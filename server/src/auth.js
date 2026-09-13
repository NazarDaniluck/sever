import jwt from 'jsonwebtoken'
import db, { utcIso } from './db.js'
import { isOnline } from './presence.js'
import { isValidSession, touchSession } from './security.js'
import { isUserBlocked } from './moderation.js'

const SECRET = process.env.JWT_SECRET || 'sever-super-secret-key-change-me-in-production'

// Сегодня ли день рождения (сравнение день/месяц по локальному времени сервера)
function isBirthdayToday(birthday) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) return false
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return String(birthday).slice(5) === `${mm}-${dd}`
}

const USER_COLS = 'id, email, username, display_name, first_name, last_name, status, hometown, marital_status, marital_partner, political_views, pronouns, birthday, birthday_visibility, interests, favorite_music, favorite_movies, favorite_tv, favorite_books, favorite_quotes, favorite_games, about_me, website, city, address, psychotype, thinking_type, bio, avatar, cover, is_admin, is_tester, is_moderator, memorialized, memorialized_at, memorialized_by, verified, show_online, muted_until, public_profile, backdrop, always_backdrop, telegram, contact_email, allow_mentions, message_mode, token_version, totp_enabled, blocked_until, blocked_reason, last_seen, show_local_time, timezone, avatar_scale, hide_group_posts, profile_visibility, mute_posts_until, mute_audios_until, mute_videos_until, show_nsfw, page_color, page_bg, is_foreign_agent, created_at'

export function signToken(user, sessionId) {
  return jwt.sign({ id: user.id, sid: sessionId || null, ver: user.token_version || 0 }, SECRET, { expiresIn: '30d' })
}

// Короткоживущий токен «шаг 1 входа»: выдаётся после верного пароля, когда включена 2FA.
export function signLoginToken(user) {
  return jwt.sign({ id: user.id, purpose: '2fa' }, SECRET, { expiresIn: '5m' })
}

export function verifyLoginToken(token) {
  try {
    const payload = jwt.verify(token, SECRET)
    if (!payload || payload.purpose !== '2fa' || !payload.id) return null
    return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) || null
  } catch {
    return null
  }
}

// Внутренняя проверка токена + живучести сессии и версии токенов.
function tokenPayload(token) {
  try {
    const payload = jwt.verify(token, SECRET)
    if (!payload || !payload.id) return null
    const user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(payload.id)
    if (!user) return null
    // Заблокированный аккаунт: все сессии сразу недействительны (мемориал — не трогаем)
    if (isUserBlocked(user.id)) return null
    if ((user.token_version || 0) !== (payload.ver || 0)) return null
    if (payload.sid && !isValidSession(user.id, payload.sid)) return null
    if (payload.sid) touchSession(payload.sid)
    return { payload, user }
  } catch {
    return null
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Не авторизован' })
  const t = tokenPayload(token)
  if (!t) return res.status(401).json({ error: 'Недействительный токен' })
  req.user = t.user
  req.sessionId = t.payload.sid || null
  touchLastSeen(req.user.id)
  next()
}

// Обновляем время последнего посещения не чаще раза в минуту на пользователя.
export function touchLastSeen(userId) {
  db.prepare(`UPDATE users SET last_seen = datetime('now') WHERE id = ? AND (last_seen IS NULL OR last_seen < datetime('now','-1 minute'))`)
    .run(userId)
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || ''
  let token = header.startsWith('Bearer ') ? header.slice(7) : null
  // Встроенные медиа-элементы (<audio>/<video>/poster) не могут отправить
  // заголовок Authorization, поэтому разрешаем токен через query (?token=).
  if (!token && typeof req.query?.token === 'string' && req.query.token) token = req.query.token
  if (!token) return next()
  const t = tokenPayload(token)
  if (t) {
    req.user = t.user
    req.sessionId = t.payload.sid || null
  }
  next()
}

// Проверка токена для WebSocket (socket.io). Возвращает пользователя или null.
export function wsUser(token) {
  if (!token) return null
  const t = tokenPayload(token)
  return t ? t.user : null
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Не авторизован' })
  if (!req.user.is_admin) return res.status(403).json({ error: 'Нет прав администратора' })
  next()
}

// Модератор = админ или пользователь с ролью модератора
export function requireModerator(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Не авторизован' })
  if (!req.user.is_admin && !req.user.is_moderator) return res.status(403).json({ error: 'Нет прав модератора' })
  next()
}

export function parseBackdrop(raw) {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    return o && o.type ? { type: String(o.type), value: o.value || null } : null
  } catch {
    return null
  }
}

// Фон страницы профиля: структурированный объект из JSON. Нормализуем допустимые значения.
export function parsePageBg(raw) {
  if (!raw) return null
  let o
  try { o = JSON.parse(raw) } catch { return null }
  if (!o || !o.type) return null
  const type = String(o.type)
  if (!['none', 'preset', 'color', 'image'].includes(type)) return null
  const out = { type, value: o.value || null }
  const op = Number(o.opacity)
  if (!Number.isNaN(op)) out.opacity = Math.min(1, Math.max(0.05, op))
  return out
}

// Статусы, при которых можно указать партнёра (по желанию).
const PARTNER_STATUSES = ['in_relationship', 'engaged', 'married', 'complicated', 'in_love', 'civil_marriage']

// Публичный профиль для чужих глаз: email никому не отдаём. Дату рождения
// показываем, только если её видимость «всем» (или явно передано includeBirthday —
// для владельца и друзей).
export function publicUser(u, includeBirthday = false) {
  if (!u) return null
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  const canShowBirthday = includeBirthday || u.birthday_visibility === 'everyone'
  let maritalPartnerUser = null
  if (u.marital_partner && PARTNER_STATUSES.includes(u.marital_status)) {
    const p = db.prepare('SELECT username, display_name, first_name, last_name, avatar FROM users WHERE username = ?').get(u.marital_partner)
    if (p) {
      const pName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      maritalPartnerUser = { username: p.username, displayName: pName || p.display_name || p.username, avatar: p.avatar }
    }
  }
  return {
    id: u.id,
    username: u.username,
    displayName: fullName || u.display_name || u.username,
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    bio: u.bio,
    status: u.status || '',
    hometown: u.hometown || '',
    maritalStatus: u.marital_status || 'not_selected',
    maritalPartner: u.marital_partner || '',
    maritalPartnerUser,
    politicalViews: u.political_views || 'not_selected',
    pronouns: u.pronouns || 'not_selected',
    birthday: canShowBirthday ? u.birthday || null : null,
    birthdayVisibility: u.birthday_visibility || 'everyone',
    interests: u.interests || '',
    favoriteMusic: u.favorite_music || '',
    favoriteMovies: u.favorite_movies || '',
    favoriteTv: u.favorite_tv || '',
    favoriteBooks: u.favorite_books || '',
    favoriteQuotes: u.favorite_quotes || '',
    favoriteGames: u.favorite_games || '',
    aboutMe: u.about_me || '',
    psychotype: u.psychotype || 'not_selected',
    thinkingType: u.thinking_type || 'not_selected',
    website: u.website || '',
    city: u.city || '',
    address: u.address || '',
    avatar: u.avatar,
    cover: u.cover,
    isAdmin: !!u.is_admin,
    isTester: !!u.is_tester,
    isModerator: !!u.is_moderator,
    memorialized: !!u.memorialized,
    memorializedAt: utcIso(u.memorialized_at),
    verified: !!u.verified,
    showOnline: !!u.show_online,
    online: !!(u.show_online && isOnline(u.id)),
    mutedUntil: utcIso(u.muted_until),
    birthdayToday: isBirthdayToday(u.birthday),
    blockedUntil: utcIso(u.blocked_until),
    blockedReason: u.blocked_reason || '',
    lastSeen: utcIso(u.last_seen),
    showLocalTime: !!u.show_local_time,
    timezone: u.timezone || 'Europe/Kyiv',
    avatarScale: u.avatar_scale == null ? 1 : Number(u.avatar_scale),
    hideGroupPosts: !!u.hide_group_posts,
    profileVisibility: u.profile_visibility || 'open',
    isForeignAgent: !!u.is_foreign_agent,
    mutePostsUntil: utcIso(u.mute_posts_until),
    muteAudiosUntil: utcIso(u.mute_audios_until),
    muteVideosUntil: utcIso(u.mute_videos_until),
    publicProfile: !!u.public_profile,
    backdrop: parseBackdrop(u.backdrop),
    pageColor: u.page_color || null,
    pageBg: parsePageBg(u.page_bg),
    alwaysBackdrop: !!u.always_backdrop,
    telegram: u.telegram || '',
    contactEmail: u.contact_email || '',
    allowMentions: !!u.allow_mentions,
    messageMode: u.message_mode || 'all',
    createdAt: utcIso(u.created_at)
  }
}

// Данные для самого владельца аккаунта (включая email и статус 2FA).
export function selfUser(u) {
  return u && { ...publicUser(u, true), email: u.email, twoFactorEnabled: !!u.totp_enabled, showNsfw: !!u.show_nsfw }
}

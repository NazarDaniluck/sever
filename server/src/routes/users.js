import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db, { utcIso } from '../db.js'
import { requireAuth, publicUser, selfUser, signToken, parsePageBg } from '../auth.js'
import { getFeed, countFeed } from '../posts.js'
import { notifyMentions, createNotification } from '../notifications.js'
import { revokeAllExcept, logSecurity, reqMeta, authLimiter } from '../security.js'
import { createUploader, validateFiles } from '../uploads.js'
import { areFriends, friendRequestBetween } from './friends.js'

const router = Router()

const PAGE_SIZE = 10

const upload = createUploader({ maxSize: 8 * 1024 * 1024 })

const MARITAL_STATUSES = ['not_selected', 'single', 'in_relationship', 'engaged', 'married', 'complicated', 'active_search', 'in_love', 'civil_marriage']
const POLITICAL_VIEWS = ['not_selected', 'communist', 'socialist', 'moderate', 'liberal', 'conservative', 'monarchist', 'ultraconservative', 'libertarian', 'indifferent']
const PSYCHOTYPES = ['not_selected', 'introvert', 'extrovert', 'social_introvert', 'ambivert', 'textrovert']
const THINKING_TYPES = ['not_selected', 'techie', 'humanities']
const PRONOUNS = ['not_selected', 'he', 'she', 'they']
const BIRTHDAY_VISIBILITY = ['everyone', 'friends', 'only_me']

const cap = (v, n) => String(v == null ? '' : v).trim().slice(0, n)

// Закрытый профиль (только для друзей): владелец/админ/друзья видят, остальные — нет
function profileVisibleTo(u, req) {
  if (u.profile_visibility !== 'friends') return true
  if (!req.user) return false
  if (req.user.id === u.id || req.user.is_admin) return true
  return areFriends(req.user.id, u.id)
}

router.get('/me', requireAuth, (req, res) => res.json(selfUser(req.user)))

router.put('/me', requireAuth, (req, res) => {
  const { displayName, bio, username, email, showOnline, publicProfile, alwaysBackdrop, backdrop, telegram, contactEmail, allowMentions, messageMode, currentPassword,
    profileVisibility, hideGroupPosts, showLocalTime, timezone, avatarScale, pageColor, pageBg } = req.body || {}

  const { firstName, lastName, status, hometown, maritalStatus, maritalPartner, politicalViews, psychotype, thinkingType, pronouns, birthday, birthdayVisibility, interests, favoriteMusic, favoriteMovies, favoriteTv, favoriteBooks, favoriteQuotes, favoriteGames, aboutMe, website, city, address } = req.body || {}

  // Смена логина или email — только с подтверждением текущего пароля
  const wantsSensitive = (username !== undefined && String(username).trim() !== req.user.username) ||
    (email !== undefined && String(email).trim().toLowerCase() !== String(req.user.email || '').toLowerCase())
  if (wantsSensitive) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, req.user.password_hash)) {
      return res.status(400).json({ error: 'Для смены логина или email введите текущий пароль' })
    }
  }

  if (username !== undefined) {
    const val = String(username).trim()
    if (!/^[\w-]{3,30}$/.test(val)) {
      return res.status(400).json({ error: 'Логин: 3–30 символов, допустимы буквы, цифры, "_" и "-"' })
    }
    if (val !== req.user.username) {
      const taken = db.prepare('SELECT 1 FROM users WHERE username = ?').get(val)
      if (taken) return res.status(409).json({ error: 'Этот логин уже занят' })
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(val, req.user.id)
    }
  }
  if (showOnline !== undefined) {
    db.prepare('UPDATE users SET show_online = ? WHERE id = ?').run(showOnline ? 1 : 0, req.user.id)
  }
  if (publicProfile !== undefined) {
    db.prepare('UPDATE users SET public_profile = ? WHERE id = ?').run(publicProfile ? 1 : 0, req.user.id)
  }
  if (alwaysBackdrop !== undefined) {
    db.prepare('UPDATE users SET always_backdrop = ? WHERE id = ?').run(alwaysBackdrop ? 1 : 0, req.user.id)
  }
  if (backdrop !== undefined) {
    const b = backdrop && backdrop.type ? JSON.stringify({ type: String(backdrop.type), value: backdrop.value || null }) : null
    db.prepare('UPDATE users SET backdrop = ? WHERE id = ?').run(b, req.user.id)
  }
  if (pageColor !== undefined) {
    const pc = pageColor ? String(pageColor).trim() : null
    if (pc && !/^#[0-9a-fA-F]{6}$/.test(pc)) return res.status(400).json({ error: 'Некорректный цвет: нужен формат #RRGGBB' })
    db.prepare('UPDATE users SET page_color = ? WHERE id = ?').run(pc, req.user.id)
  }
  if (pageBg !== undefined) {
    const bg = pageBg && pageBg.type ? parsePageBg(JSON.stringify(pageBg)) : null
    if (pageBg !== null && !bg) return res.status(400).json({ error: 'Некорректный фон страницы' })
    db.prepare('UPDATE users SET page_bg = ? WHERE id = ?').run(bg ? JSON.stringify(bg) : null, req.user.id)
    if (bg) db.prepare('UPDATE users SET page_color = ? WHERE id = ?').run(bg.type === 'color' ? (bg.value || null) : null, req.user.id)
  }
  if (telegram !== undefined) {
    db.prepare('UPDATE users SET telegram = ? WHERE id = ?').run(String(telegram).trim().replace(/^@/, ''), req.user.id)
  }
  if (contactEmail !== undefined) {
    db.prepare('UPDATE users SET contact_email = ? WHERE id = ?').run(String(contactEmail).trim(), req.user.id)
  }
  if (email !== undefined) {
    const val = String(email).trim()
    if (!/^\S+@\S+\.\S+$/.test(val)) {
      return res.status(400).json({ error: 'Некорректный email' })
    }
    if (val.toLowerCase() !== String(req.user.email || '').toLowerCase()) {
      const taken = db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(val)
      if (taken) return res.status(409).json({ error: 'Этот email уже занят' })
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(val, req.user.id)
    }
  }
  if (allowMentions !== undefined) {
    db.prepare('UPDATE users SET allow_mentions = ? WHERE id = ?').run(allowMentions ? 1 : 0, req.user.id)
  }
  if (messageMode !== undefined) {
    const mm = String(messageMode)
    if (!['all', 'requests', 'none'].includes(mm)) return res.status(400).json({ error: 'Недопустимый режим сообщений' })
    db.prepare('UPDATE users SET message_mode = ? WHERE id = ?').run(mm, req.user.id)
  }
  if (profileVisibility !== undefined) {
    const pv = String(profileVisibility)
    if (!['open', 'friends', 'closed'].includes(pv)) return res.status(400).json({ error: 'Недопустимый уровень доступа к профилю' })
    db.prepare('UPDATE users SET profile_visibility = ? WHERE id = ?').run(pv, req.user.id)
  }
  if (hideGroupPosts !== undefined) {
    db.prepare('UPDATE users SET hide_group_posts = ? WHERE id = ?').run(hideGroupPosts ? 1 : 0, req.user.id)
  }
  if (showLocalTime !== undefined) {
    db.prepare('UPDATE users SET show_local_time = ? WHERE id = ?').run(showLocalTime ? 1 : 0, req.user.id)
  }
  if (timezone !== undefined) {
    const tz = String(timezone || '').trim()
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { return res.status(400).json({ error: 'Некорректная временная зона' }) }
    db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(tz, req.user.id)
  }
  if (avatarScale !== undefined) {
    const scale = Math.min(5, Math.max(0.5, Number(avatarScale) || 1))
    db.prepare('UPDATE users SET avatar_scale = ? WHERE id = ?').run(scale, req.user.id)
  }

  // ---------- Анкета: основная информация ----------
  if (firstName !== undefined || lastName !== undefined) {
    const fn = cap(firstName ?? req.user.first_name, 60)
    const ln = cap(lastName ?? req.user.last_name, 60)
    db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(fn, ln, req.user.id)
  }
  if (status !== undefined) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(cap(status, 120), req.user.id)
  }
  if (hometown !== undefined) {
    db.prepare('UPDATE users SET hometown = ? WHERE id = ?').run(cap(hometown, 120), req.user.id)
  }
  if (maritalStatus !== undefined) {
    if (!MARITAL_STATUSES.includes(String(maritalStatus))) return res.status(400).json({ error: 'Недопустимое семейное положение' })
    db.prepare('UPDATE users SET marital_status = ? WHERE id = ?').run(String(maritalStatus), req.user.id)
  }
  if (maritalPartner !== undefined) {
    const v = String(maritalPartner).trim()
    if (v && !/^[\w-]{3,30}$/.test(v)) return res.status(400).json({ error: 'Некорректный никнейм' })
    db.prepare('UPDATE users SET marital_partner = ? WHERE id = ?').run(v, req.user.id)
  }
  if (politicalViews !== undefined) {
    if (!POLITICAL_VIEWS.includes(String(politicalViews))) return res.status(400).json({ error: 'Недопустимые политические взгляды' })
    db.prepare('UPDATE users SET political_views = ? WHERE id = ?').run(String(politicalViews), req.user.id)
  }
  if (pronouns !== undefined) {
    if (!PRONOUNS.includes(String(pronouns))) return res.status(400).json({ error: 'Недопустимые местоимения' })
    db.prepare('UPDATE users SET pronouns = ? WHERE id = ?').run(String(pronouns), req.user.id)
  }
  if (psychotype !== undefined) {
    if (!PSYCHOTYPES.includes(String(psychotype))) return res.status(400).json({ error: 'Недопустимый психотип' })
    db.prepare('UPDATE users SET psychotype = ? WHERE id = ?').run(String(psychotype), req.user.id)
  }
  if (thinkingType !== undefined) {
    if (!THINKING_TYPES.includes(String(thinkingType))) return res.status(400).json({ error: 'Недопустимый тип мышления' })
    db.prepare('UPDATE users SET thinking_type = ? WHERE id = ?').run(String(thinkingType), req.user.id)
  }
  if (birthday !== undefined) {
    const b = birthday ? String(birthday) : ''
    if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) return res.status(400).json({ error: 'Некорректная дата рождения' })
    db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(b || null, req.user.id)
  }
  if (birthdayVisibility !== undefined) {
    if (!BIRTHDAY_VISIBILITY.includes(String(birthdayVisibility))) return res.status(400).json({ error: 'Недопустимая видимость даты рождения' })
    db.prepare('UPDATE users SET birthday_visibility = ? WHERE id = ?').run(String(birthdayVisibility), req.user.id)
  }

  // ---------- Анкета: личные интересы ----------
  if (interests !== undefined) db.prepare('UPDATE users SET interests = ? WHERE id = ?').run(cap(interests, 2000), req.user.id)
  if (favoriteMusic !== undefined) db.prepare('UPDATE users SET favorite_music = ? WHERE id = ?').run(cap(favoriteMusic, 2000), req.user.id)
  if (favoriteMovies !== undefined) db.prepare('UPDATE users SET favorite_movies = ? WHERE id = ?').run(cap(favoriteMovies, 2000), req.user.id)
  if (favoriteTv !== undefined) db.prepare('UPDATE users SET favorite_tv = ? WHERE id = ?').run(cap(favoriteTv, 2000), req.user.id)
  if (favoriteBooks !== undefined) db.prepare('UPDATE users SET favorite_books = ? WHERE id = ?').run(cap(favoriteBooks, 2000), req.user.id)
  if (favoriteQuotes !== undefined) db.prepare('UPDATE users SET favorite_quotes = ? WHERE id = ?').run(cap(favoriteQuotes, 2000), req.user.id)
  if (favoriteGames !== undefined) db.prepare('UPDATE users SET favorite_games = ? WHERE id = ?').run(cap(favoriteGames, 2000), req.user.id)
  if (aboutMe !== undefined) db.prepare('UPDATE users SET about_me = ? WHERE id = ?').run(cap(aboutMe, 4000), req.user.id)

  // ---------- Анкета: контактная информация ----------
  if (website !== undefined) db.prepare('UPDATE users SET website = ? WHERE id = ?').run(cap(website, 500), req.user.id)
  if (city !== undefined) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(cap(city, 120), req.user.id)
  if (address !== undefined) db.prepare('UPDATE users SET address = ? WHERE id = ?').run(cap(address, 200), req.user.id)

  db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?')
    .run(displayName ?? req.user.display_name, bio ?? req.user.bio, req.user.id)
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json(selfUser(u))
})

// Загрузка аватара (scale — коэффициент приближения: 0.5..5, файл не обрезается)
router.post('/me/avatar', requireAuth, upload.single('avatar'), validateFiles(['image']), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  const scale = Math.min(5, Math.max(0.5, Number(req.body?.scale) || 1))
  db.prepare('UPDATE users SET avatar = ?, avatar_scale = ? WHERE id = ?').run(`/uploads/${req.file.filename}`, scale, req.user.id)
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json(selfUser(u))
})

// Загрузка обложки (широкая картинка шапки, как у сообществ)
router.post('/me/cover', requireAuth, upload.single('cover'), validateFiles(['image']), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  db.prepare('UPDATE users SET cover = ? WHERE id = ?').run(`/uploads/${req.file.filename}`, req.user.id)
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json(selfUser(u))
})

// Смена пароля (с подтверждением текущего). Все остальные сессии завершаются,
// текущая остаётся — выдаём свежий токен.
router.post('/me/password', requireAuth, authLimiter(15 * 60 * 1000, 10, 'Слишком много попыток смены пароля. Подождите 15 минут.'), (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
  if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' })
  }
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' })
  }
  if (String(newPassword).length > 64) {
    return res.status(400).json({ error: 'Пароль слишком длинный (максимум 64 символа)' })
  }
  const hash = bcrypt.hashSync(String(newPassword), 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id)
  revokeAllExcept(user.id, req.sessionId)
  logSecurity(user.id, 'password_changed', { ...reqMeta(req), detail: 'Смена пароля' })
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ ok: true, token: signToken(fresh, req.sessionId), user: selfUser(fresh) })
})

// Настройка «показывать NSFW-посты». По умолчанию скрыты.
// Включение показа — только с подтверждением пароля аккаунта.
router.post('/me/nsfw', requireAuth, (req, res) => {
  const show = req.body?.showNsfw === true
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
  if (show) {
    const password = String(req.body?.password || '')
    if (!password || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: 'Неверный пароль' })
    }
  }
  db.prepare('UPDATE users SET show_nsfw = ? WHERE id = ?').run(show ? 1 : 0, user.id)
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json(selfUser(fresh))
})

// Список пользователей (поиск). Заблокированные аккаунты из поиска скрываются.
router.get('/', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim()
  let rows
  if (q) {
    rows = db.prepare(`
      SELECT * FROM users
      WHERE (username LIKE ? OR display_name LIKE ?)
        AND (blocked_until IS NULL OR blocked_until < datetime('now'))
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`)
  } else {
    rows = db.prepare(`
      SELECT * FROM users
      WHERE blocked_until IS NULL OR blocked_until < datetime('now')
      ORDER BY created_at DESC LIMIT 20
    `).all()
  }
  res.json(rows.map(publicUser))
})

router.get('/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  if (!req.user && !u.public_profile) return res.status(403).json({ error: 'Профиль закрыт для гостей. Войдите, чтобы посмотреть.' })

  const isOwner = req.user && req.user.id === u.id
  const follows = req.user
    ? db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id, u.id)
    : null
  const followsMe = req.user
    ? db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(u.id, req.user.id)
    : null

  // Закрытый профиль: видят только владелец, админы и друзья
  const isFriend = req.user && !isOwner ? areFriends(req.user.id, u.id) : null
  if (!profileVisibleTo(u, req)) {
    return res.status(403).json({ error: 'Профиль доступен только друзьям' })
  }

  // Дату рождения видят сам пользователь и друзья (взаимная подписка)
  const includeBirthday = isOwner || !!(follows && followsMe)

  // Статус переписки: режим хозяина профиля + статус заявки от текущего пользователя
  let message = { mode: u.message_mode || 'all', requestStatus: null }
  if (req.user && !isOwner) {
    const req2 = db.prepare('SELECT status FROM message_requests WHERE from_user_id=? AND to_user_id=?')
      .get(req.user.id, u.id)
    if (req2) message.requestStatus = req2.status
    const hasConv = db.prepare(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants a ON a.conversation_id=c.id AND a.user_id=?
      JOIN conversation_participants b ON b.conversation_id=c.id AND b.user_id=?
      WHERE (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id=c.id) = 2
    `).get(req.user.id, u.id)
    if (hasConv) message.requestStatus = 'approved'
  }

  const followers = db.prepare(`
    SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ? ORDER BY f.created_at DESC LIMIT 6
  `).all(u.id)

  const following = db.prepare(`
    SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 6
  `).all(u.id)

  const communities = db.prepare(`
    SELECT c.* FROM community_members cm JOIN communities c ON c.id = cm.community_id
    WHERE cm.user_id = ? LIMIT 6
  `).all(u.id)

  const friendsCount = db.prepare('SELECT COUNT(*) n FROM friends f WHERE f.user_id=? OR f.friend_id=?').get(u.id, u.id).n

  res.json({
    user: publicUser(u, includeBirthday),
    isOwner: !!isOwner,
    isFriend: !!isFriend,
    friendRequest: req.user && !isOwner ? friendRequestBetween(req.user.id, u.id) : null,
    followsMe: !!followsMe,
    following,
    followed: !!follows,
    counts: {
      followers: db.prepare('SELECT COUNT(*) n FROM follows WHERE following_id=?').get(u.id).n,
      following: db.prepare('SELECT COUNT(*) n FROM follows WHERE follower_id=?').get(u.id).n,
      friends: friendsCount,
      posts: db.prepare('SELECT COUNT(*) n FROM posts WHERE author_id=? AND parent_id IS NULL').get(u.id).n,
      communities: communities.length
    },
    recent: { followers: followers.map(publicUser), following: following.map(publicUser), communities },
    message
  })
})

// Аватарка как фотография: просмотр и комментарии
function avatarCommentJson(c) {
  return {
    id: c.id,
    body: c.body,
    createdAt: utcIso(c.created_at),
    author: { id: c.uid, username: c.uusername, displayName: c.udisplay, avatar: c.uavatar, isAdmin: !!c.uisadmin }
  }
}

router.get('/:username/avatar', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  const comments = db.prepare(`
    SELECT c.*, u2.username AS uusername, u2.display_name AS udisplay, u2.avatar AS uavatar, u2.is_admin AS uisadmin
    FROM avatar_comments c JOIN users u2 ON u2.id = c.author_id
    WHERE c.user_id = ? ORDER BY c.created_at ASC, c.id ASC
  `).all(u.id).map(avatarCommentJson)
  res.json({
    url: u.avatar || null,
    username: u.username,
    displayName: u.display_name || u.username,
    comments
  })
})

router.post('/:username/avatar/comments', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Пустой комментарий' })
  const info = db.prepare('INSERT INTO avatar_comments (user_id, author_id, body) VALUES (?, ?, ?)')
    .run(u.id, req.user.id, body)
  const c = db.prepare(`
    SELECT c.*, u2.username AS uusername, u2.display_name AS udisplay, u2.avatar AS uavatar, u2.is_admin AS uisadmin
    FROM avatar_comments c JOIN users u2 ON u2.id = c.author_id WHERE c.id = ?
  `).get(info.lastInsertRowid)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'avatar', targetId: u.id, commentId: c.id })
  createNotification({
    io: req.app.get('io'), userId: u.id, actorId: req.user.id, type: 'avatar_comment',
    targetType: 'avatar', targetId: u.id, commentId: c.id, body
  })
  res.status(201).json(avatarCommentJson(c))
})

// Полные списки подписчиков и подписок пользователя
router.get('/:username/followers', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  if (!profileVisibleTo(u, req)) return res.status(403).json({ error: 'Профиль доступен только друзьям' })
  const meId = req.user ? req.user.id : null
  const rows = db.prepare(`
    SELECT u.*,
           (SELECT 1 FROM follows f2 WHERE f2.follower_id=?  AND f2.following_id=u.id) AS _is_followed,
           (SELECT 1 FROM follows f3 WHERE f3.follower_id=u.id AND f3.following_id=?)   AS _follows_me
    FROM follows f JOIN users u ON u.id=f.follower_id
    WHERE f.following_id=? ORDER BY f.created_at DESC
  `).all(meId, meId, u.id)
  res.json(rows.map(r => ({ ...publicUser(r), isFollowed: !!r.is_followed, followsMe: !!r.follows_me,
    mutual: !!r.is_followed && !!r.follows_me })))
})

router.get('/:username/following', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  if (!profileVisibleTo(u, req)) return res.status(403).json({ error: 'Профиль доступен только друзьям' })
  const meId = req.user ? req.user.id : null
  const rows = db.prepare(`
    SELECT u.*,
           (SELECT 1 FROM follows f2 WHERE f2.follower_id=?  AND f2.following_id=u.id) AS is_followed,
           (SELECT 1 FROM follows f3 WHERE f3.follower_id=u.id AND f3.following_id=?)  AS follows_me
    FROM follows f JOIN users u ON u.id=f.following_id
    WHERE f.follower_id=? ORDER BY f.created_at DESC
  `).all(meId, meId, u.id)
  res.json(rows.map(r => ({ ...publicUser(r), isFollowed: !!r.is_followed, followsMe: !!r.follows_me,
    mutual: !!r.is_followed && !!r.follows_me })))
})

// Действия: подписки
router.post('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id)
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя подписаться на себя' })
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(targetId)
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' })
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId)
  res.json({ ok: true })
})

router.delete('/:id/follow', requireAuth, (req, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?').run(req.user.id, Number(req.params.id))
  res.json({ ok: true })
})

// Посты пользователя (с постраничной навигацией)
router.get('/:username/posts', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  if (!req.user && !u.public_profile) return res.status(403).json({ error: 'Профиль закрыт для гостей. Войдите, чтобы посмотреть.' })
  if (!profileVisibleTo(u, req)) return res.status(403).json({ error: 'Профиль доступен только друзьям' })
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const posts = getFeed(req.user ? req.user.id : null, { authorId: u.id, limit: PAGE_SIZE, offset, hideGroupPosts: !!u.hide_group_posts, hideNsfw: req.user ? !req.user.show_nsfw : true })
  const total = countFeed({ authorId: u.id, hideGroupPosts: !!u.hide_group_posts, hideNsfw: req.user ? !req.user.show_nsfw : true })
  res.json({ posts, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
})

export default router
import db, { utcIso } from './db.js'

export const MAX_MESSAGE_LEN = 512

const WINDOW_MS = 10 * 1000
const SPAM_LIMIT = 8
const MUTE_MS = 60 * 60 * 1000

const sendHistory = new Map()

export function isMuted(userId) {
  const u = db.prepare('SELECT muted_until, is_admin FROM users WHERE id=?').get(userId)
  if (!u || u.is_admin || !u.muted_until) return null
  const active = db.prepare("SELECT 1 WHERE ? > datetime('now')").get(u.muted_until)
  return active ? { until: utcIso(u.muted_until) } : null
}

export function checkMuted(userId) {
  const m = isMuted(userId)
  if (m) return { allowed: false, error: 'Вы в муте до ' + new Date(m.until).toLocaleString('ru-RU') }
  return { allowed: true }
}

export function applyMute(userId) {
  db.prepare("UPDATE users SET muted_until = datetime('now','+1 hour') WHERE id=? AND is_admin=0").run(userId)
  return isMuted(userId)
}

export function clearMute(userId) {
  db.prepare('UPDATE users SET muted_until = NULL WHERE id=?').run(userId)
}

// ---------- Блокировка аккаунта (временная или навсегда) ----------

const FOREVER = '9999-12-31 23:59:59'

function toSqlTime(durationMs) {
  if (durationMs == null) return FOREVER
  return new Date(Date.now() + durationMs).toISOString().replace('T', ' ').slice(0, 19)
}

export function isUserBlocked(userId) {
  const u = db.prepare('SELECT blocked_until, is_admin FROM users WHERE id=?').get(userId)
  if (!u || u.is_admin || !u.blocked_until) return null
  const active = db.prepare("SELECT 1 WHERE ? > datetime('now')").get(u.blocked_until)
  return active ? { until: utcIso(u.blocked_until), reason: u.blocked_reason || '' } : null
}

export function applyBlock(userId, { durationMs = null, reason = '' } = {}) {
  db.prepare('UPDATE users SET blocked_until=?, blocked_reason=? WHERE id=? AND is_admin=0')
    .run(toSqlTime(durationMs), String(reason || '').slice(0, 200), userId)
  return isUserBlocked(userId)
}

export function clearBlock(userId) {
  db.prepare('UPDATE users SET blocked_until=NULL, blocked_reason=\'\' WHERE id=?').run(userId)
}

// ---------- Муты по типам контента: посты / аудио / видео ----------

const CONTENT_MUTE_COLS = {
  posts: 'mute_posts_until',
  audios: 'mute_audios_until',
  videos: 'mute_videos_until'
}

export function contentMute(userId, type) {
  const col = CONTENT_MUTE_COLS[type]
  if (!col) return null
  const u = db.prepare(`SELECT ${col}, is_admin FROM users WHERE id=?`).get(userId)
  if (!u || u.is_admin || !u[col]) return null
  const active = db.prepare("SELECT 1 WHERE ? > datetime('now')").get(u[col])
  return active ? { until: utcIso(u[col]) } : null
}

export function checkContentMuted(userId, type) {
  const m = contentMute(userId, type)
  if (m) {
    return { allowed: false, error: 'Вы не можете публиковать: ограничение до ' + new Date(m.until).toLocaleString('ru-RU') }
  }
  return { allowed: true }
}

export function applyContentMute(userId, type, durationMs = null) {
  const col = CONTENT_MUTE_COLS[type]
  if (!col) return null
  db.prepare(`UPDATE users SET ${col}=? WHERE id=? AND is_admin=0`).run(toSqlTime(durationMs), userId)
  return contentMute(userId, type)
}

export function clearContentMute(userId, type) {
  const col = CONTENT_MUTE_COLS[type]
  if (!col) return null
  db.prepare(`UPDATE users SET ${col}=NULL WHERE id=?`).run(userId)
}

export function contentMutesFor(userId) {
  return {
    posts: contentMute(userId, 'posts'),
    audios: contentMute(userId, 'audios'),
    videos: contentMute(userId, 'videos')
  }
}

export function checkTextLength(body) {
  if (body && body.length > MAX_MESSAGE_LEN) {
    return { allowed: false, error: `Сообщение не должно превышать ${MAX_MESSAGE_LEN} символов` }
  }
  return { allowed: true }
}

// Проверка на спам: слишком много сообщений подряд -> глобальный мут на час.
// Админы исключены: не блокируются и не получают мут.
export function checkSpam(userId, isAdmin) {
  if (isAdmin) return { allowed: true }
  const now = Date.now()
  const arr = (sendHistory.get(userId) || []).filter(t => now - t < WINDOW_MS)
  arr.push(now)
  if (arr.length >= SPAM_LIMIT) {
    sendHistory.delete(userId)
    const until = applyMute(userId)
    return { allowed: false, error: 'Спам-защита: вы в муте на 1 час', muted: until }
  }
  sendHistory.set(userId, arr)
  return { allowed: true }
}

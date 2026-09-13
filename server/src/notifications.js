import db, { utcIso } from './db.js'

// Упоминания: @username после пробела или пунктуации (не внутри email/слова)
const MENTION_RE = /(?:^|[\s.,;:!?()[\]{}'"<>«»"–—-])@([A-Za-z0-9_-]{3,30})(?![\w-])/g

export function extractMentions(text) {
  const out = new Set()
  let m
  while ((m = MENTION_RE.exec(text || ''))) out.add(m[1])
  return [...out]
}

export function eventJson(row) {
  return {
    id: row.id,
    type: row.type,
    target: { type: row.target_type, id: row.target_id, username: row.avatar_username || null },
    commentId: row.comment_id || null,
    body: row.body || null,
    read: !!row.read_at,
    createdAt: utcIso(row.created_at),
    actor: {
      id: row.actor_id,
      username: row.actor_username,
      displayName: row.actor_display_name || row.actor_username,
      avatar: row.actor_avatar
    }
  }
}

const EVENT_SELECT = `
  SELECT n.*, u.username AS actor_username, u.display_name AS actor_display_name, u.avatar AS actor_avatar,
         t.username AS avatar_username
  FROM notifications n
  JOIN users u ON u.id = n.actor_id
  LEFT JOIN users t ON n.target_type = 'avatar' AND t.id = n.target_id
`

export function createNotification({ io, userId, actorId, type, targetType, targetId, commentId, body }) {
  if (userId == null || userId === actorId) return null
  const info = db.prepare(`
    INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, comment_id, body)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, actorId, type, targetType, targetId ?? null, commentId ?? null,
    body ? String(body).slice(0, 200) : null)
  const row = db.prepare(`${EVENT_SELECT} WHERE n.id = ?`).get(info.lastInsertRowid)
  if (!row) return null
  const evt = { userId, ...eventJson(row) }
  if (io) io.to(`user-${userId}`).emit('event', evt)
  return evt
}

// Упомянутые в тексте пользователи (кроме автора и тех, кто запретил упоминания)
export function notifyMentions(io, actorId, text, { targetType, targetId, commentId }) {
  const names = extractMentions(text)
  if (!names.length) return
  const ph = names.map(() => '?').join(',')
  const marks = db.prepare(`SELECT id FROM users WHERE LOWER(username) IN (${ph}) AND id != ? AND allow_mentions = 1`)
    .all(...names, actorId)
  for (const u of marks) {
    createNotification({ io, userId: u.id, actorId, type: 'mention', targetType, targetId, commentId, body: text })
  }
}

// Ответ на комментарий — уведомляем автора родительского комментария
export function notifyReply(io, actorId, parent, { targetType, targetId }) {
  if (!parent || parent.author_id === actorId) return
  const allow = db.prepare('SELECT allow_mentions FROM users WHERE id = ?').get(parent.author_id)
  if (allow && !allow.allow_mentions) return
  createNotification({
    io, userId: parent.author_id, actorId, type: 'reply', targetType, targetId,
    commentId: parent.id, body: parent.body
  })
}

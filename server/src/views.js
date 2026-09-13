import db, { utcIso } from './db.js'

// Учёт просмотров с защитой от накрутки (общий для видео и постов):
// - один зритель засчитывается не чаще раза в 24 часа на одну запись;
// - просмотры автора не считаются;
// - лимит реальных засчитываний по IP в памяти (без нагрузки на БД): не более 600/час.
const COOLDOWN_MS = 24 * 60 * 60 * 1000
const viewBudget = new Map() // ip -> [timestamps фактических засчитываний]

const VIEW_TABLE = { posts: 'post_views', library_videos: 'video_views' }
const ID_COL = { posts: 'post_id', library_videos: 'video_id' }

// Возвращает { notFound: true } | { views }
export function recordView(table, id, ownerId, req) {
  const row = db.prepare(`SELECT views FROM ${table} WHERE id=?`).get(id)
  if (!row) return { notFound: true }
  const current = row.views || 0
  if (req.user && req.user.id === ownerId) return { views: current }

  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown')
  const now = Date.now()
  const viewer = req.user ? `u${req.user.id}` : `ip${ip}`
  const viewTable = VIEW_TABLE[table]
  const idCol = ID_COL[table]

  const seen = db.prepare(`SELECT viewed_at FROM ${viewTable} WHERE ${idCol}=? AND viewer=?`).get(id, viewer)
  if (seen && now - new Date(utcIso(seen.viewed_at)).getTime() < COOLDOWN_MS) return { views: current }

  // Квоту по IP тратим только на фактическое засчитывание (повторы в 24ч квоту не съедают)
  const arr = viewBudget.get(ip) || []
  viewBudget.set(ip, arr)
  while (arr.length && now - arr[0] > 60 * 60 * 1000) arr.shift()
  if (arr.length >= 600) return { views: current }
  arr.push(now)

  db.prepare(`INSERT INTO ${viewTable} (${idCol}, viewer, viewed_at) VALUES (?, ?, ?)
    ON CONFLICT(${idCol}, viewer) DO UPDATE SET viewed_at = excluded.viewed_at`)
    .run(id, viewer, new Date(now).toISOString().replace('T', ' ').slice(0, 19))
  db.prepare(`UPDATE ${table} SET views = views + 1 WHERE id=?`).run(id)
  return { views: current + 1 }
}

import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'
import { eventJson } from '../notifications.js'

const router = Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, u.username AS actor_username, u.display_name AS actor_display_name, u.avatar AS actor_avatar,
           t.username AS avatar_username
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN users t ON n.target_type = 'avatar' AND t.id = n.target_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC LIMIT 50
  `).all(req.user.id)
  res.json({ events: rows.map(eventJson) })
})

router.get('/unread', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n
  res.json({ unread: n })
})

router.post('/read', (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id)
  res.json({ ok: true })
})

router.post('/:id/read', (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(Number(req.params.id), req.user.id)
  res.json({ ok: true })
})

// Удалить отдельное событие (уведомление)
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user.id)
  if (!info.changes) return res.status(404).json({ error: 'Событие не найдено' })
  res.json({ ok: true })
})

export default router

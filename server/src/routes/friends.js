import { Router } from 'express'
import db from '../db.js'
import { requireAuth, publicUser } from '../auth.js'
import { createNotification } from '../notifications.js'

const router = Router()
router.use(requireAuth)

// Дружба симметрична: одна строка в friends с user_id < friend_id.
export function areFriends(a, b) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return !!db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(lo, hi)
}

export function friendRequestBetween(fromId, toId) {
  return db.prepare('SELECT status FROM friend_requests WHERE from_user_id=? AND to_user_id=?').get(fromId, toId)
}

export function addFriends(a, b) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(lo, hi)
}

const FRIEND_SELECT = `
  SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?
  UNION
  SELECT u.* FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ?
`

router.get('/', (req, res) => {
  const rows = db.prepare(FRIEND_SELECT).all(req.user.id, req.user.id)
  res.json(rows.map(publicUser))
})

router.get('/requests', (req, res) => {
  const incoming = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester
    FROM friend_requests r JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id=? AND r.status='pending' ORDER BY r.created_at DESC
  `).all(req.user.id).map(r => ({ id: r.id, fromUserId: r.from_user_id, createdAt: r.created_at, user: publicUser(r) }))
  const outgoing = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester
    FROM friend_requests r JOIN users u ON u.id = r.to_user_id
    WHERE r.from_user_id=? AND r.status='pending' ORDER BY r.created_at DESC
  `).all(req.user.id).map(r => ({ id: r.id, toUserId: r.to_user_id, createdAt: r.created_at, user: publicUser(r) }))
  res.json({ incoming, outgoing })
})

// Список друзей пользователя (публично)
router.get('/:username', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  const rows = db.prepare(FRIEND_SELECT).all(u.id, u.id)
  res.json(rows.map(publicUser))
})

// Отправить заявку в друзья
router.post('/:userId/request', (req, res) => {
  const targetId = Number(req.params.userId)
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя добавить себя в друзья' })
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(targetId)
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' })
  if (areFriends(req.user.id, targetId)) return res.status(400).json({ error: 'Вы уже друзья' })

  // Встречная заявка от собеседника — дружим сразу
  const rev = db.prepare("SELECT 1 FROM friend_requests WHERE from_user_id=? AND to_user_id=? AND status='pending'")
    .get(targetId, req.user.id)
  if (rev) {
    addFriends(req.user.id, targetId)
    db.prepare('DELETE FROM friend_requests WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)')
      .run(targetId, req.user.id, req.user.id, targetId)
    createNotification({
      io: req.app.get('io'), userId: targetId, actorId: req.user.id, type: 'friend_accepted',
      targetType: 'friend', targetId: req.user.id, body: 'Вы теперь друзья'
    })
    return res.json({ ok: true, becameFriends: true })
  }

  const existing = friendRequestBetween(req.user.id, targetId)
  if (existing && existing.status === 'pending') return res.status(400).json({ error: 'Заявка уже отправлена' })
  db.prepare(`INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?,?)
      ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET status='pending', created_at=datetime('now')`)
    .run(req.user.id, targetId)
  createNotification({
    io: req.app.get('io'), userId: targetId, actorId: req.user.id, type: 'friend_request',
    targetType: 'friend', targetId: req.user.id, body: 'Хочет добавить вас в друзья'
  })
  res.json({ ok: true })
})

// Отменить свою исходящую заявку
router.delete('/:userId/request', (req, res) => {
  db.prepare("DELETE FROM friend_requests WHERE from_user_id=? AND to_user_id=? AND status='pending'")
    .run(req.user.id, Number(req.params.userId))
  res.json({ ok: true })
})

// Ответить на входящую заявку
router.post('/:userId/respond', (req, res) => {
  const fromUserId = Number(req.params.userId)
  const r = db.prepare("SELECT 1 FROM friend_requests WHERE from_user_id=? AND to_user_id=? AND status='pending'")
    .get(fromUserId, req.user.id)
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' })
  const approve = req.body?.approve === true
  db.prepare('DELETE FROM friend_requests WHERE from_user_id=? AND to_user_id=?').run(fromUserId, req.user.id)
  if (approve) {
    addFriends(fromUserId, req.user.id)
    createNotification({
      io: req.app.get('io'), userId: fromUserId, actorId: req.user.id, type: 'friend_accepted',
      targetType: 'friend', targetId: req.user.id, body: 'Ваша заявка в друзья принята'
    })
  } else {
    createNotification({
      io: req.app.get('io'), userId: fromUserId, actorId: req.user.id, type: 'friend_rejected',
      targetType: 'friend', targetId: req.user.id, body: 'Вашу заявку в друзья отклонили'
    })
  }
  res.json({ ok: true, approved: approve })
})

// Убрать из друзей
router.delete('/:userId', (req, res) => {
  const targetId = Number(req.params.userId)
  const lo = Math.min(req.user.id, targetId)
  const hi = Math.max(req.user.id, targetId)
  db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').run(lo, hi)
  db.prepare('DELETE FROM friend_requests WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)')
    .run(req.user.id, targetId, targetId, req.user.id)
  res.json({ ok: true })
})

export default router

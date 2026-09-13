import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()
router.use(requireAuth)

const REASONS = ['spam', 'insult', 'nsfw', 'violence', 'fake', 'copyright', 'other']

function targetExists(type, id) {
  switch (type) {
    case 'post': return !!db.prepare('SELECT 1 FROM posts WHERE id=?').get(id)
    case 'video': return !!db.prepare('SELECT 1 FROM library_videos WHERE id=?').get(id)
    case 'audio': return !!db.prepare('SELECT 1 FROM library_audios WHERE id=?').get(id)
    case 'photo': return !!db.prepare('SELECT 1 FROM album_photos WHERE id=?').get(id)
    case 'album': return !!db.prepare('SELECT 1 FROM albums WHERE id=?').get(id)
    default: return false
  }
}

// Подать жалобу на контент (пост/видео/аудио/альбом/фото)
router.post('/', (req, res) => {
  const { targetType, targetId, reason, detail } = req.body || {}
  const type = String(targetType || '')
  const id = Number(targetId)
  if (!['post', 'video', 'audio', 'photo', 'album'].includes(type) || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Недопустимый объект жалобы' })
  }
  if (!targetExists(type, id)) return res.status(404).json({ error: 'Объект не найден' })
  const r = String(reason || '').trim()
  if (!REASONS.includes(r)) return res.status(400).json({ error: 'Недопустимая причина жалобы' })
  const info = db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, detail) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, id, r, String(detail || '').trim().slice(0, 500))
  res.status(201).json({ id: info.lastInsertRowid, ok: true })
})

export default router

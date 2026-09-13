import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'
import { getBookmarkedPosts, countBookmarkedPosts } from '../posts.js'

const router = Router()
router.use(requireAuth)

const PAGE_SIZE = 10

// Переключение закладки (пост/видео)
router.put('/:type/:id', (req, res) => {
  const type = req.params.type // post | video
  const id = Number(req.params.id)
  if (type !== 'post' && type !== 'video') return res.status(400).json({ error: 'Неизвестный тип записи' })
  const table = type === 'post' ? 'posts' : 'library_videos'
  const row = db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id)
  if (!row) return res.status(404).json({ error: 'Запись не найдена' })
  const on = !!req.body?.on
  if (on) {
    db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, target_type, target_id) VALUES (?, ?, ?)')
      .run(req.user.id, type, id)
  } else {
    db.prepare('DELETE FROM bookmarks WHERE user_id=? AND target_type=? AND target_id=?')
      .run(req.user.id, type, id)
  }
  res.json({ bookmarked: on })
})

// Закладки: посты (как лента)
router.get('/posts', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const hideNsfw = !req.user.show_nsfw
  const posts = getBookmarkedPosts(req.user.id, { limit: PAGE_SIZE, offset, hideNsfw })
  const total = countBookmarkedPosts(req.user.id, hideNsfw)
  res.json({ posts, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
})

export default router

import { Router } from 'express'
import db, { utcIso } from '../db.js'
import { requireAuth } from '../auth.js'
import { getFeed, getFeedForUser, getTrending, getPostById, getComments, getCommentById, serializePosts,
  countFeed, countFeedForUser, countTrending } from '../posts.js'
import { notifyMentions, notifyReply } from '../notifications.js'
import { recordView } from '../views.js'
import { createUploader, validateFiles } from '../uploads.js'
import { checkMuted, checkSpam, checkTextLength, checkContentMuted } from '../moderation.js'
import { buildForwardAttachment } from '../forward.js'

const router = Router()

const PAGE_SIZE = 10

function pageInfo(page) {
  const p = Math.max(1, Number.parseInt(page, 10) || 1)
  return { page: p, offset: (p - 1) * PAGE_SIZE }
}

const upload = createUploader({ maxSize: 50 * 1024 * 1024, maxFiles: 8 })

function attachmentType(file) {
  if (file.kind === 'image') return 'photo'
  if (file.kind === 'video') return 'video'
  if (file.kind === 'audio') return 'audio'
  return 'document'
}

// Лента (с постраничной навигацией: 10 постов на страницу)
router.get('/', (req, res) => {
  const kind = req.query.feed
  const { page, offset } = pageInfo(req.query.page)
  // Скрывать NSFW-посты, если пользователь не включил их показ (по умолчанию скрыты)
  const hideNsfw = req.user ? !req.user.show_nsfw : true
  let posts, total
  if (kind === 'new') {
    posts = getFeed(req.user ? req.user.id : null, { limit: PAGE_SIZE, offset, hideNsfw })
    total = countFeed({ hideNsfw })
  } else if (req.user && (kind === 'home' || !kind)) {
    posts = getFeedForUser(req.user.id, req.user.id, { limit: PAGE_SIZE, offset, hideNsfw })
    total = countFeedForUser(req.user.id, req.user.id, hideNsfw)
  } else if (kind === 'trending') {
    posts = getTrending(req.user ? req.user.id : null, { limit: PAGE_SIZE, offset, hideNsfw })
    total = countTrending(hideNsfw)
  } else {
    posts = getFeed(req.user ? req.user.id : null, { limit: PAGE_SIZE, offset, hideNsfw })
    total = countFeed({ hideNsfw })
  }
  res.json({ posts, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
})

router.get('/:id', (req, res) => {
  const post = getPostById(Number(req.params.id), req.user ? req.user.id : null)
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  res.json({ post, comments: getComments(post.id) })
})

// Просмотр поста: защита от накрутки (общая логика в views.js)
router.post('/:id/view', (req, res) => {
  const id = Number(req.params.id)
  const p = db.prepare('SELECT id, author_id FROM posts WHERE id=?').get(id)
  if (!p) return res.status(404).json({ error: 'Пост не найден' })
  const r = recordView('posts', id, p.author_id, req)
  if (r.notFound) return res.status(404).json({ error: 'Пост не найден' })
  res.json({ views: r.views })
})

// Просмотры пачкой (лента/профиль): { ids: [...] } -> { views: { id: count } }
router.post('/views', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : []
  const result = {}
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const p = db.prepare('SELECT id, author_id FROM posts WHERE id=?').get(id)
    if (!p) continue
    result[id] = recordView('posts', id, p.author_id, req).views
  }
  res.json({ views: result })
})

router.get('/:id/comments', (req, res) => {
  res.json(getComments(Number(req.params.id)))
})

// Создание поста
router.post('/', requireAuth, upload.array('file', 8), validateFiles(['image', 'video', 'audio']), (req, res) => {
  const body = (req.body.body || '').trim()
  const communityId = req.body.communityId ? Number(req.body.communityId) : null
  const parentId = req.body.parentId ? Number(req.body.parentId) : null
  const repostOfId = req.body.repostOfId ? Number(req.body.repostOfId) : null
  const nsfw = req.body.nsfw === '1' || req.body.nsfw === 'true'

  // Мут на публикацию постов
  const pmute = checkContentMuted(req.user.id, 'posts')
  if (!pmute.allowed) return res.status(403).json({ error: pmute.error })

  const files = req.files || []
  const attachments = files.map(f => ({
    type: attachmentType(f),
    url: `/uploads/${f.filename}`,
    name: f.originalname
  }))

  let meta = []
  try { meta = JSON.parse(req.body.attachmentMeta || '[]') } catch { meta = [] }
  for (const m of meta) {
    if (m.type === 'note' && String(m.text || '').trim()) {
      attachments.push({ type: 'note', text: String(m.text).trim() })
    } else if (m.type === 'poll' && String(m.question || '').trim()) {
      const options = (Array.isArray(m.options) ? m.options : [])
        .map(o => String(o || '').trim()).filter(Boolean).slice(0, 8)
      if (options.length >= 2) {
        attachments.push({ type: 'poll', question: String(m.question).trim(), options })
      }
    } else if (m.type === 'photo' && m.lib?.kind === 'photo') {
      const p = db.prepare(`
        SELECT ap.id, ap.url FROM album_photos ap JOIN albums a ON a.id=ap.album_id
        WHERE ap.url=? AND a.owner_id=?
      `).get(String(m.lib.url), req.user.id)
      if (p) attachments.push({ type: 'photo', url: p.url, photoId: p.id })
    } else if (m.type === 'video' && m.lib && (m.lib.kind === 'video' || m.lib.url)) {
      const v = m.lib.id
        ? db.prepare('SELECT * FROM library_videos WHERE id=? AND owner_id=?').get(Number(m.lib.id), req.user.id)
        : null
      if (v) {
        attachments.push({ type: 'video', url: v.url, youtube: v.youtube, name: v.title, videoId: v.id })
      } else if (m.lib.url) {
        const owned = db.prepare('SELECT * FROM library_videos WHERE url=? AND owner_id=?')
          .get(String(m.lib.url), req.user.id)
        if (owned) attachments.push({ type: 'video', url: owned.url, youtube: owned.youtube, name: owned.title, videoId: owned.id })
      }
    } else if (m.type === 'audio' && m.lib && (m.lib.kind === 'audio' || m.lib.url)) {
      const a = m.lib.id
        ? db.prepare('SELECT * FROM library_audios WHERE id=? AND owner_id=?').get(Number(m.lib.id), req.user.id)
        : null
      if (a) {
        attachments.push({ type: 'audio', url: a.url, name: a.artist ? `${a.artist} — ${a.title}` : a.title, cover: a.cover })
      } else if (m.lib.url) {
        const owned = db.prepare('SELECT * FROM library_audios WHERE url=? AND owner_id=?')
          .get(String(m.lib.url), req.user.id)
        if (owned) attachments.push({ type: 'audio', url: owned.url, name: owned.artist ? `${owned.artist} — ${owned.title}` : owned.title, cover: owned.cover })
      }
    } else if (m.type === 'forward' && m.messageId) {
      const src = db.prepare('SELECT * FROM messages WHERE id=?').get(Number(m.messageId))
      if (src && !src.deleted) {
        const canSee = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?')
          .get(src.conversation_id, req.user.id)
        if (canSee) {
          const sender = db.prepare('SELECT * FROM users WHERE id=?').get(src.sender_id)
          const fwd = buildForwardAttachment(src, sender)
          if (fwd) attachments.push(fwd[0])
        }
      }
    }
  }

  if (!body && !repostOfId && !files.length && !attachments.length) {
    return res.status(400).json({ error: 'Пост не может быть пустым' })
  }

  // Проверка прав на публикацию в сообщество: членство + режим записей.
  // Если сообщество настроено «от имени сообщества» — владелец/модератор пишет как сообщество.
  let authorCommunityId = null
  if (communityId) {
    const c = db.prepare('SELECT post_mode, post_as FROM communities WHERE id=?').get(communityId)
    if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
    const member = db.prepare('SELECT role FROM community_members WHERE community_id=? AND user_id=?')
      .get(communityId, req.user.id)
    if (!member) return res.status(403).json({ error: 'Вы не состоите в этом сообществе' })
    if ((c.post_mode || 'member') === 'owner' && member.role !== 'owner' && member.role !== 'moderator') {
      return res.status(403).json({ error: 'Писать в этом сообществе могут только владелец и администраторы' })
    }
    if ((c.post_as || 'user') === 'community' && (member.role === 'owner' || member.role === 'moderator')) {
      authorCommunityId = communityId
    }
  }

  const firstPhoto = attachments.find(a => a.type === 'photo')
  const info = db.prepare(`
    INSERT INTO posts (author_id, community_id, author_community_id, body, image, attachments, parent_id, repost_of_id, nsfw, pinned_until, community_pinned_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')
  `).run(req.user.id, communityId, authorCommunityId, body || '', firstPhoto ? firstPhoto.url : null,
    JSON.stringify(attachments), parentId, repostOfId, nsfw ? 1 : 0)

  const post = getPostById(info.lastInsertRowid, req.user.id)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'post', targetId: post.id })
  res.status(201).json(post)
})

// Пересылка сообщения из личной переписки в пост (вложение «переслано»)
router.post('/forward', requireAuth, (req, res) => {
  const messageId = Number(req.body?.messageId)
  const body = (req.body?.body || '').trim()
  const communityId = req.body?.communityId ? Number(req.body.communityId) : null
  const nsfw = req.body?.nsfw === '1' || req.body?.nsfw === 'true'

  const src = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId)
  if (!src || src.deleted) return res.status(404).json({ error: 'Сообщение не найдено' })
  const canSee = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?')
    .get(src.conversation_id, req.user.id)
  if (!canSee) return res.status(403).json({ error: 'Нет доступа к исходному сообщению' })
  const sender = db.prepare('SELECT * FROM users WHERE id=?').get(src.sender_id)
  const forwardAtt = buildForwardAttachment(src, sender)
  if (!forwardAtt) return res.status(400).json({ error: 'Нечего пересылать' })

  const muted = checkMuted(req.user.id)
  if (!muted.allowed) return res.status(403).json({ error: muted.error })
  const len = checkTextLength(body)
  if (!len.allowed) return res.status(400).json({ error: len.error })

  let authorCommunityId = null
  if (communityId) {
    const c = db.prepare('SELECT post_mode, post_as FROM communities WHERE id=?').get(communityId)
    if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
    const member = db.prepare('SELECT role FROM community_members WHERE community_id=? AND user_id=?')
      .get(communityId, req.user.id)
    if (!member) return res.status(403).json({ error: 'Вы не состоите в этом сообществе' })
    if ((c.post_mode || 'member') === 'owner' && member.role !== 'owner' && member.role !== 'moderator') {
      return res.status(403).json({ error: 'Писать в этом сообществе могут только владелец и администраторы' })
    }
    if ((c.post_as || 'user') === 'community' && (member.role === 'owner' || member.role === 'moderator')) {
      authorCommunityId = communityId
    }
  }

  const info = db.prepare(`
    INSERT INTO posts (author_id, community_id, author_community_id, body, image, attachments, parent_id, repost_of_id, nsfw, pinned_until, community_pinned_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')
  `).run(req.user.id, communityId, authorCommunityId, body, null, JSON.stringify(forwardAtt), null, null, nsfw ? 1 : 0)
  const post = getPostById(info.lastInsertRowid, req.user.id)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'post', targetId: post.id })
  res.status(201).json(post)
})

router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id))
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  if (post.author_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Чужой пост нельзя удалить' })
  db.prepare('DELETE FROM posts WHERE id=?').run(post.id)
  res.json({ ok: true })
})

// Редактирование поста (только автор, не позднее 24 часов с момента создания)
router.put('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id))
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Чужой пост нельзя изменить' })
  const ageMs = Date.now() - new Date(utcIso(post.created_at)).getTime()
  if (ageMs > 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Пост старше 24 часов — его нельзя изменить' })

  const body = (req.body?.body ?? '').trim()
  if (!body && !post.image && (post.attachments === '[]' || !post.attachments)) {
    return res.status(400).json({ error: 'Пост не может быть пустым' })
  }
  db.prepare('UPDATE posts SET body=?, edited_at=datetime(\'now\') WHERE id=?').run(body, post.id)
  res.json(getPostById(post.id, req.user.id))
})

// Закрепить/открепить пост (автор или админ). until — своё время до которого закрепить,
// null — навсегда, '' — открепить.
router.put('/:id/pin', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id))
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  if (post.author_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Чужой пост нельзя закрепить' })

  const until = req.body?.until
  let pinnedUntil
  if (until === null) {
    pinnedUntil = null // навсегда
  } else if (until === '') {
    pinnedUntil = ''   // открепить
  } else if (typeof until === 'string' && until.trim()) {
    const ts = new Date(until)
    if (isNaN(ts.getTime())) return res.status(400).json({ error: 'Некорректное время' })
    if (ts.getTime() <= Date.now()) return res.status(400).json({ error: 'Время закрепления должно быть в будущем' })
    pinnedUntil = ts.toISOString().slice(0, 19).replace('T', ' ') // SQLite UTC «YYYY-MM-DD HH:MM:SS»
  } else {
    return res.status(400).json({ error: 'Укажите время закрепления' })
  }

  db.prepare('UPDATE posts SET pinned_until=? WHERE id=?').run(pinnedUntil, post.id)
  res.json(getPostById(post.id, req.user.id))
})

// Кто лайкнул пост (для аватарок)
router.get('/:id/likes', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id=?').get(Number(req.params.id))
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.is_admin
    FROM reactions r JOIN users u ON u.id = r.user_id
    WHERE r.post_id = ? ORDER BY r.created_at DESC
  `).all(post.id).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatar: u.avatar,
    isAdmin: !!u.is_admin
  }))
  res.json({ users })
})

// Реакции
router.put('/:id/reaction', requireAuth, (req, res) => {
  const postId = Number(req.params.id)
  const exists = db.prepare('SELECT id FROM posts WHERE id=?').get(postId)
  if (!exists) return res.status(404).json({ error: 'Пост не найден' })
  const type = req.body.type // если null/undefined — снять реакцию
  db.prepare('DELETE FROM reactions WHERE post_id=? AND user_id=?').run(postId, req.user.id)
  if (type) {
    db.prepare('INSERT INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)').run(postId, req.user.id, type)
  }
  const post = getPostById(postId, req.user.id)
  res.json({ reactions: post.reactions, reactionsCount: post.reactions.count })
})

// Голосование / отмена голоса в опросе
router.post('/:id/poll', requireAuth, (req, res) => {
  const postId = Number(req.params.id)
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(postId)
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  let attachments = []
  try { attachments = JSON.parse(post.attachments || '[]') } catch { attachments = [] }
  const poll = attachments.find(a => a.type === 'poll')
  if (!poll) return res.status(400).json({ error: 'В посте нет опроса' })

  if (req.body?.option == null) {
    // отменить свой голос
    db.prepare('DELETE FROM poll_votes WHERE post_id=? AND user_id=?').run(postId, req.user.id)
    return res.json(getPostById(postId, req.user.id))
  }

  const option = Number(req.body.option)
  if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) {
    return res.status(400).json({ error: 'Недопустимый вариант ответа' })
  }
  db.prepare('DELETE FROM poll_votes WHERE post_id=? AND user_id=?').run(postId, req.user.id)
  db.prepare('INSERT INTO poll_votes (post_id, user_id, option_index) VALUES (?,?,?)').run(postId, req.user.id, option)
  res.json(getPostById(postId, req.user.id))
})

// Комментарий
router.post('/:id/comments', requireAuth, (req, res) => {
  const body = (req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Пустой комментарий' })
  const post = db.prepare('SELECT id FROM posts WHERE id=?').get(Number(req.params.id))
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null
  let parent = null
  if (parentId) {
    parent = db.prepare('SELECT * FROM comments WHERE id=? AND post_id=?').get(parentId, post.id)
    if (!parent) return res.status(400).json({ error: 'Нельзя ответить на этот комментарий' })
  }
  const info = db.prepare(`INSERT INTO comments (post_id, author_id, body, parent_id) VALUES (?, ?, ?, ?)`)
    .run(post.id, req.user.id, body, parentId)
  const c = getCommentById(info.lastInsertRowid)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'post', targetId: post.id, commentId: c.id })
  notifyReply(req.app.get('io'), req.user.id, parent, { targetType: 'post', targetId: post.id })
  res.status(201).json(c)
})

export default router
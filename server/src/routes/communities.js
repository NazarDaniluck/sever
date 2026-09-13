import { Router } from 'express'
import db, { utcIso } from '../db.js'
import { requireAuth, publicUser, parseBackdrop } from '../auth.js'
import { getFeed, getPostById } from '../posts.js'
import { createNotification } from '../notifications.js'
import { createUploader, validateFiles } from '../uploads.js'

const router = Router()

function serializeCommunity(c) {
  if (!c) return c
  const { hide_owner, ...rest } = c
  return { ...rest, hideOwner: !!hide_owner, backdrop: parseBackdrop(c.backdrop) }
}

const upload = createUploader({ maxSize: 8 * 1024 * 1024 })

function isOwnerOrAdmin(c, req) {
  return req.user && (c.owner_id === req.user.id || req.user.is_admin)
}

function memberRole(c, userId) {
  if (!userId) return null
  const m = db.prepare('SELECT role FROM community_members WHERE community_id=? AND user_id=?').get(c.id, userId)
  return m ? m.role : null
}

function canWrite(c, userId, role) {
  if (!userId || !role) return false
  if (role === 'owner' || role === 'moderator') return true
  return (c.post_mode || 'member') === 'member'
}

// Модерация постов сообщества: владелец, модераторы сообщества и админы
function canModerate(c, req) {
  if (!req.user) return false
  if (req.user.is_admin) return true
  const role = memberRole(c, req.user.id)
  return role === 'owner' || role === 'moderator'
}

router.put('/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Нет прав на изменение сообщества' })

  const { name, description, backdrop, joinMode, postMode, postAs, slug, hideOwner } = req.body || {}
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Название не может быть пустым' })
  if (joinMode !== undefined && !['open', 'request', 'closed'].includes(joinMode)) {
    return res.status(400).json({ error: 'Недопустимый режим вступления' })
  }
  if (postMode !== undefined && !['member', 'owner'].includes(postMode)) {
    return res.status(400).json({ error: 'Недопустимый режим записей' })
  }
  if (postAs !== undefined && !['user', 'community'].includes(postAs)) {
    return res.status(400).json({ error: 'Недопустимый режим авторства' })
  }
  if (slug !== undefined && !/^[\w-]{3,30}$/.test(String(slug).trim())) {
    return res.status(400).json({ error: 'Адрес: 3–30 символов, допустимы буквы, цифры, "_" и "-"' })
  }

  const newName = name !== undefined ? String(name).trim() : c.name
  if (slug !== undefined && String(slug).trim() !== c.slug) {
    const newSlug = String(slug).trim()
    const slugTaken = db.prepare('SELECT 1 FROM communities WHERE slug=? AND id != ?').get(newSlug, c.id)
    if (slugTaken) return res.status(409).json({ error: 'Такой адрес уже занят' })
    db.prepare('UPDATE communities SET slug=? WHERE id=?').run(newSlug, c.id)
  } else if (slug === undefined && newName !== c.name) {
    const taken = db.prepare('SELECT 1 FROM communities WHERE name=? AND id != ?').get(newName, c.id)
    if (taken) return res.status(409).json({ error: 'Такое название уже занято' })
    const auto = slugify(newName)
    const slugTaken = db.prepare('SELECT 1 FROM communities WHERE slug=? AND id != ?').get(auto, c.id)
    db.prepare('UPDATE communities SET name=?, slug=? WHERE id=?').run(newName, slugTaken ? `${auto}-${c.id}` : auto, c.id)
  }
  if (description !== undefined) {
    db.prepare('UPDATE communities SET description=? WHERE id=?').run(String(description).trim(), c.id)
  }
  if (backdrop !== undefined) {
    const b = backdrop && backdrop.type ? JSON.stringify({ type: String(backdrop.type), value: backdrop.value || null }) : null
    db.prepare('UPDATE communities SET backdrop=? WHERE id=?').run(b, c.id)
  }
  if (joinMode !== undefined) {
    db.prepare('UPDATE communities SET join_mode=? WHERE id=?').run(joinMode, c.id)
  }
  if (postMode !== undefined) {
    db.prepare('UPDATE communities SET post_mode=? WHERE id=?').run(postMode, c.id)
  }
  if (postAs !== undefined) {
    db.prepare('UPDATE communities SET post_as=? WHERE id=?').run(postAs, c.id)
  }
  if (hideOwner !== undefined) {
    db.prepare('UPDATE communities SET hide_owner=? WHERE id=?').run(hideOwner ? 1 : 0, c.id)
  }
  res.json(serializeCommunity(db.prepare('SELECT * FROM communities WHERE id=?').get(c.id)))
})

router.post('/:id/avatar', requireAuth, upload.single('avatar'), validateFiles(['image']), (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Нет прав на изменение сообщества' })
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  db.prepare('UPDATE communities SET avatar=? WHERE id=?').run(`/uploads/${req.file.filename}`, c.id)
  res.json(serializeCommunity(db.prepare('SELECT * FROM communities WHERE id=?').get(c.id)))
})

// Обложка сообщества (широкая картинка шапки)
router.post('/:id/cover', requireAuth, upload.single('cover'), validateFiles(['image']), (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Нет прав на изменение сообщества' })
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  db.prepare('UPDATE communities SET cover=? WHERE id=?').run(`/uploads/${req.file.filename}`, c.id)
  res.json(serializeCommunity(db.prepare('SELECT * FROM communities WHERE id=?').get(c.id)))
})

function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
  return base || `community-${Date.now()}`
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim()
  let rows
  if (q) {
    rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id=c.id) AS members
      FROM communities c WHERE c.name LIKE ? OR c.description LIKE ? LIMIT 20
    `).all(`%${q}%`, `%${q}%`)
  } else {
    rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id=c.id) AS members
      FROM communities c ORDER BY members DESC LIMIT 20
    `).all()
  }
  res.json(rows.map(serializeCommunity))
})

router.post('/', requireAuth, (req, res) => {
  const { name, description } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите название сообщества' })
  const slug = slugify(name)
  const exists = db.prepare('SELECT 1 FROM communities WHERE slug=?').get(slug)
  const finalSlug = exists ? `${slug}-${Date.now().toString(36)}` : slug

  const info = db.prepare('INSERT INTO communities (name, slug, description, owner_id) VALUES (?,?,?,?)')
    .run(name.trim(), finalSlug, description || '', req.user.id)
  const cid = info.lastInsertRowid
  db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?,?,?)').run(cid, req.user.id, 'owner')
  const c = db.prepare('SELECT * FROM communities WHERE id=?').get(cid)
  res.status(201).json(serializeCommunity(c))
})

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=?').get(Number(req.params.id)) ||
          db.prepare('SELECT * FROM communities WHERE slug=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })

  const role = memberRole(c, req.user ? req.user.id : null)
  const isMember = !!role
  const canManage = isOwnerOrAdmin(c, req)
  const memberCount = db.prepare('SELECT COUNT(*) n FROM community_members WHERE community_id=?').get(c.id).n
  const owner = db.prepare('SELECT * FROM users WHERE id=?').get(c.owner_id)
  const members = db.prepare(`
    SELECT u.* FROM community_members cm JOIN users u ON u.id=cm.user_id
    WHERE cm.community_id=? ORDER BY cm.created_at DESC LIMIT 8
  `).all(c.id)

  const joinRequested = req.user && db.prepare('SELECT 1 FROM community_join_requests WHERE community_id=? AND user_id=?')
    .get(c.id, req.user.id)
  const pendingJoinCount = canManage
    ? db.prepare('SELECT COUNT(*) n FROM community_join_requests WHERE community_id=?').get(c.id).n
    : 0
  const postCount = db.prepare('SELECT COUNT(*) n FROM posts WHERE community_id=? AND parent_id IS NULL').get(c.id).n

  // «Сообщество-призрак»: владелец скрыт для всех, кроме самого владельца и админов
  const ownerHidden = !!c.hide_owner && !canManage

  res.json({
    community: serializeCommunity(c),
    isMember,
    memberRole: role,
    joinRequested: !!joinRequested,
    canWrite: isMember && canWrite(c, req.user ? req.user.id : null, role),
    canModerate: canModerate(c, req),
    canManage: canManage,
    pendingJoinCount,
    memberCount,
    postCount,
    ownerHidden,
    owner: ownerHidden ? null : publicUser(owner),
    members: members.map(publicUser)
  })
})

// Полный список участников с ролями (для модерации сообщества и страницы участников)
router.get('/:id/members', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  const total = db.prepare('SELECT COUNT(*) n FROM community_members WHERE community_id=?').get(c.id).n
  const limit = Math.min(Number(req.query.limit) || -1, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const rows = db.prepare(`
    SELECT u.*, cm.role AS member_role, cm.created_at AS joined_at
    FROM community_members cm JOIN users u ON u.id=cm.user_id
    WHERE cm.community_id=?
    ORDER BY (CASE cm.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END), cm.created_at ASC
    LIMIT ? OFFSET ?
  `).all(c.id, limit, offset)
  res.json({ total, members: rows.map(r => ({ ...publicUser(r), memberRole: r.member_role, joinedAt: utcIso(r.joined_at) })) })
})

router.post('/:id/join', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  const already = db.prepare('SELECT 1 FROM community_members WHERE community_id=? AND user_id=?').get(c.id, req.user.id)
  if (already) return res.json({ ok: true, status: 'member' })

  const mode = c.join_mode || 'open'
  if (mode === 'closed') {
    return res.status(403).json({ error: 'Вступление в это сообщество закрыто', code: 'JOIN_CLOSED' })
  }
  if (mode === 'request') {
    db.prepare('INSERT OR IGNORE INTO community_join_requests (community_id, user_id) VALUES (?,?)')
      .run(c.id, req.user.id)
    const io = req.app.get('io')
    createNotification({
      io, userId: c.owner_id, actorId: req.user.id, type: 'community_join_request',
      targetType: 'community', targetId: c.id, body: `Хочет вступить в «${c.name}»`
    })
    return res.json({ ok: true, status: 'pending' })
  }
  db.prepare('INSERT OR IGNORE INTO community_members (community_id, user_id, role) VALUES (?,?,?)')
    .run(c.id, req.user.id, 'member')
  res.json({ ok: true, status: 'member' })
})

router.delete('/:id/join', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  db.prepare("DELETE FROM community_members WHERE community_id=? AND user_id=? AND role != 'owner'").run(c.id, req.user.id)
  db.prepare('DELETE FROM community_join_requests WHERE community_id=? AND user_id=?').run(c.id, req.user.id)
  res.json({ ok: true })
})

// Заявки на вступление (владелец/админ)
router.get('/:id/join-requests', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Нет прав' })
  const rows = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar, u.is_admin
    FROM community_join_requests r JOIN users u ON u.id = r.user_id
    WHERE r.community_id = ? ORDER BY r.created_at DESC
  `).all(c.id)
  res.json(rows.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    user: { id: r.user_id, username: r.username, displayName: r.display_name, avatar: r.avatar, isAdmin: !!r.is_admin }
  })))
})

// Одобрить/отклонить заявку на вступление
router.post('/:id/join-requests/:userId/respond', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id) || 0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Нет прав' })
  const userId = Number(req.params.userId)
  const r = db.prepare('SELECT 1 FROM community_join_requests WHERE community_id=? AND user_id=?').get(c.id, userId)
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' })
  db.prepare('DELETE FROM community_join_requests WHERE community_id=? AND user_id=?').run(c.id, userId)
  const io = req.app.get('io')
  if (req.body?.approve === true) {
    db.prepare('INSERT OR IGNORE INTO community_members (community_id, user_id, role) VALUES (?,?,?)')
      .run(c.id, userId, 'member')
    createNotification({
      io, userId, actorId: req.user.id, type: 'community_join_approved',
      targetType: 'community', targetId: c.id, body: `Ваша заявка в «${c.name}» одобрена`
    })
    res.json({ ok: true, approved: true })
  } else {
    createNotification({
      io, userId, actorId: req.user.id, type: 'community_join_rejected',
      targetType: 'community', targetId: c.id, body: `Вашу заявку в «${c.name}» отклонили`
    })
    res.json({ ok: true, approved: false })
  }
})

router.get('/:id/posts', (req, res) => {
  const num = Number(req.params.id)
  const c = db.prepare('SELECT id FROM communities WHERE id=? OR slug=?').get(num, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  res.json(getFeed(req.user ? req.user.id : null, { communityId: c.id, hideNsfw: req.user ? !req.user.show_nsfw : true }))
})

router.post('/:id/posts', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id)||0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  const role = memberRole(c, req.user.id)
  if (!role) return res.status(403).json({ error: 'Сначала вступите в сообщество' })
  if (!canWrite(c, req.user.id, role)) {
    return res.status(403).json({ error: 'Писать в этом сообществе могут только владелец и администраторы' })
  }
  const body = (req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Пост пустой' })
  const authorCommunityId = (c.post_as || 'user') === 'community' && (role === 'owner' || role === 'moderator')
    ? c.id : null
  const info = db.prepare(`INSERT INTO posts (author_id, community_id, author_community_id, body, pinned_until, community_pinned_until) VALUES (?,?,?,?,'','')`)
    .run(req.user.id, c.id, authorCommunityId, body)
  res.status(201).json(getPostById(info.lastInsertRowid, req.user.id))
})

// Удаление поста в сообществе (владелец, модераторы сообщества, админы)
router.delete('/:id/posts/:postId', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id)||0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!canModerate(c, req)) return res.status(403).json({ error: 'Нет прав модерации сообщества' })
  const post = db.prepare('SELECT * FROM posts WHERE id=? AND community_id=?').get(Number(req.params.postId), c.id)
  if (!post) return res.status(404).json({ error: 'Пост не найден' })
  db.prepare('DELETE FROM posts WHERE id=?').run(post.id)
  res.json({ ok: true })
})

// Закрепить/открепить пост в сообществе. until — своё время, null — навсегда, '' — открепить.
router.put('/:id/posts/:postId/pin', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id)||0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!canModerate(c, req)) return res.status(403).json({ error: 'Нет прав модерации сообщества' })
  const post = db.prepare('SELECT * FROM posts WHERE id=? AND community_id=?').get(Number(req.params.postId), c.id)
  if (!post) return res.status(404).json({ error: 'Пост не найден' })

  const until = req.body?.until
  let pinnedUntil
  if (until === null) {
    pinnedUntil = null
  } else if (until === '') {
    pinnedUntil = ''
  } else if (typeof until === 'string' && until.trim()) {
    const ts = new Date(until)
    if (isNaN(ts.getTime())) return res.status(400).json({ error: 'Некорректное время' })
    if (ts.getTime() <= Date.now()) return res.status(400).json({ error: 'Время закрепления должно быть в будущем' })
    pinnedUntil = ts.toISOString().slice(0, 19).replace('T', ' ')
  } else {
    return res.status(400).json({ error: 'Укажите время закрепления' })
  }

  db.prepare('UPDATE posts SET community_pinned_until=? WHERE id=?').run(pinnedUntil, post.id)
  res.json(getPostById(post.id, req.user.id))
})

// Назначить/снять администратора сообщества (только владелец или админ)
router.put('/:id/members/:userId/role', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id)||0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!isOwnerOrAdmin(c, req)) return res.status(403).json({ error: 'Только владелец сообщества' })
  const userId = Number(req.params.userId)
  const role = memberRole(c, userId)
  if (!role) return res.status(404).json({ error: 'Участник не найден' })
  if (role === 'owner') return res.status(400).json({ error: 'Владелец всегда владелец' })
  const next = req.body?.admin === true ? 'moderator' : 'member'
  db.prepare('UPDATE community_members SET role=? WHERE community_id=? AND user_id=?').run(next, c.id, userId)
  res.json({ ok: true, role: next })
})

// Исключить участника (владелец, модераторы сообщества, админы)
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? OR slug=?').get(Number(req.params.id)||0, req.params.id)
  if (!c) return res.status(404).json({ error: 'Сообщество не найдено' })
  if (!canModerate(c, req)) return res.status(403).json({ error: 'Нет прав модерации сообщества' })
  const userId = Number(req.params.userId)
  const role = memberRole(c, userId)
  if (!role) return res.status(404).json({ error: 'Участник не найден' })
  if (role === 'owner') return res.status(403).json({ error: 'Нельзя исключить владельца' })
  db.prepare('DELETE FROM community_members WHERE community_id=? AND user_id=?').run(c.id, userId)
  res.json({ ok: true })
})

export default router
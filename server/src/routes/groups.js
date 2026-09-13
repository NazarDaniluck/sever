import { Router } from 'express'
import crypto from 'node:crypto'
import db, { utcIso } from '../db.js'
import { requireAuth, publicUser } from '../auth.js'
import { createUploader, validateFiles } from '../uploads.js'
import { checkMuted, checkSpam, checkTextLength, checkContentMuted } from '../moderation.js'
import { createNotification } from '../notifications.js'

const router = Router()

const DEFAULT_LIMIT = 100
const MIN_LIMIT = 2
const MAX_LIMIT = 500
const ACCESS = ['open', 'link', 'closed']

const upload = createUploader({ maxSize: 8 * 1024 * 1024 })

function newToken() {
  return crypto.randomBytes(18).toString('base64url')
}

function serializeGroup(g, extra = {}) {
  return {
    id: g.id,
    name: g.name,
    description: g.description || '',
    avatar: g.avatar || null,
    cover: g.cover || null,
    access: g.access || 'open',
    memberLimit: g.member_limit || DEFAULT_LIMIT,
    createdAt: utcIso(g.created_at),
    ...extra
  }
}

function getGroup(id) {
  return db.prepare('SELECT * FROM groups WHERE id=?').get(Number(id))
}

function memberRole(gid, uid) {
  if (!uid) return null
  const m = db.prepare('SELECT role FROM group_members WHERE group_id=? AND user_id=?').get(gid, uid)
  return m ? m.role : null
}

function isOwnerOrAdmin(gid, uid) {
  const role = memberRole(gid, uid)
  return role === 'owner' || role === 'admin'
}

function memberCount(gid) {
  return db.prepare('SELECT COUNT(*) n FROM group_members WHERE group_id=?').get(gid).n
}

function canViewGroup(g, meId) {
  if (!g) return false
  if (g.access === 'open') return true
  if (meId == null) return false
  if (memberRole(g.id, meId)) return true
  // По ссылке: можно посмотреть страницу группы (и вступить), но она не в списках.
  return g.access === 'link'
}

function serializeMessage(r) {
  let atts = []
  try { atts = JSON.parse(r.attachments || '[]') } catch { atts = [] }
  return {
    id: r.id,
    groupId: r.group_id,
    body: r.body,
    attachments: atts,
    createdAt: utcIso(r.created_at),
    sender: { id: r.sender_id, username: r.username, displayName: r.display_name, avatar: r.avatar }
  }
}

function buildGroupAttachments(meta) {
  const atts = []
  for (const m of (Array.isArray(meta) ? meta : [])) {
    if (m.type === 'photo' && m.lib && m.lib.url) {
      atts.push({ type: 'photo', url: m.lib.url })
    } else if (m.type === 'video' && m.lib) {
      atts.push({ type: 'video', url: m.lib.url, videoId: m.lib.id, name: m.lib.name, youtube: m.lib.youtube })
    }
  }
  return atts
}

// Список групп: открытые + группы, где пользователь уже участник
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim()
  const meId = req.user ? req.user.id : null
  const myGroups = meId != null
    ? db.prepare('SELECT group_id FROM group_members WHERE user_id=?').all(meId).map(r => r.group_id)
    : []
  const ids = [...new Set(myGroups)]
  const idPh = ids.length ? ids.map(() => '?').join(',') : 'NULL'

  let rows
  if (q) {
    rows = db.prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS members
      FROM groups g
      WHERE (g.access='open' OR g.id IN (${idPh}))
        AND (contains_no_case(g.name, ?) OR contains_no_case(g.description, ?))
      LIMIT 20
    `).all(q, q, ...ids)
  } else {
    rows = db.prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS members
      FROM groups g
      WHERE g.access='open' OR g.id IN (${idPh})
      ORDER BY members DESC, g.id DESC LIMIT 20
    `).all(...ids)
  }
  res.json(rows.map(g => serializeGroup(g, {
    members: g.members,
    isMember: meId != null && !!memberRole(g.id, meId)
  })))
})

// Создать группу
router.post('/', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Укажите название группы' })
  if (name.length > 60) return res.status(400).json({ error: 'Название слишком длинное (максимум 60 символов)' })
  const description = String(req.body?.description || '').trim().slice(0, 500)
  const access = ACCESS.includes(req.body?.access) ? req.body.access : 'open'
  const memberLimit = clampLimit(req.body?.memberLimit)

  const info = db.prepare('INSERT INTO groups (name, description, owner_id, access, member_limit, invite_token) VALUES (?,?,?,?,?,?)')
    .run(name, description, req.user.id, access, memberLimit, newToken())
  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?,?,?)').run(info.lastInsertRowid, req.user.id, 'owner')
  const g = getGroup(info.lastInsertRowid)
  res.status(201).json(serializeGroup(g, { members: 1, myRole: 'owner', isMember: true, inviteToken: g.invite_token }))
})

function clampLimit(v) {
  const n = Number.parseInt(v, 10)
  if (!isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n))
}

router.get('/:id', (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  const meId = req.user ? req.user.id : null
  if (!canViewGroup(g, meId)) return res.status(403).json({ error: 'Нет доступа к группе' })
  const myRole = memberRole(g.id, meId)
  const members = db.prepare(`
    SELECT gm.role, u.id, u.username, u.display_name, u.avatar, u.is_admin, u.is_moderator, u.is_tester, u.verified, u.memorialized, u.created_at
    FROM group_members gm JOIN users u ON u.id=gm.user_id
    WHERE gm.group_id=? ORDER BY (CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END), gm.created_at ASC
  `).all(g.id).map(r => ({ ...publicUser(r), groupRole: r.role }))
  const owner = db.prepare('SELECT * FROM users WHERE id=?').get(g.owner_id)
  const isOwner = myRole === 'owner' || myRole === 'admin'
  const invite = meId != null
    ? db.prepare("SELECT * FROM group_invites WHERE group_id=? AND user_id=? AND status='pending'").get(g.id, meId)
    : null
  res.json({
    group: serializeGroup(g, {
      members: members.length,
      myRole,
      inviteToken: isOwner ? g.invite_token : undefined,
      invite: invite ? { id: invite.id, status: invite.status } : null
    }),
    isMember: !!myRole,
    memberCount: members.length,
    owner: publicUser(owner),
    members,
    canJoin: g.access === 'open' && !myRole && !invite,
    isFull: memberCount(g.id) >= (g.member_limit || DEFAULT_LIMIT)
  })
})

// Редактирование группы (включая доступ и лимит участников)
router.put('/:id', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав на изменение группы' })
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Название не может быть пустым' })
    if (name.length > 60) return res.status(400).json({ error: 'Название слишком длинное' })
    db.prepare('UPDATE groups SET name=? WHERE id=?').run(name, g.id)
  }
  if (req.body.description !== undefined) {
    db.prepare('UPDATE groups SET description=? WHERE id=?').run(String(req.body.description || '').trim().slice(0, 500), g.id)
  }
  if (req.body.access !== undefined) {
    if (!ACCESS.includes(req.body.access)) return res.status(400).json({ error: 'Недопустимый режим доступа' })
    db.prepare('UPDATE groups SET access=? WHERE id=?').run(req.body.access, g.id)
  }
  if (req.body.memberLimit !== undefined) {
    db.prepare('UPDATE groups SET member_limit=? WHERE id=?').run(clampLimit(req.body.memberLimit), g.id)
  }
  res.json(serializeGroup(getGroup(g.id)))
})

// Аватарка группы
router.post('/:id/avatar', requireAuth, upload.single('avatar'), validateFiles(['image']), (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  db.prepare('UPDATE groups SET avatar=? WHERE id=?').run(`/uploads/${req.file.filename}`, g.id)
  res.json(serializeGroup(getGroup(g.id)))
})

// Обложка группы
router.post('/:id/cover', requireAuth, upload.single('cover'), validateFiles(['image']), (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
  db.prepare('UPDATE groups SET cover=? WHERE id=?').run(`/uploads/${req.file.filename}`, g.id)
  res.json(serializeGroup(getGroup(g.id)))
})

// Вступить в группу (учитывая режим доступа и лимит участников)
router.post('/:id/join', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (memberRole(g.id, req.user.id)) return res.json({ ok: true, status: 'member' })
  if (g.access === 'closed') return res.status(403).json({ error: 'Вступление в группу закрыто — только по приглашению' })
  if (g.access === 'link') {
    const token = String(req.body?.token || '')
    if (!token || token !== g.invite_token) return res.status(403).json({ error: 'Неверная ссылка-приглашение' })
  }
  const limit = g.member_limit || DEFAULT_LIMIT
  const count = memberCount(g.id)
  if (count >= limit) return res.status(403).json({ error: `В группе достигнут лимит участников (${limit})` })
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?,?,?)').run(g.id, req.user.id, 'member')
  res.json({ ok: true, status: 'member' })
})

// Пригласить пользователя по username (владелец/админ) — приглашение приходит в уведомления
router.post('/:id/invite', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  const username = String(req.body?.username || '').trim().replace(/^@/, '')
  if (!username) return res.status(400).json({ error: 'Укажите username участника' })
  const u = db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username)
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' })
  if (memberRole(g.id, u.id)) return res.json({ ok: true, status: 'already' })
  const existing = db.prepare("SELECT id FROM group_invites WHERE group_id=? AND user_id=? AND status='pending'").get(g.id, u.id)
  if (existing) return res.json({ ok: true, status: 'pending', inviteId: existing.id })
  const limit = g.member_limit || DEFAULT_LIMIT
  if (memberCount(g.id) >= limit) return res.status(403).json({ error: `В группе достигнут лимит участников (${limit})` })
  const info = db.prepare("INSERT INTO group_invites (group_id, user_id, inviter_id, status) VALUES (?,?,?, 'pending')")
    .run(g.id, u.id, req.user.id)
  createNotification({
    io: req.app.get('io'),
    userId: u.id,
    actorId: req.user.id,
    type: 'group_invite',
    targetType: 'group',
    targetId: g.id,
    commentId: info.lastInsertRowid,
    body: g.name
  })
  res.status(201).json({ ok: true, status: 'sent', inviteId: info.lastInsertRowid })
})

// Принять приглашение в группу
router.post('/:id/invites/accept', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  const invite = db.prepare("SELECT * FROM group_invites WHERE group_id=? AND user_id=? AND status='pending'").get(g.id, req.user.id)
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' })
  if (memberRole(g.id, req.user.id)) {
    db.prepare("UPDATE group_invites SET status='accepted', responded_at=? WHERE id=?").run(utcIso(), invite.id)
    return res.json({ ok: true, status: 'member' })
  }
  const limit = g.member_limit || DEFAULT_LIMIT
  if (memberCount(g.id) >= limit) return res.status(403).json({ error: `В группе достигнут лимит участников (${limit})` })
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?,?,?)').run(g.id, req.user.id, 'member')
  db.prepare("UPDATE group_invites SET status='accepted', responded_at=? WHERE id=?").run(utcIso(), invite.id)
  res.json({ ok: true, status: 'member' })
})

// Отклонить приглашение в группу
router.post('/:id/invites/decline', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  const invite = db.prepare("SELECT * FROM group_invites WHERE group_id=? AND user_id=? AND status='pending'").get(g.id, req.user.id)
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' })
  db.prepare("UPDATE group_invites SET status='declined', responded_at=? WHERE id=?").run(utcIso(), invite.id)
  res.json({ ok: true, status: 'declined' })
})

// Перегенерировать ссылку-приглашение (владелец/админ)
router.post('/:id/invite-link', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  const token = newToken()
  db.prepare('UPDATE groups SET invite_token=? WHERE id=?').run(token, g.id)
  res.json({ ok: true, inviteToken: token })
})

// Покинуть группу
router.delete('/:id/join', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (memberRole(g.id, req.user.id) === 'owner') {
    return res.status(403).json({ error: 'Владелец не может покинуть группу — удалите её' })
  }
  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(g.id, req.user.id)
  res.json({ ok: true })
})

// Исключить участника (владелец/админ)
router.post('/:id/members/:userId/kick', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  const userId = Number(req.params.userId)
  const role = memberRole(g.id, userId)
  if (!role) return res.status(404).json({ error: 'Участник не найден' })
  if (role === 'owner') return res.status(403).json({ error: 'Нельзя исключить владельца' })
  if (role === 'admin' && memberRole(g.id, req.user.id) !== 'owner') return res.status(403).json({ error: 'Только владелец может исключать администраторов' })
  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(g.id, userId)
  res.json({ ok: true })
})

// Назначить/снять администратора (только владелец)
router.post('/:id/members/:userId/role', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (memberRole(g.id, req.user.id) !== 'owner') return res.status(403).json({ error: 'Только владелец' })
  const userId = Number(req.params.userId)
  const role = memberRole(g.id, userId)
  if (!role) return res.status(404).json({ error: 'Участник не найден' })
  if (role === 'owner') return res.status(400).json({ error: 'Владелец всегда владелец' })
  const next = req.body?.admin === true ? 'admin' : 'member'
  db.prepare('UPDATE group_members SET role=? WHERE group_id=? AND user_id=?').run(next, g.id, userId)
  res.json({ ok: true, role: next })
})

// Удалить группу
router.delete('/:id', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!isOwnerOrAdmin(g.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' })
  db.prepare('DELETE FROM groups WHERE id=?').run(g.id)
  res.json({ ok: true })
})

// ---------- Чат группы ----------

const GROUP_MSG_SELECT = `
  SELECT m.*, u.username, u.display_name, u.avatar
  FROM group_messages m JOIN users u ON u.id=m.sender_id
`

// История сообщений чата (участники)
router.get('/:id/messages', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  if (!memberRole(g.id, req.user.id)) return res.status(403).json({ error: 'Только участники группы могут читать чат' })
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 200)
  const before = Number.parseInt(req.query.before, 10)
  const rows = before
    ? db.prepare(`${GROUP_MSG_SELECT} WHERE m.group_id=? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(g.id, before, limit)
    : db.prepare(`${GROUP_MSG_SELECT} WHERE m.group_id=? ORDER BY m.id DESC LIMIT ?`).all(g.id, limit)
  res.json(rows.reverse().map(serializeMessage))
})

// Отправить сообщение в чат группы (можно с вложением фото/видео из фонда)
router.post('/:id/messages', requireAuth, (req, res) => {
  const g = getGroup(req.params.id)
  if (!g) return res.status(404).json({ error: 'Группа не найдена' })
  const role = memberRole(g.id, req.user.id)
  if (!role) return res.status(403).json({ error: 'Только участники группы могут писать в чат' })
  if (req.user.id !== g.owner_id) {
    const muted = checkMuted(req.user.id)
    if (!muted.allowed) return res.status(403).json({ error: muted.error })
    const spam = checkSpam(req.user.id, req.user.is_admin)
    if (!spam.allowed) return res.status(429).json({ error: spam.error })
    const lenErr = checkTextLength(String(req.body?.body || ''), 512)
    if (!lenErr.allowed) return res.status(400).json({ error: lenErr.error })
  }
  const body = String(req.body?.body || '').trim().slice(0, 512)
  let meta = []
  try { meta = JSON.parse(req.body.attachmentMeta || '[]') } catch { meta = [] }
  const attachments = buildGroupAttachments(meta)
  // Подтверждаем, что видео реально существует и доступно отправителю
  for (const a of attachments) {
    if (a.type === 'video' && a.videoId) {
      const v = db.prepare('SELECT id, owner_id, url, youtube, title, access, published FROM library_videos WHERE id=?').get(a.videoId)
      const canSee = v && (v.owner_id === req.user.id || v.published === 1 || (v.access === 'link' && !!req.user.is_admin))
      if (!canSee) {
        a.url = null
      } else {
        a.videoId = v.id; a.url = v.url || null; a.youtube = a.youtube || null; a.name = v.title
      }
    }
  }
  if (!body && !attachments.length) return res.status(400).json({ error: 'Сообщение пустое' })
  if (!req.user.is_admin) {
    const cm = checkContentMuted(req.user.id, 'messages')
    if (!cm.allowed) return res.status(403).json({ error: cm.error })
  }
  const info = db.prepare('INSERT INTO group_messages (group_id, sender_id, body, attachments) VALUES (?,?,?,?)')
    .run(g.id, req.user.id, body, JSON.stringify(attachments))
  const row = db.prepare(`${GROUP_MSG_SELECT} WHERE m.id=?`).get(info.lastInsertRowid)
  const msg = serializeMessage(row)
  const io = req.app.get('io')
  if (io) io.to(`group-${g.id}`).emit('group:message', msg)
  res.status(201).json(msg)
})

export default router

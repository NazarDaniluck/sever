import { Router } from 'express'
import db, { utcIso } from '../db.js'
import { requireAuth, requireModerator, publicUser } from '../auth.js'
import { checkMuted, checkSpam, checkTextLength, clearMute, isMuted } from '../moderation.js'
import { createNotification } from '../notifications.js'
import { createUploader, validateFiles } from '../uploads.js'
import { buildForwardAttachment } from '../forward.js'

const router = Router()
router.use(requireAuth)

const upload = createUploader({ maxSize: 50 * 1024 * 1024, maxFiles: 8 })

// Р’ СЃРѕРѕР±С‰РµРЅРёСЏС… РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ С„РѕС‚Рѕ Рё РІРёРґРµРѕ (Р°СѓРґРёРѕ, РґРѕРєСѓРјРµРЅС‚С‹ Рё РѕРїСЂРѕСЃС‹ вЂ” РЅРµС‚)
const MEDIA = ['photo', 'video']

function attachmentType(file) {
  if (file.kind === 'image') return 'photo'
  if (file.kind === 'video') return 'video'
  if (file.kind === 'audio') return 'audio'
  return 'document'
}

function getConversationUserIds(convId) {
  return db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(convId).map(r => r.user_id)
}

// РџСЂР°РІРёР»Р°: РјРµРґРёР° (С„РѕС‚Рѕ/РІРёРґРµРѕ) вЂ” РґРѕ 4 С€С‚СѓРє; Р·Р°РјРµС‚РєР°/СЃСЃС‹Р»РєР° РЅР° РїРѕСЃС‚/РїРµСЂРµСЃС‹Р»РєР° вЂ”
// С‚РѕР»СЊРєРѕ РѕРґРёРЅ РІРёРґ Рё Р±РµР· СЃРѕРІРјРµС‰РµРЅРёСЏ СЃ С‡РµРј-Р»РёР±Рѕ РµС‰С‘.
function validateAttachments(atts) {
  const media = atts.filter(a => MEDIA.includes(a.type))
  const specials = atts.filter(a => !MEDIA.includes(a.type))
  if (media.length > 4) throw new Error('РќРµ Р±РѕР»РµРµ 4 РјРµРґРёР°-РІР»РѕР¶РµРЅРёР№ РІ РѕРґРЅРѕРј СЃРѕРѕР±С‰РµРЅРёРё')
  if (specials.length > 1) throw new Error('Р—Р°РјРµС‚РєСѓ РёР»Рё СЃСЃС‹Р»РєСѓ РјРѕР¶РЅРѕ РїСЂРёРєСЂРµРїРёС‚СЊ С‚РѕР»СЊРєРѕ РѕРґРЅСѓ')
  if (media.length && specials.length) throw new Error('Р—Р°РјРµС‚РєСѓ РёР»Рё СЃСЃС‹Р»РєСѓ РЅРµР»СЊР·СЏ СЃРѕРІРјРµС‰Р°С‚СЊ СЃ РґСЂСѓРіРёРјРё РІР»РѕР¶РµРЅРёСЏРјРё')
  return atts
}

function parseAttachments(raw) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// РЎРѕРѕР±С‰РµРЅРёРµ РґР»СЏ API: sender РІСЃРµРіРґР° СЂРµР°Р»СЊРЅС‹Р№ id СЋР·РµСЂР° + РіРѕС‚РѕРІРѕРµ createdAt
function serializeMessage(r, userId = null) {
  const atts = parseAttachments(r.attachments)
  const pollAtts = atts.filter(a => a.type === 'poll').map(a => a.message_index || 0)
  let counts = {}, myVote = null
  if (pollAtts.length) {
    const mpv = db.prepare('SELECT option_index, COUNT(*) c FROM message_poll_votes WHERE message_id=? GROUP BY option_index').all(r.id)
    counts = Object.fromEntries(mpv.map(v => [v.option_index, v.c]))
    if (userId != null) {
      myVote = db.prepare('SELECT option_index FROM message_poll_votes WHERE message_id=? AND user_id=?').get(r.id, userId)?.option_index ?? null
    }
  }
  const attachments = atts.map(a => {
    if (a.type !== 'poll') return a
    const opts = (a.options || []).map((name, i) => ({ name, votes: counts[i] || 0 }))
    const total = opts.reduce((s, o) => s + o.votes, 0)
    return { ...a, options: opts, total, myVote }
  })
  return {
    id: r.id,
    conversationId: r.conversation_id,
    body: r.body,
    attachments,
    nsfw: !!r.nsfw,
deleted: !!r.deleted,
    editedAt: utcIso(r.edited_at),
    readAt: utcIso(r.read_at),
    createdAt: utcIso(r.created_at),
    sender: { id: r.sender_id, username: r.username, displayName: r.display_name, avatar: r.avatar, isAdmin: !!r.is_admin, isTester: !!r.is_tester, isForeignAgent: !!r.is_foreign_agent }
  }
}

function isEditable(msgRow) {
  return Date.now() - new Date(utcIso(msgRow.created_at)).getTime() <= 24 * 60 * 60 * 1000
}

router.get('/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.read_at IS NULL AND m.sender_id != ?) AS unread,
           (SELECT m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
           (SELECT m.attachments FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_att,
           (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
           (SELECT m.sender_id FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id
    FROM conversations c
    JOIN conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=?
    ORDER BY last_at DESC
  `).all(req.user.id, req.user.id)

  const result = rows.map(r => {
    const ids = getConversationUserIds(r.id).filter(id => id !== req.user.id)
    const users = ids.map(id => {
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(id)
      return publicUser(u)
    })
    const hasAtt = !r.last_body && parseAttachments(r.last_att).length > 0
    return { id: r.id, unread: r.unread || 0, lastMessage: r.last_body || (hasAtt ? 'рџ“Ћ Р’Р»РѕР¶РµРЅРёРµ' : null), lastAt: utcIso(r.last_at), participants: users }
  })
  res.json(result)
})

// РќР°Р№С‚Рё РёР»Рё СЃРѕР·РґР°С‚СЊ РґРёР°Р»РѕРі СЃ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј
router.post('/conversations', (req, res) => {
  const otherId = Number(req.body?.userId)
  if (!otherId || otherId === req.user.id) return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ СЃРѕР±РµСЃРµРґРЅРёРє' })
  const other = db.prepare('SELECT * FROM users WHERE id=?').get(otherId)
  if (!other) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })

  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_participants a ON a.conversation_id=c.id AND a.user_id=?
    JOIN conversation_participants b ON b.conversation_id=c.id AND b.user_id=?
    WHERE (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id=c.id) = 2
  `).get(req.user.id, otherId)
  if (existing) {
    const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(existing.id)
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(otherId)
    return res.json({ id: conv.id, participants: [publicUser(u)], unread: 0, lastMessage: null })
  }

  // РџСЂР°РІРѕ РЅР° РїРµСЂРµРїРёСЃРєСѓ: СЂРµР¶РёРј СЃРѕР±РµСЃРµРґРЅРёРєР° + СЃС‚Р°С‚СѓСЃ Р·Р°СЏРІРєРё
  const mode = other.message_mode || 'all'
  if (mode === 'none') {
    return res.status(403).json({ error: 'Р­С‚РѕС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РїСЂРёРЅРёРјР°РµС‚ СЃРѕРѕР±С‰РµРЅРёСЏ', code: 'MESSAGES_DISABLED' })
  }
  if (mode === 'requests') {
    const r = db.prepare('SELECT status FROM message_requests WHERE from_user_id=? AND to_user_id=?')
      .get(req.user.id, otherId)
    if (r?.status === 'pending') {
      return res.status(409).json({ error: 'Р—Р°СЏРІРєР° РЅР° РїРµСЂРµРїРёСЃРєСѓ СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°', code: 'REQUEST_PENDING' })
    }
    if (r?.status !== 'approved') {
      return res.status(403).json({ error: 'Р”Р»СЏ РїРµСЂРµРїРёСЃРєРё СЃ СЌС‚РёРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј РѕС‚РїСЂР°РІСЊС‚Рµ Р·Р°СЏРІРєСѓ', code: 'REQUEST_REQUIRED' })
    }
  }

  const info = db.prepare('INSERT INTO conversations DEFAULT VALUES').run()
  const convId = info.lastInsertRowid
  db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?,?)').run(convId, req.user.id)
  db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?,?)').run(convId, otherId)

  const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(convId)
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(otherId)
  res.json({ id: conv.id, participants: [publicUser(u)], unread: 0, lastMessage: null })
})

// Р—Р°СЏРІРєРё РЅР° РїРµСЂРµРїРёСЃРєСѓ
router.get('/requests', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_foreign_agent
    FROM message_requests r JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(req.user.id)
  res.json(rows.map(r => ({
    id: r.id,
    status: r.status,
    createdAt: utcIso(r.created_at),
    from: { id: r.from_user_id, username: r.username, displayName: r.display_name, avatar: r.avatar, isAdmin: !!r.is_admin }
  })))
})

// РћС‚РїСЂР°РІРёС‚СЊ Р·Р°СЏРІРєСѓ РЅР° РїРµСЂРµРїРёСЃРєСѓ
router.post('/requests', (req, res) => {
  const otherId = Number(req.body?.userId)
  if (!otherId || otherId === req.user.id) return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ Р°РґСЂРµСЃР°С‚' })
  const other = db.prepare('SELECT * FROM users WHERE id=?').get(otherId)
  if (!other) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  if ((other.message_mode || 'all') !== 'requests') {
    return res.status(400).json({ error: 'Р­С‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ Р·Р°СЏРІРєРё РЅРµ РЅСѓР¶РЅС‹', code: 'REQUESTS_NOT_USED' })
  }
  const hasConv = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_participants a ON a.conversation_id=c.id AND a.user_id=?
    JOIN conversation_participants b ON b.conversation_id=c.id AND b.user_id=?
    WHERE (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id=c.id) = 2
  `).get(req.user.id, otherId)
  if (hasConv) return res.status(400).json({ error: 'Р’С‹ СѓР¶Рµ РјРѕР¶РµС‚Рµ РїРёСЃР°С‚СЊ СЌС‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ' })
  const existing = db.prepare('SELECT * FROM message_requests WHERE from_user_id=? AND to_user_id=?')
    .get(req.user.id, otherId)
  if (existing?.status === 'pending') {
    return res.status(409).json({ error: 'Р—Р°СЏРІРєР° СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°', code: 'REQUEST_PENDING' })
  }
  if (existing?.status === 'approved') {
    return res.status(400).json({ error: 'Р’С‹ СѓР¶Рµ РјРѕР¶РµС‚Рµ РїРёСЃР°С‚СЊ СЌС‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ' })
  }
  if (existing?.status === 'rejected') {
    // РџРѕСЃР»Рµ РѕС‚РєР»РѕРЅРµРЅРёСЏ РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ РµС‰С‘ 2 СЂР°Р·Р° (РёС‚РѕРіРѕ 3 РїРѕРїС‹С‚РєРё), РљР” 72 С‡Р°СЃР° РїРѕСЃР»Рµ РєР°Р¶РґРѕРіРѕ РѕС‚РєР°Р·Р°
    const REJECT_LIMIT = 3
    const COOLDOWN_MS = 72 * 60 * 60 * 1000
    if ((existing.reject_count || 0) >= REJECT_LIMIT) {
      return res.status(403).json({ error: 'Р’С‹ Р±РѕР»СЊС€Рµ РЅРµ РјРѕР¶РµС‚Рµ РѕС‚РїСЂР°РІР»СЏС‚СЊ Р·Р°СЏРІРєСѓ СЌС‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ', code: 'REQUEST_LOCKED' })
    }
    if (existing.last_rejected_at) {
      const lastRejected = new Date(utcIso(existing.last_rejected_at)).getTime()
      const wait = COOLDOWN_MS - (Date.now() - lastRejected)
      if (wait > 0) {
        const hours = Math.ceil(wait / 3600000)
        return res.status(429).json({ error: `Р—Р°СЏРІРєР° Р±С‹Р»Р° РѕС‚РєР»РѕРЅРµРЅР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР° С‡РµСЂРµР· ${hours} С‡`, code: 'REQUEST_COOLDOWN' })
      }
    }
  }
  db.prepare(`
    INSERT INTO message_requests (from_user_id, to_user_id, status)
    VALUES (?, ?, 'pending')
    ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET status='pending', created_at=datetime('now')
  `).run(req.user.id, otherId)
  const io = req.app.get('io')
  createNotification({
    io, userId: otherId, actorId: req.user.id, type: 'message_request',
    targetType: 'message', targetId: req.user.id, body: 'РҐРѕС‡РµС‚ РЅР°РїРёСЃР°С‚СЊ РІР°Рј'
  })
  res.status(201).json({ status: 'pending' })
})

// РћРґРѕР±СЂРёС‚СЊ/РѕС‚РєР»РѕРЅРёС‚СЊ Р·Р°СЏРІРєСѓ РЅР° РїРµСЂРµРїРёСЃРєСѓ (С…РѕР·СЏРёРЅ РїСЂРѕС„РёР»СЏ)
router.post('/requests/:fromUserId/respond', (req, res) => {
  const fromId = Number(req.params.fromUserId)
  const r = db.prepare('SELECT * FROM message_requests WHERE from_user_id=? AND to_user_id=?').get(fromId, req.user.id)
  if (!r) return res.status(404).json({ error: 'Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°' })
  const approve = req.body?.approve
  if (approve === true) {
    db.prepare("UPDATE message_requests SET status='approved' WHERE from_user_id=? AND to_user_id=?")
      .run(fromId, req.user.id)
    const io = req.app.get('io')
    createNotification({
      io, userId: fromId, actorId: req.user.id, type: 'message_request_approved',
      targetType: 'message', targetId: req.user.id, body: 'РћРґРѕР±СЂРёР»(Р°) РІР°С€Сѓ Р·Р°СЏРІРєСѓ РЅР° РїРµСЂРµРїРёСЃРєСѓ'
    })
    res.json({ ok: true, status: 'approved' })
  } else {
    db.prepare(`
      UPDATE message_requests SET status='rejected',
        reject_count = reject_count + 1,
        last_rejected_at = datetime('now')
      WHERE from_user_id=? AND to_user_id=?
    `).run(fromId, req.user.id)
    const io = req.app.get('io')
    createNotification({
      io, userId: fromId, actorId: req.user.id, type: 'message_request_rejected',
      targetType: 'message', targetId: req.user.id, body: 'РћС‚РєР»РѕРЅРёР»(Р°) РІР°С€Сѓ Р·Р°СЏРІРєСѓ РЅР° РїРµСЂРµРїРёСЃРєСѓ'
    })
    res.json({ ok: true, status: 'rejected' })
  }
})

router.get('/conversations/:id/messages', (req, res) => {
  const convId = Number(req.params.id)
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const rows = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_foreign_agent
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.conversation_id=? ORDER BY m.created_at ASC LIMIT 200
`).all(convId)
  // Отметить прочитанными и разослать «прочитано» отправителям (через сокет другого участника)
  const io = req.app.get('io')
  markMessagesRead(io, convId, req.user.id)
  res.json(rows.map(r => serializeMessage(r, req.user.id)))
})

function markMessagesRead(io, convId, readerId) {
  const affected = db.prepare('SELECT id FROM messages WHERE conversation_id=? AND sender_id != ? AND read_at IS NULL').all(convId, readerId)
  if (affected.length) {
    db.prepare("UPDATE messages SET read_at=datetime('now') WHERE conversation_id=? AND sender_id != ? AND read_at IS NULL").run(convId, readerId)
  }
  if (io) {
    const ids = affected.map(r => r.id)
    if (ids.length) {
      io.in(`conv-${convId}`).emit('message:read', { conversationId: convId, messageIds: ids })
    }
  }
}

function emitMessage(io, msg, convId) {
  db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=? AND user_id != ?')
    .all(convId, msg.sender.id).forEach(p => {
      io.to(`user-${p.user_id}`).emit('conversation:update', { conversationId: convId })
    })
  io.to(`conv-${convId}`).emit('message', msg)
  const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(convId)
  participants.forEach(p => {
    const n = db.prepare(`
      SELECT COUNT(*) AS n FROM messages m
      WHERE m.read_at IS NULL AND m.sender_id != ?
        AND m.conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=?)
    `).get(p.user_id, p.user_id).n || 0
    io.to(`user-${p.user_id}`).emit('unread', { unread: n })
  })
}

function buildAttachments(files, meta, userId) {
  const atts = (files || []).map(f => ({ type: attachmentType(f), url: `/uploads/${f.filename}`, name: f.originalname }))
  for (const m of (Array.isArray(meta) ? meta : [])) {
    if (m.type === 'note' && String(m.text || '').trim()) {
      atts.push({ type: 'note', text: String(m.text).trim() })
    } else if (m.type === 'poll' && String(m.question || '').trim()) {
      const options = (Array.isArray(m.options) ? m.options : []).map(o => String(o || '').trim()).filter(Boolean).slice(0, 8)
      if (options.length >= 2) atts.push({ type: 'poll', question: String(m.question).trim(), options })
    } else if (m.type === 'post') {
      const pid = Number(m.postId)
      const p = pid && db.prepare('SELECT id FROM posts WHERE id=?').get(pid)
      if (p) atts.push({ type: 'post', postId: pid })
    } else if (m.type === 'photo' && m.lib?.kind === 'photo') {
      const p = db.prepare(`
        SELECT ap.id, ap.url FROM album_photos ap JOIN albums a ON a.id=ap.album_id
        WHERE ap.url=? AND a.owner_id=?
      `).get(String(m.lib.url), userId)
      if (p) atts.push({ type: 'photo', url: p.url, photoId: p.id })
    } else if (m.type === 'video' && m.lib && (m.lib.kind === 'video' || m.lib.url)) {
      const v = m.lib.id
        ? db.prepare('SELECT * FROM library_videos WHERE id=? AND owner_id=?').get(Number(m.lib.id), userId)
        : null
      if (v) {
        atts.push({ type: 'video', url: v.url, youtube: v.youtube, name: v.title, videoId: v.id })
      } else if (m.lib.url) {
        const owned = db.prepare('SELECT * FROM library_videos WHERE url=? AND owner_id=?')
          .get(String(m.lib.url), userId)
        if (owned) atts.push({ type: 'video', url: owned.url, youtube: owned.youtube, name: owned.title, videoId: owned.id })
      }
    } else if (m.type === 'audio' && m.lib && (m.lib.kind === 'audio' || m.lib.url)) {
      const a = m.lib.id
        ? db.prepare('SELECT * FROM library_audios WHERE id=? AND owner_id=?').get(Number(m.lib.id), userId)
        : null
      if (a) {
        atts.push({ type: 'audio', url: a.url, name: a.artist ? `${a.artist} вЂ” ${a.title}` : a.title, cover: a.cover })
      } else if (m.lib.url) {
        const owned = db.prepare('SELECT * FROM library_audios WHERE url=? AND owner_id=?')
          .get(String(m.lib.url), userId)
        if (owned) atts.push({ type: 'audio', url: owned.url, name: owned.artist ? `${owned.artist} вЂ” ${owned.title}` : owned.title, cover: owned.cover })
      }
    }
  }
  return validateAttachments(atts)
}

// РћС‚РїСЂР°РІРєР° СЃРѕРѕР±С‰РµРЅРёСЏ СЃ РІР»РѕР¶РµРЅРёСЏРјРё (multipart: file[] + attachmentMeta)
router.post('/conversations/:id/messages', upload.array('file', 8), validateFiles(['image', 'video']), (req, res) => {
  const convId = Number(req.params.id)
  const body = (req.body.body || '').trim()
  const nsfw = req.body.nsfw === '1' || req.body.nsfw === 'true'
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })

  const muted = checkMuted(req.user.id)
  if (!muted.allowed) return res.status(403).json({ error: muted.error })
  const len = checkTextLength(body)
  if (!len.allowed) return res.status(400).json({ error: len.error })
  const spam = checkSpam(req.user.id, req.user.is_admin)
  if (!spam.allowed) {
    if (spam.muted) {
      const io = req.app.get('io')
      if (io) io.to(`user-${req.user.id}`).emit('muted', { until: spam.muted.until })
    }
    return res.status(429).json({ error: spam.error })
  }

  let meta = []
  try { meta = JSON.parse(req.body.attachmentMeta || '[]') } catch { meta = [] }
  let attachments
  try {
    attachments = buildAttachments(req.files, meta, req.user.id)
  } catch (ex) {
    return res.status(400).json({ error: ex.message })
  }
  if (!body && !attachments.length) return res.status(400).json({ error: 'РџСѓСЃС‚РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' })

  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, attachments, nsfw) VALUES (?,?,?,?,?)')
    .run(convId, req.user.id, body, JSON.stringify(attachments), nsfw ? 1 : 0)
  const row = db.prepare('SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(info.lastInsertRowid)
  const msg = serializeMessage(row, req.user.id)
  const io = req.app.get('io')
  if (io) emitMessage(io, msg, convId)
  res.status(201).json(msg)
})

// РџРµСЂРµСЃС‹Р»РєР° СЃРѕРѕР±С‰РµРЅРёСЏ РІ РґСЂСѓРіРѕР№ РґРёР°Р»РѕРі (РєРѕРїРёСЏ СЃ РїРѕРјРµС‚РєРѕР№ В«РїРµСЂРµСЃР»Р°РЅРѕВ»)
router.post('/conversations/:id/messages/:messageId/forward', (req, res) => {
  const convId = Number(req.params.id)
  const messageId = Number(req.params.messageId)
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })

  const src = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId)
  if (!src || src.deleted) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  const srcConv = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(src.conversation_id, req.user.id)
  if (!srcConv) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РёСЃС…РѕРґРЅРѕРјСѓ СЃРѕРѕР±С‰РµРЅРёСЋ' })

  const muted = checkMuted(req.user.id)
  if (!muted.allowed) return res.status(403).json({ error: muted.error })
  const spam = checkSpam(req.user.id, req.user.is_admin)
  if (!spam.allowed) {
    if (spam.muted) {
      const io = req.app.get('io')
      if (io) io.to(`user-${req.user.id}`).emit('muted', { until: spam.muted.until })
    }
    return res.status(429).json({ error: spam.error })
  }

  const sender = db.prepare('SELECT * FROM users WHERE id=?').get(src.sender_id)
  const forwardAtt = buildForwardAttachment(src, sender)
  if (!forwardAtt) return res.status(400).json({ error: 'РќРµС‡РµРіРѕ РїРµСЂРµСЃС‹Р»Р°С‚СЊ' })

  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, attachments, nsfw) VALUES (?,?,?,?,?)')
    .run(convId, req.user.id, '', JSON.stringify(forwardAtt), src.nsfw ? 1 : 0)
  const row = db.prepare('SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(info.lastInsertRowid)
  const msg = serializeMessage(row, req.user.id)
  const io = req.app.get('io')
  if (io) emitMessage(io, msg, convId)
  res.status(201).json(msg)
})

// РР·РјРµРЅРµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ (С‚РѕР»СЊРєРѕ Р°РІС‚РѕСЂ, РЅРµ РїРѕР·РґРЅРµРµ 24 С‡Р°СЃРѕРІ)
router.put('/conversations/:id/messages/:messageId', (req, res) => {
  const convId = Number(req.params.id)
  const messageId = Number(req.params.messageId)
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND conversation_id=?').get(messageId, convId)
  if (!m) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'Р§СѓР¶РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ' })
  if (m.deleted) return res.status(400).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ СѓРґР°Р»РµРЅРѕ' })
  if (!isEditable(m)) return res.status(400).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ СЃС‚Р°СЂС€Рµ 24 С‡Р°СЃРѕРІ вЂ” РµРіРѕ РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ' })

  const body = (req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'РџСѓСЃС‚РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' })
  const muted = checkMuted(req.user.id)
  if (!muted.allowed) return res.status(403).json({ error: muted.error })
  const len = checkTextLength(body)
  if (!len.allowed) return res.status(400).json({ error: len.error })
  db.prepare('UPDATE messages SET body=?, edited_at=datetime(\'now\') WHERE id=?').run(body, m.id)
  const row = db.prepare('SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(m.id)
  const msg = serializeMessage(row, req.user.id)
  const io = req.app.get('io')
  if (io) io.to(`conv-${convId}`).emit('message:updated', msg)
  res.json(msg)
})

// РЈРґР°Р»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ (С‚РѕР»СЊРєРѕ Р°РІС‚РѕСЂ, РЅРµ РїРѕР·РґРЅРµРµ 24 С‡Р°СЃРѕРІ)
router.delete('/conversations/:id/messages/:messageId', (req, res) => {
  const convId = Number(req.params.id)
  const messageId = Number(req.params.messageId)
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND conversation_id=?').get(messageId, convId)
  if (!m) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'Р§СѓР¶РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ' })
  if (m.deleted) return res.status(400).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ СѓР¶Рµ СѓРґР°Р»РµРЅРѕ' })
  if (!isEditable(m)) return res.status(400).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ СЃС‚Р°СЂС€Рµ 24 С‡Р°СЃРѕРІ вЂ” РµРіРѕ РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ' })

  db.prepare('UPDATE messages SET deleted=1 WHERE id=?').run(m.id)
  const row = db.prepare('SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(m.id)
  const msg = serializeMessage(row, req.user.id)
  const io = req.app.get('io')
  if (io) io.to(`conv-${convId}`).emit('message:updated', msg)
  res.json(msg)
})

// РЈРґР°Р»РµРЅРёРµ РїРµСЂРµРїРёСЃРєРё. Р•СЃР»Рё РїРµСЂРµРїРёСЃРєР° Р±С‹Р»Р° СЃРѕР·РґР°РЅР° РїРѕ РѕРґРѕР±СЂРµРЅРЅРѕР№ Р·Р°СЏРІРєРµ вЂ”
// СѓРґР°Р»СЏРµРј РµС‘ С†РµР»РёРєРѕРј (Сѓ РѕР±РѕРёС…) Рё СЃР±СЂР°СЃС‹РІР°РµРј Р·Р°СЏРІРєСѓ, С‡С‚РѕР±С‹ СЃРѕР±РµСЃРµРґРЅРёРє
// Р±РѕР»СЊС€Рµ РЅРµ РјРѕРі РїРёСЃР°С‚СЊ Рё РґР»СЏ РЅРѕРІРѕР№ РїРµСЂРµРїРёСЃРєРё С‚СЂРµР±РѕРІР°Р»Р°СЃСЊ РЅРѕРІР°СЏ Р·Р°СЏРІРєР°.
// РРЅР°С‡Рµ вЂ” СѓРґР°Р»СЏРµРј С‚РѕР»СЊРєРѕ РґР»СЏ СЃРµР±СЏ.
router.delete('/conversations/:id', (req, res) => {
  const convId = Number(req.params.id)
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const otherIds = getConversationUserIds(convId).filter(id => id !== req.user.id)
  const hasApprovedRequest = otherIds.some(otherId =>
    db.prepare(`
      SELECT 1 FROM message_requests
      WHERE status = 'approved' AND (
        (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
      )
    `).get(req.user.id, otherId, otherId, req.user.id)
  )
  if (hasApprovedRequest) {
    db.prepare(`
      DELETE FROM message_requests
      WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
    `).run(req.user.id, otherIds[0], otherIds[0], req.user.id)
    db.prepare('DELETE FROM conversations WHERE id=?').run(convId)
    const io = req.app.get('io')
    if (io) {
      otherIds.forEach(oid => io.to(`user-${oid}`).emit('conversation:update', { conversationId: convId }))
    }
  } else {
    db.prepare('DELETE FROM conversation_participants WHERE conversation_id=? AND user_id=?').run(convId, req.user.id)
  }
  res.json({ ok: true })
})

// Р“РѕР»РѕСЃРѕРІР°РЅРёРµ / РѕС‚РјРµРЅР° РіРѕР»РѕСЃР° РІ РѕРїСЂРѕСЃРµ СЃРѕРѕР±С‰РµРЅРёСЏ
router.post('/poll', (req, res) => {
  const messageId = Number(req.body?.messageId)
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId)
  if (!m) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(m.conversation_id, req.user.id)
  if (!isParticipant) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const atts = parseAttachments(m.attachments)
  const poll = atts.find(a => a.type === 'poll')
  if (!poll) return res.status(400).json({ error: 'Р’ СЃРѕРѕР±С‰РµРЅРёРё РЅРµС‚ РѕРїСЂРѕСЃР°' })

  if (req.body?.option == null) {
    db.prepare('DELETE FROM message_poll_votes WHERE message_id=? AND user_id=?').run(messageId, req.user.id)
  } else {
    const option = Number(req.body.option)
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) {
      return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РІР°СЂРёР°РЅС‚ РѕС‚РІРµС‚Р°' })
    }
    db.prepare('DELETE FROM message_poll_votes WHERE message_id=? AND user_id=?').run(messageId, req.user.id)
    db.prepare('INSERT INTO message_poll_votes (message_id, user_id, option_index) VALUES (?,?,?)').run(messageId, req.user.id, option)
  }
  const row = db.prepare('SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(messageId)
  res.json(serializeMessage(row, req.user.id))
})

router.get('/unread', (req, res) => {
  const n = db.prepare(`
    SELECT COUNT(*) AS n FROM messages m
    WHERE m.read_at IS NULL AND m.sender_id != ?
      AND m.conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=?)
  `).get(req.user.id, req.user.id).n
  res.json({ unread: n })
})

// РЎРЅСЏС‚СЊ РіР»РѕР±Р°Р»СЊРЅС‹Р№ РјСѓС‚ СЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (С‚РѕР»СЊРєРѕ РјРѕРґРµСЂР°С‚РѕСЂС‹/Р°РґРјРёРЅС‹)
router.post('/unmute/:userId', requireModerator, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.userId))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  clearMute(u.id)
  res.json({ ok: true, mutedUntil: null })
})

// РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РјСѓС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РјРѕРґРµСЂР°С‚РѕСЂР° (РІ РґРёР°Р»РѕРіРµ)
router.get('/mute/:userId', requireModerator, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.userId))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  res.json({ mutedUntil: isMuted(u.id)?.until || null })
})

export default router

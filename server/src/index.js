import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import db, { utcIso } from './db.js'
import { requireAuth, optionalAuth, wsUser, touchLastSeen } from './auth.js'
import { getFeedForUser, getTrending, getUnreadMessagesCount } from './posts.js'
import { publicConfig, getAppMode } from './settings.js'
import { markOnline, markOffline, isOnline } from './presence.js'
import { checkMuted, checkSpam, checkTextLength, MAX_MESSAGE_LEN } from './moderation.js'
import { securityHeaders } from './security.js'

try { process.loadEnvFile() } catch { /* .env РјРѕР¶РµС‚ РѕС‚СЃСѓС‚СЃС‚РІРѕРІР°С‚СЊ */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

// cloudpub-С‚СѓРЅРЅРµР»СЊ (cloudflared) РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ СЃ localhost Рё РїСЂРёРЅРѕСЃРёС‚ СЂРµР°Р»СЊРЅС‹Р№
// IP РєР»РёРµРЅС‚Р°. Р”РѕРІРµСЂСЏРµРј X-Forwarded-For/CF-Connecting-IP С‚РѕР»СЊРєРѕ РѕС‚ loopback вЂ”
// СЌС‚Рѕ РґР°С‘С‚ РєРѕСЂСЂРµРєС‚РЅС‹Р№ req.ip (С‚РѕС‡РЅС‹Р№ Р°РЅС‚Рё-РЅР°РєСЂСѓС‚РєР° РїСЂРѕСЃРјРѕС‚СЂРѕРІ) Рё РЅРµ РґР°С‘С‚
// РїРѕРґРјРµРЅРёС‚СЊ IP СѓРґР°Р»С‘РЅРЅС‹Рј РєР»РёРµРЅС‚Р°Рј, РїРѕРґРєР»СЋС‡Р°СЋС‰РёРјСЃСЏ Рє РїРѕСЂС‚Сѓ РЅР°РїСЂСЏРјСѓСЋ.
app.set('trust proxy', 'loopback')

// РСЃС‚РѕС‡РЅРёРєРѕРІ РјРѕР¶РµС‚ Р±С‹С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ: СѓРєР°Р¶РёС‚Рµ С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ (РЅР°РїСЂРёРјРµСЂ Р»РѕРєР°Р»СЊРЅС‹Р№ Рё РґРѕРјРµРЅ cloudpub)
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
function originAllowed(origin) {
  if (!origin) return true
  return ALLOWED_ORIGINS.includes(origin)
}
const corsOptions = { origin: (origin, cb) => cb(null, originAllowed(origin)), credentials: true }

app.use(cors(corsOptions))
app.use(express.json({ limit: '2mb' }))
app.use(securityHeaders)

// Р‘Р»РѕРєРёСЂРѕРІРєР° РїРѕ IP: Р±Р°РЅРёРј РІРµСЃСЊ API РґР»СЏ Р°РґСЂРµСЃР° РёР· blocked_ips (РїРѕРєР° РґРµР№СЃС‚РІСѓРµС‚)
app.use('/api', (req, res, next) => {
  const ip = req.ip
  if (!ip) return next()
  const ban = db.prepare("SELECT 1 FROM blocked_ips WHERE ip=? AND (expires_at IS NULL OR expires_at > datetime('now'))").get(ip)
  if (ban) return res.status(403).json({ error: 'Р’Р°С€ IP-Р°РґСЂРµСЃ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ' })
  next()
})

app.use((req, res, next) => { optionalAuth(req, res, next) })

// Р Р°Р·РґР°С‡Р° Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… С„Р°Р№Р»РѕРІ СЃ РєРѕРЅС‚СЂРѕР»РµРј РґРѕСЃС‚СѓРїР° (РІРјРµСЃС‚Рѕ СЃС‚Р°С‚РёРєРё):
// РѕС‚РєСЂС‹С‚С‹Рµ РєР°СЂС‚РёРЅРєРё/РґРѕРєСѓРјРµРЅС‚С‹ вЂ” РІСЃРµРј, РІРёРґРµРѕ вЂ” РїРѕ СѓСЂРѕРІРЅСЋ РґРѕСЃС‚СѓРїР°, Р°СѓРґРёРѕ вЂ” С‚РѕР»СЊРєРѕ Р°РІС‚РѕСЂРёР·РѕРІР°РЅРЅС‹Рј.
// Р Р°СЃС€РёСЂРµРЅРёСЏ Р·РґРµСЃСЊ СѓР¶Рµ СЃРµСЂРІРµСЂРЅС‹Рµ (СЃРј. uploads.js), РёРјРµРЅР° вЂ” РІСЂРµРјРµРЅРЅС‹Рµ РјРµС‚РєРё+hex, С‚Р°Рє С‡С‚Рѕ traversal РёСЃРєР»СЋС‡С‘РЅ.
const SAFE_UPLOAD_NAME = /^[\w-]+\.(jpe?g|png|gif|webp|bmp|mp4|webm|ogg|mp3|flac|m4a|pdf|zip|rar|txt|md|json)$/i
const FRIEND_MUTUAL_SQL = `
  SELECT 1 FROM follows f1
  JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
  WHERE f1.follower_id = ? AND f1.following_id = ?
`

function mediaAllowed(access, ownerId, user) {
  if (access === 'open' || access === 'link') return true
  if (user && (user.id === ownerId || user.is_admin)) return true
  if (access === 'friends' && user) return !!db.prepare(FRIEND_MUTUAL_SQL).get(user.id, ownerId)
  return false
}

app.get('/uploads/:file', (req, res) => {
  const file = req.params.file
  if (!SAFE_UPLOAD_NAME.test(file)) return res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' })
  const p = path.join(__dirname, '..', 'uploads', file)
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' })
  const url = `/uploads/${file}`
  const v = db.prepare('SELECT owner_id, access, published FROM library_videos WHERE url=? OR preview=?').get(url, url)
  if (v) {
    if (!mediaAllowed(v.access || 'private', v.owner_id, req.user)) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
    return res.sendFile(p, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' }) })
  }
  const a = db.prepare('SELECT owner_id FROM library_audios WHERE url=?').get(url)
  if (a) {
    if (!req.user) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
    return res.sendFile(p, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' }) })
  }
  res.sendFile(p, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' }) })
})

// РњР°СЂС€СЂСѓС‚С‹, РЅРµ С‚СЂРµР±СѓСЋС‰РёРµ Р°РІС‚РѕСЂРёР·Р°С†РёРё (auth РІРЅСѓС‚СЂРё СЃРІРѕРёС… СЂРѕСѓС‚РѕРІ СЂРµС€Р°РµС‚ СЌС‚Рѕ СЃР°Рј)
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import postsRoutes from './routes/posts.js'
import communitiesRoutes from './routes/communities.js'
import messagesRoutes from './routes/messages.js'
import adminRoutes from './routes/admin.js'
import libraryRoutes from './routes/library.js'
import eventsRoutes from './routes/events.js'
import bookmarksRoutes from './routes/bookmarks.js'
import reportsRoutes from './routes/reports.js'
import friendsRoutes from './routes/friends.js'
import groupsRoutes from './routes/groups.js'

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.get('/api/config', (req, res) => res.json(publicConfig()))
// NOTE: СЂРµРіРёСЃС‚СЂР°С†РёСЏ/Р»РѕРіРёРЅ/РєРѕРґ 2FA РѕРіСЂР°РЅРёС‡РµРЅС‹ РїРѕ С‡Р°СЃС‚РѕС‚Рµ РІ security.js (authLimiter)

app.get('/api/about', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n
  const admins = db.prepare(
    'SELECT id, username, display_name, avatar, is_admin FROM users WHERE is_admin = 1 ORDER BY id'
  ).all().map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatar: u.avatar,
    isAdmin: !!u.is_admin
  }))
  res.json({
    name: 'РЎРµРІРµСЂ',
    stats: {
      users: count('SELECT COUNT(*) n FROM users'),
      communities: count('SELECT COUNT(*) n FROM communities'),
      posts: count('SELECT COUNT(*) n FROM posts'),
      comments: count('SELECT COUNT(*) n FROM comments'),
      messages: count('SELECT COUNT(*) n FROM messages')
    },
    admins
  })
})

// Р РµР¶РёРј В«С‚РµС…. СЂР°Р±РѕС‚С‹В»: Р±Р»РѕРєРёСЂСѓРµС‚ API РґР»СЏ РІСЃРµС…, РєСЂРѕРјРµ Р°РґРјРёРЅРѕРІ, С‚РµСЃС‚РёСЂРѕРІС‰РёРєРѕРІ Рё СЃР»СѓР¶РµР±РЅС‹С… РїСѓС‚РµР№
app.use('/api', (req, res, next) => {
  if (getAppMode() !== 'maintenance') return next()
  const open = req.path === '/health' || req.path === '/config' || req.path === '/about'
    || req.path.startsWith('/auth') || req.path.startsWith('/admin')
  if (open || (req.user && (req.user.is_admin || req.user.is_tester))) return next()
  return res.status(503).json({ error: 'РўРµС…РЅРёС‡РµСЃРєРёРµ СЂР°Р±РѕС‚С‹. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/communities', communitiesRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/library', libraryRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/bookmarks', bookmarksRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/friends', friendsRoutes)
app.use('/api/groups', groupsRoutes)

// Р Р°Р·РґР°С‡Р° СЃРѕР±СЂР°РЅРЅРѕРіРѕ РєР»РёРµРЅС‚Р° (client/dist) РІ РїСЂРѕРґР°РєС€РµРЅРµ. Р’РєР»СЋС‡Р°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё,
// РµСЃР»Рё СЃР±РѕСЂРєР° СЃСѓС‰РµСЃС‚РІСѓРµС‚. РљР»РёРµРЅС‚ С…РѕРґРёС‚ РЅР° /api, /uploads Рё /socket.io РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹РјРё
// РїСѓС‚СЏРјРё, РїРѕСЌС‚РѕРјСѓ API Рё СЃР°Р№С‚ Р¶РёРІСѓС‚ РЅР° РѕРґРЅРѕРј РїРѕСЂС‚Сѓ, Рё С‚СѓРЅРЅРµР»СЊ СѓРєР°Р·С‹РІР°РµС‚ С‚РѕР»СЊРєРѕ РЅР° PORT.
const DIST = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)|\/socket\.io(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

app.use((err, req, res, next) => {
  // РљР»РёРµРЅС‚Сѓ вЂ” С‚РѕР»СЊРєРѕ В«РёР·РІРµСЃС‚РЅС‹РµВ» РѕС€РёР±РєРё (multer, СЃРІРѕРё UploadError). Р’СЃС‘ РїСЂРѕС‡РµРµ (SQL,
  // РІРЅСѓС‚СЂРµРЅРЅРёРµ РёСЃРєР»СЋС‡РµРЅРёСЏ) РЅРµ РґРѕР»Р¶РЅРѕ СѓС‚РµРєР°С‚СЊ РЅР°СЂСѓР¶Сѓ вЂ” Р»РѕРіРёСЂСѓРµРј РґРµС‚Р°Р»Рё РЅР° СЃРµСЂРІРµСЂ.
  const known = err && (err.name === 'MulterError' || err.expose === true)
  if (known) return res.status(err.status || 400).json({ error: err.message || 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ Р·Р°РїСЂРѕСЃ' })
  console.error(err)
  res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' })
})

const httpServer = createServer(app)
const io = new Server(httpServer, { cors: corsOptions })
app.set('io', io)

// ----- РњРµСЃСЃРµРЅРґР¶РµСЂ: realtime -----
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  const u = wsUser(token)
  if (!u) return next(new Error('bad-token'))
  socket.user = { ...u, displayName: u.display_name, isAdmin: !!u.is_admin, isTester: !!u.is_tester }
  next()
})

io.on('connection', (socket) => {
  const userId = socket.user.id
  touchLastSeen(userId)
  // РїРѕРґРїРёСЃРєР° РЅР° РґРёР°Р»РѕРіРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
  const convIds = db.prepare('SELECT conversation_id FROM conversation_participants WHERE user_id=?').all(userId).map(r => r.conversation_id)
  convIds.forEach(id => socket.join(`conv-${id}`))
  socket.join(`user-${userId}`)
  markOnline(userId)
  socket.broadcast.emit('presence', { userId, online: !!socket.user.show_online })

  // РѕР±С‰РµРµ С‡РёСЃР»Рѕ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С… РґР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РїСѓС€ РІ РµРіРѕ РєРѕРјРЅР°С‚Сѓ
  const pushUnread = () => {
    const n = db.prepare(`
      SELECT COUNT(*) AS n FROM messages m
      WHERE m.read_at IS NULL AND m.sender_id != ?
        AND m.conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=?)
    `).get(userId, userId).n || 0
    io.to(`user-${userId}`).emit('unread', { unread: n })
  }

  // РџРѕРґРїРёСЃРєР° РЅР° РєРѕРјРЅР°С‚Сѓ РґРёР°Р»РѕРіР° вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ СѓС‡Р°СЃС‚РЅРёРєРѕРІ (РёРЅР°С‡Рµ РјРѕР¶РЅРѕ СЃР»СѓС€Р°С‚СЊ С‡СѓР¶СѓСЋ РїРµСЂРµРїРёСЃРєСѓ)
  socket.on('subscribe-conversation', (convId) => {
    if (!convId) return
    const member = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, userId)
    if (member) socket.join(`conv-${convId}`)
  })

  // РџРѕРґРїРёСЃРєР° РЅР° С‡Р°С‚ РіСЂСѓРїРїС‹ вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  socket.on('subscribe-group', (groupId) => {
    if (!groupId) return
    const member = db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(groupId, userId)
    if (member) socket.join(`group-${groupId}`)
  })

  // РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РєСЂС‹Р» РґРёР°Р»РѕРі вЂ” РїРѕРјРµС‡Р°РµРј РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рј Рё РѕР±РЅРѕРІР»СЏРµРј СЃС‡С‘С‚С‡РёРє
  socket.on('view-conversation', (convId) => {
    if (!convId) return
    const member = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(convId, userId)
    if (!member) return
    const affected = db.prepare('SELECT id FROM messages WHERE conversation_id=? AND sender_id != ? AND read_at IS NULL').all(convId, userId)
    if (affected.length) {
      db.prepare('UPDATE messages SET read_at=datetime(\'now\') WHERE conversation_id=? AND sender_id != ? AND read_at IS NULL').run(convId, userId)
      pushUnread()
      io.to(`conv-${convId}`).emit('message:read', { conversationId: convId, messageIds: affected.map(r => r.id) })
    } else {
      pushUnread()
    }
  })

  socket.on('send-message', ({ conversationId, body, nsfw }) => {
    if (!conversationId || !body?.trim()) return
    const blocked = checkMuted(userId)
    if (!blocked.allowed) {
      socket.emit('message:error', { error: blocked.error })
      return
    }
    const len = checkTextLength(body.trim())
    if (!len.allowed) {
      socket.emit('message:error', { error: len.error })
      return
    }
    const spam = checkSpam(userId, socket.user.isAdmin)
    if (!spam.allowed) {
      if (spam.muted) io.to(`user-${userId}`).emit('muted', { until: spam.muted.until })
      socket.emit('message:error', { error: spam.error })
      return
    }
    const isParticipant = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(conversationId, userId)
    if (!isParticipant) return
    const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, nsfw) VALUES (?,?,?,?)')
      .run(conversationId, userId, body.trim(), nsfw ? 1 : 0)
    const row = db.prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar, u.is_admin, u.is_tester, u.is_foreign_agent FROM messages m
      JOIN users u ON u.id=m.sender_id WHERE m.id=?
    `).get(info.lastInsertRowid)

    const msg = {
      id: row.id,
      conversationId: row.conversation_id,
      body: row.body,
      attachments: [],
      nsfw: !!row.nsfw,
      readAt: utcIso(row.read_at),
      createdAt: utcIso(row.created_at),
      sender: { id: row.sender_id, username: row.username, displayName: row.display_name, avatar: row.avatar, isAdmin: !!row.is_admin, isTester: !!row.is_tester, isForeignAgent: !!row.is_foreign_agent }
    }

    // СѓРІРµРґРѕРјРёС‚СЊ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ РґРёР°Р»РѕРіР°, РєСЂРѕРјРµ РѕС‚РїСЂР°РІРёС‚РµР»СЏ
    db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=? AND user_id != ?')
      .all(conversationId, userId).forEach(p => {
        io.to(`user-${p.user_id}`).emit('conversation:update', { conversationId })
      })
    io.to(`conv-${conversationId}`).emit('message', msg)

    // Р¶РёРІСЊС‘Рј РѕР±РЅРѕРІРёС‚СЊ СЃС‡С‘С‚С‡РёРєРё РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С… Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ РґРёР°Р»РѕРіР°
    const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(conversationId)
    participants.forEach(p => {
      const n = db.prepare(`
        SELECT COUNT(*) AS n FROM messages m
        WHERE m.read_at IS NULL AND m.sender_id != ?
          AND m.conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=?)
      `).get(p.user_id, p.user_id).n || 0
      io.to(`user-${p.user_id}`).emit('unread', { unread: n })
    })
  })

  socket.on('typing', ({ conversationId }) => {
    socket.to(`conv-${conversationId}`).emit('typing', { conversationId, user: socket.user })
  })

  socket.on('disconnect', () => {
    markOffline(userId)
    socket.broadcast.emit('presence', { userId, online: !!socket.user.show_online && isOnline(userId) })
  })
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`API СЂР°Р±РѕС‚Р°РµС‚ РЅР° http://localhost:${PORT}`)
})
import { Router } from 'express'
import db, { utcIso } from '../db.js'
import { requireAdmin, publicUser } from '../auth.js'
import { getAppMode, getRegMode, getInviteKey, getSidebarAd, setSetting } from '../settings.js'
import { isMuted, clearMute, applyBlock, clearBlock, applyContentMute, clearContentMute, contentMutesFor } from '../moderation.js'
import { isPinned } from '../posts.js'
import { createNotification } from '../notifications.js'

const router = Router()
router.use(requireAdmin)

const BLOCK_DURATIONS = { '1h': 3600e3, '1d': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 }
const CONTENT_TYPES = ['posts', 'audios', 'videos']

function blockDurationMs(duration) {
  if (duration === 'forever') return null
  const ms = BLOCK_DURATIONS[duration]
  return ms == null ? undefined : ms
}

// ---------- РџРѕР»СЊР·РѕРІР°С‚РµР»Рё: РїСЂРёРІРёР»РµРіРёСЏ С‚РµСЃС‚РёСЂРѕРІС‰РёРєР° Рё РјСѓС‚ ----------
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC LIMIT 50').all()
  res.json(rows.map(publicUser))
})

router.put('/users/:id/tester', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const isTester = req.body?.isTester ? 1 : 0
  db.prepare('UPDATE users SET is_tester=? WHERE id=?').run(isTester, u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.put('/users/:id/verified', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const verified = req.body?.verified ? 1 : 0
  db.prepare('UPDATE users SET verified=? WHERE id=?').run(verified, u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.put('/users/:id/foreign-agent', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const isForeignAgent = req.body?.isForeignAgent ? 1 : 0
  db.prepare('UPDATE users SET is_foreign_agent=? WHERE id=?').run(isForeignAgent, u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.put('/users/:id/moderator', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const isModerator = req.body?.isModerator ? 1 : 0
  db.prepare('UPDATE users SET is_moderator=? WHERE id=?').run(isModerator, u.id)
  createNotification({
    io: req.app.get('io'), userId: u.id, actorId: req.user.id, type: 'role_changed',
    targetType: 'admin', targetId: null,
    body: isModerator ? 'Р’Р°Рј РІС‹РґР°РЅР° СЂРѕР»СЊ РјРѕРґРµСЂР°С‚РѕСЂР°' : 'Р РѕР»СЊ РјРѕРґРµСЂР°С‚РѕСЂР° СЃРЅСЏС‚Р°'
  })
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

// РњРµРјРѕСЂРёР°Р»: РІС…РѕРґ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РЅРµРІРѕР·РјРѕР¶РµРЅ, РЅРѕ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ СЃРµСЃСЃРёРё РѕСЃС‚Р°СЋС‚СЃСЏ.
router.put('/users/:id/memorialize', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const memorialized = req.body?.memorialized ? 1 : 0
  if (memorialized && !u.memorialized) {
    db.prepare('UPDATE users SET memorialized=1, memorialized_at=datetime(\'now\'), memorialized_by=? WHERE id=?')
      .run(req.user.id, u.id)
    createNotification({
      io: req.app.get('io'), userId: u.id, actorId: req.user.id, type: 'role_changed',
      targetType: 'admin', targetId: null, body: 'Р’Р°С€ Р°РєРєР°СѓРЅС‚ РїРµСЂРµРІРµРґС‘РЅ РІ СЂРµР¶РёРј РїР°РјСЏС‚Рё'
    })
  } else if (!memorialized) {
    db.prepare('UPDATE users SET memorialized=0, memorialized_at=NULL, memorialized_by=NULL WHERE id=?').run(u.id)
  }
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

// Р‘Р»РѕРєРёСЂРѕРІРєР° Р°РєРєР°СѓРЅС‚Р°: РІСЂРµРјРµРЅРЅР°СЏ (1 С‡Р°СЃ/1 РґРµРЅСЊ/7 РґРЅРµР№/30 РґРЅРµР№) РёР»Рё РЅР°РІСЃРµРіРґР°
router.put('/users/:id/block', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const durationMs = blockDurationMs(req.body?.duration)
  if (durationMs === undefined) return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃСЂРѕРє Р±Р»РѕРєРёСЂРѕРІРєРё' })
  applyBlock(u.id, { durationMs, reason: req.body?.reason })
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.delete('/users/:id/block', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  clearBlock(u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

// РњСѓС‚С‹ РїРѕ С‚РёРїР°Рј РєРѕРЅС‚РµРЅС‚Р°: РїРѕСЃС‚С‹ / Р°СѓРґРёРѕ / РІРёРґРµРѕ
router.put('/users/:id/mute/:type', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const type = String(req.params.type)
  if (!CONTENT_TYPES.includes(type)) return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ С‚РёРї РєРѕРЅС‚РµРЅС‚Р°' })
  const durationMs = blockDurationMs(req.body?.duration)
  if (durationMs === undefined) return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃСЂРѕРє' })
  applyContentMute(u.id, type, durationMs)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.delete('/users/:id/mute/:type', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  const type = String(req.params.type)
  if (!CONTENT_TYPES.includes(type)) return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ С‚РёРї РєРѕРЅС‚РµРЅС‚Р°' })
  clearContentMute(u.id, type)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.delete('/users/:id/mute', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' })
  clearMute(u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)))
})

router.get('/mutes', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY muted_until DESC LIMIT 50').all()
    .filter(u => isMuted(u.id))
  res.json(rows.map(publicUser))
})

// ---------- РћР±С‰Р°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР° ----------
router.get('/stats', (req, res) => {
  const total = (sql) => db.prepare(sql).get().n
  const dayStart = `datetime('now','start of day')`

  res.json({
    totals: {
      users: total('SELECT COUNT(*) n FROM users'),
      posts: total('SELECT COUNT(*) n FROM posts'),
      comments: total('SELECT COUNT(*) n FROM comments'),
      communities: total('SELECT COUNT(*) n FROM communities'),
      messages: total('SELECT COUNT(*) n FROM messages'),
      reactions: total('SELECT COUNT(*) n FROM reactions'),
      follows: total('SELECT COUNT(*) n FROM follows')
    },
    today: {
      users: total(`SELECT COUNT(*) n FROM users WHERE created_at >= ${dayStart}`),
      posts: total(`SELECT COUNT(*) n FROM posts WHERE created_at >= ${dayStart}`),
      comments: total(`SELECT COUNT(*) n FROM comments WHERE created_at >= ${dayStart}`),
      communities: total(`SELECT COUNT(*) n FROM communities WHERE created_at >= ${dayStart}`),
      messages: total(`SELECT COUNT(*) n FROM messages WHERE created_at >= ${dayStart}`)
    },
    recentUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC LIMIT 20').all().map(publicUser),
    recentPosts: db.prepare(`
      SELECT p.id, p.body, p.created_at,
             u.id AS uid, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin
      FROM posts p JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 20
    `).all().map(r => ({
      id: r.id, body: r.body, createdAt: utcIso(r.created_at),
      author: { id: r.uid, username: r.uusername, displayName: r.udisplay, avatar: r.uavatar, isAdmin: !!r.uisadmin }
    })),
    recentCommunities: db.prepare(`
      SELECT c.id, c.name, c.description, c.created_at,
             u.id AS uid, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin
      FROM communities c JOIN users u ON u.id = c.owner_id
      ORDER BY c.created_at DESC, c.id DESC LIMIT 20
    `).all().map(r => ({
      id: r.id, name: r.name, description: r.description, createdAt: utcIso(r.created_at),
      owner: { id: r.uid, username: r.uusername, displayName: r.udisplay, avatar: r.uavatar, isAdmin: !!r.uisadmin }
    }))
  })
})

// ---------- Р РµР¶РёРјС‹ СЃР°Р№С‚Р° Рё СЂРµРіРёСЃС‚СЂР°С†РёРё ----------
router.get('/settings', (req, res) => {
  res.json({ appMode: getAppMode(), regMode: getRegMode(), inviteKey: getInviteKey(), sidebarAd: getSidebarAd() })
})

router.put('/settings', (req, res) => {
  const { appMode, regMode, inviteKey, sidebarAd } = req.body || {}
  if (appMode !== undefined) {
    if (!['normal', 'maintenance'].includes(appMode)) return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ СЂРµР¶РёРј СЃР°Р№С‚Р°' })
    setSetting('app_mode', appMode)
  }
  if (regMode !== undefined) {
    if (!['free', 'invite'].includes(regMode)) return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ СЂРµР¶РёРј СЂРµРіРёСЃС‚СЂР°С†РёРё' })
    setSetting('reg_mode', regMode)
  }
  if (inviteKey !== undefined) {
    const v = String(inviteKey).trim()
    if (v.length < 3) return res.status(400).json({ error: 'РљР»СЋС‡ РїСЂРёРіР»Р°С€РµРЅРёСЏ СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРёР№' })
    setSetting('invite_key', v)
  }
  if (sidebarAd !== undefined && sidebarAd !== null) {
    const { enabled, image, title, desc, link } = sidebarAd
    if (enabled !== undefined) setSetting('sidebar_ad_enabled', enabled ? '1' : '0')
    if (image !== undefined) setSetting('sidebar_ad_image', String(image || '').slice(0, 300))
    if (title !== undefined) setSetting('sidebar_ad_title', String(title || '').slice(0, 120))
    if (desc !== undefined) setSetting('sidebar_ad_desc', String(desc || '').slice(0, 300))
    if (link !== undefined) setSetting('sidebar_ad_link', String(link || '').slice(0, 500))
  }
  res.json({ appMode: getAppMode(), regMode: getRegMode(), inviteKey: getInviteKey(), sidebarAd: getSidebarAd() })
})

// ---------- РњРѕРґРµСЂР°С†РёСЏ РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ ----------
router.get('/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.body, m.created_at, m.post_id,
           u.id AS author_id, u.username AS author_username,
           u.display_name AS author_display_name, u.avatar AS author_avatar,
           p.body AS post_body
    FROM comments m
    JOIN users u ON u.id = m.author_id
    JOIN posts p ON p.id = m.post_id
    ORDER BY m.created_at DESC LIMIT 50
  `).all()
  res.json(rows.map(r => ({
    id: r.id, body: r.body, createdAt: r.created_at, postId: r.post_id, postBody: r.post_body,
    author: { id: r.author_id, username: r.author_username, displayName: r.author_display_name, avatar: r.author_avatar }
  })))
})

router.delete('/comments/:id', (req, res) => {
  const info = db.prepare('DELETE FROM comments WHERE id=?').run(Number(req.params.id))
  if (!info.changes) return res.status(404).json({ error: 'РљРѕРјРјРµРЅС‚Р°СЂРёР№ РЅРµ РЅР°Р№РґРµРЅ' })
  res.json({ ok: true })
})

// ---------- РњРѕРґРµСЂР°С†РёСЏ РїРѕСЃС‚РѕРІ ----------
router.get('/posts', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.body, p.image, p.created_at, p.pinned_until,
           u.id AS author_id, u.username AS author_username,
           u.display_name AS author_display_name, u.avatar AS author_avatar
    FROM posts p JOIN users u ON u.id = p.author_id
    ORDER BY p.created_at DESC LIMIT 50
  `).all()
  res.json(rows.map(r => ({
    id: r.id, body: r.body, image: r.image, createdAt: r.created_at,
    pinned: isPinned(r.pinned_until), pinnedUntil: r.pinned_until ? utcIso(r.pinned_until) : null,
    author: { id: r.author_id, username: r.author_username, displayName: r.author_display_name, avatar: r.author_avatar }
  })))
})

// ---------- РњРѕРґРµСЂР°С†РёСЏ РІРёРґРµРѕ ----------
router.get('/videos', (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.title, v.url, v.youtube, v.published, v.access, v.created_at, v.pinned_until,
           (SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id=v.id) AS like_count,
           u.id AS owner_id, u.username AS owner_username,
           u.display_name AS owner_display_name, u.avatar AS owner_avatar
    FROM library_videos v JOIN users u ON u.id = v.owner_id
    ORDER BY v.created_at DESC LIMIT 50
  `).all()
  res.json(rows.map(r => ({
    id: r.id, title: r.title, url: r.url, youtube: r.youtube, published: !!r.published,
    access: r.access || 'private',
    createdAt: utcIso(r.created_at), likes: r.like_count || 0,
    pinned: isPinned(r.pinned_until), pinnedUntil: r.pinned_until ? utcIso(r.pinned_until) : null,
    author: { id: r.owner_id, username: r.owner_username, displayName: r.owner_display_name, avatar: r.owner_avatar }
  })))
})

// ---------- РњРѕРґРµСЂР°С†РёСЏ СЃРѕРѕР±С‰РµСЃС‚РІ ----------
router.get('/communities', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username AS owner_username, u.display_name AS owner_display_name
    FROM communities c JOIN users u ON u.id = c.owner_id
    ORDER BY c.created_at DESC LIMIT 50
  `).all()
  res.json(rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, description: r.description, avatar: r.avatar, createdAt: r.created_at,
    owner: { username: r.owner_username, displayName: r.owner_display_name }
  })))
})

router.delete('/communities/:id', (req, res) => {
  const info = db.prepare('DELETE FROM communities WHERE id=?').run(Number(req.params.id))
  if (!info.changes) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµСЃС‚РІРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  res.json({ ok: true })
})

// ---------- Р–Р°Р»РѕР±С‹ РЅР° РєРѕРЅС‚РµРЅС‚ ----------
function reportTarget(type, id) {
  if (type === 'post') {
    const p = db.prepare('SELECT p.id, p.body, u.username AS uname, u.display_name AS dname FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=?').get(id)
    return p ? { id: p.id, text: (p.body || '').slice(0, 200), author: p.dname || p.uname } : null
  }
  if (type === 'video') {
    const v = db.prepare('SELECT v.id, v.title, u.username AS uname, u.display_name AS dname FROM library_videos v JOIN users u ON u.id=v.owner_id WHERE v.id=?').get(id)
    return v ? { id: v.id, text: v.title, author: v.dname || v.uname } : null
  }
  if (type === 'audio') {
    const a = db.prepare('SELECT a.id, a.title, a.artist, u.username AS uname, u.display_name AS dname FROM library_audios a JOIN users u ON u.id=a.owner_id WHERE a.id=?').get(id)
    return a ? { id: a.id, text: a.artist ? `${a.artist} вЂ” ${a.title}` : a.title, author: a.dname || a.uname } : null
  }
  if (type === 'photo') {
    const p = db.prepare('SELECT ap.id, alb.title, u.username AS uname, u.display_name AS dname FROM album_photos ap JOIN albums alb ON alb.id=ap.album_id JOIN users u ON u.id=alb.owner_id WHERE ap.id=?').get(id)
    return p ? { id: p.id, text: `Р¤РѕС‚Рѕ РёР· Р°Р»СЊР±РѕРјР° В«${p.title}В»`, author: p.dname || p.uname } : null
  }
  if (type === 'album') {
    const a = db.prepare('SELECT a.id, a.title, u.username AS uname, u.display_name AS dname FROM albums a JOIN users u ON u.id=a.owner_id WHERE a.id=?').get(id)
    return a ? { id: a.id, text: `РђР»СЊР±РѕРј В«${a.title}В»`, author: a.dname || a.uname } : null
  }
  return null
}

function reportJson(r) {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    detail: r.detail || '',
    status: r.status || 'pending',
    response: r.response || '',
    createdAt: utcIso(r.created_at),
    handledAt: utcIso(r.handled_at),
    reporter: { id: r.reporter_id, username: r.reporter_username, displayName: r.reporter_display_name, avatar: r.reporter_avatar },
    target: reportTarget(r.target_type, r.target_id)
  }
}

const REPORT_SELECT = `
  SELECT r.*, ru.username AS reporter_username, ru.display_name AS reporter_display_name, ru.avatar AS reporter_avatar
  FROM reports r JOIN users ru ON ru.id = r.reporter_id
`

router.get('/reports', (req, res) => {
  const status = String(req.query.status || 'all')
  const where = status === 'pending' || status === 'approved' || status === 'dismissed' ? `WHERE r.status = ?` : ''
  const rows = db.prepare(`
    ${REPORT_SELECT}
    ${where}
    ORDER BY (CASE WHEN r.status='pending' THEN 0 ELSE 1 END), r.id DESC LIMIT 100
  `).all(...(where ? [status] : []))
  res.json(rows.map(reportJson))
})

function deleteReportedContent(r) {
  const id = Number(r.target_id)
  switch (r.target_type) {
    case 'post': db.prepare('DELETE FROM posts WHERE id=?').run(id); break
    case 'video': db.prepare('DELETE FROM library_videos WHERE id=?').run(id); break
    case 'audio': db.prepare('DELETE FROM library_audios WHERE id=?').run(id); break
    case 'photo': db.prepare('DELETE FROM album_photos WHERE id=?').run(id); break
    case 'album': db.prepare('DELETE FROM albums WHERE id=?').run(id); break
  }
}

// РћС‚РІРµС‚ РЅР° Р¶Р°Р»РѕР±Сѓ: СЃС‚Р°С‚СѓСЃ (approved/dismissed), С‚РµРєСЃС‚ РѕС‚РІРµС‚Р°, РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ СѓРґР°Р»РёС‚СЊ РєРѕРЅС‚РµРЅС‚.
// РћС‚РІРµС‚ РїСЂРёС…РѕРґРёС‚ Р°РІС‚РѕСЂСѓ Р¶Р°Р»РѕР±С‹ РІ В«РњРѕРё СЃРѕР±С‹С‚РёСЏВ».
router.put('/reports/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id=?').get(Number(req.params.id))
  if (!r) return res.status(404).json({ error: 'Р–Р°Р»РѕР±Р° РЅРµ РЅР°Р№РґРµРЅР°' })
  const { status, response, deleteContent } = req.body || {}
  const newStatus = status === 'approved' || status === 'dismissed' ? status : (r.status || 'pending')
  db.prepare('UPDATE reports SET status=?, response=?, handled_by=?, handled_at=datetime(\'now\') WHERE id=?')
    .run(newStatus, String(response || '').slice(0, 500), req.user.id, r.id)
  if (deleteContent) deleteReportedContent(r)
  if (response) {
    createNotification({
      io: req.app.get('io'), userId: r.reporter_id, actorId: req.user.id, type: 'report_response',
      targetType: 'report', targetId: r.id, body: String(response).slice(0, 200)
    })
  }
  res.json(reportJson(db.prepare(`${REPORT_SELECT} WHERE r.id=?`).get(r.id)))
})

router.delete('/reports/:id', (req, res) => {
  const info = db.prepare('DELETE FROM reports WHERE id=?').run(Number(req.params.id))
  if (!info.changes) return res.status(404).json({ error: 'Р–Р°Р»РѕР±Р° РЅРµ РЅР°Р№РґРµРЅР°' })
  res.json({ ok: true })
})

// ---------- Р‘Р°РЅС‹ РїРѕ IP ----------
router.get('/blocked-ips', (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.username AS handled_username FROM blocked_ips b
    LEFT JOIN users u ON u.id = b.handled_by
    ORDER BY b.created_at DESC
  `).all()
  res.json(rows.map(r => ({
    ip: r.ip, reason: r.reason || '', createdAt: utcIso(r.created_at), expiresAt: utcIso(r.expires_at),
    handledBy: r.handled_username || null
  })))
})

router.post('/blocked-ips', (req, res) => {
  const ip = String(req.body?.ip || '').trim()
  if (!ip) return res.status(400).json({ error: 'РЈРєР°Р¶РёС‚Рµ IP-Р°РґСЂРµСЃ' })
  const durationMs = blockDurationMs(req.body?.duration)
  if (durationMs === undefined) return res.status(400).json({ error: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃСЂРѕРє' })
  const expires = durationMs == null
    ? '9999-12-31 23:59:59'
    : new Date(Date.now() + durationMs).toISOString().replace('T', ' ').slice(0, 19)
  db.prepare('INSERT OR REPLACE INTO blocked_ips (ip, reason, handled_by, expires_at) VALUES (?,?,?,?)')
    .run(ip, String(req.body?.reason || '').slice(0, 200), req.user.id, expires)
  res.json({ ok: true })
})

router.delete('/blocked-ips/:ip', (req, res) => {
  const info = db.prepare('DELETE FROM blocked_ips WHERE ip=?').run(String(req.params.ip))
  if (!info.changes) return res.status(404).json({ error: 'Р‘Р»РѕРєРёСЂРѕРІРєР° РЅРµ РЅР°Р№РґРµРЅР°' })
  res.json({ ok: true })
})

export default router
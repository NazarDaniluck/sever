import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import db, { uploadsDir, utcIso } from '../db.js'
import { requireAuth } from '../auth.js'
import { notifyMentions, notifyReply, createNotification } from '../notifications.js'
import { recordView } from '../views.js'
import { createUploader, validateFiles, renameAs } from '../uploads.js'
import { checkContentMuted } from '../moderation.js'

const router = Router()

const photoUpload = createUploader({ maxSize: 20 * 1024 * 1024, maxFiles: 10 })
// Р’РёРґРµРѕ + РѕРїС†РёРѕРЅР°Р»СЊРЅРѕРµ РїСЂРµРІСЊСЋ-РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІ РѕРґРЅРѕРј Р·Р°РїСЂРѕСЃРµ (РѕР±Р° С„Р°Р№Р»Р° РїСЂРѕС…РѕРґСЏС‚
// РїСЂРѕРІРµСЂРєСѓ СЃРѕРґРµСЂР¶РёРјРѕРіРѕ; С‡С‚Рѕ РёРјРµРЅРЅРѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєР°СЂС‚РёРЅРєРѕР№ вЂ” РїСЂРѕРІРµСЂСЏРµРј РІ СЂРѕСѓС‚Рµ).
const videoUpload = createUploader({ maxSize: 100 * 1024 * 1024, maxFiles: 2 })
// РђСѓРґРёРѕ + РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅР°СЏ РѕР±Р»РѕР¶РєР° (РєРѕРЅС‚РµР№РЅРµСЂ MP4 РїРµСЂРµСЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РєР°Рє .m4a РІ СЂРѕСѓС‚Рµ)
const audioUpload = createUploader({ maxSize: 100 * 1024 * 1024, maxFiles: 2 })

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/)
  return m ? m[1] : null
}

// РР·РІР»РµС‡РµРЅРёРµ РІСЃС‚СЂРѕРµРЅРЅРѕР№ РѕР±Р»РѕР¶РєРё (APIC) РёР· ID3v2-С‚РµРіРѕРІ Р°СѓРґРёРѕС„Р°Р№Р»Р°.
// РџРѕРґРґРµСЂР¶РёРІР°РµС‚ v2.3/v2.4. Р’РѕР·РІСЂР°С‰Р°РµС‚ { mime, data } РёР»Рё null.
function extractID3Cover(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return null
  const ver = buf[3]
  if (ver !== 3 && ver !== 4) return null
  const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
  const tagEnd = 10 + tagSize
  if (tagEnd > buf.length) return null
  let pos = 10
  while (pos + 10 <= tagEnd) {
    const frameId = buf.toString('latin1', pos, pos + 4)
    let size = buf.readUInt32BE(pos + 4)
    if (ver === 4) size = ((buf[pos + 4] & 0x7f) << 21) | ((buf[pos + 5] & 0x7f) << 14) | ((buf[pos + 6] & 0x7f) << 7) | (buf[pos + 7] & 0x7f)
    pos += 10
    if (frameId === 'APIC' && size > 0) {
      const frameEnd = pos + size
      if (frameEnd > buf.length) return null
      const f = buf.subarray(pos, frameEnd)
      let p = 1
      let mime = ''
      while (p < f.length && f[p] !== 0) { mime += String.fromCharCode(f[p]); p++ }
      p++ // null-terminator MIME
      p++ // picture type byte
      // РѕРїРёСЃР°РЅРёРµ (encoding-Р·Р°РІРёСЃРёРјС‹Р№ С‚РµСЂРјРёРЅР°С‚РѕСЂ)
      const enc = f[0]
      if (enc === 1 || enc === 2) { // UTF-16
        while (p + 1 < f.length) {
          if (f[p] === 0 && f[p + 1] === 0) { p += 2; break }
          p += 2
        }
      } else {
        while (p < f.length && f[p] !== 0) p++
        p++
      }
      const data = f.subarray(p)
      if (data.length > 0 && mime.toLowerCase().startsWith('image/')) return { mime, data }
    }
    pos += size
  }
  return null
}

function saveCover(buf, mime) {
  const ext = (mime === 'image/png') ? '.png' : (mime === 'image/gif' ? '.gif' : '.jpg')
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  fs.writeFileSync(path.join(uploadsDir, filename), buf)
  return `/uploads/${filename}`
}

// ---------- Р¤РѕС‚РѕРіСЂР°С„РёРё (Р°Р»СЊР±РѕРјС‹) ----------
router.get('/albums', requireAuth, (req, res) => {
  const albums = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id=a.id) AS photo_count,
           (SELECT url FROM album_photos ap2 WHERE ap2.album_id=a.id ORDER BY ap2.id DESC LIMIT 1) AS cover
    FROM albums a WHERE a.owner_id=? ORDER BY a.created_at DESC, a.id DESC
  `).all(req.user.id)
  res.json(albums.map(a => ({ id: a.id, title: a.title, createdAt: utcIso(a.created_at), photoCount: a.photo_count, cover: a.cover })))
})

router.get('/albums/:id', (req, res) => {
  const id = Number(req.params.id)
  const album = db.prepare(`
    SELECT a.*, u.username AS owner_username, u.display_name AS owner_display_name, u.avatar AS owner_avatar
    FROM albums a JOIN users u ON u.id=a.owner_id WHERE a.id=?
  `).get(id)
  if (!album) return res.status(404).json({ error: 'РђР»СЊР±РѕРј РЅРµ РЅР°Р№РґРµРЅ' })
  const photos = db.prepare('SELECT * FROM album_photos WHERE album_id=? ORDER BY id ASC').all(id)
    .map(p => ({ id: p.id, url: p.url, createdAt: utcIso(p.created_at) }))
  res.json({
    id: album.id,
    title: album.title,
    createdAt: utcIso(album.created_at),
    isOwner: req.user ? album.owner_id === req.user.id : false,
    owner: {
      id: album.owner_id,
      username: album.owner_username,
      displayName: album.owner_display_name || album.owner_username,
      avatar: album.owner_avatar
    },
    photos
  })
})

router.post('/albums', requireAuth, photoUpload.array('file', 10), validateFiles(['image']), (req, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ Р°Р»СЊР±РѕРјР° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅСѓ С„РѕС‚РѕРіСЂР°С„РёСЋ' })
  const info = db.prepare('INSERT INTO albums (owner_id, title) VALUES (?, ?)').run(req.user.id, title)
  const ins = db.prepare('INSERT INTO album_photos (album_id, url) VALUES (?, ?)')
  for (const f of files) ins.run(info.lastInsertRowid, `/uploads/${f.filename}`)
  res.status(201).json({ id: info.lastInsertRowid, title, photoCount: files.length })
})

// Р”РѕР±Р°РІРёС‚СЊ С„РѕС‚РѕРіСЂР°С„РёРё РІ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ Р°Р»СЊР±РѕРј (РґРѕ 10 Р·Р° СЂР°Р·, РІ СЃСѓРјРјРµ РґРѕ 100)
router.post('/albums/:id/photos', requireAuth, photoUpload.array('file', 10), validateFiles(['image']), (req, res) => {
  const id = Number(req.params.id)
  const album = db.prepare('SELECT * FROM albums WHERE id=?').get(id)
  if (!album || album.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'Р¤Р°Р№Р»С‹ РЅРµ РІС‹Р±СЂР°РЅС‹' })
  const current = db.prepare('SELECT COUNT(*) n FROM album_photos WHERE album_id=?').get(id).n
  if (current + files.length > 100) return res.status(400).json({ error: 'Р’ Р°Р»СЊР±РѕРјРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РјР°РєСЃРёРјСѓРј 100 С„РѕС‚РѕРіСЂР°С„РёР№' })
  const ins = db.prepare('INSERT INTO album_photos (album_id, url) VALUES (?, ?)')
  for (const f of files) ins.run(id, `/uploads/${f.filename}`)
  res.json({ ok: true, added: files.length })
})

// РџРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ Р°Р»СЊР±РѕРј
router.put('/albums/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const album = db.prepare('SELECT * FROM albums WHERE id=?').get(id)
  if (!album) return res.status(404).json({ error: 'РђР»СЊР±РѕРј РЅРµ РЅР°Р№РґРµРЅ' })
  if (album.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ Р°Р»СЊР±РѕРјР° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  if (title.length > 50) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ СЃР»РёС€РєРѕРј РґР»РёРЅРЅРѕРµ' })
  db.prepare('UPDATE albums SET title=? WHERE id=?').run(title, id)
  res.json({ id, title })
})

router.delete('/albums/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const album = db.prepare('SELECT * FROM albums WHERE id=?').get(id)
  if (!album) return res.status(404).json({ error: 'РђР»СЊР±РѕРј РЅРµ РЅР°Р№РґРµРЅ' })
  if (album.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM albums WHERE id=?').run(id)
  res.json({ ok: true })
})

router.delete('/albums/:id/photos/:photoId', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const photoId = Number(req.params.photoId)
  const album = db.prepare('SELECT * FROM albums WHERE id=?').get(id)
  if (!album) return res.status(404).json({ error: 'РђР»СЊР±РѕРј РЅРµ РЅР°Р№РґРµРЅ' })
  if (album.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM album_photos WHERE id=? AND album_id=?').run(photoId, id)
  res.json({ ok: true })
})

// ---------- РЎС‚СЂР°РЅРёС†Р° С„РѕС‚РѕРіСЂР°С„РёРё ----------
function commentJson(c) {
  return {
    id: c.id,
    body: c.body,
    createdAt: utcIso(c.created_at),
    parentId: c.parent_id || null,
    replyTo: c.reply_uid
      ? { id: c.reply_uid, username: c.reply_username, displayName: c.reply_display_name }
      : null,
    author: { id: c.uid, username: c.uusername, displayName: c.udisplay, avatar: c.uavatar, isAdmin: !!c.uisadmin, isForeignAgent: !!c.uis_foreign_agent }
  }
}

// РЎРѕРµРґРёРЅРµРЅРёРµ СЂРѕРґРёС‚РµР»СЊСЃРєРѕРіРѕ РєРѕРјРјРµРЅС‚Р°СЂРёСЏ (РґР»СЏ РѕС‚РІРµС‚РѕРІ)
const PARENT_JOIN = `
  LEFT JOIN %TABLE% pc ON pc.id = c.parent_id
  LEFT JOIN users pu ON pu.id = pc.author_id
`
const commentColumns = `
  c.*, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin, u.is_foreign_agent AS uis_foreign_agent,
  pu.id AS reply_uid, pu.username AS reply_username, pu.display_name AS reply_display_name
`
const photoCommentSelect = `SELECT ${commentColumns} FROM photo_comments c JOIN users u ON u.id = c.author_id ${PARENT_JOIN.replace('%TABLE%', 'photo_comments')}`
const videoCommentSelect = `SELECT ${commentColumns} FROM video_comments c JOIN users u ON u.id = c.author_id ${PARENT_JOIN.replace('%TABLE%', 'video_comments')}`

router.get('/photos/:photoId', (req, res) => {
  const photoId = Number(req.params.photoId)
  const p = db.prepare(`
    SELECT ap.*, alb.title AS album_title, alb.owner_id AS album_owner, u.id AS uid, u.username AS uusername,
           u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin, u.is_foreign_agent AS uis_foreign_agent,
           (SELECT COUNT(*) FROM photo_likes pl WHERE pl.photo_id=ap.id) AS like_count,
           (SELECT 1 FROM photo_likes pl2 WHERE pl2.photo_id=ap.id AND pl2.user_id=?) AS i_like
    FROM album_photos ap
    JOIN albums alb ON alb.id=ap.album_id
    JOIN users u ON u.id=alb.owner_id
    WHERE ap.id=?
  `).get(req.user ? req.user.id : null, photoId)
  if (!p) return res.status(404).json({ error: 'Р¤РѕС‚РѕРіСЂР°С„РёСЏ РЅРµ РЅР°Р№РґРµРЅР°' })
  const comments = db.prepare(`
    ${photoCommentSelect}
    WHERE c.photo_id=? ORDER BY c.created_at ASC, c.id ASC
  `).all(photoId).map(commentJson)
  res.json({
    id: p.id, url: p.url, createdAt: utcIso(p.created_at),
    album: { id: p.album_id, title: p.album_title },
    likes: p.like_count || 0, liked: !!p.i_like,
    owner: { id: p.uid, username: p.uusername, displayName: p.udisplay, avatar: p.uavatar, isAdmin: !!p.uisadmin, isForeignAgent: !!p.uis_foreign_agent },
    comments
  })
})

router.post('/photos/:photoId/like', requireAuth, (req, res) => {
  const photoId = Number(req.params.photoId)
  const p = db.prepare('SELECT id FROM album_photos WHERE id=?').get(photoId)
  if (!p) return res.status(404).json({ error: 'Р¤РѕС‚РѕРіСЂР°С„РёСЏ РЅРµ РЅР°Р№РґРµРЅР°' })
  const liked = db.prepare('SELECT 1 FROM photo_likes WHERE photo_id=? AND user_id=?').get(photoId, req.user.id)
  if (liked) db.prepare('DELETE FROM photo_likes WHERE photo_id=? AND user_id=?').run(photoId, req.user.id)
  else db.prepare('INSERT OR IGNORE INTO photo_likes (photo_id, user_id) VALUES (?, ?)').run(photoId, req.user.id)
  const likes = db.prepare('SELECT COUNT(*) n FROM photo_likes WHERE photo_id=?').get(photoId).n
  res.json({ likes, liked: !liked })
})

router.post('/photos/:photoId/comments', requireAuth, (req, res) => {
  const photoId = Number(req.params.photoId)
  const p = db.prepare('SELECT id FROM album_photos WHERE id=?').get(photoId)
  if (!p) return res.status(404).json({ error: 'Р¤РѕС‚РѕРіСЂР°С„РёСЏ РЅРµ РЅР°Р№РґРµРЅР°' })
  const body = String(req.body.body || '').trim()
  if (!body) return res.status(400).json({ error: 'РџСѓСЃС‚РѕР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№' })
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null
  let parent = null
  if (parentId) {
    parent = db.prepare('SELECT * FROM photo_comments WHERE id=? AND photo_id=?').get(parentId, photoId)
    if (!parent) return res.status(400).json({ error: 'РќРµР»СЊР·СЏ РѕС‚РІРµС‚РёС‚СЊ РЅР° СЌС‚РѕС‚ РєРѕРјРјРµРЅС‚Р°СЂРёР№' })
  }
  const info = db.prepare('INSERT INTO photo_comments (photo_id, author_id, body, parent_id) VALUES (?, ?, ?, ?)')
    .run(photoId, req.user.id, body, parentId)
  const c = db.prepare(`${photoCommentSelect} WHERE c.id=?`).get(info.lastInsertRowid)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'photo', targetId: photoId, commentId: c.id })
  notifyReply(req.app.get('io'), req.user.id, parent, { targetType: 'photo', targetId: photoId })
  res.status(201).json(commentJson(c))
})

// ---------- Р’РёРґРµРѕР·Р°РїРёСЃРё ----------
function isPinned(pinnedUntil) {
  if (pinnedUntil == null) return true           // NULL = Р·Р°РєСЂРµРїР»РµРЅРѕ РЅР°РІСЃРµРіРґР°
  if (pinnedUntil === '') return false           // '' = РЅРµ Р·Р°РєСЂРµРїР»РµРЅРѕ
  return new Date(utcIso(pinnedUntil)).getTime() > Date.now()
}

// В«Р”СЂСѓР·СЊСЏВ» = РІР·Р°РёРјРЅС‹Рµ РїРѕРґРїРёСЃРєРё (РїРѕРґРїРёСЃР°РЅ РЅР° РјРµРЅСЏ Рё СЏ РЅР° РЅРµРіРѕ)
const FRIEND_SQL = `
  EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id=? AND f1.following_id=v.owner_id)
  AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id=v.owner_id AND f2.following_id=?)
`

// Р’РёРґРёРјРѕСЃС‚СЊ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР° РїРѕ СЃСЃС‹Р»РєРµ/Р·Р°РєР»Р°РґРѕРє (open, link, СЃРІРѕРё, РґСЂСѓР·СЊСЏ)
function viewAccessSql(viewerId) {
  if (viewerId == null) return { sql: "(v.access = 'open' OR v.access = 'link')", params: [] }
  return {
    sql: `(v.access = 'open' OR v.access = 'link' OR v.owner_id = ? OR (v.access = 'friends' AND ${FRIEND_SQL}))`,
    params: [viewerId, viewerId, viewerId]
  }
}

// Р’РёРґРёРјРѕСЃС‚СЊ РІ Р»РµРЅС‚Рµ (open вЂ” РІСЃРµРј, friends вЂ” РґСЂСѓР·СЊСЏРј Рё РІР»Р°РґРµР»СЊС†Сѓ)
function feedAccessSql(viewerId) {
  if (viewerId == null) return { sql: "v.access = 'open'", params: [] }
  return {
    sql: `(v.access = 'open' OR (v.access = 'friends' AND (v.owner_id = ? OR ${FRIEND_SQL})))`,
    params: [viewerId, viewerId, viewerId]
  }
}

// РџСЂР°РІРѕ РЅР° РІР·Р°РёРјРѕРґРµР№СЃС‚РІРёРµ (Р»Р°Р№Рє/РєРѕРјРјРµРЅС‚Р°СЂРёР№/РїСЂРѕСЃРјРѕС‚СЂ): РєР°Рє РїСЂРѕСЃРјРѕС‚СЂ РїРѕ СЃСЃС‹Р»РєРµ,
// С‡С‚РѕР±С‹ РЅРµР»СЊР·СЏ Р±С‹Р»Рѕ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРѕРІР°С‚СЊ СЃ РІРёРґРµРѕ, РєРѕС‚РѕСЂРѕРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ РЅРµ РІРёРґРЅРѕ.
function canInteract(req, v) {
  if (v.access === 'open' || v.access === 'link') return true
  if (req.user && (v.owner_id === req.user.id || req.user.is_admin)) return true
  if (v.access === 'friends' && req.user) {
    return !!db.prepare(`
      SELECT 1 FROM follows f1
      JOIN follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id
      WHERE f1.follower_id=? AND f1.following_id=?
    `).get(req.user.id, v.owner_id)
  }
  return false
}

function videoJson(r, viewed = false) {
  return {
    id: r.id, title: r.title, url: r.url, youtube: youtubeId(r.youtube || null) || r.youtube || null,
    youtubeUrl: r.youtube || null, published: !!r.published, access: r.access || 'private',
    description: r.description || '', preview: r.preview || null,
    views: r.views || 0, likes: r.like_count || 0, liked: !!r.i_like, bookmarked: !!r.i_bookmark,
    pinned: isPinned(r.pinned_until), pinnedUntil: r.pinned_until ? utcIso(r.pinned_until) : null,
    createdAt: utcIso(r.created_at)
  }
}

// РљРѕР»РѕРЅРєРё РґР»СЏ РІС‹Р±РѕСЂРєРё РІРёРґРµРѕ СЃ СѓС‡С‘С‚РѕРј Р·СЂРёС‚РµР»СЏ
const VIDEO_VIEWER_SELECT = `
  v.*,
  (SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id=v.id) AS like_count,
  (SELECT 1 FROM video_likes vl2 WHERE vl2.video_id=v.id AND vl2.user_id=?) AS i_like,
  (SELECT 1 FROM bookmarks bm2 WHERE bm2.user_id=? AND bm2.target_type='video' AND bm2.target_id=v.id) AS i_bookmark
`

router.get('/videos', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT ${VIDEO_VIEWER_SELECT}
    FROM library_videos v WHERE v.owner_id=? ORDER BY (CASE WHEN v.pinned_until IS NULL OR (v.pinned_until != '' AND v.pinned_until > datetime('now')) THEN 0 ELSE 1 END), v.created_at DESC, v.id DESC
  `).all(req.user.id, req.user.id, req.user.id)
  res.json(rows.map(r => videoJson(r)))
})

// Р›РµРЅС‚Р° РІРёРґРµРѕ (РїСѓР±Р»РёС‡РЅР°СЏ): С‚РѕР»СЊРєРѕ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Рµ, СЂР°Р·РЅС‹Рµ СЃРѕСЂС‚РёСЂРѕРІРєРё
router.get('/feed', (req, res) => {
  const sort = req.query.sort || 'date'
  let order
  switch (sort) {
    case 'popular': order = '(SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id=v.id) DESC, v.views DESC, v.id DESC'; break
    case 'views': order = 'v.views DESC, v.id DESC'; break
    case 'likes': order = '(SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id=v.id) DESC, v.id DESC'; break
    case 'trending': order = `(CASE WHEN datetime('now') - datetime(v.created_at) < 7 THEN 1 ELSE 0 END) DESC,
        (v.views*3 + 20*(SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id=v.id)) / max(1, julianday('now') - julianday(v.created_at)) DESC, v.id DESC`; break
    case 'date':
    default: order = 'v.created_at DESC, v.id DESC'
  }
  const viewerId = req.user ? req.user.id : null
  const acc = feedAccessSql(viewerId)
  const q = String(req.query.q || '').trim()
  let where = `v.published=1 AND ${acc.sql}`
  const params = [viewerId, viewerId, ...acc.params]
  if (q) {
    where += ` AND (contains_no_case(v.title, ?) OR contains_no_case(v.description, ?) OR contains_no_case(u.username, ?) OR contains_no_case(u.display_name, ?))`
    params.push(q, q, q, q)
  }
  const rows = db.prepare(`
    SELECT ${VIDEO_VIEWER_SELECT.replace('v.*', 'v.*, u.id AS uid, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin, u.is_foreign_agent AS uis_foreign_agent')}
    FROM library_videos v JOIN users u ON u.id=v.owner_id
    WHERE ${where}
    ORDER BY (CASE WHEN v.pinned_until IS NULL OR (v.pinned_until != '' AND v.pinned_until > datetime('now')) THEN 0 ELSE 1 END), ${order}
  `).all(...params)
  res.json({
    sort,
    videos: rows.map(r => ({ ...videoJson(r), author: { id: r.uid, username: r.uusername, displayName: r.udisplay, avatar: r.uavatar, isAdmin: !!r.uisadmin, isForeignAgent: !!r.uis_foreign_agent } }))
  })
})

// РЎРјРµРЅР° СѓСЂРѕРІРЅСЏ РґРѕСЃС‚СѓРїР° / РІС‹РєР»Р°РґРєР° РІ Р»РµРЅС‚Сѓ + РїСЂР°РІРєР° РЅР°Р·РІР°РЅРёСЏ Рё РѕРїРёСЃР°РЅРёСЏ.
// Р”РѕСЃС‚СѓРї Р·Р°РґР°С‘С‚СЃСЏ РѕРґРёРЅ СЂР°Р·: РїРѕРєР° РІРёРґРµРѕ РЅРµ РІС‹Р»РѕР¶РµРЅРѕ. РџРѕСЃР»Рµ РІС‹РєР»Р°РґРєРё РёР·РјРµРЅРёС‚СЊ РЅРµР»СЊР·СЏ.
// РќР°Р·РІР°РЅРёРµ Рё РѕРїРёСЃР°РЅРёРµ РјРѕР¶РЅРѕ РјРµРЅСЏС‚СЊ РєРѕРіРґР° СѓРіРѕРґРЅРѕ, Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№ РїРѕ РІСЂРµРјРµРЅРё.
router.put('/videos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT * FROM library_videos WHERE id=?').get(id)
  if (!v || v.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  if (req.body.title !== undefined) {
    const title = String(req.body.title || '').trim()
    if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РІРёРґРµРѕР·Р°РїРёСЃРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
    db.prepare('UPDATE library_videos SET title=? WHERE id=?').run(title, id)
  }
  if (req.body.access !== undefined) {
    const access = String(req.body.access || '')
    const allowed = ['private', 'link', 'friends', 'open']
    if (!allowed.includes(access)) return res.status(400).json({ error: 'РќРµРёР·РІРµСЃС‚РЅС‹Р№ СѓСЂРѕРІРµРЅСЊ РґРѕСЃС‚СѓРїР°' })
    if (v.published === 1) {
      return res.status(400).json({ error: 'Р”РѕСЃС‚СѓРї СѓР¶Рµ Р·Р°РґР°РЅ. РР·РјРµРЅРёС‚СЊ РµРіРѕ РЅРµР»СЊР·СЏ вЂ” РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ СЃРєСЂС‹С‚СЊ РІРёРґРµРѕ РёР»Рё СѓРґР°Р»РёС‚СЊ РµРіРѕ.' })
    }
    const published = access === 'private' ? 0 : 1
    db.prepare('UPDATE library_videos SET access=?, published=? WHERE id=?').run(access, published, id)
  }
  if (req.body.description !== undefined) {
    db.prepare('UPDATE library_videos SET description=? WHERE id=?').run(String(req.body.description || '').trim(), id)
  }
  if (req.body.preview !== undefined && req.body.preview === null) {
    db.prepare('UPDATE library_videos SET preview=NULL WHERE id=?').run(id)
  }
  const row = db.prepare(`SELECT ${VIDEO_VIEWER_SELECT} FROM library_videos v WHERE v.id=?`).get(req.user.id, req.user.id, id)
  res.json(videoJson(row))
})

// РЎРјРµРЅРёС‚СЊ РїСЂРµРІСЊСЋ (РјРёРЅРёР°С‚СЋСЂСѓ) РІРёРґРµРѕ
router.post('/videos/:id/preview', requireAuth, photoUpload.single('preview'), validateFiles(['image']), (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT * FROM library_videos WHERE id=?').get(id)
  if (!v || v.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  if (!req.file) return res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' })
  db.prepare('UPDATE library_videos SET preview=? WHERE id=?').run(`/uploads/${req.file.filename}`, id)
  const row = db.prepare(`SELECT ${VIDEO_VIEWER_SELECT} FROM library_videos v WHERE v.id=?`).get(req.user.id, req.user.id, id)
  res.json(videoJson(row))
})

// РџРѕР»РЅРѕСЃС‚СЊСЋ СЃРєСЂС‹С‚СЊ РІРёРґРµРѕ (СЃРЅРёРјР°РµС‚ СЃ РїР»РѕС‰Р°РґРєРё, РґРѕСЃС‚СѓРї С‚РѕР»СЊРєРѕ РјРЅРµ)
router.post('/videos/:id/hide', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT * FROM library_videos WHERE id=?').get(id)
  if (!v || v.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare("UPDATE library_videos SET published=0, access='private' WHERE id=?").run(id)
  const row = db.prepare(`SELECT ${VIDEO_VIEWER_SELECT} FROM library_videos v WHERE v.id=?`).get(req.user.id, req.user.id, id)
  res.json(videoJson(row))
})

router.post('/videos', requireAuth, videoUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), validateFiles(['video', 'image']), (req, res) => {
  const vmute = checkContentMuted(req.user.id, 'videos')
  if (!vmute.allowed) return res.status(403).json({ error: vmute.error })
  const videoFile = (req.files?.file || [])[0]
  const previewFile = (req.files?.preview || [])[0]
  if (videoFile && videoFile.kind !== 'video') {
    return res.status(400).json({ error: 'РќРµРїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Р№ С‚РёРї РІРёРґРµРѕС„Р°Р№Р»Р°' })
  }
  if (previewFile && previewFile.kind !== 'image') {
    return res.status(400).json({ error: 'РџСЂРµРІСЊСЋ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµРј' })
  }
  const title = String(req.body.title || (videoFile?.originalname || '')).trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РІРёРґРµРѕР·Р°РїРёСЃРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  if (!videoFile) return res.status(400).json({ error: 'РџСЂРёРєСЂРµРїРёС‚Рµ РІРёРґРµРѕС„Р°Р№Р»' })
  const description = String(req.body.description || '').trim()
  const preview = previewFile ? `/uploads/${previewFile.filename}` : null
  const playlistId = Number.parseInt(req.body.playlistId, 10) || null
  if (playlistId) {
    const pl = db.prepare('SELECT id, owner_id FROM video_playlists WHERE id=?').get(playlistId)
    if (!pl || pl.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РїР»РµР№Р»РёСЃС‚Сѓ' })
  }
  const info = db.prepare("INSERT INTO library_videos (owner_id, title, description, url, preview, published, access, pinned_until) VALUES (?, ?, ?, ?, ?, 0, 'private', '')")
    .run(req.user.id, title, description, `/uploads/${videoFile.filename}`, preview)
  const videoId = info.lastInsertRowid
  if (playlistId) {
    db.prepare('INSERT OR IGNORE INTO video_playlist_items (playlist_id, video_id) VALUES (?, ?)').run(playlistId, videoId)
  }
  res.status(201).json(videoJson({
    id: videoId, title, description, url: `/uploads/${videoFile.filename}`, preview,
    created_at: new Date().toISOString(), published: 0, access: 'private', pinned_until: ''
  }))
})

// Р›Р°Р№Рє/РґРёР·Р»Р°Р№Рє РІРёРґРµРѕ
router.post('/videos/:id/like', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT id, owner_id, access FROM library_videos WHERE id=?').get(id)
  if (!v) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (!canInteract(req, v)) return res.status(403).json({ error: 'Р’РёРґРµРѕ РІР°Рј РЅРµРґРѕСЃС‚СѓРїРЅРѕ' })
  if (req.user.id === v.owner_id) return res.status(400).json({ error: 'РќРµР»СЊР·СЏ Р»Р°Р№РєР°С‚СЊ СЃРІРѕС‘ РІРёРґРµРѕ' })
  const liked = db.prepare('SELECT 1 FROM video_likes WHERE video_id=? AND user_id=?').get(id, req.user.id)
  if (liked) db.prepare('DELETE FROM video_likes WHERE video_id=? AND user_id=?').run(id, req.user.id)
  else db.prepare('INSERT OR IGNORE INTO video_likes (video_id, user_id) VALUES (?, ?)').run(id, req.user.id)
  const likes = db.prepare('SELECT COUNT(*) n FROM video_likes WHERE video_id=?').get(id).n
  res.json({ likes, liked: !liked })
})

// РџСЂРѕСЃРјРѕС‚СЂ РІРёРґРµРѕ: Р·Р°С‰РёС‚Р° РѕС‚ РЅР°РєСЂСѓС‚РєРё (РѕР±С‰Р°СЏ Р»РѕРіРёРєР° РІ views.js)
router.post('/videos/:id/view', (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT id, owner_id, access FROM library_videos WHERE id=?').get(id)
  if (!v) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (!canInteract(req, v)) return res.status(403).json({ error: 'Р’РёРґРµРѕ РІР°Рј РЅРµРґРѕСЃС‚СѓРїРЅРѕ' })
  const r = recordView('library_videos', id, v.owner_id, req)
  if (r.notFound) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  res.json({ views: r.views })
})

// ---------- РЎС‚СЂР°РЅРёС†Р° РІРёРґРµРѕ ----------
router.get('/videos/bookmarks', requireAuth, (req, res) => {
  const acc = viewAccessSql(req.user.id)
  const rows = db.prepare(`
    SELECT ${VIDEO_VIEWER_SELECT.replace('v.*', 'v.*, u.id AS uid, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin, u.is_foreign_agent AS uis_foreign_agent')}
    FROM library_videos v JOIN users u ON u.id=v.owner_id
    JOIN bookmarks bm ON bm.target_id=v.id AND bm.target_type='video' AND bm.user_id=?
    WHERE ${acc.sql}
    ORDER BY bm.id DESC
  `).all(req.user.id, req.user.id, req.user.id, ...acc.params)
  res.json(rows.map(r => ({ ...videoJson(r), author: { id: r.uid, username: r.uusername, displayName: r.udisplay, avatar: r.uavatar, isAdmin: !!r.uisadmin, isForeignAgent: !!r.uis_foreign_agent } })))
})

// ---------- РџР»РµР№Р»РёСЃС‚С‹ РІРёРґРµРѕР·Р°РїРёСЃРµР№ ----------
router.get('/videos/playlists', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT pl.*,
      (SELECT COUNT(*) FROM video_playlist_items pi WHERE pi.playlist_id=pl.id) AS video_count,
      (SELECT COALESCE(v.preview, v.url) FROM video_playlist_items pi2 JOIN library_videos v ON v.id=pi2.video_id WHERE pi2.playlist_id=pl.id ORDER BY pi2.added_at DESC, pi2.rowid DESC LIMIT 1) AS cover
    FROM video_playlists pl WHERE pl.owner_id=? ORDER BY pl.created_at DESC, pl.id DESC
  `).all(req.user.id)
  res.json(rows.map(r => ({ id: r.id, title: r.title, videoCount: r.video_count || 0, cover: r.cover || null, createdAt: utcIso(r.created_at) })))
})

router.post('/videos/playlists', requireAuth, (req, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РїР»РµР№Р»РёСЃС‚Р° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  const info = db.prepare('INSERT INTO video_playlists (owner_id, title) VALUES (?, ?)').run(req.user.id, title)
  res.status(201).json({ id: info.lastInsertRowid, title, videoCount: 0, cover: null, createdAt: new Date().toISOString() })
})

router.put('/videos/playlists/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const pl = db.prepare('SELECT * FROM video_playlists WHERE id=?').get(id)
  if (!pl || pl.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РїР»РµР№Р»РёСЃС‚Р° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  db.prepare('UPDATE video_playlists SET title=? WHERE id=?').run(title, id)
  res.json({ ok: true, id, title })
})

router.delete('/videos/playlists/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const pl = db.prepare('SELECT * FROM video_playlists WHERE id=?').get(id)
  if (!pl) return res.status(404).json({ error: 'РџР»РµР№Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ' })
  if (pl.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM video_playlists WHERE id=?').run(id)
  res.json({ ok: true })
})

// РЎС‚СЂР°РЅРёС†Р° РїР»РµР№Р»РёСЃС‚Р°: СЃРІРѕРё РІРёРґРµРѕ РІСЃРµРіРґР°, С‡СѓР¶РёРµ вЂ” РїРѕ РґРѕСЃС‚СѓРїСѓ Рє РєР°Р¶РґРѕРјСѓ
router.get('/videos/playlists/:id', (req, res) => {
  const id = Number(req.params.id)
  const pl = db.prepare(`
    SELECT pl.*, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar
    FROM video_playlists pl JOIN users u ON u.id=pl.owner_id WHERE pl.id=?
  `).get(id)
  if (!pl) return res.status(404).json({ error: 'РџР»РµР№Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ' })
  const uid = req.user ? req.user.id : null
  const isMine = uid === pl.owner_id
  const isAdmin = req.user && req.user.is_admin
  const acc = (isMine || isAdmin) ? null : viewAccessSql(uid)
  const cond = acc ? `AND ${acc.sql}` : ''
  const params = (acc ? [uid, uid, id, ...acc.params] : [uid, uid, id])
  const rows = db.prepare(`
    SELECT ${VIDEO_VIEWER_SELECT.replace('v.*', 'v.*, u2.id AS vid_uid, u2.username AS vid_uusername, u2.display_name AS vid_udisplay, u2.avatar AS vid_uavatar, u2.is_admin AS vid_uisadmin, u2.is_foreign_agent AS vid_uis_foreign_agent')}
    FROM video_playlist_items pi
    JOIN library_videos v ON v.id=pi.video_id
    JOIN users u2 ON u2.id=v.owner_id
    WHERE pi.playlist_id=? ${cond}
    ORDER BY pi.added_at DESC, pi.rowid DESC
  `).all(...params)
  if (!isMine && !isAdmin && rows.length === 0) return res.status(403).json({ error: 'РџР»РµР№Р»РёСЃС‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ' })
  res.json({
    id: pl.id, title: pl.title, isMine,
    owner: { id: pl.owner_id, username: pl.uusername, displayName: pl.udisplay, avatar: pl.uavatar },
    videos: rows.map(r => ({ ...videoJson(r), author: { id: r.vid_uid, username: r.vid_uusername, displayName: r.vid_udisplay, avatar: r.vid_uavatar, isAdmin: !!r.vid_uisadmin, isForeignAgent: !!r.vid_uis_foreign_agent } }))
  })
})

// Р”РѕР±Р°РІРёС‚СЊ/СѓР±СЂР°С‚СЊ РІРёРґРµРѕ РІ РїР»РµР№Р»РёСЃС‚
router.post('/videos/:id/playlist', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT id, owner_id FROM library_videos WHERE id=?').get(id)
  if (!v || v.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const playlistId = Number.parseInt(req.body.playlistId, 10) || null
  if (!playlistId) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅ РїР»РµР№Р»РёСЃС‚' })
  const pl = db.prepare('SELECT id, owner_id FROM video_playlists WHERE id=?').get(playlistId)
  if (!pl || pl.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РїР»РµР№Р»РёСЃС‚Сѓ' })
  const on = req.body.on !== false
  if (on) db.prepare('INSERT OR IGNORE INTO video_playlist_items (playlist_id, video_id) VALUES (?, ?)').run(playlistId, id)
  else db.prepare('DELETE FROM video_playlist_items WHERE playlist_id=? AND video_id=?').run(playlistId, id)
  res.json({ ok: true, on })
})

router.get('/videos/:id', (req, res) => {
  const id = Number(req.params.id)
  const viewerId = req.user ? req.user.id : null
  const v = db.prepare(`
    SELECT ${VIDEO_VIEWER_SELECT.replace('v.*', 'v.*, u.id AS uid, u.username AS uusername, u.display_name AS udisplay, u.avatar AS uavatar, u.is_admin AS uisadmin, u.is_foreign_agent AS uis_foreign_agent')}
    FROM library_videos v JOIN users u ON u.id=v.owner_id
    WHERE v.id=?
  `).get(viewerId, viewerId, id)
  if (!v) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  const uid = req.user ? req.user.id : null
  const isMine = uid === v.owner_id
  const isAdmin = req.user && req.user.is_admin
  if (!v.published && !isMine && !isAdmin) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (!isMine && !isAdmin) {
    const acc = viewAccessSql(uid)
    const row = db.prepare(`SELECT v.id FROM library_videos v WHERE v.id=? AND ${acc.sql}`).get(id, ...acc.params)
    if (!row) return res.status(403).json({ error: 'Р’РёРґРµРѕ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РґСЂСѓР·СЊСЏРј РёР»Рё РїРѕ РїСЂСЏРјРѕР№ СЃСЃС‹Р»РєРµ' })
  }
  const comments = db.prepare(`
    ${videoCommentSelect}
    WHERE c.video_id=? ORDER BY c.created_at ASC, c.id ASC
  `).all(id).map(commentJson)
  // РџР»РµР№Р»РёСЃС‚С‹, РІ РєРѕС‚РѕСЂС‹Рµ РґРѕР±Р°РІР»РµРЅРѕ СЌС‚Рѕ РІРёРґРµРѕ (РІРёРґРЅС‹ РІР»Р°РґРµР»СЊС†Сѓ Рё Р°РґРјРёРЅСѓ)
  let playlists = []
  if (isMine || isAdmin) {
    playlists = db.prepare(`
      SELECT pl.id, pl.title FROM video_playlists pl
      JOIN video_playlist_items pi ON pi.playlist_id=pl.id
      WHERE pi.video_id=? ORDER BY pl.created_at DESC
    `).all(id)
  }
  res.json({
    ...videoJson(v),
    author: { id: v.uid, username: v.uusername, displayName: v.udisplay, avatar: v.uavatar, isAdmin: !!v.uisadmin, isForeignAgent: !!v.uis_foreign_agent },
    isMine,
    playlists: playlists.map(p => ({ id: p.id, title: p.title })),
    comments
  })
})

router.post('/videos/:id/comments', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT id, owner_id, access FROM library_videos WHERE id=?').get(id)
  if (!v) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (!canInteract(req, v)) return res.status(403).json({ error: 'Р’РёРґРµРѕ РІР°Рј РЅРµРґРѕСЃС‚СѓРїРЅРѕ' })
  const body = String(req.body.body || '').trim()
  if (!body) return res.status(400).json({ error: 'РџСѓСЃС‚РѕР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№' })
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null
  let parent = null
  if (parentId) {
    parent = db.prepare('SELECT * FROM video_comments WHERE id=? AND video_id=?').get(parentId, id)
    if (!parent) return res.status(400).json({ error: 'РќРµР»СЊР·СЏ РѕС‚РІРµС‚РёС‚СЊ РЅР° СЌС‚РѕС‚ РєРѕРјРјРµРЅС‚Р°СЂРёР№' })
  }
  const info = db.prepare('INSERT INTO video_comments (video_id, author_id, body, parent_id) VALUES (?, ?, ?, ?)').run(id, req.user.id, body, parentId)
  const c = db.prepare(`${videoCommentSelect} WHERE c.id=?`).get(info.lastInsertRowid)
  notifyMentions(req.app.get('io'), req.user.id, body, { targetType: 'video', targetId: id, commentId: c.id })
  notifyReply(req.app.get('io'), req.user.id, parent, { targetType: 'video', targetId: id })
  res.status(201).json(commentJson(c))
})

router.delete('/videos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const v = db.prepare('SELECT * FROM library_videos WHERE id=?').get(id)
  if (!v) return res.status(404).json({ error: 'Р’РёРґРµРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (v.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM library_videos WHERE id=?').run(id)
  res.json({ ok: true })
})

// ---------- РђСѓРґРёРѕР·Р°РїРёСЃРё ----------
router.get('/audios', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM library_audios WHERE owner_id=? ORDER BY created_at DESC, id DESC').all(req.user.id)
  res.json(rows.map(r => ({ id: r.id, title: r.title, artist: r.artist, url: r.url, cover: r.cover, createdAt: utcIso(r.created_at) })))
})

router.post('/audios', requireAuth, audioUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), validateFiles(['audio', 'image', 'video']), (req, res) => {
  const amute = checkContentMuted(req.user.id, 'audios')
  if (!amute.allowed) return res.status(403).json({ error: amute.error })
  const audioFile = (req.files?.file || [])[0]
  const coverFile = (req.files?.cover || [])[0]
  if (coverFile && coverFile.kind !== 'image') {
    return res.status(400).json({ error: 'РћР±Р»РѕР¶РєР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµРј' })
  }
  if (!audioFile) return res.status(400).json({ error: 'РџСЂРёРєСЂРµРїРёС‚Рµ Р°СѓРґРёРѕС„Р°Р№Р»' })
  // РљРѕРЅС‚РµР№РЅРµСЂ MP4 РјРѕР¶РµС‚ Р±С‹С‚СЊ Рё Р°СѓРґРёРѕ (m4a) вЂ” РїРµСЂРµСЃРѕС…СЂР°РЅСЏРµРј СЃ СЂР°СЃС€РёСЂРµРЅРёРµРј .m4a
  if (audioFile.kind === 'video') {
    try { renameAs(audioFile, 'audio', '.m4a') } catch { return res.status(400).json({ error: 'РќРµРїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Р№ С‚РёРї Р°СѓРґРёРѕС„Р°Р№Р»Р°' }) }
  } else if (audioFile.kind !== 'audio') {
    return res.status(400).json({ error: 'РќРµРїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Р№ С‚РёРї Р°СѓРґРёРѕС„Р°Р№Р»Р°' })
  }
  const title = String(req.body.title || (audioFile?.originalname || '')).trim()
  if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ Р°СѓРґРёРѕР·Р°РїРёСЃРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' })
  if (!audioFile) return res.status(400).json({ error: 'РџСЂРёРєСЂРµРїРёС‚Рµ Р°СѓРґРёРѕС„Р°Р№Р»' })
  const artist = String(req.body.artist || '').trim()
  let cover = null
  if (coverFile) {
    cover = `/uploads/${coverFile.filename}`
  } else {
    // РїРѕРїС‹С‚РєР° РёР·РІР»РµС‡СЊ РѕР±Р»РѕР¶РєСѓ РёР· ID3-С‚РµРіРѕРІ Р°СѓРґРёРѕС„Р°Р№Р»Р°
    try {
      const buf = fs.readFileSync(path.join(uploadsDir, audioFile.filename))
      const apic = extractID3Cover(buf)
      if (apic) cover = saveCover(apic.data, apic.mime)
    } catch { /* РЅРµС‚ С‚РµРіР° вЂ” РїСЂРѕРїСѓСЃРєР°РµРј */ }
  }
  const info = db.prepare('INSERT INTO library_audios (owner_id, title, artist, url, cover) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, title, artist, `/uploads/${audioFile.filename}`, cover)
  res.status(201).json({ id: info.lastInsertRowid, title, artist, url: `/uploads/${audioFile.filename}`, cover, createdAt: new Date().toISOString() })
})

router.delete('/audios/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const a = db.prepare('SELECT * FROM library_audios WHERE id=?').get(id)
  if (!a) return res.status(404).json({ error: 'РђСѓРґРёРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' })
  if (a.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM library_audios WHERE id=?').run(id)
  res.json({ ok: true })
})

// ---------- Р—Р°РјРµС‚РєРё ----------
router.get('/notes', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM user_notes WHERE owner_id=? ORDER BY created_at DESC, id DESC').all(req.user.id)
  res.json(rows.map(r => ({ id: r.id, text: r.text, createdAt: utcIso(r.created_at) })))
})

router.post('/notes', requireAuth, (req, res) => {
  const text = String(req.body.text || '').trim()
  if (!text) return res.status(400).json({ error: 'Р—Р°РјРµС‚РєР° РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚РѕР№' })
  const info = db.prepare('INSERT INTO user_notes (owner_id, text) VALUES (?, ?)').run(req.user.id, text)
  res.status(201).json({ id: info.lastInsertRowid, text, createdAt: new Date().toISOString() })
})

router.put('/notes/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const n = db.prepare('SELECT * FROM user_notes WHERE id=?').get(id)
  if (!n || n.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  const text = String(req.body.text || '').trim()
  if (!text) return res.status(400).json({ error: 'Р—Р°РјРµС‚РєР° РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚РѕР№' })
  db.prepare('UPDATE user_notes SET text=? WHERE id=?').run(text, id)
  res.json({ id, text, createdAt: utcIso(n.created_at) })
})

router.delete('/notes/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const n = db.prepare('SELECT * FROM user_notes WHERE id=?').get(id)
  if (!n || n.owner_id !== req.user.id) return res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' })
  db.prepare('DELETE FROM user_notes WHERE id=?').run(id)
  res.json({ ok: true })
})

export default router
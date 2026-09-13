import db, { utcIso } from './db.js'

// Собирает объект пользователя из строки с префиксными колонками
// (например 'author' — author_id, author_username, ...).
export function mapUser(r, prefix = '') {
  const p = prefix ? prefix + '_' : ''
  return {
    id: r[p + 'id'],
    username: r[p + 'username'],
    displayName: r[p + 'display_name'],
    bio: r[p + 'bio'],
    avatar: r[p + 'avatar'],
    cover: r[p + 'cover'],
    isAdmin: !!r[p + 'is_admin'],
    isModerator: !!r[p + 'is_moderator'],
    isTester: !!r[p + 'is_tester'],
    verified: !!r[p + 'verified'],
    memorialized: !!r[p + 'memorialized'],
    isForeignAgent: !!r[p + 'is_foreign_agent'],
    createdAt: utcIso(r[p + 'created_at'])
  }
}

const POST_SELECT = `
SELECT p.*,
       u.id AS author_id,
       u.username AS author_username,
       u.display_name AS author_display_name,
       u.avatar AS author_avatar,
       u.bio AS author_bio,
       u.cover AS author_cover,
       u.is_admin AS author_is_admin,
       u.is_moderator AS author_is_moderator,
       u.is_tester AS author_is_tester,
       u.verified AS author_verified,
       u.memorialized AS author_memorialized,
       u.is_foreign_agent AS author_is_foreign_agent,
       u.created_at AS author_created_at,
       c.id AS community_id,
       c.name AS community_name,
       c.slug AS community_slug,
       c.avatar AS community_avatar,
       rp.id AS repost_author_id,
       rp.username AS repost_author_username,
       rp.display_name AS repost_author_display_name,
       rp.avatar AS repost_author_avatar,
       rp.is_admin AS repost_author_is_admin,
       rp.is_moderator AS repost_author_is_moderator,
       rp.is_tester AS repost_author_is_tester,
       rp.verified AS repost_author_verified,
       rp.memorialized AS repost_author_memorialized,
       ca.id AS as_comm_id,
       ca.name AS as_comm_name,
       ca.slug AS as_comm_slug,
       ca.avatar AS as_comm_avatar
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN communities c ON c.id = p.community_id
LEFT JOIN communities ca ON ca.id = p.author_community_id
LEFT JOIN posts pr ON pr.id = p.repost_of_id
LEFT JOIN users rp ON rp.id = pr.author_id
`

const COUNTS = `
SELECT p.id AS pid,
       (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reaction_count,
       (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id) AS comment_count,
       (SELECT COUNT(*) FROM posts po WHERE po.repost_of_id = p.id) AS repost_count,
       (SELECT MAX(r.type) FROM reactions r WHERE r.post_id = p.id AND r.user_id = ?) AS my_reaction,
       (SELECT r.type FROM reactions r WHERE r.post_id = p.id GROUP BY r.type ORDER BY COUNT(*) DESC LIMIT 1) AS top_reaction
FROM posts p
WHERE p.id IN (?)
`

export function isPinned(pinnedUntil) {
  if (pinnedUntil == null) return true           // NULL = закреплено навсегда
  if (pinnedUntil === '') return false           // '' = не закреплено
  return new Date(utcIso(pinnedUntil)).getTime() > Date.now()
}

const PINNED_ORDER = "(CASE WHEN p.pinned_until IS NULL OR (p.pinned_until != '' AND p.pinned_until > datetime('now')) THEN 0 ELSE 1 END)"

// Закрепление внутри сообщества — используется ТОЛЬКО в ленте сообщества,
// в общую ленту не попадает.
const COMMUNITY_PINNED_ORDER = "(CASE WHEN p.community_pinned_until IS NULL OR (p.community_pinned_until != '' AND p.community_pinned_until > datetime('now')) THEN 0 ELSE 1 END)"

export function serializePosts(rows, currentUserId) {
  if (!rows.length) return []
  const ids = rows.map(r => r.id)
  const ph = ids.map(() => '?').join(',')
  const counts = db.prepare(COUNTS.replace('(?)', `(${ph})`)).all(currentUserId, ...ids)
  const countMap = new Map(counts.map(c => [c.pid, c]))

  const bookmarkedSet = new Set()
  if (currentUserId != null) {
    db.prepare(`SELECT target_id FROM bookmarks WHERE user_id=? AND target_type='post' AND target_id IN (${ph})`)
      .all(currentUserId, ...ids).forEach(r => bookmarkedSet.add(r.target_id))
  }

  // Опросы: подсчёт голосов и мой голос
  const pollPostIds = rows.filter(r => hasPoll(r.attachments)).map(r => r.id)
  const pollCounts = new Map()   // postId -> { option_index: count }
  const myPollVote = new Map()   // postId -> option_index
  if (pollPostIds.length) {
    const inn = pollPostIds.map(() => '?').join(',')
    db.prepare(`SELECT post_id, option_index, COUNT(*) c FROM poll_votes WHERE post_id IN (${inn}) GROUP BY post_id, option_index`)
      .all(...pollPostIds).forEach(r => {
        if (!pollCounts.has(r.post_id)) pollCounts.set(r.post_id, {})
        pollCounts.get(r.post_id)[r.option_index] = r.c
      })
    if (currentUserId != null) {
      db.prepare(`SELECT post_id, option_index FROM poll_votes WHERE user_id=? AND post_id IN (${inn})`)
        .all(currentUserId, ...pollPostIds).forEach(r => myPollVote.set(r.post_id, r.option_index))
    }
  }

  return rows.map(r => {
    const cm = countMap.get(r.id) || {}
    return {
      id: r.id,
      body: r.body,
      image: r.image,
      attachments: attachPollVotes(r.attachments, pollCounts.get(r.id), myPollVote.get(r.id)),
      createdAt: utcIso(r.created_at),
      editedAt: utcIso(r.edited_at),
      nsfw: !!r.nsfw,
      repostOfId: r.repost_of_id,
      parentId: r.parent_id,
      pinned: isPinned(r.pinned_until),
      pinnedUntil: r.pinned_until ? utcIso(r.pinned_until) : null,
      communityPinned: isPinned(r.community_pinned_until),
      communityPinnedUntil: r.community_pinned_until ? utcIso(r.community_pinned_until) : null,
      bookmarked: bookmarkedSet.has(r.id),
      views: r.views || 0,
      reactions: { count: cm.reaction_count || 0, top: cm.top_reaction || null, myReaction: cm.my_reaction || null },
      commentsCount: cm.comment_count || 0,
      repostsCount: cm.repost_count || 0,
      authorId: r.author_id,
      author: r.as_comm_id
        ? { id: r.as_comm_id, username: r.as_comm_slug, displayName: r.as_comm_name, avatar: r.as_comm_avatar, isCommunity: true }
        : mapUser(r, 'author'),
      community: r.community_id
        ? { id: r.community_id, name: r.community_name, slug: r.community_slug, avatar: r.community_avatar }
        : null,
      repostedFrom: r.repost_author_id ? mapUser(r, 'repost_author') : null
    }
  })
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

function hasPoll(raw) {
  return parseAttachments(raw).some(a => a.type === 'poll')
}

function attachPollVotes(raw, counts, myVote) {
  return parseAttachments(raw).map(a => {
    if (a.type !== 'poll') return a
    const opts = (a.options || []).map((name, i) => {
      const votes = counts ? counts[i] || 0 : 0
      return { name, votes }
    })
    const total = opts.reduce((s, o) => s + o.votes, 0)
    return { ...a, options: opts, total, myVote: myVote ?? null }
  })
}

export function getFeed(userId, { authorId, communityId, limit = 30, offset = 0, hideGroupPosts = false, hideNsfw = false } = {}) {
  const clauses = ['p.parent_id IS NULL']
  const params = []
  if (authorId) { clauses.push('p.author_id = ?'); params.push(authorId) }
  if (communityId) { clauses.push('p.community_id = ?'); params.push(communityId) }
  // Скрыть посты, опубликованные от лица сообщества/группы (настройка «мои записи с сообществ»)
  if (hideGroupPosts) clauses.push('p.author_community_id IS NULL')
  if (hideNsfw) clauses.push('p.nsfw = 0')
  const where = clauses.join(' AND ')
  params.push(limit, offset)
  const orderBy = communityId ? COMMUNITY_PINNED_ORDER : PINNED_ORDER
  const rows = db.prepare(`${POST_SELECT} WHERE ${where} ORDER BY ${orderBy}, p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(...params)
  return serializePosts(rows, userId)
}

export function countFeed({ authorId, communityId, hideGroupPosts = false, hideNsfw = false } = {}) {
  const clauses = ['p.parent_id IS NULL']
  const params = []
  if (authorId) { clauses.push('p.author_id = ?'); params.push(authorId) }
  if (communityId) { clauses.push('p.community_id = ?'); params.push(communityId) }
  if (hideGroupPosts) clauses.push('p.author_community_id IS NULL')
  if (hideNsfw) clauses.push('p.nsfw = 0')
  const where = clauses.join(' AND ')
  return db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`).get(...params).n
}

export function getFeedForUser(userId, meId, { limit = 60, offset = 0, hideNsfw = false } = {}) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  const rows = db.prepare(`
    ${POST_SELECT}
    WHERE p.parent_id IS NULL
      ${nsfw}
      AND (
        p.author_id = ?
        OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
        OR p.community_id IN (SELECT community_id FROM community_members WHERE user_id = ?)
      )
    ORDER BY ${PINNED_ORDER}, p.created_at DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).all(userId, meId, meId, limit, offset)
  return serializePosts(rows, meId)
}

export function countFeedForUser(userId, meId, hideNsfw = false) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  return db.prepare(`
    SELECT COUNT(*) AS n FROM posts p
    WHERE p.parent_id IS NULL
      ${nsfw}
      AND (
        p.author_id = ?
        OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
        OR p.community_id IN (SELECT community_id FROM community_members WHERE user_id = ?)
      )
  `).get(userId, meId, meId).n
}

export function getTrending(meId, { limit = 30, offset = 0, hideNsfw = false } = {}) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  const rows = db.prepare(`
    ${POST_SELECT}
    WHERE p.parent_id IS NULL
      ${nsfw}
    ORDER BY (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) DESC, p.created_at DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset)
  return serializePosts(rows, meId)
}

export function countTrending(hideNsfw = false) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  return db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE p.parent_id IS NULL ${nsfw}`).get().n
}

export function getPostById(id, meId) {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(id)
  return row ? serializePosts([row], meId)[0] : null
}

export function serializeComments(rows) {
  return rows.map(r => ({
    id: r.id,
    body: r.body,
    createdAt: utcIso(r.created_at),
    parentId: r.parent_id || null,
    replyTo: r.reply_id
      ? { id: r.reply_id, username: r.reply_username, displayName: r.reply_display_name }
      : null,
    author: mapUser(r, 'author')
  }))
}

const COMMENT_SELECT = `
  SELECT m.id, m.body, m.created_at, m.parent_id,
         u.id AS author_id, u.username AS author_username, u.display_name AS author_display_name,
         u.avatar AS author_avatar, u.bio AS author_bio, u.cover AS author_cover, u.is_admin AS author_is_admin,
         u.is_moderator AS author_is_moderator, u.is_tester AS author_is_tester, u.verified AS author_verified,
         u.memorialized AS author_memorialized, u.is_foreign_agent AS author_is_foreign_agent, u.created_at AS author_created_at,
         pu.id AS reply_id, pu.username AS reply_username, pu.display_name AS reply_display_name
  FROM comments m
  JOIN users u ON u.id = m.author_id
  LEFT JOIN comments pc ON pc.id = m.parent_id
  LEFT JOIN users pu ON pu.id = pc.author_id
`

export function getCommentById(commentId) {
  const row = db.prepare(`${COMMENT_SELECT} WHERE m.id = ?`).get(commentId)
  return row ? serializeComments([row])[0] : null
}

export function getComments(postId) {
  const rows = db.prepare(`
    ${COMMENT_SELECT}
    WHERE m.post_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `).all(postId)
  return serializeComments(rows)
}

// Закладки-посты: как лента, но из сохранённых постов (закреплённые сверху)
export function getBookmarkedPosts(userId, { limit = 30, offset = 0, hideNsfw = false } = {}) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  const rows = db.prepare(`
    ${POST_SELECT}
    JOIN bookmarks bm ON bm.target_id = p.id AND bm.target_type = 'post' AND bm.user_id = ?
    WHERE p.parent_id IS NULL ${nsfw}
    ORDER BY ${PINNED_ORDER}, bm.id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset)
  return serializePosts(rows, userId)
}

export function countBookmarkedPosts(userId, hideNsfw = false) {
  const nsfw = hideNsfw ? 'AND p.nsfw = 0' : ''
  return db.prepare(`SELECT COUNT(*) AS n FROM bookmarks bm JOIN posts p ON p.id=bm.target_id WHERE bm.user_id=? AND bm.target_type='post' ${nsfw}`).get(userId).n
}

export function getUnreadMessagesCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM messages m
    WHERE m.read_at IS NULL AND m.sender_id != ?
      AND m.conversation_id IN (
        SELECT conversation_id FROM conversation_participants WHERE user_id = ?
      )
  `).get(userId, userId).n || 0
}

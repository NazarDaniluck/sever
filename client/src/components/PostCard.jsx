import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { postsApi, bookmarksApi, mediaUrl } from '../api.js'
import { trackPostView, onPostViews } from '../viewTracker.js'
import { Avatar } from './Navbar.jsx'
import AdminBadge from './AdminBadge.jsx'
import ShareModal from './ShareModal.jsx'
import CommentSection from './CommentSection.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { timeAgo } from '../utils.js'
import BodyText from './BodyText.jsx'
import ForwardEmbed from './ForwardEmbed.jsx'
import ReportButton from './ReportButton.jsx'
import VideoModal from './VideoModal.jsx'

const HOUR = 60 * 60 * 1000

export default function PostCard({ post, onUpdated, onDelete, canDelete = false, expandComments = false, onComment, trackView = false, canPin, pinAction, videoModal = true }) {
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const cardRef = useRef(null)
  const [showComments, setShowComments] = useState(expandComments)
  const [comments, setComments] = useState([])
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.body || '')
  const [likers, setLikers] = useState([])
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked)
  const [views, setViews] = useState(post.views || 0)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinErr, setPinErr] = useState('')
  const [videoOpen, setVideoOpen] = useState(null)
  const nsfwHidden = !!post.nsfw && !revealed

  const isAuthor = me?.id === post.author?.id
  const canEdit = isAuthor && Date.now() - new Date(post.createdAt).getTime() <= 24 * HOUR
  const canPinPost = canPin !== undefined ? canPin : (isAuthor || me?.isAdmin)

  // В сообществе закрепление отдельное (communityPinned*), в общей ленте — глобальное (pinned*).
  // Бейдж показываем, если есть хоть одно закрепление.
  const isCommunityPost = !!post.community
  const pinned = !!post.pinned || !!post.communityPinned
  const pinnedUntil = (isCommunityPost ? post.communityPinnedUntil : post.pinnedUntil) || post.pinnedUntil

  const defaultPinValue = () => {
    const d = new Date(Date.now() + 24 * HOUR)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [pinUntil, setPinUntil] = useState(defaultPinValue)

  // Синхронизация счётчика, когда родитель присылает свежее значение
  useEffect(() => { setViews(post.views || 0) }, [post.views])

  // Просмотр засчитывается, когда пост появился в зоне видимости при листании ленты
  useEffect(() => {
    if (!trackView || typeof IntersectionObserver !== 'function') return
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          obs.unobserve(e.target)
          trackPostView(post.id)
        }
      }
    }, { rootMargin: '200px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [post.id, trackView])

  // Обновление счётчиков из пачечного ответа трекера
  useEffect(() => {
    return onPostViews((updates) => {
      if (updates[post.id] != null) setViews(updates[post.id])
    })
  }, [post.id])

  useEffect(() => {
    if (!showComments) return
    let active = true
    postsApi.get(post.id).then(d => { if (active) setComments(d.comments) }).catch(() => {})
    return () => { active = false }
  }, [post.id, showComments])

  useEffect(() => {
    if (!(post.reactions?.count > 0)) return
    let active = true
    postsApi.likes(post.id).then(d => { if (active) setLikers(d.users || []) }).catch(() => {})
    return () => { active = false }
  }, [post.id, post.reactions?.count])

  const like = async () => {
    if (!me) { navigate('/login'); return }
    setBusy(true)
    const type = post.reactions?.myReaction === 'like' ? null : 'like'
    const d = await postsApi.react(post.id, type).catch(() => null)
    if (d && onUpdated) onUpdated({ ...d, id: post.id })
    else if (onUpdated) onUpdated({ id: post.id })
    setBusy(false)
  }

  const submitComment = async (body, parentId) => {
    try {
      const c = await postsApi.comment(post.id, body, parentId)
      if (c) {
        setComments(list => [...list, c])
        if (onComment) onComment(c)
      }
    } catch { /* ошибку выводят выше */ }
  }

  const toggleBookmark = async (e) => {
    e.preventDefault()
    if (!me) { navigate('/login'); return }
    if (busy) return
    setBusy(true)
    const next = !bookmarked
    const d = await bookmarksApi.toggle('post', post.id, next).catch(() => null)
    if (d) {
      setBookmarked(!!d.bookmarked)
      if (onUpdated) onUpdated({ ...post, id: post.id, bookmarked: !!d.bookmarked })
    }
    setBusy(false)
  }

  const repost = async (e) => {
    e.preventDefault()
    if (!me) { navigate('/login'); return }
    setSharing(true)
  }

  const saveEdit = async () => {
    if (!editText.trim() || busy) return
    setBusy(true)
    try {
      const updated = await postsApi.edit(post.id, editText.trim())
      if (onUpdated) onUpdated({ ...updated, id: post.id })
      setEditing(false)
    } catch { /* ошибку выводят выше */ } finally { setBusy(false) }
  }

  const applyPin = async (until) => {
    setPinErr('')
    try {
      const updated = pinAction
        ? await pinAction(until)
        : await postsApi.pin(post.id, until)
      setPinOpen(false)
      if (onUpdated) onUpdated({ ...updated, id: post.id })
    } catch (ex) { setPinErr(ex.message) }
  }

  const reactionCount = post.reactions?.count || 0

  const vote = async (i) => {
    if (!me) { navigate('/login'); return }
    if (busy) return
    const poll = (post.attachments || []).find(a => a.type === 'poll')
    if (!poll || poll.myVote != null) return
    setBusy(true)
    const d = await postsApi.pollVote(post.id, i).catch(() => null)
    if (d && onUpdated) onUpdated({ ...d, id: post.id })
    setBusy(false)
  }

  const cancelVote = async () => {
    if (!me) { navigate('/login'); return }
    if (busy) return
    setBusy(true)
    const d = await postsApi.pollVote(post.id, null).catch(() => null)
    if (d && onUpdated) onUpdated({ ...d, id: post.id })
    setBusy(false)
  }

  const renderAttach = (a, idx) => {
    switch (a.type) {
      case 'video':
        if (a.videoId) {
          if (videoModal) {
            return (
              <button
                type="button"
                className="post-video-link"
                key={a.url || a.videoId}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setVideoOpen({ url: a.url, youtube: a.youtube, title: a.name }) }}
              >
                <span className="post-video-thumb">▶</span>
                <span className="post-video-info">
                  <strong>{a.name || 'Видеозапись'}</strong>
                  <span className="muted small">Смотреть →</span>
                </span>
              </button>
            )
          }
          return (
            <Link to={`/video/${a.videoId}`} className="post-video-link" key={a.url || a.videoId}>
              <span className="post-video-thumb">▶</span>
              <span className="post-video-info">
                <strong>{a.name || 'Видеозапись'}</strong>
                <span className="muted small">Открыть страницу видео →</span>
              </span>
            </Link>
          )
        }
        return <video src={mediaUrl(a.url)} controls className="post-image" key={a.url} />
      case 'audio':
        return (
          <div className="post-audio-card" key={a.url}>
            {a.cover
              ? <img className="post-audio-cover" src={mediaUrl(a.cover)} alt="" />
              : <span className="audio-icon">🎵</span>}
            <div className="audio-info">
              <strong>{a.name || 'Аудиозапись'}</strong>
              <audio src={mediaUrl(a.url)} controls className="audio-body" />
            </div>
          </div>
        )
      case 'document':
        return (
          <a href={a.url} target="_blank" rel="noreferrer" className="post-doc" key={idx}>
            <span className="doc-icon">📄</span>
            <span className="doc-name">{a.name || 'Документ'}</span>
            <span className="doc-open">Открыть →</span>
          </a>
        )
      case 'note':
        return <div className="post-note" key={idx}>{a.text}</div>
      case 'forward':
        return <ForwardEmbed f={a} key={idx} />
      case 'poll': {
        const total = a.total || 0
        return (
          <div className="post-poll" key={idx}>
            <div className="poll-question">{a.question}</div>
            {(a.options || []).map((o, i) => {
              const pct = total ? Math.round((o.votes / total) * 100) : 0
              const mine = a.myVote === i
              const voted = a.myVote != null
              return (
                <button key={i} className={`poll-option ${mine ? 'mine' : ''}`} disabled={voted} onClick={() => vote(i)}>
                  <span className="poll-bar" style={{ width: `${total ? pct : 0}%` }} />
                  <span className="poll-name">{o.name}</span>
                  <span className="poll-pct">{total ? `${pct}%` : ''}</span>
                </button>
              )
            })}
            <div className="poll-footer">
              {a.myVote != null
                ? <><span>✓ Вы проголосовали</span> <button type="button" className="poll-cancel" onClick={cancelVote}>Отменить голос</button></>
                : 'Проголосуйте'} · голосов: {total}
            </div>
          </div>
        )
      }
      case 'photo':
      default:
        return a.photoId ? (
          <Link to={`/photo/${a.photoId}`} className="post-image-link" key={idx}>
            <img src={a.url} className="post-image" alt="" />
          </Link>
        ) : <img src={a.url} className="post-image" alt="" key={idx} />
    }
  }

  const attachments = post.attachments || []

  return (
    <article className="card post" ref={cardRef}>
      <div className="post-header">
        <Link to={post.author.isCommunity ? `/c/${post.author.id}` : `/u/${post.author.username}`}>
          <Avatar user={post.author} size={44} />
        </Link>
        <div className="post-meta">
          <Link to={post.author.isCommunity ? `/c/${post.author.id}` : `/u/${post.author.username}`} className="author-name">
            {post.author.displayName || post.author.username}
          </Link>
          <AdminBadge user={post.author} />
          {post.community && (
            <Link to={`/c/${post.community.id}`} className="community-tag">↦ {post.community.name}</Link>
          )}
          <div className="post-time">
            <Link to={`/post/${post.id}`}>{timeAgo(post.createdAt)}</Link>
            {post.editedAt && <span className="muted" title={`Изменено ${timeAgo(post.editedAt)}`}> · изменено</span>}
            {pinned && <span className="pinned-badge">📌 Закреплено</span>}
          </div>
        </div>
        {canEdit && (
          <button className="icon-btn" title="Изменить" onClick={() => setEditing(!editing)}>✎</button>
        )}
        {canPinPost && (
          <button className={`icon-btn ${pinned ? 'pinned-on' : ''}`} title={pinned ? 'Открепить / изменить время' : 'Закрепить пост на своё время'} onClick={() => { setPinErr(''); setPinOpen(v => !v) }}>📌</button>
        )}
        {canDelete && onDelete && (
          <button className="icon-btn danger" title="Удалить" onClick={() => onDelete(post.id)}>🗑</button>
        )}
      </div>

      {canPinPost && pinOpen && (
        <div className="post-pin">
          {pinned && <p className="muted small">Пост закреплён до {pinnedUntil ? new Date(pinnedUntil).toLocaleString('ru-RU') : 'бессрочно'}.</p>}
          <div className="row-custom">
            <input className="input" type="datetime-local" value={pinUntil} onChange={e => setPinUntil(e.target.value)} />
            <button className="btn primary small-btn" onClick={() => applyPin(pinUntil)}>Закрепить до</button>
            <button className="btn ghost small-btn" onClick={() => applyPin(null)} title="Без срока окончания">Навсегда</button>
            {pinned && <button className="btn ghost small-btn" onClick={() => applyPin('')}>Открепить</button>}
          </div>
          {pinErr && <div className="error-text">{pinErr}</div>}
        </div>
      )}

      {post.repostedFrom && (
        <div className="repost-note">
          <Link to={`/u/${post.repostedFrom.username}`}>↩ {post.repostedFrom.displayName || post.repostedFrom.username}</Link>
        </div>
      )}

      {post.nsfw && (
        <div className="nsfw-badge" title="Запись помечена как 18+">
          <span className="nsfw-dot">🔞</span> 18+
        </div>
      )}

      {editing ? (
        <div className="post-edit">
          <textarea className="textarea" rows={3} value={editText} autoFocus
            onChange={e => setEditText(e.target.value)} />
          <div className="row-custom">
            <button className="btn primary small-btn" disabled={!editText.trim() || busy} onClick={saveEdit}>Сохранить</button>
            <button className="btn ghost small-btn" disabled={busy} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <div className={`nsfw-box ${nsfwHidden ? 'nsfw-hidden' : ''}`}>
          <div className="nsfw-blur">
            <div className="post-body"><BodyText text={post.body} /></div>
            {attachments.length
              ? <div className="post-attachments">{attachments.map(renderAttach)}</div>
              : post.image && <img src={post.image} className="post-image" alt="" />}
          </div>
          {nsfwHidden && (
            <button type="button" className="nsfw-veil" onClick={() => setRevealed(true)}>
              <span className="nsfw-veil-title">🔞 Содержимое 18+</span>
              <span className="nsfw-veil-hint">Нажмите, чтобы показать</span>
            </button>
          )}
        </div>
      )}

      <div className="post-actions">
        <div className="reaction-wrap">
          <button
            className={`icon-btn react ${post.reactions?.myReaction ? 'active' : ''}`}
            disabled={busy}
            onClick={like}
            title="Нравится"
          >
            <span className="react-emoji">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          </button>
          <span className="count">{reactionCount}</span>
          {reactionCount > 0 && likers.length > 0 && (
            <div className="likers-popover">
              {likers.slice(0, 5).map(u => (
                <Link key={u.id} to={`/u/${u.username}`} title={u.displayName || u.username}>
                  <Avatar user={u} size={20} />
                </Link>
              ))}
              {reactionCount > 5 && <span className="likers-more" title={`Ещё ${reactionCount - 5}`}>+{reactionCount - 5}</span>}
            </div>
          )}
        </div>
        <button
          className={`icon-btn bookmark ${bookmarked ? 'active' : ''}`}
          disabled={busy}
          onClick={toggleBookmark}
          title={bookmarked ? 'Убрать из закладок' : 'В закладки'}
        >
          <span className="bookmark-star">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          </span>
        </button>
        <Link to={`/post/${post.id}`} className="icon-btn">Комментировать<span className="count">({post.commentsCount})</span></Link>
        <button className="icon-btn" onClick={repost} title="Поделиться">Поделиться<span className="count">({post.repostsCount})</span></button>
        <ReportButton targetType="post" targetId={post.id} text />
        {views > 0 && <span className="icon-btn post-views" title="Просмотры">👁 <span className="count">{views}</span></span>}
      </div>

      {sharing && (
        <ShareModal post={post} currentUserId={me.id}
          onClose={() => setSharing(false)}
          onShared={() => { setSharing(false); if (onUpdated) onUpdated({ id: post.id }) }} />
      )}

      {videoOpen && (
        <VideoModal url={videoOpen.url} youtube={videoOpen.youtube} title={videoOpen.title} onClose={() => setVideoOpen(null)} />
      )}

      {showComments && (
        <CommentSection comments={comments} me={me} busy={busy} onSubmit={submitComment} />
      )}
    </article>
  )
}

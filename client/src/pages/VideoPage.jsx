import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { libraryApi, bookmarksApi, usersApi, mediaUrl } from '../api.js'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import ReportButton from '../components/ReportButton.jsx'
import CommentSection from '../components/CommentSection.jsx'
import PlaylistButton from '../components/PlaylistButton.jsx'
import Sidebar from '../components/Sidebar.jsx'
import DescriptionText from '../components/DescriptionText.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { timeAgo } from '../utils.js'

function nf(n) { return (n || 0).toLocaleString('ru-RU') }

export default function VideoPage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const [video, setVideo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const viewedRef = useRef(false)
  const [sub, setSub] = useState(null)
  const vidRef = useRef(null)
  const vidMetaRef = useRef(null)
  const { play } = usePlayer()
  const playRef = useRef(play)
  playRef.current = play

  const load = async () => {
    try {
      const v = await libraryApi.video(id)
      setVideo(v)
      vidMetaRef.current = v && { url: v.url, title: v.title, poster: v.preview || null }
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { setErr(''); setVideo(null); viewedRef.current = false; load() }, [id])

  useEffect(() => {
    if (!video?.author) return
    let cancelled = false
    usersApi.get(video.author.username)
      .then(d => { if (!cancelled) setSub({ count: d.counts.followers, followed: d.followed }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [video?.author?.username])

  useEffect(() => () => {
    const el = vidRef.current
    if (el && !el.paused && vidMetaRef.current && vidMetaRef.current.url) {
      playRef.current({
        type: 'video',
        url: vidMetaRef.current.url,
        title: vidMetaRef.current.title,
        poster: vidMetaRef.current.poster || null,
        startTime: el.currentTime
      })
    }
  }, [])

  const toggleFollow = async () => {
    if (!sub || !video?.author) return
    try {
      if (sub.followed) await usersApi.unfollow(video.author.id)
      else await usersApi.follow(video.author.id)
      const d = await usersApi.get(video.author.username)
      setSub({ count: d.counts.followers, followed: d.followed })
    } catch (e) { setErr(e.message) }
  }

  const onPlay = () => {
    if (viewedRef.current) return
    viewedRef.current = true
    libraryApi.viewVideo(id).then(r => setVideo(v => v && { ...v, views: r.views })).catch(() => {})
  }

  const like = async () => {
    if (!video) return
    const r = await libraryApi.likeVideo(video.id).catch(() => null)
    if (r) setVideo(v => v && { ...v, likes: r.likes, liked: r.liked })
  }

  const bookmark = async () => {
    if (!video) return
    const r = await bookmarksApi.toggle('video', video.id, !video.bookmarked).catch(() => null)
    if (r) setVideo(v => v && { ...v, bookmarked: r.bookmarked })
  }

  const submitComment = async (body, parentId) => {
    setBusy(true)
    try {
      const c = await libraryApi.commentVideo(video.id, body, parentId)
      setVideo(v => v && { ...v, comments: [...(v.comments || []), c] })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err) return <div className="layout"><Sidebar /><div className="column main-col"><div className="error-text">{err}</div></div></div>
  if (!video) return <div className="layout"><Sidebar /><div className="column main-col"><div className="card muted">Загрузка…</div></div></div>

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">
          <Link to="/videos/feed">← Лента видео</Link>
        </div>

        <div className="video-page">
          <div className="video-page-main">
            <div className="video-player">
              {video.url ? (
                <video ref={vidRef} src={mediaUrl(video.url)} controls onPlay={onPlay} preload="metadata" poster={video.preview ? mediaUrl(video.preview) : undefined} />
              ) : video.youtube ? (
                <iframe
                  src={`https://www.youtube.com/embed/${video.youtube}`}
                  title={video.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onClick={onPlay}
                />
              ) : null}
            </div>

            <h3 className="video-page-title">
              {video.title}
              {video.pinned && <span className="pinned-badge">📌 Закреплено</span>}
            </h3>
            <div className="video-page-stats muted small">
              {nf(video.views)} просмотров · загружено {timeAgo(video.createdAt)}
            </div>

            {video.description && <div className="video-page-desc"><DescriptionText text={video.description} /></div>}

            {video.isMine && (
              <div className="video-page-playlists" style={{ marginTop: 8 }}>
                <PlaylistButton videoId={video.id} />
              </div>
            )}

            <div className="video-page-author row">
              <Link to={`/u/${video.author.username}`}><Avatar user={video.author} size={40} /></Link>
              <div>
                <Link to={`/u/${video.author.username}`} className="author-name">{video.author.displayName || video.author.username}</Link>
                <AdminBadge user={video.author} />
                <div className="muted small">{sub ? sub.count : '…'} подписчиков</div>
                {me && me.id !== video.author.id && sub && (
                  <button className="btn ghost small-btn" onClick={toggleFollow}>{sub.followed ? 'Отписаться' : 'Подписаться'}</button>
                )}
              </div>
              <ReportButton targetType="video" targetId={video.id} />
              <div className="reaction-wrap ml-auto">
                <button className={`icon-btn react${video.liked ? ' active' : ''}`} onClick={like} title="Нравится">
                  <span className="react-emoji">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </span>
                </button>
                <span className="count">{nf(video.likes)}</span>
                <button
                  className={`icon-btn bookmark${video.bookmarked ? ' active' : ''}`}
                  onClick={bookmark}
                  title={video.bookmarked ? 'Убрать из закладок' : 'В закладки'}
                >
                  <span className="bookmark-star">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            <CommentSection comments={video.comments || []} me={me} busy={busy} onSubmit={submitComment} />
          </div>
        </div>
      </div>
    </div>
  )
}
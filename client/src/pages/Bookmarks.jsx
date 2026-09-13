import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { libraryApi, bookmarksApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import PostCard from '../components/PostCard.jsx'
import VideoThumb from '../components/VideoThumb.jsx'
import { timeAgo, initials } from '../utils.js'

function nf(n) { return (n || 0).toLocaleString('ru-RU') }

export default function Bookmarks() {
  const nav = useNavigate()
  const [tab, setTab] = useState('posts')
  const [posts, setPosts] = useState([])
  const [videos, setVideos] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setErr('')
    try {
      if (tab === 'posts') {
        const d = await bookmarksApi.posts()
        setPosts(d.posts || [])
      } else {
        setVideos(await libraryApi.bookmarkedVideos())
      }
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab])

  const onPostUpdated = (p) => {
    if (p.bookmarked === false) setPosts(list => list.filter(x => x.id !== p.id))
    else setPosts(list => list.map(x => x.id === p.id ? { ...x, ...p } : x))
  }

  const toggleVideoBookmark = async (v) => {
    try {
      const r = await bookmarksApi.toggle('video', v.id, false)
      if (r.bookmarked === false) setVideos(list => list.filter(x => x.id !== v.id))
    } catch (e) { setErr(e.message) }
  }

  const openVideo = (v) => nav(`/video/${v.id}`)

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои закладки</div>
        {err && <div className="error-text">{err}</div>}
        <div className="feed-sort row" role="tablist">
          <button
            className={`btn ghost small-btn${tab === 'posts' ? ' active' : ''}`}
            onClick={() => setTab('posts')}
          >Посты</button>
          <button
            className={`btn ghost small-btn${tab === 'videos' ? ' active' : ''}`}
            onClick={() => setTab('videos')}
          >Видео</button>
        </div>

        {loading ? (
          <div className="card muted">Загрузка…</div>
        ) : tab === 'posts' ? (
          posts.length === 0 ? (
            <div className="card muted">В закладках пока нет постов. Нажимайте ☆ у постов, чтобы сохранить их сюда.</div>
          ) : (
            posts.map(p => (
              <PostCard key={p.id} post={p} onUpdated={onPostUpdated} trackView />
            ))
          )
        ) : videos.length === 0 ? (
          <div className="card muted">В закладках пока нет видео. Нажимайте ☆ у видео, чтобы сохранить их сюда.</div>
        ) : (
          <div className="video-feed-list">
            {videos.map(v => (
              <div className="feed-card clickable" key={v.id} onClick={() => openVideo(v)}>
                <div className="feed-thumb-wrap">
                  <VideoThumb v={v} />
                  <span className="feed-play">▶</span>
                </div>
                <div className="feed-body">
                  <strong className="feed-title">{v.title}</strong>
                  {v.pinned && <span className="pinned-badge">📌 Закреплено</span>}
                  <div className="muted small">
                    {nf(v.views)} просмотров · загружено {timeAgo(v.createdAt)}
                  </div>
                  <div className="feed-author row">
                    {v.author.avatar ? (
                      <img className="avatar-small" src={v.author.avatar} alt="" />
                    ) : (
                      <span className="avatar-small avatar-fallback">{initials(v.author.displayName || v.author.username)}</span>
                    )}
                    <span className="muted">{v.author.displayName || v.author.username}</span>
                  </div>
                  <div className="row-custom">
                    <button className="btn ghost small-btn active" onClick={e => { e.stopPropagation(); toggleVideoBookmark(v) }}>
                      ★ В закладках
                    </button>
                    <Link to={`/u/${v.author.username}`} className="muted small" onClick={e => e.stopPropagation()}>
                      Автор
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

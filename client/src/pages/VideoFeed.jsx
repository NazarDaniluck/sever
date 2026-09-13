import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { libraryApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import VideoThumb from '../components/VideoThumb.jsx'
import DescriptionText from '../components/DescriptionText.jsx'
import { timeAgo, initials } from '../utils.js'

function nf(n) {
  return n.toLocaleString('ru-RU')
}

export default function VideoFeed() {
  const nav = useNavigate()
  const [sort, setSort] = useState('date')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ videos: [] })
  const [err, setErr] = useState('')

  const SORTS = [
    { id: 'date', label: 'Дата' },
    { id: 'views', label: 'Просмотры' },
    { id: 'likes', label: 'Лайки' },
    { id: 'trending', label: 'Набирающие' },
  ]

  const load = async () => {
    try { setData(await libraryApi.feed(sort, search)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [sort, search])

  const openVideo = (v) => nav(`/video/${v.id}`)

  const submitSearch = (e) => {
    e.preventDefault()
    setSearch(q.trim())
  }

  const videos = data.videos || []

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Лента видео</div>
        {err && <div className="error-text">{err}</div>}

        <form className="feed-search" onSubmit={submitSearch}>
          <input
            className="input search"
            placeholder="Поиск по названию, описанию или автору…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="btn ghost small-btn" type="submit">Найти</button>
          {search && <button className="btn ghost small-btn" type="button" onClick={() => { setQ(''); setSearch('') }}>✕</button>}
        </form>

        <div className="feed-sort row" role="tablist">
          {SORTS.map(s => (
            <button
              key={s.id}
              className={`btn ghost small-btn${sort === s.id ? ' active' : ''}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {search && (
          <div className="muted small" style={{ marginBottom: 8 }}>
            Результаты по запросу «{search}»: {videos.length}
          </div>
        )}

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
                {v.description && <div className="muted small"><DescriptionText text={v.description} /></div>}
                <div className="feed-author row">
                  {v.author.avatar ? (
                    <img className="avatar-small" src={v.author.avatar} alt="" />
                  ) : (
                    <span className="avatar-small avatar-fallback">{initials(v.author.displayName || v.author.username)}</span>
                  )}
                  <span className="muted">
                    {v.author.displayName || v.author.username}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {videos.length === 0 && !err && <div className="card muted">{search ? 'По запросу ничего не найдено.' : 'Опубликованных видео пока нет.'}</div>}
      </div>
    </div>
  )
}

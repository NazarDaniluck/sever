import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { libraryApi } from '../api.js'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import CommentSection from '../components/CommentSection.jsx'
import Sidebar from '../components/Sidebar.jsx'
import ReportButton from '../components/ReportButton.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { timeAgo } from '../utils.js'

function nf(n) { return (n || 0).toLocaleString('ru-RU') }

export default function PhotoPage() {
  const { photoId } = useParams()
  const nav = useNavigate()
  const { user: me } = useAuth()
  const [photo, setPhoto] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setPhoto(await libraryApi.photo(photoId)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { setErr(''); setPhoto(null); load() }, [photoId])

  const like = async () => {
    if (!photo) return
    const r = await libraryApi.likePhoto(photo.id).catch(() => null)
    if (r) setPhoto(p => p && { ...p, likes: r.likes, liked: r.liked })
  }

  const submitComment = async (body, parentId) => {
    setBusy(true)
    try {
      const c = await libraryApi.commentPhoto(photo.id, body, parentId)
      setPhoto(p => p && { ...p, comments: [...(p.comments || []), c] })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err) return <div className="layout"><Sidebar /><div className="column main-col"><div className="error-text">{err}</div></div></div>
  if (!photo) return <div className="layout"><Sidebar /><div className="column main-col"><div className="card muted">Загрузка…</div></div></div>

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">
          <button className="btn ghost small-btn" onClick={() => nav(-1)}>← Назад</button>
          <ReportButton targetType="photo" targetId={photo.id} />
        </div>

        <div className="photo-page">
          <div className="photo-page-image">
            <img src={photo.url} alt="" />
          </div>
          <div className="photo-page-side">
            <div className="photo-page-author row">
              <Link to={`/u/${photo.owner.username}`}><Avatar user={photo.owner} size={40} /></Link>
              <div>
                <Link to={`/u/${photo.owner.username}`} className="author-name">{photo.owner.displayName || photo.owner.username}</Link>
                <AdminBadge user={photo.owner} />
              </div>
              {photo.album && (
                <Link to={`/photos/${photo.album.id}`} className="muted small album-link">↦ {photo.album.title}</Link>
              )}
            </div>

            <div className="photo-page-stats muted small">
              <div className="reaction-wrap">
                <button className={`icon-btn react${photo.liked ? ' active' : ''}`} onClick={like} title="Нравится">
                  <span className="react-emoji">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </span>
                </button>
                <span className="count">{nf(photo.likes)}</span>
              </div>
              <span>· {nf(photo.comments?.length)} комментариев · {timeAgo(photo.createdAt)}</span>
            </div>

            <CommentSection comments={photo.comments || []} me={me} busy={busy} onSubmit={submitComment} />
          </div>
        </div>
      </div>
    </div>
  )
}
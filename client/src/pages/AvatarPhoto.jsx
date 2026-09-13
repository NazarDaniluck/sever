import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usersApi } from '../api.js'
import CommentSection from '../components/CommentSection.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function AvatarPhoto() {
  const { username } = useParams()
  const nav = useNavigate()
  const { user: me } = useAuth()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setData(await usersApi.avatar(username)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { setErr(''); setData(null); load() }, [username])

  const submitComment = async (body) => {
    setBusy(true)
    try {
      const c = await usersApi.avatarComment(username, body)
      setData(d => d && { ...d, comments: [...(d.comments || []), c] })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err) return <div className="layout"><Sidebar /><div className="column main-col"><div className="error-text">{err}</div></div></div>
  if (!data) return <div className="layout"><Sidebar /><div className="column main-col"><div className="card muted">Загрузка…</div></div></div>

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">
          <button className="btn ghost small-btn" onClick={() => nav(-1)}>← Назад</button>
        </div>

        <div className="photo-page">
          <div className="photo-page-image avatar-photo-page">
            {data.url ? (
              <img src={data.url} alt="" />
            ) : (
              <div className="avatar-photo-empty">У пользователя нет аватарки</div>
            )}
          </div>
          <div className="photo-page-side">
            <div className="photo-page-author row">
              <Link to={`/u/${data.username}`} className="author-name">{data.displayName || data.username}</Link>
            </div>
            <p className="muted small">Аватарка пользователя — оставьте комментарий под ней.</p>

            <CommentSection comments={data.comments || []} me={me} busy={busy} onSubmit={submitComment} />
          </div>
        </div>
      </div>
    </div>
  )
}

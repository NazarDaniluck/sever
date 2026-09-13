import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postsApi, messagesApi, usersApi } from '../api.js'
import { Avatar } from './Navbar.jsx'

export default function ShareModal({ post, currentUserId, onClose, onShared }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [sent, setSent] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!q.trim()) { setPeople([]); return }
    const t = setTimeout(() => usersApi.search(q).then(setPeople), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { inputRef.current?.focus() }, [])

  const shareToWall = async () => {
    setBusy(true); setErr('')
    try {
      await postsApi.repost(post.id)
      onShared()
      setSent('wall')
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  const shareToUser = async (u) => {
    setBusy(true); setErr('')
    try {
      const conv = await messagesApi.open(u.id)
      const fd = new FormData()
      fd.append('body', '')
      fd.append('attachmentMeta', JSON.stringify([{ type: 'post', postId: post.id }]))
      await messagesApi.sendAttached(conv.id, fd)
      onShared()
      setSent('user')
      nav(`/messages/${conv.id}`)
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Поделиться записью</strong>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {sent ? (
          <div className="success-text">{sent === 'wall' ? 'Запись опубликована на вашей стене' : 'Запись отправлена в личные сообщения'}</div>
        ) : (
          <>
            <div className="share-target" onClick={shareToWall}>
              <span className="share-icon">🗨</span>
              <div>
                <strong>На мою стену</strong>
                <div className="muted small">Опубликовать запись в своём профиле</div>
              </div>
            </div>
            <div className="share-search">
              <div className="muted small" style={{ marginBottom: 4 }}>Или в личные сообщения:</div>
              <input ref={inputRef} className="input search" placeholder="Найти человека…" value={q} onChange={e => setQ(e.target.value)} />
              {people.filter(p => p.id !== currentUserId).slice(0, 6).map(p => (
                <button key={p.id} className="conv-row share-person" disabled={busy} onClick={() => shareToUser(p)}>
                  <Avatar user={p} size={32} />
                  <span>{p.displayName || p.username}</span>
                </button>
              ))}
              {q.trim() && people.filter(p => p.id !== currentUserId).length === 0 && <div className="muted small">Никого не нашли</div>}
            </div>
          </>
        )}
        {err && <div className="error-text">{err}</div>}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { messagesApi, postsApi } from '../api.js'
import { Avatar } from './Navbar.jsx'

export default function ForwardModal({ messageId, onClose, onDone }) {
  const [convs, setConvs] = useState([])
  const [mode, setMode] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    messagesApi.conversations().then(setConvs).catch(() => {})
  }, [])

  const doForward = async (convId) => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await messagesApi.forward(convId, messageId)
      if (onDone) onDone()
      onClose()
    } catch (e) {
      setErr(e.message || 'Не удалось переслать')
    } finally { setBusy(false) }
  }

  const doPost = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await postsApi.forward(messageId, comment.trim())
      if (onDone) onDone()
      onClose()
    } catch (e) {
      setErr(e.message || 'Не удалось создать запись')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal forward-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>Переслать сообщение</span>
          <button type="button" className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {mode === null && (
            <>
              <button type="button" className="forward-choice" onClick={() => setMode('post')}>📝 В пост</button>
              <div className="forward-list-label">В диалог:</div>
              <div className="forward-list">
                {convs.length === 0 && <div className="muted small">Нет диалогов</div>}
                {convs.map(c => {
                  const other = c.participants?.[0]
                  return (
                    <button type="button" key={c.id} className="forward-row" onClick={() => doForward(c.id)} disabled={busy}>
                      <Avatar user={other} size={28} />
                      <span>{other?.displayName || other?.username || 'Собеседник'}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {mode === 'post' && (
            <div className="forward-post-form">
              <textarea className="textarea" rows={4} placeholder="Добавить комментарий к пересланному сообщению (необязательно)…"
                value={comment} onChange={e => setComment(e.target.value)} maxLength={2048} autoFocus />
              <div className="row-custom">
                <button className="btn primary small-btn" disabled={busy} onClick={doPost}>Опубликовать запись</button>
                <button className="btn ghost small-btn" disabled={busy} onClick={() => setMode(null)}>Назад</button>
              </div>
            </div>
          )}
          {err && <div className="form-error">{err}</div>}
        </div>
      </div>
    </div>
  )
}

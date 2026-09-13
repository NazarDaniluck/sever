import { useState } from 'react'
import { reportsApi } from '../api.js'

const REASONS = [
  { id: 'spam', label: 'Спам' },
  { id: 'insult', label: 'Оскорбления' },
  { id: 'nsfw', label: 'Контент 18+' },
  { id: 'violence', label: 'Насилие' },
  { id: 'fake', label: 'Мошенничество' },
  { id: 'copyright', label: 'Нарушение авторских прав' },
  { id: 'other', label: 'Другое' }
]

// Кнопка «пожаловаться» на контент: пост / видео / аудио / альбом / фото.
// text — показывать как красный текст «Пожаловаться» вместо иконки-флага.
export default function ReportButton({ targetType, targetId, title, text = false }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const openModal = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setErr(''); setMsg('')
    setOpen(v => !v)
  }

  const submit = async () => {
    if (!reason) return setErr('Выберите причину жалобы')
    setBusy(true); setErr(''); setMsg('')
    try {
      await reportsApi.create({ targetType, targetId, reason, detail })
      setMsg('Жалоба отправлена администрации.')
      setReason(''); setDetail('')
      setTimeout(() => setOpen(false), 900)
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  return (
    <>
      {text ? (
        <button className="report-btn-text" title={title || 'Пожаловаться'} aria-label="Пожаловаться" onClick={openModal}>Пожаловаться</button>
      ) : (
        <button className="report-btn" title={title || 'Пожаловаться'} aria-label="Пожаловаться" onClick={openModal}>⚑</button>
      )}
      {open && (
        <div className="report-modal-backdrop" onClick={openModal}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-title">Пожаловаться на контент</div>
            <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Причина…</option>
              {REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <textarea className="textarea" rows={2} placeholder="Подробности (необязательно)" value={detail} onChange={e => setDetail(e.target.value)} />
            {err && <div className="error-text">{err}</div>}
            {msg && <div className="success-text">{msg}</div>}
            <div className="row-custom">
              <button className="btn primary small" disabled={busy} onClick={submit}>{busy ? 'Отправляем…' : 'Отправить'}</button>
              <button className="btn ghost small" onClick={openModal}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

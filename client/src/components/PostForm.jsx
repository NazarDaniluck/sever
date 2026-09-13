import { useState } from 'react'
import { postsApi } from '../api.js'
import AttachMenu, { ATTACH_TYPES } from './AttachMenu.jsx'
import EmojiPicker from './EmojiPicker.jsx'

let uid = 0
const nextId = () => `a${Date.now()}-${uid++}`

export default function PostForm({ onPosted, placeholder = 'Что нового?', compact = false, communityId = null }) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(!compact)
  const [err, setErr] = useState('')
  const [nsfw, setNsfw] = useState(false)

  const upsert = (item) => setPending(list => {
    if (item.type === 'photo' || item.type === 'video' || item.type === 'audio' || item.type === 'document') {
      return [...list.filter(p => !(p.file || p.lib)), item]
    }
    return [...list.filter(p => p.type !== item.type), item]
  })

  const pick = (type, file) => {
    if (file) { upsert({ id: nextId(), type, file }); return }
    if (type === 'note') upsert({ id: nextId(), type, text: '' })
    else if (type === 'poll') upsert({ id: nextId(), type, question: '', options: ['', ''] })
  }

  const pickFromLib = (type, lib) => {
    if (!lib) return
    upsert({ id: nextId(), type, lib })
  }

  const remove = (id) => setPending(list => list.filter(p => p.id !== id))
  const patch = (id, upd) => setPending(list => list.map(p => p.id === id ? { ...p, ...upd } : p))

  const canSubmit = Boolean(body.trim() || pending.length)

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('body', body)
      fd.append('communityId', communityId || '')
      fd.append('nsfw', nsfw ? '1' : '0')
      const meta = pending.map(p => {
        if (p.type === 'note' || p.type === 'poll') {
          return p.type === 'note'
            ? { type: 'note', text: p.text }
            : { type: 'poll', question: p.question, options: p.options }
        }
        if (p.lib) return { type: p.type, lib: p.lib }
        return null
      }).filter(Boolean)
      fd.append('attachmentMeta', JSON.stringify(meta))
      pending.filter(p => p.file).forEach(p => fd.append('file', p.file))
      await postsApi.create(fd)
      setBody(''); setPending([]); setOpen(false); setNsfw(false)
      if (onPosted) onPosted()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  if (compact && !open) {
    return (
      <div className="card composer compact" onClick={() => setOpen(true)}>
        <span className="muted">Поделитесь мыслью…</span>
      </div>
    )
  }

  const showNote = pending.find(p => p.type === 'note')
  const showPoll = pending.find(p => p.type === 'poll')
  const mediaItems = pending.filter(p => p.file)
  const libItems = pending.filter(p => p.lib)

  return (
    <form className="card composer" onSubmit={submit}>
      <textarea
        className="textarea composer-textarea"
        rows={3}
        placeholder={placeholder}
        value={body}
        onChange={e => setBody(e.target.value)}
        autoFocus={open}
      />

      <div className="composer-emoji">
        <EmojiPicker value={body} onSelect={setBody} />
      </div>

      {pending.length > 0 && (
        <div className="pending-attachments">
          {mediaItems.map(p => (
            <div className="pending-media" key={p.id}>
              {p.type === 'photo'
                ? <img src={URL.createObjectURL(p.file)} alt="" />
                : <span className="pending-chip">{ATTACH_TYPES.find(t => t.type === p.type)?.icon} {p.file.name}</span>}
              <button type="button" className="icon-btn" onClick={() => remove(p.id)}>✕</button>
            </div>
          ))}

          {libItems.map(p => (
            <div className="pending-media" key={p.id}>
              {p.type === 'photo'
                ? <img src={p.lib.url} alt="" />
                : <span className="pending-chip">
                    {ATTACH_TYPES.find(t => t.type === p.type)?.icon} {p.lib.name || 'Из фонда'}
                  </span>}
              <button type="button" className="icon-btn" onClick={() => remove(p.id)}>✕</button>
            </div>
          ))}

          {showNote && (
            <div className="attach-box">
              <div className="attach-box-head">
                <span>📝 Заметка</span>
                <button type="button" className="icon-btn" onClick={() => remove(showNote.id)}>✕</button>
              </div>
              <textarea className="textarea" rows={2} placeholder="Текст заметки…"
                value={showNote.text || ''} onChange={e => patch(showNote.id, { text: e.target.value })} />
            </div>
          )}

          {showPoll && (
            <div className="attach-box">
              <div className="attach-box-head">
                <span>🗳 Опрос</span>
                <button type="button" className="icon-btn" onClick={() => remove(showPoll.id)}>✕</button>
              </div>
              <input className="input" placeholder="Вопрос" value={showPoll.question || ''}
                onChange={e => patch(showPoll.id, { question: e.target.value })} />
              {(showPoll.options || []).map((o, i) => (
                <div className="row-custom" key={i}>
                  <input className="input" placeholder={`Вариант ${i + 1}`} value={o}
                    onChange={e => {
                      const opts = [...(showPoll.options || [])]
                      opts[i] = e.target.value
                      patch(showPoll.id, { options: opts })
                    }} />
                  <button type="button" className="icon-btn" onClick={() => patch(showPoll.id, { options: (showPoll.options || []).filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {(showPoll.options || []).length < 8 && (
                <button type="button" className="small-btn" onClick={() => patch(showPoll.id, { options: [...(showPoll.options || []), ''] })}>+ Добавить вариант</button>
              )}
            </div>
          )}
        </div>
      )}

      {err && <div className="error-text">{err}</div>}
      <div className="composer-actions">
        <div className="composer-right">
          <label className="nsfw-check" title="Пометить запись как 18+: текст и медиа будут размыты, пока зритель не нажмёт">
            <input type="checkbox" checked={nsfw} onChange={e => setNsfw(e.target.checked)} />
            <span>NSFW (18+)</span>
          </label>
          <AttachMenu onPick={pick} onPickFromLib={pickFromLib} types={['photo', 'video', 'audio', 'note', 'poll']} />
          <button className="btn primary" disabled={busy || !canSubmit}>
            {busy ? 'Публикуем…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </form>
  )
}

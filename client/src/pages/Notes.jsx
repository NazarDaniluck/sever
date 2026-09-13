import { useEffect, useState } from 'react'
import { libraryApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import { timeAgo } from '../utils.js'

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const load = async () => {
    try { setNotes(await libraryApi.notes()) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      await libraryApi.createNote(text)
      setText(''); flash('Заметка сохранена.'); load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const save = async () => {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      await libraryApi.updateNote(editing, text)
      setEditing(null); setText(''); flash('Заметка обновлена.'); load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const startEdit = (n) => { setEditing(n.id); setText(n.text) }

  const remove = async (id) => {
    if (!confirm('Удалить заметку?')) return
    try { await libraryApi.deleteNote(id); load() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои заметки</div>
        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        <div className="card">
          <div className="settings_title">{editing ? 'Редактирование' : 'Новая заметка'}</div>
          <textarea className="textarea" rows={3} value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Напишите напоминание…" maxLength={2000} />
          <div className="row" style={{ marginTop: 6 }}>
            {editing ? (
              <>
                <button className="btn primary" disabled={busy || !text.trim()} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
                <button className="btn ghost" onClick={() => { setEditing(null); setText('') }}>Отмена</button>
              </>
            ) : (
              <button className="btn primary" disabled={busy || !text.trim()} onClick={add}>{busy ? 'Добавляем…' : 'Добавить'}</button>
            )}
          </div>
        </div>

        <div className="card">
          {notes.map(n => (
            <div className="mod-row" key={n.id}>
              <div className="mod-main">
                <div className="post-note">{n.text}</div>
                <div className="muted small">Заметка от {timeAgo(n.createdAt)}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn ghost small-btn" onClick={() => startEdit(n)}>Ред.</button>
                <button className="icon-btn danger" title="Удалить" onClick={() => remove(n.id)}>🗑</button>
              </div>
            </div>
          ))}
          {notes.length === 0 && <div className="muted">Заметок пока нет.</div>}
        </div>
      </div>
    </div>
  )
}
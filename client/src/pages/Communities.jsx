import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { communitiesApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'

export default function Communities() {
  const [list, setList] = useState([])
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [err, setErr] = useState('')

  const load = async (query = q) => {
    const d = await communitiesApi.list(query)
    setList(d)
  }

  useEffect(() => { load() }, [q])

  const create = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const c = await communitiesApi.create(form)
      setForm({ name: '', description: '' })
      setShowCreate(false)
      load()
    } catch (ex) { setErr(ex.message) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои группы</div>
        <div className="toolbar">
        <input className="input search" placeholder="Найти сообщество…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setShowCreate(v => !v)}>+ Создать</button>
      </div>

      {showCreate && (
        <form className="card" onSubmit={create}>
          <h3>Новое сообщество</h3>
          <input className="input" placeholder="Название" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <textarea className="textarea" rows={3} placeholder="Описание" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {err && <div className="error-text">{err}</div>}
          <button className="btn primary">Создать</button>
        </form>
      )}

      <div className="grid">
        {list.map(c => (
          <Link to={`/c/${c.id}`} className="card community-card" key={c.id}>
            {c.avatar ? <img src={c.avatar} className="comm-avatar" alt="" /> : <div className="comm-avatar placeholder">{c.name.charAt(0)}</div>}
            <div>
              <strong>{c.name}</strong>
              <div className="muted">{(c.members ?? 0)} участников</div>
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && <div className="card muted">Ничего не найдено.</div>}
      </div>
    </div>
  )
}
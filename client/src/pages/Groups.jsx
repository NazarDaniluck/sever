import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { groupsApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'

const ACCESS_LABELS = { open: '🌐', link: '🔗', closed: '🔒' }

export default function Groups() {
  const nav = useNavigate()
  const [list, setList] = useState([])
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', access: 'open', memberLimit: 100 })
  const [err, setErr] = useState('')

  const load = async (query = q) => {
    setErr('')
    const d = await groupsApi.list(query)
    setList(d)
  }

  useEffect(() => { load().catch(ex => setErr(ex.message)) }, [q])

  const create = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const g = await groupsApi.create(form)
      setForm({ name: '', description: '', access: 'open', memberLimit: 100 })
      setShowCreate(false)
      nav(`/groups/${g.id}`)
    } catch (ex) { setErr(ex.message) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Группы</div>

        <div className="toolbar">
          <input className="input search" placeholder="Найти группу…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => setShowCreate(v => !v)}>Создать группу</button>
        </div>

        {showCreate && (
          <form className="card" onSubmit={create}>
            <h3>Новая группа</h3>
            <label className="field-label">Название</label>
            <input className="input" placeholder="Название" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <label className="field-label">Описание</label>
            <textarea className="textarea" rows={3} placeholder="Описание" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <label className="field-label">Доступ</label>
            <div className="access-options">
              {[
                { v: 'open', t: '🌐 Открытая', d: 'Любой может найти и вступить' },
                { v: 'link', t: '🔗 По ссылке', d: 'Группа не видна в списках' },
                { v: 'closed', t: '🔒 Закрытая', d: 'Участников добавляет владелец' }
              ].map(o => (
                <label key={o.v} className={`access-option access-option-${o.v} ${form.access === o.v ? 'active' : ''}`}>
                  <input type="radio" name="create-access" value={o.v} checked={form.access === o.v} onChange={() => setForm(f => ({ ...f, access: o.v }))} />
                  <span>
                    <span className="access-option-title">{o.t}</span>
                    <span className="access-option-desc">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="field-label">Лимит участников (2–500)</label>
            <input className="input" type="number" min="2" max="500" value={form.memberLimit}
              onChange={e => setForm(f => ({ ...f, memberLimit: e.target.value }))} />
            {err && <div className="error-text">{err}</div>}
            <button className="btn primary">Создать</button>
          </form>
        )}

        <div className="group-grid">
          {list.map(g => (
            <Link to={`/groups/${g.id}`} className="card group-card" key={g.id}>
              <div className="group-card-head">
                <Avatar user={{ avatar: g.avatar, name: g.name }} size={48} />
                <span className={`group-access access-${g.access}`} title={ACCESS_LABELS[g.access]}>{ACCESS_LABELS[g.access]}</span>
              </div>
              <strong>{g.name}</strong>
              {g.description && <div className="muted small group-card-desc">{g.description}</div>}
              <div className="muted small">
                Участников: {g.members ?? 0} / {g.memberLimit ?? 100}
                {g.isMember ? ' · вы в группе' : ''}
              </div>
            </Link>
          ))}
        </div>
        {list.length === 0 && <div className="card muted">Группы не найдены. Закрытые и «по ссылке» группы не показываются в списке.</div>}
      </div>
    </div>
  )
}

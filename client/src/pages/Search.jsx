import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi, communitiesApi } from '../api.js'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Search() {
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [groups, setGroups] = useState([])

  useEffect(() => {
    if (!q.trim()) { setPeople([]); setGroups([]); return }
    const t = setTimeout(async () => {
      const [p, g] = await Promise.all([usersApi.search(q), communitiesApi.list(q)])
      setPeople(p); setGroups(g)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Поиск</div>
        <input autoFocus className="input search big" placeholder="Поиск людей и сообществ…" value={q} onChange={e => setQ(e.target.value)} />
      {!q.trim() && <div className="muted center-screen">Начните вводить, чтобы найти людей и сообщества</div>}

      {q.trim() && (
        <>
          <h3 className="section-title">Люди</h3>
          {people.filter(p => p.id !== me.id).map(p => (
            <Link to={`/u/${p.username}`} className="card suggest-row big" key={p.id}>
              <Avatar user={p} size={48} />
              <div>
                <strong>{p.displayName || p.username}</strong>
                <AdminBadge user={p} />
                <div className="muted">@{p.username} · {p.bio || ''}</div>
              </div>
            </Link>
          ))}
          {people.filter(p => p.id !== me.id).length === 0 && <div className="card muted">Никого не нашли.</div>}

          <h3 className="section-title">Сообщества</h3>
          {groups.map(c => (
            <Link to={`/c/${c.id}`} className="card suggest-row big" key={c.id}>
              <Avatar user={{ ...c, displayName: c.name }} size={48} />
              <div>
                <strong>{c.name}</strong>
                <div className="muted">{c.description || ''} · {(c.members ?? 0)} участников</div>
              </div>
            </Link>
          ))}
          {groups.length === 0 && <div className="card muted">Сообществ не найдено.</div>}
        </>
      )}
      </div>
    </div>
  )
}
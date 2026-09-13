import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { communitiesApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'

const PAGE_SIZE = 30

export default function CommunityMembers() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const [comm, setComm] = useState(null)
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState({})

  const loadComm = async () => {
    const d = await communitiesApi.get(id)
    setComm(d)
  }

  const loadMembers = async (off) => {
    setLoading(true)
    setErr('')
    try {
      const d = await communitiesApi.members(id, PAGE_SIZE, off)
      setMembers(off === 0 ? d.members : prev => [...prev, ...d.members])
      setTotal(d.total)
      setOffset(off)
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComm().catch(ex => setErr(ex.message))
    loadMembers(0)
  }, [id])

  if (err && !comm && members.length === 0) return <div className="center muted">{err}</div>
  if (!comm && loading) return <div className="center muted">Загрузка…</div>
  if (!comm) return <div className="center muted">Загрузка…</div>

  const canModerate = !!comm.canModerate

  const setRole = async (m) => {
    if (busy[m.id]) return
    setBusy(b => ({ ...b, [m.id]: true }))
    try {
      await communitiesApi.setMemberRole(comm.community.id, m.id, m.memberRole !== 'moderator')
      await loadMembers(0)
    } catch (ex) { setErr(ex.message) }
    finally { setBusy(b => ({ ...b, [m.id]: false })) }
  }

  const kick = async (m) => {
    if (!window.confirm(`Исключить ${m.displayName || m.username} из сообщества?`)) return
    setBusy(b => ({ ...b, [m.id]: true }))
    try {
      await communitiesApi.kickMember(comm.community.id, m.id)
      await loadMembers(0)
    } catch (ex) { setErr(ex.message) }
    finally { setBusy(b => ({ ...b, [m.id]: false })) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">
          <Link to={`/c/${comm.community.id}`} className="back-link">←</Link>{' '}
          Участники сообщества «{comm.community.name}» · {total}
        </div>
        {err && <div className="error-text">{err}</div>}

        {members.length === 0 && !loading && <div className="card muted">Участников пока нет.</div>}

        <div className="member-grid">
          {members.map(m => (
            <div className="member-tile card" key={m.id}>
              <Link to={`/u/${m.username}`} className="member-tile-link">
                <Avatar user={m} size={64} />
                <strong className="member-tile-name">{m.displayName || m.username}</strong>
                <span className="muted small">@{m.username}</span>
                <div className="member-tile-badges">
                  <AdminBadge user={m} />
                </div>
                {m.memberRole === 'owner' && <span className="role-chip">👑 Владелец</span>}
                {m.memberRole === 'moderator' && <span className="role-chip mod">🛡 Администратор</span>}
              </Link>
              {canModerate && m.id !== me?.id && m.memberRole !== 'owner' && (
                <div className="member-tile-actions">
                  <button className="small-btn" disabled={busy[m.id]} onClick={() => setRole(m)}>
                    {m.memberRole === 'moderator' ? 'Снять админа' : 'Сделать админом'}
                  </button>
                  {me?.id === comm.community.owner_id && (
                    <button className="small-btn ghost danger" disabled={busy[m.id]} onClick={() => kick(m)}>Исключить</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {loading && <div className="center muted">Загрузка…</div>}

        {members.length < total && (
          <div className="center" style={{ margin: '12px 0' }}>
            <button className="btn ghost" disabled={loading} onClick={() => loadMembers(offset + PAGE_SIZE)}>
              Показать ещё ({total - members.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

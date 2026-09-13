import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import { eventsApi, groupsApi } from '../api.js'
import { useEvents, eventUrl, eventText } from '../context/EventsContext.jsx'
import { timeAgo } from '../utils.js'

export default function EventsPage() {
  const { refresh } = useEvents()
  const nav = useNavigate()
  const [events, setEvents] = useState([])

  useEffect(() => {
    eventsApi.list().then(d => setEvents(d.events || [])).catch(() => {})
  }, [])

  const markAll = async () => {
    await eventsApi.markAllRead().catch(() => {})
    setEvents(list => list.map(e => ({ ...e, read: true })))
    refresh()
  }

  const open = async (e) => {
    if (!e.read) {
      setEvents(list => list.map(x => x.id === e.id ? { ...x, read: true } : x))
      await eventsApi.markRead(e.id).catch(() => {})
      refresh()
    }
    nav(eventUrl(e))
  }

  const del = async (e) => {
    if (!window.confirm('Удалить это событие?')) return
    try {
      await eventsApi.del(e.id)
      setEvents(list => list.filter(x => x.id !== e.id))
    } catch { /* ошибка */ }
  }

  const respondInvite = async (e, accept) => {
    if (e._busy) return
    setEvents(list => list.map(x => x.id === e.id ? { ...x, _busy: true } : x))
    try {
      await (accept ? groupsApi.acceptInvite(e.target.id) : groupsApi.declineInvite(e.target.id))
      setEvents(list => list.filter(x => x.id !== e.id))
      if (accept) nav(`/groups/${e.target.id}`)
    } catch (err) {
      alert(err.message)
      setEvents(list => list.map(x => x.id === e.id ? { ...x, _busy: false } : x))
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои события</div>
        <div className="card">
          {events.length === 0 && (
            <div className="muted pad">Пока нет событий. Здесь появятся упоминания вас (@логин) и ответы на ваши комментарии.</div>
          )}
          {events.map(e => (
            <div key={e.id} className={`event-row ${e.read ? '' : 'unread'}`}>
              <button className="event-main" onClick={() => open(e)}>
                <Avatar user={e.actor} size={40} />
                <div className="event-info">
                  <div>
                    <strong>{e.actor?.displayName || e.actor?.username}</strong>
                    <span className="muted"> — {eventText(e)}</span>
                  </div>
                  {e.body && <div className="muted small event-body">{e.body}</div>}
                </div>
                <div className="muted small event-time">{timeAgo(e.createdAt)}</div>
              </button>
              {e.type === 'group_invite' && (
                <div className="event-actions">
                  <button className="btn small-btn" disabled={e._busy} onClick={() => respondInvite(e, true)}>Принять</button>
                  <button className="btn small-btn ghost" disabled={e._busy} onClick={() => respondInvite(e, false)}>Отклонить</button>
                </div>
              )}
              <button className="event-del" title="Удалить событие" aria-label="Удалить событие" onClick={() => del(e)}>✕</button>
            </div>
          ))}
          {events.length > 0 && (
            <div className="events-actions">
              <button className="btn ghost" onClick={markAll}>Отметить все прочитанными</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

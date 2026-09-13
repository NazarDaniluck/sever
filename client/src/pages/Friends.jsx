import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usersApi, friendsApi } from '../api.js'

function FollowButton({ person }) {
  const { user: me } = useAuth()
  const [followed, setFollowed] = useState(person.id !== me.id && person.isFollowed)
  const [t, setT] = useState(person.followsMe && !person.isFollowed)

  if (person.id === me.id) return <span className="muted small">это вы</span>

  const toggle = async () => {
    if (followed) await usersApi.unfollow(person.id)
    else await usersApi.follow(person.id)
    setFollowed(v => !v)
  }

  return (
    <button className={`btn ${followed ? 'ghost' : 'primary'}`} onClick={toggle}>
      {followed ? 'Отписаться' : (t ? 'В ответ' : 'Подписаться')}
    </button>
  )
}

export default function Friends() {
  const { username } = useParams()
  const { user: me } = useAuth()
  const [tab, setTab] = useState('friends')
  const [list, setList] = useState([])
  const [reqs, setReqs] = useState({ incoming: [], outgoing: [] })
  const [loading, setLoading] = useState(true)
  const [frState, setFrState] = useState({})

  useEffect(() => {
    if (!username) return
    setLoading(true)
    const load = tab === 'friends'
      ? friendsApi.list()
      : tab === 'requests'
        ? friendsApi.requests()
        : (tab === 'followers' ? usersApi.followers(username) : usersApi.following(username))
    Promise.resolve(load)
      .then(d => {
        if (tab === 'requests') setReqs(d)
        else setList(d)
      })
      .catch(() => {
        if (tab === 'requests') setReqs({ incoming: [], outgoing: [] })
        else setList([])
      })
      .finally(() => setLoading(false))
  }, [username, tab])

  const mine = me && me.username === username

  const addFriend = async (u) => {
    try {
      await friendsApi.send(u.id)
      setFrState(s => ({ ...s, [u.id]: 'sent' }))
    } catch { /* ignore */ }
  }

  const removeFriend = async (u) => {
    if (!window.confirm(`Убрать ${u.displayName || u.username} из друзей?`)) return
    await friendsApi.remove(u.id)
    setList(l => l.filter(x => x.id !== u.id))
  }

  const approve = async (r) => {
    await friendsApi.respond(r.fromUserId, true)
    setReqs(s => ({ ...s, incoming: s.incoming.filter(x => x.id !== r.id) }))
  }

  const decline = async (r) => {
    await friendsApi.respond(r.fromUserId, false)
    setReqs(s => ({ ...s, incoming: s.incoming.filter(x => x.id !== r.id) }))
  }

  const cancelReq = async (r) => {
    await friendsApi.cancel(r.toUserId)
    setReqs(s => ({ ...s, outgoing: s.outgoing.filter(x => x.id !== r.id) }))
  }

  const userActions = (u) => (
    <>
      {u.id !== me?.id && (
        frState[u.id] === 'sent'
          ? <span className="muted small">Заявка отправлена</span>
          : (u.isFriend || frState[u.id] === 'friends')
            ? null
            : <button className="btn ghost small-btn" onClick={() => addFriend(u)}>В друзья</button>
      )}
    </>
  )

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои друзья</div>
        <div className="tabs">
          <button className={`tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>Друзья</button>
          <button className={`tab ${tab === 'followers' ? 'active' : ''}`} onClick={() => setTab('followers')}>Подписчики</button>
          <button className={`tab ${tab === 'following' ? 'active' : ''}`} onClick={() => setTab('following')}>Подписки</button>
          {mine && <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Заявки</button>}
        </div>
        {loading ? <div className="muted">Загрузка…</div> : (
          tab === 'requests' ? (
            <div className="card">
              <div className="section-title">Входящие</div>
              {reqs.incoming.length === 0 && <div className="muted small">Пусто.</div>}
              {reqs.incoming.map(r => (
                <div className="friend-row" key={r.id}>
                  <Link to={`/u/${r.user.username}`}><Avatar user={r.user} size={40} /></Link>
                  <div className="friend-info">
                    <Link className="author-name" to={`/u/${r.user.username}`}>{r.user.displayName || r.user.username}</Link>
                    <AdminBadge user={r.user} />
                    <div className="muted">@{r.user.username}</div>
                  </div>
                  <button className="btn primary small-btn" onClick={() => approve(r)}>Принять</button>
                  <button className="btn ghost small-btn" onClick={() => decline(r)}>Отклонить</button>
                </div>
              ))}
              <div className="section-title">Исходящие</div>
              {reqs.outgoing.length === 0 && <div className="muted small">Пусто.</div>}
              {reqs.outgoing.map(r => (
                <div className="friend-row" key={r.id}>
                  <Link to={`/u/${r.user.username}`}><Avatar user={r.user} size={40} /></Link>
                  <div className="friend-info">
                    <Link className="author-name" to={`/u/${r.user.username}`}>{r.user.displayName || r.user.username}</Link>
                    <AdminBadge user={r.user} />
                    <div className="muted">@{r.user.username}</div>
                  </div>
                  <button className="btn ghost small-btn" onClick={() => cancelReq(r)}>Отменить</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              {list.length === 0 && <div className="muted">{mine ? 'Пока никого нет.' : 'Здесь никого нет.'}</div>}
              {list.map(u => (
                <div className="friend-row" key={u.id}>
                  <Link to={`/u/${u.username}`}><Avatar user={u} size={40} /></Link>
                  <div className="friend-info">
                    <Link className="author-name" to={`/u/${u.username}`}>{u.displayName || u.username}</Link>
                    <AdminBadge user={u} />
                    <div className="muted">@{u.username}</div>
                  </div>
                  {u.mutual && <span className="mutual" title="Взаимная подписка">взаимно</span>}
                  {tab === 'friends'
                    ? (u.id !== me?.id && <button className="btn ghost small-btn" onClick={() => removeFriend(u)}>Убрать из друзей</button>)
                    : <><FollowButton person={u} />{userActions(u)}</>}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

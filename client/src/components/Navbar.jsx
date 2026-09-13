import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { messagesApi } from '../api.js'
import { playMessageSound } from '../sound.js'
import { browserNotify } from '../context/EventsContext.jsx'
import { io } from 'socket.io-client'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [socket, setSocket] = useState(null)
  const [menu, setMenu] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => {
    messagesApi.unread().then(d => setUnread(d.unread)).catch(() => {})
    const s = io('/', { auth: { token: localStorage.getItem('sever_token') } })
    setSocket(s)
    s.on('conversation:update', () => messagesApi.unread().then(d => setUnread(d.unread)).catch(() => {}))
    s.on('message', (msg) => {
      messagesApi.unread().then(d => setUnread(d.unread)).catch(() => {})
      if (msg.sender?.id !== user.id) {
        playMessageSound()
        browserNotify(msg.sender?.displayName || msg.sender?.username || 'Новое сообщение', {
          body: msg.body ? String(msg.body).slice(0, 140) : 'Новое вложение',
          icon: msg.sender?.avatar || undefined,
          url: `/messages/${msg.conversationId}`,
          insidePath: '/messages'
        })
      }
    })
    s.on('unread', ({ unread }) => setUnread(unread))
    return () => s.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = (path) => { navigate(path); setMenu(false); setMobileMenu(false) }

  const link = ({ isActive }) => isActive ? 'nav-link active' : 'nav-link'

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="logo" onClick={() => { setMenu(false); setMobileMenu(false) }}>
          <img src="/sever-logo.png" alt="" className="logo-img" />Север
        </Link>
        <nav className="nav-links">
          <NavLink to="/feed" className={link} end onClick={() => setMobileMenu(false)}>Лента</NavLink>
          <NavLink to="/communities" className={link} onClick={() => setMobileMenu(false)}>Сообщества</NavLink>
          <NavLink to="/search" className={link} onClick={() => setMobileMenu(false)}>Поиск</NavLink>
          <NavLink to="/messages" className={link} onClick={() => setMobileMenu(false)}>
            Сообщения
            {unread > 0 && <span className="badge">{unread}</span>}
          </NavLink>
        </nav>
        <div className="nav-right">
          <button className="nav-burger" onClick={() => setMobileMenu(v => !v)} title="Меню" aria-label="Меню">
            <span className="burger-bar" />
            <span className="burger-bar" />
            <span className="burger-bar" />
          </button>
          <button className="avatar-btn" onClick={() => setMenu(v => !v)} title={user.displayName}>
            <Avatar user={user} size={36} />
          </button>
          {menu && (
            <div className="dropdown">
              <button onClick={() => goTo(`/u/${user.username}`)}>Моя страница</button>
              <button onClick={() => goTo('/friends/' + user.username)}>Мои друзья</button>
              <button onClick={() => goTo('/settings')}>Мои настройки</button>
              {user.isAdmin && <button onClick={() => goTo('/admin')}>🛠 Админ-панель</button>}
              <button onClick={() => goTo('/faq')}>❓ FAQ</button>
              <button className="danger" onClick={() => { logout(); goTo('/login') }}>Выйти</button>
            </div>
          )}
        </div>
      </div>
      {mobileMenu && (
        <div className="nav-mobile-menu">
          <NavLink to="/feed" className={link} end onClick={() => setMobileMenu(false)}>Лента</NavLink>
          <NavLink to="/communities" className={link} onClick={() => setMobileMenu(false)}>Сообщества</NavLink>
          <NavLink to="/search" className={link} onClick={() => setMobileMenu(false)}>Поиск</NavLink>
          <NavLink to="/messages" className={link} onClick={() => setMobileMenu(false)}>
            Сообщения{unread > 0 && <span className="badge">{unread}</span>}
          </NavLink>
        </div>
      )}
    </header>
  )
}

export function Avatar({ user, size = 40, className = '', scale }) {
  const s = scale ?? user?.avatarScale ?? 1
  const style = { width: size, height: size }
  const inner = user?.avatar ? (
    <img className="avatar-img" src={user.avatar} alt="" style={{ transform: `scale(${s})` }} />
  ) : (
    <div className="avatar-placeholder" style={{ fontSize: size * 0.45 }}>
      {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
    </div>
  )
  const capSize = Math.max(10, Math.round(size * 0.4))
  return (
    <span className={`avatar ${className}`} style={style}>
      <span className="avatar-clip">
        {inner}
        {user?.memorialized && <span className="memorial-veil" title="Аккаунт в режиме памяти" />}
      </span>
      {user?.birthdayToday && (
        <span
          className="birthday-cap"
          title="🎂 Сегодня день рождения"
          style={{ width: capSize, height: capSize, top: -capSize * 0.25, right: -capSize * 0.3 }}
        />
      )}
    </span>
  )
}
import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEvents } from '../context/EventsContext.jsx'
import { configApi } from '../api.js'

const MENU = [
  { label: 'Моя страница', to: (u) => `/u/${u.username}` },
  { label: 'Мои фотографии', to: () => '/photos' },
  { label: 'Мои видеозаписи', to: () => '/videos' },
  { label: 'Мои аудиозаписи', to: () => '/audios' },
  { label: 'Мои заметки', to: () => '/notes' },
  { label: 'Мои события', to: () => '/events', badge: 'events' },
  { label: 'Мои закладки', to: () => '/bookmarks' }
]

export default function Sidebar() {
  const { user } = useAuth()
  const events = useEvents()
  const [hideTg, setHideTg] = useState(() => localStorage.getItem('sever_tg_ad_hidden') === '1')
  const [ad, setAd] = useState(null)

  useEffect(() => {
    let alive = true
    configApi.get().then(cfg => { if (alive) setAd(cfg.sidebarAd || null) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!user) return null

  const badgeValue = (item) => {
    if (item.badge === 'events') return events?.unread || 0
    return 0
  }

  const MenuItem = ({ item }) => {
    const to = item.to ? item.to(user) : null
    const badge = to && item.badge ? badgeValue(item) : 0
    return to ? (
      <NavLink to={to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        {item.label}
        {badge > 0 && <span className="badge">{badge}</span>}
      </NavLink>
    ) : (
      <span className="nav-item soon" title="Скоро">↘ {item.label}</span>
    )
  }

  return (
    <div className="column sidebar">
      <div className="navigation">
        <div className="navigation_header">
          <span className="username">{user.displayName || user.username}</span>
        </div>
        {MENU.map((item, i) => <MenuItem key={i} item={item} />)}
      </div>
      <div className="sidebar_ads">
        <div className="sidebar-slogan">Север — это внебрачный сын твиттера и вк</div>
        {(ad?.enabled && ad.title) && (
          <div className="ad-card">
            {ad.image && <img src={ad.image} alt="" className="ad-img" onError={e => { e.target.style.display = 'none' }} />}
            <div className="ad-body">
              {ad.title && <div className="ad-title">{ad.title}</div>}
              {ad.desc && <div className="ad-desc">{ad.desc}</div>}
              {ad.link && <a href={ad.link} target="_blank" rel="noreferrer" className="btn primary ad-btn">Перейти →</a>}
            </div>
          </div>
        )}
        <div className="ad-card">
          <img src="/sever-logo.png" alt="" className="ad-img" />
          <div className="ad-body">
            <div className="ad-title">Лента видео</div>
            <div className="ad-desc">Все новые ролики сети в одном месте. Не пропустите свежее!</div>
            <Link to="/videos/feed" className="btn primary ad-btn">Смотреть ленту →</Link>
          </div>
        </div>
        {!hideTg && (
          <div className="ad-card">
            <button className="ad-close" title="Скрыть навсегда" aria-label="Скрыть" onClick={() => { localStorage.setItem('sever_tg_ad_hidden', '1'); setHideTg(true) }}>✕</button>
            <img src="/telegram-cat.png" alt="" className="ad-img" />
            <div className="ad-body">
              <div className="ad-title">Телеграм-канал Создателя</div>
              <div className="ad-desc">Новости проекта, анонсы, обновления и жизнь админа :) </div>
              <a href="https://t.me/sever_socialnetwork" target="_blank" rel="noreferrer" className="btn primary ad-btn">Подписаться →</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

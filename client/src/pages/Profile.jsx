import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usersApi, postsApi, messagesApi, friendsApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { backdropToStyle, pageBgToStyle } from '../context/SettingsContext.jsx'
import PostCard from '../components/PostCard.jsx'
import PostForm from '../components/PostForm.jsx'
import Pagination from '../components/Pagination.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import { fullDate, birthdayWithAge, tzLabel } from '../utils.js'
import { MARITAL_OPTIONS, POLITICAL_OPTIONS, PSYCHOTYPE_OPTIONS, THINKING_TYPE_OPTIONS, PARTNER_STATUSES, PARTNER_PREFIX, labelOf } from '../profileMeta.js'

export default function Profile() {
  const { username } = useParams()
  const { user: me } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [err, setErr] = useState('')
  const [chatMsg, setChatMsg] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const [closedUser, setClosedUser] = useState(null)
  const [closedSent, setClosedSent] = useState(false)
  const guest = !me

  const load = async (pg = page) => {
    setLoading(true)
    try {
      const d = await usersApi.get(username)
      setData(d)
      const p = await usersApi.posts(username, pg)
      setPosts(p.posts)
      setPages(p.pages)
      setErr('')
    } catch (ex) {
      if (guest) { nav('/login'); return }
      setErr(ex.message)
      if (ex.message.includes('только друзьям')) {
        try {
          const res = await usersApi.search(username)
          const found = (Array.isArray(res) ? res : []).find(i => i.username === username)
          if (found) setClosedUser(found)
        } catch (e) { /* ignore */ }
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load(page) }, [username, page, nonce])
  useEffect(() => { setPage(1) }, [username])

  if (loading) return <div className="center muted">Загрузка…</div>
  if (err) {
    if (err.includes('только друзьям')) {
      return (
        <div className="layout">
          <Sidebar />
          <div className="column main-col">
            <div className="card">
              <div className="center muted">Профиль закрыт. Добавьте пользователя в друзья, чтобы видеть его страницу.</div>
              {closedUser && !closedSent && (
                <div className="center">
                  <button className="btn primary" onClick={async () => {
                    await friendsApi.send(closedUser.id)
                    setClosedSent(true)
                  }}>Отправить заявку в друзья</button>
                </div>
              )}
              {closedSent && <div className="center success-text">Заявка отправлена</div>}
            </div>
          </div>
        </div>
      )
    }
    return <div className="center muted">{err}</div>
  }
  if (!data) return <div className="center muted">Пользователь не найден</div>

  const { user, counts, isOwner, followed } = data
  const ownerBackdrop = backdropToStyle(user.backdrop)
  const ownerPageColor = pageBgToStyle(user.pageBg || (user.pageColor ? { type: 'color', value: user.pageColor } : null))

  const toggleFollow = async () => {
    if (followed) { await usersApi.unfollow(user.id); setData(d => ({ ...d, followed: false, counts: { ...d.counts, followers: d.counts.followers - 1 } })) }
    else { await usersApi.follow(user.id); setData(d => ({ ...d, followed: true, counts: { ...d.counts, followers: d.counts.followers + 1 } })) }
  }

  const friendBtn = !isOwner ? (
    data.isFriend ? (
      <button className="btn ghost" onClick={async () => {
        await friendsApi.remove(user.id)
        setData(d => ({ ...d, isFriend: false }))
      }}>Убрать из друзей</button>
    ) : data.friendRequest?.status === 'pending' ? (
      <>
        <button className="btn ghost" disabled>Заявка отправлена</button>
        <button className="btn ghost small-btn" onClick={async () => {
          await friendsApi.cancel(user.id)
          setData(d => ({ ...d, friendRequest: null }))
        }}>Отменить</button>
      </>
    ) : (
      <button className="btn ghost" onClick={async () => {
        const res = await friendsApi.send(user.id)
        setData(d => ({ ...d, friendRequest: { status: 'pending' }, isFriend: res?.becameFriends ? true : d.isFriend }))
      }}>В друзья</button>
    )
  ) : null

  const openChat = async () => {
    setChatMsg('')
    try {
      const conv = await messagesApi.open(user.id)
      nav(`/messages/${conv.id}`)
    } catch (ex) {
      if (ex.code === 'REQUEST_REQUIRED') {
        try {
          await messagesApi.sendRequest(user.id)
          setChatMsg('Заявка на переписку отправлена. Ждите ответа владельца профиля.')
          setData(d => ({ ...d, message: { ...d.message, requestStatus: 'pending' } }))
        } catch (e2) {
          setChatMsg(e2.message)
        }
        return
      }
      if (ex.code === 'MESSAGES_DISABLED') { setChatMsg('Этот пользователь не принимает сообщения.'); return }
      setChatMsg(ex.message)
    }
  }

  const sendRequest = async () => {
    setChatMsg('')
    try {
      await messagesApi.sendRequest(user.id)
      setChatMsg('Заявка на переписку отправлена. Ждите ответа владельца профиля.')
      setData(d => ({ ...d, message: { ...d.message, requestStatus: 'pending' } }))
    } catch (ex) { setChatMsg(ex.message) }
  }

  const msgMode = data.message?.mode || 'all'
  const msgStatus = data.message?.requestStatus

  const needLogin = (fn) => () => guest ? nav('/login') : fn()

  const aboutFacts = []
  if (user.status) aboutFacts.push(['Статус', user.status])
  if (user.hometown) aboutFacts.push(['Родной город', user.hometown])
  const marital = labelOf(MARITAL_OPTIONS, user.maritalStatus)
  if (marital) {
    const partner = user.maritalPartnerUser
    if (partner && PARTNER_STATUSES.includes(user.maritalStatus)) {
      const prefix = PARTNER_PREFIX[user.maritalStatus] || 'Семейное положение'
      aboutFacts.push(['Семейное положение', (
        <>{prefix}{' '}
          <Link className="author-name" to={`/u/${partner.username}`}>{partner.displayName}</Link>
        </>
      )])
    } else {
      aboutFacts.push(['Семейное положение', marital])
    }
  }
  const political = labelOf(POLITICAL_OPTIONS, user.politicalViews)
  if (political) aboutFacts.push(['Политические взгляды', political])
  const psychotype = labelOf(PSYCHOTYPE_OPTIONS, user.psychotype)
  if (psychotype) aboutFacts.push(['Психотип', psychotype])
  const thinkingType = labelOf(THINKING_TYPE_OPTIONS, user.thinkingType)
  if (thinkingType) aboutFacts.push(['Тип мышления', thinkingType])
  if (user.birthday) aboutFacts.push(['День рождения', <>{user.birthdayToday && '🎉 '}{birthdayWithAge(user.birthday)}</>])
  if (user.interests) aboutFacts.push(['Интересы', user.interests])
  if (user.favoriteMusic) aboutFacts.push(['Любимая музыка', user.favoriteMusic])
  if (user.favoriteMovies) aboutFacts.push(['Любимые фильмы', user.favoriteMovies])
  if (user.favoriteTv) aboutFacts.push(['Любимые ТВ-шоу', user.favoriteTv])
  if (user.favoriteBooks) aboutFacts.push(['Любимые книги', user.favoriteBooks])
  if (user.favoriteGames) aboutFacts.push(['Любимые игры', user.favoriteGames])
  if (user.favoriteQuotes) aboutFacts.push(['Любимые цитаты', user.favoriteQuotes])
  if (user.aboutMe) aboutFacts.push(['Описание профиля', user.aboutMe])
  if (user.website) aboutFacts.push(['Личный сайт', user.website])
  if (user.city) aboutFacts.push(['Город', user.city])
  if (user.address) aboutFacts.push(['Адрес', user.address])

  const renderFactValue = (k, v) => {
    if (k === 'Личный сайт' && v) {
      const href = /^https?:\/\//i.test(v) ? v : `https://${v}`
      return <a className="contact-link" href={href} target="_blank" rel="noreferrer">{v}</a>
    }
    return v
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        {ownerPageColor.background && <div className="profile-pagecolor" style={ownerPageColor} />}
        {(ownerBackdrop.backgroundImage || ownerBackdrop.background) && <div className="backdrop profile-backdrop" style={ownerBackdrop} />}
        <div className="profile">
          <div className="cover" style={{ backgroundImage: user.cover ? `url(${user.cover})` : undefined }}>
            <Link to={`/avatar/${user.username}`} title="Открыть аватарку как фотографию">
              <Avatar user={user} size={96} className="profile-avatar" />
            </Link>
          </div>
      <div className="card profile-card">
        {guest && (
          <div className="guest-bar">
            <span className="muted">Вы смотрите профиль как гость — чтобы лайкать, комментировать и делиться, войдите.</span>
            <Link className="btn ghost small-btn" to="/login">Войти</Link>
          </div>
        )}
        <div className="profile-head">
          <h1>{user.displayName || user.username} <AdminBadge user={user} />{user.birthdayToday && <span className="cake-emoji" title="Сегодня день рождения">🎂</span>} {user.memorialized && <span className="memorial-badge">🕊 В памяти</span>}</h1>
          {user.isForeignAgent && (
            <div className="foreign-agent-notice">Этот человек включён в реестр иностранных агентов</div>
          )}
          <div className="muted">@{user.username}
            {user.online
              ? <span className="online-text">в сети</span>
              : <span className="online-text offline">не в сети</span>}
            {!user.online && user.lastSeen && <span className="muted small"> · был(а) в сети: {new Date(user.lastSeen).toLocaleString('ru-RU')}</span>}
            {user.showLocalTime && <span className="muted small"> · локальное время: {new Intl.DateTimeFormat('ru-RU', { timeZone: user.timezone || 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' }).format(new Date())} ({tzLabel(user.timezone)})</span>}
          </div>
          {user.bio && <p>{user.bio}</p>}
          {user.status && <div className="muted profile-status">{user.status}</div>}
          <div className="profile-contacts">
            {aboutFacts.length > 0 && (
              <button className="btn ghost small-btn" onClick={() => setShowAbout(v => !v)}>
                {showAbout ? 'Скрыть анкету' : 'О себе'}
              </button>
            )}
            {user.telegram && (
              <a className="contact-link" href={`https://t.me/${user.telegram}`} target="_blank" rel="noreferrer">✈ {user.telegram}</a>
            )}
            {user.contactEmail && (
              <a className="contact-link" href={`mailto:${user.contactEmail}`}>✉ {user.contactEmail}</a>
            )}
          </div>
          <div className="muted small">Регистрация: {fullDate(user.createdAt)}</div>

          <div className="stats">
            <span><strong>{counts.posts}</strong> постов</span>
            <span><strong>{counts.followers}</strong> подписчиков</span>
            <span><strong>{counts.following}</strong> подписок</span>
            <span><strong>{counts.friends}</strong> друзей</span>
          </div>

          <div className="profile-actions">
            {isOwner ? (
              <Link className="btn ghost" to="/settings">Настройки</Link>
            ) : user.memorialized ? null : (
              <>
                {friendBtn}
                <button className={`btn ${followed ? 'ghost' : 'primary'}`} onClick={needLogin(toggleFollow)}>
                  {followed ? 'Отписаться' : 'Подписаться'}
                </button>
                {msgMode === 'none' ? (
                  <button className="btn ghost" disabled title="Пользователь не принимает сообщения">✉ Не принимает сообщения</button>
                ) : msgMode === 'requests' && msgStatus === 'pending' ? (
                  <button className="btn ghost" disabled>✉ Заявка отправлена</button>
                ) : msgMode === 'requests' && msgStatus === 'rejected' ? (
                  <button className="btn ghost" onClick={needLogin(sendRequest)}>✉ Отправить заявку</button>
                ) : msgMode === 'requests' ? (
                  <button className="btn ghost" onClick={needLogin(sendRequest)}>✉ Написать по заявке</button>
                ) : (
                  <button className="btn ghost" onClick={needLogin(openChat)}>✉ Написать</button>
                )}
              </>
            )}
          </div>
          {chatMsg && <div className="error-text">{chatMsg}</div>}
        </div>
      </div>

      {showAbout && aboutFacts.length > 0 && (
        <div className="card about-card">
          <div className="about-title">О себе</div>
          <div className="about-grid">
            {aboutFacts.map(([k, v]) => (
              <div className="about-item" key={k}>
                <span className="about-label">{k}</span>
                <span className="about-value">{renderFactValue(k, v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && !user.memorialized && <PostForm
        onPosted={() => { setPage(1); setNonce(n => n + 1) }}
      />}

      <h3 className="section-title">Посты</h3>
      {posts.map(p => (
        <PostCard key={p.id} post={p} canDelete={p.authorId === me?.id} trackView
          onUpdated={(u) => setPosts(list => list.map(x => x.id === u.id ? { ...x, ...u } : x))}
          onDelete={async (id) => {
            await postsApi.del(id)
            setNonce(n => n + 1)
          }} />
      ))}
      {posts.length === 0 && <div className="card muted">Пока нет постов.</div>}
      <Pagination page={page} pages={pages} onPage={setPage} />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { adminApi } from '../api.js'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import { timeAgo } from '../utils.js'

const TABS = [
  { id: 'stats', label: 'Статистика' },
  { id: 'settings', label: 'Режимы' },
  { id: 'users', label: 'Пользователи' },
  { id: 'posts', label: 'Посты' },
  { id: 'videos', label: 'Видео' },
  { id: 'comments', label: 'Комментарии' },
  { id: 'communities', label: 'Сообщества' },
  { id: 'reports', label: 'Жалобы' },
  { id: 'ips', label: 'IP-баны' }
]

function StatBox({ label, value }) {
  return (
    <div className="stat-box">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function BlockForm({ u, onDone }) {
  const [dur, setDur] = useState('7d')
  const [reason, setReason] = useState('')
  const submit = async () => {
    await adminApi.block(u.id, dur, reason)
    onDone()
  }
  return (
    <div className="toggle-row">
      <select className="input" value={dur} onChange={e => setDur(e.target.value)}>
        <option value="1h">1 час</option>
        <option value="1d">1 день</option>
        <option value="7d">7 дней</option>
        <option value="30d">30 дней</option>
        <option value="forever">навсегда</option>
      </select>
      <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Причина" />
      <button className="btn primary small-btn" onClick={submit}>Заблокировать</button>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('stats')
  const [appMode, setAppMode] = useState('normal')
  const [regMode, setRegMode] = useState('free')
  const [inviteKey, setInviteKey] = useState('')
  const [sidebarAd, setSidebarAd] = useState({ enabled: false, image: '', title: '', desc: '', link: '' })
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
  const [videos, setVideos] = useState([])
  const [comments, setComments] = useState([])
  const [communities, setCommunities] = useState([])
  const [reports, setReports] = useState([])
  const [ips, setIps] = useState([])
  const [blockedForm, setBlockedForm] = useState({})
  const [respText, setRespText] = useState({})
  const [delContent, setDelContent] = useState({})
  const [ipForm, setIpForm] = useState({ ip: '', reason: '', duration: '1h' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2500) }

  const loadSettings = async () => {
    try {
      const s = await adminApi.settings()
      setAppMode(s.appMode); setRegMode(s.regMode); setInviteKey(s.inviteKey)
      setSidebarAd(s.sidebarAd || { enabled: false, image: '', title: '', desc: '', link: '' })
    } catch (ex) { setErr(ex.message) }
  }

  const loadTab = async (id) => {
    setErr('')
    try {
      if (id === 'stats') setStats(await adminApi.stats())
      else if (id === 'users') setUsers(await adminApi.users())
      else if (id === 'posts') setPosts(await adminApi.posts())
      else if (id === 'videos') setVideos(await adminApi.videos())
      else if (id === 'comments') setComments(await adminApi.comments())
      else if (id === 'communities') setCommunities(await adminApi.communities())
      else if (id === 'reports') setReports(await adminApi.reports('all'))
      else if (id === 'ips') setIps(await adminApi.blockedIps())
    } catch (ex) { setErr(ex.message) }
  }

  useEffect(() => { loadSettings() }, [])
  useEffect(() => { if (tab !== 'settings') loadTab(tab) }, [tab])

  const saveSettings = async () => {
    setErr('')
    try {
      const s = await adminApi.updateSettings({ appMode, regMode, inviteKey, sidebarAd })
      setAppMode(s.appMode); setRegMode(s.regMode); setInviteKey(s.inviteKey)
      setSidebarAd(s.sidebarAd || { enabled: false, image: '', title: '', desc: '', link: '' })
      flash('Режимы обновлены.')
    } catch (ex) { setErr(ex.message) }
  }

  const removePost = async (id) => {
    await adminApi.deletePost(id)
    setPosts(list => list.filter(p => p.id !== id))
  }
  const removeComment = async (id) => {
    await adminApi.deleteComment(id)
    setComments(list => list.filter(c => c.id !== id))
  }
  const removeCommunity = async (id) => {
    await adminApi.deleteCommunity(id)
    setCommunities(list => list.filter(c => c.id !== id))
  }

  const fmtPin = (until) => until ? ` · до ${new Date(until).toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}` : ''

  const toggleTester = async (u) => {
    const updated = await adminApi.toggleTester(u.id, !u.isTester)
    setUsers(list => list.map(x => x.id === updated.id ? updated : x))
    flash(updated.isTester ? 'Привилегия тестировщика выдана.' : 'Привилегия тестировщика снята.')
  }

  const toggleVerified = async (u) => {
    const updated = await adminApi.toggleVerified(u.id, !u.verified)
    setUsers(list => list.map(x => x.id === updated.id ? updated : x))
    flash(updated.verified ? 'Галочка верификации выдана.' : 'Галочка верификации снята.')
  }

  const unmute = async (u) => {
    const updated = await adminApi.unmute(u.id)
    setUsers(list => list.map(x => x.id === updated.id ? updated : x))
    flash('Мут снят.')
  }

  const fmtMute = (until) => until ? new Date(until).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''

  const refreshUsers = async () => setUsers(await adminApi.users())

  const toggleModerator = async (u) => {
    await adminApi.toggleModerator(u.id, !u.isModerator)
    await refreshUsers()
    flash(u.isModerator ? 'Модератор снят.' : 'Назначен модератором.')
  }

  const toggleForeignAgent = async (u) => {
    const updated = await adminApi.toggleForeignAgent(u.id, !u.isForeignAgent)
    setUsers(list => list.map(x => x.id === updated.id ? updated : x))
    flash(updated.isForeignAgent ? 'Статус иноагента присвоен.' : 'Статус иноагента снят.')
  }

  const memorialize = async (u) => {
    await adminApi.memorialize(u.id, !u.memorialized)
    await refreshUsers()
    flash(u.memorialized ? 'Аккаунт возвращён.' : 'Аккаунт переведён в мемориал.')
  }

  const toggleBlockForm = (u) => setBlockedForm(f => ({ ...f, [u.id]: !f[u.id] }))

  const unblockUser = async (u) => {
    await adminApi.unblock(u.id)
    await refreshUsers()
    flash('Блокировка снята.')
  }

  const askMute = async (u, type) => {
    const dur = window.prompt('Срок мута контента (1h, 1d, 7d, 30d, forever):', '7d')
    if (!dur) return
    await adminApi.muteContent(u.id, type, dur)
    await refreshUsers()
    flash('Мут контента установлен.')
  }

  const unmuteContent = async (u, type) => {
    await adminApi.unmuteContent(u.id, type)
    await refreshUsers()
    flash('Мут контента снят.')
  }

  const respondReport = async (r, status) => {
    await adminApi.respondReport(r.id, { status, response: respText[r.id] || '', deleteContent: !!delContent[r.id] })
    setReports(await adminApi.reports('all'))
    setRespText(t => ({ ...t, [r.id]: '' }))
    setDelContent(d => ({ ...d, [r.id]: false }))
    flash(status === 'approved' ? 'Жалоба принята.' : 'Жалоба отклонена.')
  }

  const deleteReport = async (id) => {
    await adminApi.deleteReport(id)
    setReports(await adminApi.reports('all'))
    flash('Жалоба удалена.')
  }

  const addIp = async () => {
    if (!ipForm.ip) return
    await adminApi.addBlockedIp({ ip: ipForm.ip, reason: ipForm.reason, duration: ipForm.duration })
    setIps(await adminApi.blockedIps())
    setIpForm({ ip: '', reason: '', duration: '1h' })
    flash('IP заблокирован.')
  }

  const removeIp = async (ip) => {
    await adminApi.removeBlockedIp(ip)
    setIps(await adminApi.blockedIps())
    flash('Блокировка IP снята.')
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Админ-панель</div>

        <div className="card admin-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        {tab === 'stats' && stats && (
          <div className="settings_section">
            <div className="card">
              <div className="settings_title">За всё время</div>
              <div className="stats-grid">
                <StatBox label="Пользователей" value={stats.totals.users} />
                <StatBox label="Постов" value={stats.totals.posts} />
                <StatBox label="Комментариев" value={stats.totals.comments} />
                <StatBox label="Сообществ" value={stats.totals.communities} />
                <StatBox label="Сообщений" value={stats.totals.messages} />
                <StatBox label="Реакций" value={stats.totals.reactions} />
                <StatBox label="Подписок" value={stats.totals.follows} />
              </div>
            </div>

            <div className="card">
              <div className="settings_title">За сегодня</div>
              <div className="stats-grid">
                <StatBox label="Регистраций" value={stats.today.users} />
                <StatBox label="Постов" value={stats.today.posts} />
                <StatBox label="Комментариев" value={stats.today.comments} />
                <StatBox label="Сообществ" value={stats.today.communities} />
                <StatBox label="Сообщений" value={stats.today.messages} />
              </div>
            </div>

            <div className="card">
              <div className="settings_title">Последние регистрации</div>
              {stats.recentUsers.length === 0 && <div className="muted">Пока никто не зарегистрировался.</div>}
              {stats.recentUsers.map(u => (
                <div className="mod-row" key={u.id}>
                  <Avatar user={u} size={32} />
                  <div className="mod-main">
                    <Link to={`/u/${u.username}`} className="author-name">{u.displayName || u.username}</Link>
                    <AdminBadge user={u} />
                    <div className="muted">@{u.username} · {timeAgo(u.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="settings_title">Последние посты</div>
              {stats.recentPosts.length === 0 && <div className="muted">Постов ещё нет.</div>}
              {stats.recentPosts.map(p => (
                <div className="mod-row" key={p.id}>
                  <Avatar user={p.author} size={32} />
                  <div className="mod-main">
                    <Link to={`/u/${p.author.username}`} className="author-name">{p.author.displayName || p.author.username}</Link>
                    <AdminBadge user={p.author} />
                    <div className="mod-body">{p.body || <span className="muted">(вложение)</span>}</div>
                    <span className="muted small">{timeAgo(p.createdAt)}</span>
                  </div>
                  <Link to={`/post/${p.id}`} className="btn ghost small-btn">Открыть</Link>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="settings_title">Последние сообщества</div>
              {stats.recentCommunities.length === 0 && <div className="muted">Сообществ ещё нет.</div>}
              {stats.recentCommunities.map(c => (
                <div className="mod-row" key={c.id}>
                  {c.owner?.avatar ? <img src={c.owner.avatar} className="comm-avatar" alt="" /> : <div className="comm-avatar placeholder">{(c.name || '?').charAt(0)}</div>}
                  <div className="mod-main">
                    <Link to={`/c/${c.id}`} className="author-name">{c.name}</Link>
                    <div className="muted">создал {c.owner?.displayName || c.owner?.username}</div>
                    <AdminBadge user={c.owner} />
                    <span className="muted small">· {timeAgo(c.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="card settings_section">
            <div className="settings_title">Режим сайта</div>
            <p className="muted small">«Штатный» — всё работает. «Тех. работы» — сайт отключается для всех, кроме администраторов.</p>
            <div className="theme-options">
              <label className={`theme-option ${appMode === 'normal' ? 'selected' : ''}`}>
                <input type="radio" name="appMode" checked={appMode === 'normal'} onChange={() => setAppMode('normal')} />
                Штатный
              </label>
              <label className={`theme-option ${appMode === 'maintenance' ? 'selected' : ''}`}>
                <input type="radio" name="appMode" checked={appMode === 'maintenance'} onChange={() => setAppMode('maintenance')} />
                Тех. работы
              </label>
            </div>

            <div className="settings_title">Регистрация</div>
            <p className="muted small">«Свободный» — зарегистрироваться может любой. «Приглашения» — нужен ключ.</p>
            <div className="theme-options">
              <label className={`theme-option ${regMode === 'free' ? 'selected' : ''}`}>
                <input type="radio" name="regMode" checked={regMode === 'free'} onChange={() => setRegMode('free')} />
                Свободный
              </label>
              <label className={`theme-option ${regMode === 'invite' ? 'selected' : ''}`}>
                <input type="radio" name="regMode" checked={regMode === 'invite'} onChange={() => setRegMode('invite')} />
                По приглашениям
              </label>
            </div>

            <label className="field-label">Ключ приглашения</label>
            <input className="input" value={inviteKey} onChange={e => setInviteKey(e.target.value)} />

            <div className="settings_title">Реклама в сайдбаре</div>
            <p className="muted small">Показывается в правой колонке всем пользователям. Оставьте поля пустыми, чтобы отключить.</p>
            <div className="toggle-row">
              <label className="muted small">
                <input type="checkbox" checked={!!sidebarAd.enabled} onChange={e => setSidebarAd(a => ({ ...a, enabled: e.target.checked }))} />
                {' '}Показывать рекламу
              </label>
            </div>
            <label className="field-label">Картинка (URL)</label>
            <input className="input" value={sidebarAd.image || ''} onChange={e => setSidebarAd(a => ({ ...a, image: e.target.value }))} placeholder="https://..." />
            <label className="field-label">Заголовок</label>
            <input className="input" value={sidebarAd.title || ''} onChange={e => setSidebarAd(a => ({ ...a, title: e.target.value }))} placeholder="Название" />
            <label className="field-label">Описание</label>
            <textarea className="textarea" rows={3} value={sidebarAd.desc || ''} onChange={e => setSidebarAd(a => ({ ...a, desc: e.target.value }))} placeholder="Текст под заголовком" />
            <label className="field-label">Ссылка (URL)</label>
            <input className="input" value={sidebarAd.link || ''} onChange={e => setSidebarAd(a => ({ ...a, link: e.target.value }))} placeholder="https://..." />

            <div className="settings_title">Сохранение</div>
            <button className="btn primary" onClick={saveSettings}>Сохранить настройки</button>
          </div>
        )}

        {tab === 'users' && (
          <div className="card settings_section">
            <div className="settings_title">Пользователи ({users.length})</div>
            {users.length === 0 && <div className="muted">Пользователей нет.</div>}
            <div className="admin-users-list">
              {users.map(u => {
                const muted = u.mutedUntil && new Date(u.mutedUntil) > new Date()
                return (
                  <div className={`admin-user ${u.blockedUntil ? 'banned' : ''} ${muted ? 'muted-user' : ''}`} key={u.id}>
                    <div className="admin-user-head">
                      <Avatar user={u} size={40} />
                      <div className="mod-main">
                        <div className="author-line">
                          <Link to={`/u/${u.username}`} className="author-name">{u.displayName || u.username}</Link>
                          <AdminBadge user={u} />
                          {u.isAdmin && <span className="role-chip">Админ</span>}
                          {u.isModerator && <span className="role-chip mod">Модератор</span>}
                          {u.isTester && <span className="role-chip tester">Тестировщик</span>}
                          {u.verified && <span className="role-chip verified">Проверен</span>}
                          {u.isForeignAgent && <span className="role-chip foreign">Иноагент</span>}
                          {u.memorialized && <span className="role-chip memorial">🕊 Мемориал</span>}
                        </div>
                        <div className="muted small">@{u.username} · {timeAgo(u.createdAt)}</div>
                        {muted && <div className="muted small">🔇 в муте до {fmtMute(u.mutedUntil)}</div>}
                        {u.blockedUntil && <div className="muted small danger-text">⛔ заблокирован до {new Date(u.blockedUntil).toLocaleString('ru-RU')}{u.blockedReason ? ` — ${u.blockedReason}` : ''}</div>}
                      </div>
                    </div>
                    <div className="admin-user-actions">
                      <div className="btn-group">
                        <button
                          className={`btn ${u.isModerator ? 'primary' : 'ghost'} small-btn`}
                          onClick={() => toggleModerator(u)}
                          title="Выдать или снять права модератора">
                          {u.isModerator ? 'Снять модератора' : 'Модератор'}
                        </button>
                        <button
                          className={`btn ${u.isTester ? 'primary' : 'ghost'} small-btn`}
                          onClick={() => toggleTester(u)}
                          title="Выдать или снять привилегию тестировщика (обходит тех. работы)">
                          {u.isTester ? '✓ Тестировщик' : 'Тестировщик'}
                        </button>
                        <button
                          className={`btn ${u.verified ? 'primary' : 'ghost'} small-btn`}
                          onClick={() => toggleVerified(u)}
                          title="Выдать или снять галочку верификации (официальный пользователь)">
                          {u.verified ? '✓ Проверен' : 'Верификация'}
                        </button>
                        <button
                          className={`btn ${u.isForeignAgent ? 'primary' : 'ghost'} small-btn`}
                          onClick={() => toggleForeignAgent(u)}
                          title="Присвоить или снять статус иностранного агента">
                          {u.isForeignAgent ? 'Снять иноагента' : 'Иноагент'}
                        </button>
                        <button
                          className={`btn ${u.memorialized ? 'primary' : 'ghost'} small-btn`}
                          onClick={() => memorialize(u)}
                          title="Перевести аккаунт в мемориал или вернуть">
                          {u.memorialized ? 'Вернуть' : 'Мемориал'}
                        </button>
                      </div>
                      <div className="btn-group">
                        {muted && (
                          <button className="btn ghost small-btn" onClick={() => unmute(u)}>Снять мут</button>
                        )}
                        <button className="btn ghost small-btn" onClick={() => toggleBlockForm(u)}>
                          {u.blockedUntil ? 'Изменить блок' : 'Заблокировать'}
                        </button>
                        {u.blockedUntil && (
                          <button className="btn ghost small-btn" onClick={() => unblockUser(u)}>Разблокировать</button>
                        )}
                        {blockedForm[u.id] && <BlockForm u={u} onDone={refreshUsers} />}
                      </div>
                      <div className="content-mute-row">
                        <span className="muted small">Мут контента:</span>
                        {[['posts', 'Посты'], ['audios', 'Аудио'], ['videos', 'Видео']].map(([type, label]) => (
                          <span className="content-mute-chip" key={type}>
                            <button className="btn ghost small-btn" onClick={() => askMute(u, type)}>{label}</button>
                            {u['mute' + type.charAt(0).toUpperCase() + type.slice(1) + 'Until'] && (
                              <button className="btn ghost small-btn" onClick={() => unmuteContent(u, type)}>снять</button>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'posts' && (
          <div className="card settings_section">
            {posts.length === 0 && <div className="muted">Постов нет.</div>}
            {posts.map(p => (
              <div className="mod-row" key={p.id}>
                <Avatar user={p.author} size={32} />
                <div className="mod-main">
                  <Link to={`/u/${p.author.username}`} className="author-name">{p.author.displayName || p.author.username}</Link>
                  <AdminBadge user={p.author} />
                  <div className="mod-body">{p.body}</div>
                  <span className="muted small">
                    {timeAgo(p.createdAt)}
                    {p.pinned && <span className="pinned-badge">📌 Закреплено{fmtPin(p.pinnedUntil)}</span>}
                  </span>
                </div>
                <Link to={`/post/${p.id}`} className="btn ghost small-btn">Открыть</Link>
                <button className="btn danger small-btn" onClick={() => removePost(p.id)}>Удалить</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'videos' && (
          <div className="card settings_section">
            {videos.length === 0 && <div className="muted">Видео нет.</div>}
            {videos.map(v => (
              <div className="mod-row" key={v.id}>
                <Avatar user={v.author} size={32} />
                <div className="mod-main">
                  <Link to={`/u/${v.author.username}`} className="author-name">{v.author.displayName || v.author.username}</Link>
                  <AdminBadge user={v.author} />
                  <div className="mod-body">{v.title} {!v.published && <span className="muted small">(не опубликовано)</span>}</div>
                  <span className="muted small">
                    {timeAgo(v.createdAt)}
                    {v.pinned && <span className="pinned-badge">📌 Закреплено{fmtPin(v.pinnedUntil)}</span>}
                  </span>
                </div>
                <Link to={`/video/${v.id}`} className="btn ghost small-btn">Открыть</Link>
              </div>
            ))}
          </div>
        )}

        {tab === 'comments' && (
          <div className="card settings_section">
            {comments.length === 0 && <div className="muted">Комментариев нет.</div>}
            {comments.map(c => (
              <div className="mod-row" key={c.id}>
                <Avatar user={c.author} size={32} />
                <div className="mod-main">
                  <Link to={`/u/${c.author.username}`} className="author-name">{c.author.displayName || c.author.username}</Link>
                  <AdminBadge user={c.author} />
                  <div className="mod-body">{c.body}</div>
                  <span className="muted small">к посту: {c.postBody || c.postId} · {timeAgo(c.createdAt)}</span>
                </div>
                <button className="btn danger small-btn" onClick={() => removeComment(c.id)}>Удалить</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'communities' && (
          <div className="card settings_section">
            {communities.length === 0 && <div className="muted">Сообществ нет.</div>}
            {communities.map(c => (
              <div className="mod-row" key={c.id}>
                {c.avatar ? <img src={c.avatar} className="comm-avatar" alt="" /> : <div className="comm-avatar placeholder">{c.name.charAt(0)}</div>}
                <div className="mod-main">
                  <Link to={`/c/${c.id}`} className="author-name">{c.name}</Link>
                  <div className="mod-body">{c.description}</div>
                  <span className="muted small">владелец: {c.owner.displayName || c.owner.username}</span>
                </div>
                <button className="btn danger small-btn" onClick={() => removeCommunity(c.id)}>Удалить</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'reports' && (
          <div className="card settings_section">
            {reports.length === 0 && <div className="muted">Жалоб нет.</div>}
            {reports.map(r => {
              const st = r.status === 'approved' ? 'Принята' : r.status === 'dismissed' ? 'Отклонена' : 'Ожидает'
              return (
                <div className="mod-row" key={r.id}>
                  <div className="mod-main">
                    <div className="mod-body">
                      {r.targetType} · {r.target?.text || '#' + r.targetId}
                      {r.target?.author && <span className="muted"> · автор: {r.target.author}</span>}
                    </div>
                    <div className="muted small">Жалоба: {r.reason}{r.detail && ` — ${r.detail}`}</div>
                    <div className="muted small">
                      От {r.reporter?.displayName || r.reporter?.username} · {timeAgo(r.createdAt)} ·{' '}
                      <span className={r.status === 'approved' ? 'success-text' : r.status === 'dismissed' ? 'error-text' : 'muted'}>{st}</span>
                    </div>
                    <textarea
                      className="textarea"
                      value={respText[r.id] || ''}
                      onChange={e => setRespText(t => ({ ...t, [r.id]: e.target.value }))}
                      placeholder="Ответ модератора"
                    />
                    <div className="toggle-row">
                      <label className="muted small">
                        <input type="checkbox" checked={!!delContent[r.id]} onChange={e => setDelContent(d => ({ ...d, [r.id]: e.target.checked }))} />
                        {' '}Удалить контент
                      </label>
                      <button className="btn primary small-btn" onClick={() => respondReport(r, 'approved')}>Принять</button>
                      <button className="btn ghost small-btn" onClick={() => respondReport(r, 'dismissed')}>Отклонить</button>
                      <button className="btn danger small-btn" onClick={() => deleteReport(r.id)}>Удалить жалобу</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'ips' && (
          <div className="card settings_section">
            <div className="toggle-row">
              <input className="input" placeholder="IP" value={ipForm.ip} onChange={e => setIpForm(f => ({ ...f, ip: e.target.value }))} />
              <input className="input" placeholder="Причина" value={ipForm.reason} onChange={e => setIpForm(f => ({ ...f, reason: e.target.value }))} />
              <select className="input" value={ipForm.duration} onChange={e => setIpForm(f => ({ ...f, duration: e.target.value }))}>
                <option value="1h">1 час</option>
                <option value="1d">1 день</option>
                <option value="7d">7 дней</option>
                <option value="30d">30 дней</option>
                <option value="forever">навсегда</option>
              </select>
              <button className="btn primary small-btn" onClick={addIp}>Заблокировать IP</button>
            </div>
            {ips.length === 0 && <div className="muted">Заблокированных IP нет.</div>}
            {ips.map(ip => (
              <div className="mod-row" key={ip.ip}>
                <div className="mod-main">
                  <div className="mod-body">{ip.ip}{ip.reason && <span className="muted"> — {ip.reason}</span>}</div>
                  <div className="muted small">
                    заблокирован {timeAgo(ip.createdAt)}
                    {ip.expiresAt && ` · до ${new Date(ip.expiresAt).toLocaleString('ru-RU')}`}
                  </div>
                </div>
                <button className="btn danger small-btn" onClick={() => removeIp(ip.ip)}>Снять</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

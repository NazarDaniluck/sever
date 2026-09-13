import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { communitiesApi, postsApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { backdropToStyle, BACKDROPS } from '../context/SettingsContext.jsx'
import PostCard from '../components/PostCard.jsx'
import PostForm from '../components/PostForm.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'

const SET_TABS = [
  { id: 'main', label: 'Основное' },
  { id: 'backdrop', label: 'Задник' },
  { id: 'access', label: 'Доступ' }
]

export default function Community() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user: me } = useAuth()
  const [data, setData] = useState(null)
  const [posts, setPosts] = useState([])
  const [edit, setEdit] = useState(false)
  const [setTab, setSetTab] = useState('main')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [desc, setDesc] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [joinMode, setJoinMode] = useState('open')
  const [postMode, setPostMode] = useState('member')
  const [postAs, setPostAs] = useState('user')
  const [hideOwner, setHideOwner] = useState(false)
  const [requests, setRequests] = useState([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setErr('')
    const d = await communitiesApi.get(id)
    setData(d)
    setName(d.community.name)
    setSlug(d.community.slug)
    setDesc(d.community.description || '')
    setJoinMode(d.community.join_mode || 'open')
    setPostMode(d.community.post_mode || 'member')
    setPostAs(d.community.post_as || 'user')
    setHideOwner(!!d.community.hideOwner)
    const p = await communitiesApi.posts(id)
    setPosts(p)
    if (d.pendingJoinCount > 0 && me?.id === d.owner.id) {
      communitiesApi.joinRequests(id).then(setRequests).catch(() => {})
    } else {
      setRequests([])
    }
  }

  useEffect(() => { load().catch(ex => setErr(ex.message)) }, [id])

  if (err && !data) return <div className="center muted">{err}</div>
  if (!data) return <div className="center muted">Загрузка…</div>

  const { community, isMember, joinRequested, canWrite, canModerate, memberCount, postCount, owner, ownerHidden } = data
  const isOwner = !!me && !!owner && me.id === owner.id
  const guest = !me
  const ownerBackdrop = backdropToStyle(community.backdrop)

  const isCommunityAdmin = !!canModerate

  const needLogin = (fn) => () => guest ? nav('/login') : fn()

  const hiddenOwnerLabel = ownerHidden ? 'Владелец скрыт (сообщество-призрак)' : null

  const toggleJoin = async () => {
    setErr('')
    try {
      const r = await communitiesApi.join(community.id)
      if (r.status === 'pending') {
        setData(d => ({ ...d, joinRequested: true }))
        setMsg('Заявка на вступление отправлена. Ждите решения владельца.')
      } else {
        await load()
      }
    } catch (ex) {
      if (ex.code === 'JOIN_CLOSED') setMsg('Вступление в это сообщество закрыто.')
      else setErr(ex.message)
    }
  }

  const leave = async () => {
    setErr('')
    await communitiesApi.leave(community.id)
    await load()
  }

  const respondJoin = async (uid, approve) => {
    setErr('')
    try {
      await communitiesApi.respondJoinRequest(community.id, uid, approve)
      await load()
    } catch (ex) { setErr(ex.message) }
  }

  const saveBackdrop = async (b) => {
    setErr('')
    try {
      const c = await communitiesApi.update(community.id, { backdrop: b })
      setData(d => ({ ...d, community: { ...d.community, ...c } }))
      setMsg('Задник сообщества обновлён.')
    } catch (ex) { setErr(ex.message) }
  }

  const saveSettings = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      let c = community
      if (name.trim() !== community.name || slug.trim() !== community.slug || desc !== (community.description || '')
          || joinMode !== (community.join_mode || 'open') || postMode !== (community.post_mode || 'member')
          || postAs !== (community.post_as || 'user') || hideOwner !== !!community.hideOwner) {
        c = await communitiesApi.update(community.id, { name, slug, description: desc, joinMode, postMode, postAs, hideOwner })
      }
      if (avatarFile) {
        const fd = new FormData()
        fd.append('avatar', avatarFile)
        c = await communitiesApi.uploadAvatar(community.id, fd)
      }
      if (coverFile) {
        const fd = new FormData()
        fd.append('cover', coverFile)
        c = await communitiesApi.uploadCover(community.id, fd)
      }
      setData(d => ({ ...d, community: { ...d.community, ...c } }))
      setAvatarFile(null); setCoverFile(null); setEdit(false)
      setMsg('Настройки сообщества сохранены.')
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  const joinLabel = joinMode === 'closed' ? 'Вступление закрыто'
    : joinMode === 'request' ? 'Вступление по заявке'
    : 'Открытое сообщество'

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        {(ownerBackdrop.backgroundImage || ownerBackdrop.background) && <div className="backdrop profile-backdrop community-backdrop" style={ownerBackdrop} />}
        <div className="profile">
          <div className="cover" style={{ backgroundImage: community.cover ? `url(${community.cover})` : undefined }}>
            {community.avatar
              ? <img src={community.avatar} className="comm-page-avatar" alt="" />
              : <div className="comm-page-avatar placeholder">{community.name.charAt(0)}</div>}
          </div>
          <div className="card profile-card">
            {msg && <div className="success-text">{msg}</div>}
            <div className="profile-head">
              <h1>{community.name}</h1>
              <div className="muted">@{community.slug} · {joinLabel}</div>
              {community.description && <p>{community.description}</p>}
              {ownerHidden
                ? <div className="muted small">{hiddenOwnerLabel}</div>
                : <div className="muted small">Создал(а) <Link to={`/u/${owner.username}`}>@{owner.username}</Link></div>}

              <div className="stats">
                <span><strong>{postCount}</strong> записей</span>
                <span><strong>{memberCount}</strong> участников</span>
              </div>

              <div className="profile-actions">
                <Link to={`/c/${community.id}/members`} className="btn ghost">👥 Участники</Link>
                {isOwner ? (
                  <button className="btn ghost" onClick={() => setEdit(v => !v)}>{edit ? 'Отмена' : '⚙ Настроить'}</button>
                ) : (
                  <>
                    {isMember ? (
                      <button className="btn ghost" onClick={needLogin(leave)}>Покинуть</button>
                    ) : joinRequested ? (
                      <button className="btn ghost" disabled>Заявка отправлена</button>
                    ) : joinMode === 'closed' ? (
                      <button className="btn ghost" disabled title="Вступление закрыто">Вступление закрыто</button>
                    ) : (
                      <button className="btn primary" onClick={needLogin(toggleJoin)}>
                        {joinMode === 'request' ? 'Отправить заявку' : 'Вступить'}
                      </button>
                    )}
                  </>
                )}
              </div>
              {err && <div className="error-text">{err}</div>}
            </div>
          </div>

          {isOwner && edit && (
            <form className="card" onSubmit={saveSettings}>
              <div className="settings_title">Настройки сообщества</div>
              <div className="admin-tabs sub">
                {SET_TABS.map(t => (
                  <button type="button" key={t.id} className={`tab ${setTab === t.id ? 'active' : ''}`} onClick={() => setSetTab(t.id)}>{t.label}</button>
                ))}
              </div>

              {setTab === 'main' && (
                <>
                  <div className="settings_title">Оформление</div>
                  <div className="settings_avatar">
                    {avatarFile
                      ? <img src={URL.createObjectURL(avatarFile)} className="comm-avatar" alt="" />
                      : community.avatar ? <img src={community.avatar} className="comm-avatar" alt="" /> : <div className="comm-avatar placeholder">{community.name.charAt(0)}</div>}
                    <label className="btn ghost">
                      📷 Загрузить аватар
                      <input type="file" accept="image/*" hidden onChange={e => setAvatarFile(e.target.files[0])} />
                    </label>
                    <label className="btn ghost">
                      🖼 Обложка
                      <input type="file" accept="image/*" hidden onChange={e => setCoverFile(e.target.files[0])} />
                    </label>
                  </div>

                  <label className="field-label">Название</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} />
                  <label className="field-label">Адрес (юзернейм, без @)</label>
                  <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="my-community" />
                  <p className="muted small">Отображается на странице сообщества как @адрес.</p>
                  <label className="field-label">Описание</label>
                  <textarea className="textarea" rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
                </>
              )}

              {setTab === 'backdrop' && (
                <>
                  <div className="settings_title">Задник страницы</div>
                  <div className="backdrop-grid">
                    <button type="button"
                      className={`backdrop-item ${community.backdrop?.type === 'none' ? 'selected' : ''}`}
                      onClick={() => saveBackdrop({ type: 'none', value: null })}
                    >
                      <div className="back-thumb none">Без</div>
                      <span>Без задника</span>
                    </button>
                    {BACKDROPS.map(b => (
                      <button key={b.id} type="button"
                        className={`backdrop-item ${community.backdrop?.type === 'preset' && community.backdrop?.value === b.id ? 'selected' : ''}`}
                        onClick={() => saveBackdrop({ type: 'preset', value: b.id })}
                      >
                        <div className="back-thumb" style={{ background: b.css }} />
                        <span>{b.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {setTab === 'access' && (
                <>
                  <div className="settings_title">Кто может вступать</div>
                  <div className="theme-options">
                    {[
                      { id: 'open', label: 'Все' },
                      { id: 'request', label: 'По заявке' },
                      { id: 'closed', label: 'Никто' }
                    ].map(o => (
                      <label key={o.id} className={`theme-option ${joinMode === o.id ? 'selected' : ''}`}>
                        <input type="radio" name="joinMode" checked={joinMode === o.id} onChange={() => setJoinMode(o.id)} />
                        {o.label}
                      </label>
                    ))}
                  </div>

                  <div className="settings_title">Кто может писать записи</div>
                  <div className="theme-options">
                    {[
                      { id: 'member', label: 'Все участники' },
                      { id: 'owner', label: 'Только владелец и администраторы' }
                    ].map(o => (
                      <label key={o.id} className={`theme-option ${postMode === o.id ? 'selected' : ''}`}>
                        <input type="radio" name="postMode" checked={postMode === o.id} onChange={() => setPostMode(o.id)} />
                        {o.label}
                      </label>
                    ))}
                  </div>

                  <div className="settings_title">От имени кого публиковать записи</div>
                  <div className="theme-options">
                    {[
                      { id: 'user', label: 'От своей страницы' },
                      { id: 'community', label: 'От имени сообщества' }
                    ].map(o => (
                      <label key={o.id} className={`theme-option ${postAs === o.id ? 'selected' : ''}`}>
                        <input type="radio" name="postAs" checked={postAs === o.id} onChange={() => setPostAs(o.id)} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <p className="muted small">В режиме «от имени сообщества» записи владельца и администраторов публикуются под названием сообщества.</p>

                  <div className="settings_title">Скрыть владельца</div>
                  <div className="toggle-row">
                    <div>
                      <div>Сообщество-призрак</div>
                      <div className="muted small">Скрывать страницу создателя для участников и гостей. Владелец и админы видят всё.</div>
                    </div>
                    <span className={`toggle ${hideOwner ? 'on' : ''}`} onClick={() => setHideOwner(v => !v)}>
                      <span className="toggle-knob" />
                    </span>
                  </div>
                </>
              )}

              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" disabled={saving || !name.trim()}>
                  {saving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
              </div>
            </form>
          )}

          {isOwner && requests.length > 0 && (
            <div className="card">
              <div className="settings_title">Заявки на вступление ({requests.length})</div>
              {requests.map(r => (
                <div className="friend-row" key={r.id}>
                  <Link to={`/u/${r.user.username}`}>
                    <Avatar user={r.user} size={40} />
                  </Link>
                  <div className="friend-info">
                    <Link to={`/u/${r.user.username}`} className="author-name">{r.user.displayName || r.user.username}</Link>
                  </div>
                  <button className="small-btn" onClick={() => respondJoin(r.user.id, true)}>Одобрить</button>
                  <button className="small-btn ghost" onClick={() => respondJoin(r.user.id, false)}>Отклонить</button>
                </div>
              ))}
            </div>
          )}

          {canWrite && (
            <PostForm communityId={community.id} compact placeholder="О чём расскажете сообществу?" onPosted={load} />
          )}

          <h3 className="section-title">Записи</h3>
          {posts.map(p => (
            <PostCard key={p.id} post={p} canDelete={isCommunityAdmin || p.authorId === me?.id} trackView
              canPin={isCommunityAdmin}
              pinAction={isCommunityAdmin ? (until) => communitiesApi.pinCommunityPost(community.id, p.id, until) : undefined}
              onUpdated={(u) => setPosts(list => list.map(x => x.id === u.id ? { ...x, ...u } : x))}
              onDelete={async (pid) => {
                if (isCommunityAdmin) await communitiesApi.deleteCommunityPost(community.id, pid)
                else await postsApi.del(pid)
                setPosts(list => list.filter(x => x.id !== pid))
              }} />
          ))}
          {posts.length === 0 && <div className="card muted">В сообществе пока нет записей.</div>}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { groupsApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import AdminBadge from '../components/AdminBadge.jsx'
import BodyText from '../components/BodyText.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import AttachMenu from '../components/AttachMenu.jsx'
import VideoModal from '../components/VideoModal.jsx'
import { timeAgo } from '../utils.js'

const ACCESS_LABELS = {
  open: '🌐 Открытая группа',
  link: '🔗 По ссылке',
  closed: '🔒 Закрытая группа'
}
const ACCESS_HINTS = {
  open: 'Любой может найти группу и вступить',
  link: 'Группа не видна в списках — вступить можно только по ссылке',
  closed: 'Вступление закрыто. Участников добавляют владелец и администраторы'
}
const MAX_LEN = 512
const MEDIA = ['photo', 'video']

export default function GroupPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user: me } = useAuth()
  const [data, setData] = useState(null)
  const [roles, setRoles] = useState({})
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [socket, setSocket] = useState(null)
  const [limitDraft, setLimitDraft] = useState(null)
  const [pending, setPending] = useState([])
  const [videoOpen, setVideoOpen] = useState(null)
  const bottomRef = useRef(null)

  // ---- Данные группы ----
  const load = async () => {
    setErr('')
    const d = await groupsApi.get(id)
    setData(d)
    const map = {}
    d.members.forEach(m => { map[m.id] = m.groupRole || (m.id === d.owner.id ? 'owner' : 'member') })
    if (d.group.myRole === 'admin' && me) map[me.id] = 'admin'
    setRoles(map)
  }

  // ---- Чат ----
  const loadMessages = async () => {
    if (!data?.isMember) return
    try {
      const list = await groupsApi.messages(id)
      setMessages(list)
      setTimeout(() => bottomRef.current?.scrollIntoView(), 0)
    } catch (ex) { setErr(ex.message) }
  }

  useEffect(() => {
    load().then(() => loadMessages()).catch(ex => setErr(ex.message))
    const s = io('/', { auth: { token: localStorage.getItem('sever_token') } })
    setSocket(s)
    if (data?.isMember) s.emit('subscribe-group', Number(id))
    s.on('group:message', (m) => {
      if (Number(m.groupId) === Number(id)) {
        setMessages(list => list.some(x => Number(x.id) === Number(m.id)) ? list : [...list, m])
        setTimeout(() => bottomRef.current?.scrollIntoView(), 0)
      }
    })
    s.on('group:update', () => load().catch(() => {}))
    return () => { s.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Подписка на комнату, когда стали участником
  useEffect(() => {
    if (socket && data?.isMember) {
      socket.emit('subscribe-group', Number(id))
      loadMessages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, data?.isMember])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView(), 0)
  }, [messages.length])

  if (!data) {
    return (
      <div className="layout">
        <Sidebar />
        <div className="column main-col">
          <div className="center muted">{err || 'Загрузка…'}</div>
        </div>
      </div>
    )
  }

  const { group, isMember, memberCount, owner, members, canJoin, isFull, invite } = data
  const myRole = group.myRole
  const needLogin = (fn) => () => me ? fn() : nav('/login')

  const roleOf = (u) => roles[u.id] || (u.id === owner.id ? 'owner' : 'member')
  const canManage = (u) => {
    if (u.id === owner.id) return false
    if (myRole === 'owner') return true
    if (myRole === 'admin') return roleOf(u) === 'member'
    return false
  }

  const join = async () => {
    setErr('')
    try {
      const q = new URLSearchParams(window.location.search)
      await groupsApi.join(id, q.get('invite') || undefined)
      await load()
      setMsg('Вы вступили в группу')
    } catch (ex) { setErr(ex.message) }
  }

  const leave = async () => {
    setErr('')
    try { await groupsApi.leave(id); setMessages([]); await load() }
    catch (ex) { setErr(ex.message) }
  }

  const remove = async () => {
    if (!window.confirm('Удалить группу? Это действие необратимо.')) return
    setErr('')
    try { await groupsApi.remove(id); nav('/groups') }
    catch (ex) { setErr(ex.message) }
  }

  const toggleRole = async (u) => {
    setErr('')
    try {
      await groupsApi.setRole(id, u.id, roleOf(u) !== 'admin')
      await load()
    } catch (ex) { setErr(ex.message) }
  }

  const kick = async (u) => {
    if (!window.confirm(`Исключить участника ${u.displayName || u.username} из группы?`)) return
    setErr('')
    try { await groupsApi.kick(id, u.id); await load() }
    catch (ex) { setErr(ex.message) }
  }

  const inviteMember = async (e) => {
    e.preventDefault()
    const username = new FormData(e.target).get('username')
    if (!username) return
    setErr('')
    try {
      const r = await groupsApi.invite(id, username)
      e.target.reset()
      setMsg(r.status === 'already' ? 'Пользователь уже в группе' : r.status === 'pending' ? 'Приглашение уже отправлено' : 'Приглашение отправлено')
    } catch (ex) { setErr(ex.message) }
  }

  const acceptInvite = async () => {
    setErr('')
    try { await groupsApi.acceptInvite(id); setMsg('Вы вступили в группу'); await load() }
    catch (ex) { setErr(ex.message) }
  }

  const declineInvite = async () => {
    setErr('')
    try { await groupsApi.declineInvite(id); setMsg('Приглашение отклонено'); await load() }
    catch (ex) { setErr(ex.message) }
  }

  const inviteLink = () => group.inviteToken ? `${window.location.origin}/groups/${id}?invite=${group.inviteToken}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink())
      setMsg('Ссылка скопирована')
    } catch { setErr('Не удалось скопировать ссылку') }
  }

  const regenerateLink = async () => {
    if (!window.confirm('Сменить ссылку-приглашение? Старая ссылка перестанет действовать.')) return
    setErr('')
    try { await groupsApi.regenerateLink(id); await load(); setMsg('Ссылка-приглашение обновлена') }
    catch (ex) { setErr(ex.message) }
  }

  const updateAccess = async (mode) => {
    if (group.access === mode) return
    setErr(''); setMsg('')
    try { await groupsApi.update(id, { access: mode }); await load(); setMsg('Режим доступа обновлён') }
    catch (ex) { setErr(ex.message) }
  }

  const updateLimit = async (v) => {
    const n = Number.parseInt(v, 10)
    if (!isFinite(n) || n < 2) return setMsg('Лимит участников должен быть не меньше 2')
    setErr(''); setMsg('')
    try { await groupsApi.update(id, { memberLimit: n }); setLimitDraft(null); await load(); setMsg('Лимит участников обновлён') }
    catch (ex) { setErr(ex.message) }
  }

  const send = async (e) => {
    e.preventDefault()
    if ((!text.trim() && !pending.length) || sending) return
    setSending(true); setErr('')
    try {
      const meta = pending.map(p => p.lib ? { type: p.type, lib: p.lib } : null).filter(Boolean)
      const m = await groupsApi.sendMessageWithAttachments(id, text.trim(), meta)
      setMessages(list => list.some(x => Number(x.id) === Number(m.id)) ? list : [...list, m])
      setText(''); setPending([])
      setTimeout(() => bottomRef.current?.scrollIntoView(), 0)
    } catch (ex) { setErr(ex.message) }
    finally { setSending(false) }
  }

  const pick = (type, file) => {
    setErr('')
    setPending(list => [...list.filter(p => !MEDIA.includes(p.type)), { id: `t${Date.now()}-${Math.random()}`, type, file }])
  }

  const pickFromLib = (type, lib) => {
    if (!lib) return
    setErr('')
    setPending(list => [...list.filter(p => !MEDIA.includes(p.type)), { id: `t${Date.now()}-${Math.random()}`, type, lib }])
  }

  const removePending = (pid) => setPending(list => list.filter(p => p.id !== pid))

  const canModerate = myRole === 'owner' || myRole === 'admin'
  const hasLinkToken = new URLSearchParams(window.location.search).get('invite') !== null
  const canShowJoin = !isMember && !invite && !isFull && (group.access === 'open' || (group.access === 'link' && hasLinkToken))

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="group-chat">
          <aside className="group-side card">
            <div className="group-side-head">
              <Avatar user={{ avatar: group.avatar, name: group.name }} size={56} />
              <div className="group-side-info">
                <strong>{group.name}</strong>
                <div className="muted small">{memberCount} / {group.memberLimit} участников</div>
                <span className={`group-access access-${group.access}`}>{ACCESS_LABELS[group.access]}</span>
              </div>
            </div>

            {msg && <div className="success-text">{msg}</div>}
            {err && <div className="error-text">{err}</div>}

            {group.description && <p className="muted group-desc">{group.description}</p>}

            <div className="group-side-actions">
              {!isMember && invite ? (
                <>
                  <div className="muted small group-invite-prompt">Вас пригласили в эту группу</div>
                  <div className="group-invite-btns">
                    <button className="btn primary" onClick={acceptInvite}>Принять приглашение</button>
                    <button className="btn ghost" onClick={declineInvite}>Отклонить</button>
                  </div>
                </>
              ) : !isMember ? (
                isFull
                  ? <div className="error-text">Группа заполнена (лимит {group.memberLimit} участников)</div>
                  : canShowJoin
                    ? <button className="btn primary" onClick={needLogin(join)}>Вступить в группу</button>
                    : group.access === 'link' && <div className="muted small">Вступить можно только по ссылке-приглашению</div>
              ) : myRole !== 'owner' ? (
                <button className="btn ghost" onClick={needLogin(leave)}>Покинуть группу</button>
              ) : null}
            </div>

            {canModerate && (
              <details className="group-settings">
                <summary>⚙ Настройки доступа</summary>
                <div className="muted small">{ACCESS_HINTS[group.access]}</div>
                <div className="access-options">
                  {['open', 'link', 'closed'].map(mode => (
                    <label key={mode} className={`access-option access-option-${mode} ${group.access === mode ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="access"
                        value={mode}
                        checked={group.access === mode}
                        onChange={() => updateAccess(mode)}
                      />
                      <span className="access-option-title">{ACCESS_LABELS[mode]}</span>
                    </label>
                  ))}
                </div>
                <label className="field-label">Лимит участников ({group.memberLimit})</label>
                <input
                  className="input"
                  type="number"
                  min="2"
                  max="500"
                  value={limitDraft ?? group.memberLimit}
                  onChange={e => setLimitDraft(e.target.value)}
                  onBlur={e => updateLimit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
                />
                <div className="group-link-block">
                  <div className="group-link-title">🔗 Ссылка-приглашение</div>
                  <div className="muted small">
                    {group.access === 'closed'
                      ? 'В закрытые группы вступают только по приглашению. Ссылка действует для открытых групп и групп «по ссылке».'
                      : 'По этой ссылке любой может вступить в группу.'}
                  </div>
                  <div className="group-link-row">
                    <input className="input" readOnly value={inviteLink()} onFocus={e => e.target.select()} />
                  </div>
                  <div className="group-link-actions">
                    <button className="btn small-btn ghost" onClick={copyLink}>Скопировать</button>
                    <button className="btn small-btn ghost" onClick={regenerateLink}>Сменить ссылку</button>
                  </div>
                </div>
              </details>
            )}

            <details className="group-members">
              <summary>👥 Участники ({memberCount})</summary>
              {canModerate && (
                <form className="add-member-row" onSubmit={inviteMember}>
                  <input className="input" name="username" placeholder="Пригласить по @username" />
                  <button className="btn primary small-btn" type="submit">Пригласить</button>
                </form>
              )}
              <div className="member-list">
                {members.map(u => {
                  const role = roleOf(u)
                  const manageable = canManage(u)
                  return (
                    <div className="member-row" key={u.id}>
                      <Link to={`/u/${u.username}`}><Avatar user={u} size={32} /></Link>
                      <div className="member-info">
                        <Link to={`/u/${u.username}`} className="author-name">{u.displayName || u.username}</Link>
                        <div className="muted small">
                          {role === 'owner' ? '👑 владелец' : role === 'admin' ? '🛡 администратор' : 'участник'}
                        </div>
                      </div>
                      {manageable && (
                        <div className="member-actions">
                          {role === 'admin' ? (
                            <button className="small-btn ghost" title="Снять администратора" onClick={() => toggleRole(u)}>Снять</button>
                          ) : (
                            <button className="small-btn" title="Сделать администратором" onClick={() => toggleRole(u)}>Админ</button>
                          )}
                          <button className="small-btn danger" title="Исключить" onClick={() => kick(u)}>✕</button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {members.length === 0 && <div className="muted small">Участников пока нет.</div>}
              </div>
            </details>

            {myRole === 'owner' && (
              <button className="btn danger small-btn group-delete" onClick={remove}>Удалить группу</button>
            )}
          </aside>

          <section className="chat group-chat-main">
            <div className="chat-header">
              <span className="chat-peer">
                <Avatar user={{ avatar: group.avatar, name: group.name }} size={32} />
                <strong>{group.name}</strong>
                <span className="muted small">· {memberCount} / {group.memberLimit}</span>
              </span>
              <span className="muted small group-access-text">{ACCESS_LABELS[group.access]}</span>
            </div>

            {!isMember ? (
              <div className="chat-empty">
                <div className="group-locked">
                  <div className="group-locked-icon">{group.access === 'closed' ? '🔒' : group.access === 'link' ? '🔗' : '🌐'}</div>
                  <p>Вы не участник этой группы.</p>
                  <div className="muted small">{ACCESS_HINTS[group.access]}</div>
                  {invite ? (
                    <div className="group-invite-btns">
                      <button className="btn primary" onClick={acceptInvite}>Принять приглашение</button>
                      <button className="btn ghost" onClick={declineInvite}>Отклонить</button>
                    </div>
                  ) : canShowJoin ? (
                    <button className="btn primary" onClick={needLogin(join)}>Вступить в группу</button>
                  ) : !canJoin && !isMember ? (
                    <div className="error-text">Вступление закрыто — только по приглашению или ссылке</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="chat-messages">
                  {messages.map(m => (
                    <div className={`bubble ${m.sender.id === me?.id ? 'mine' : ''}`} key={m.id}>
                      <div className="bubble-meta">
                        <Link to={`/u/${m.sender.username}`} className="author-name">
                          {m.sender.displayName || m.sender.username}
                        </Link>
                        <AdminBadge user={m.sender} />
                        <span className="muted">{timeAgo(m.createdAt)}</span>
                      </div>
                      {m.body && <p><BodyText text={m.body} /></p>}
                      {(m.attachments || []).map((a, i) => (
                        a.type === 'photo' ? (
                          <img key={i} src={a.url} className="msg-media" alt="" />
                        ) : a.type === 'video' ? (
                          <button
                            key={i}
                            type="button"
                            className="post-video-link"
                            onClick={() => setVideoOpen({ url: a.url, youtube: a.youtube, title: a.name })}
                          >
                            <span className="post-video-thumb">▶</span>
                            <span className="post-video-info">
                              <strong>{a.name || 'Видеозапись'}</strong>
                              <span className="muted small">Смотреть →</span>
                            </span>
                          </button>
                        ) : null
                      ))}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <form className="chat-input" onSubmit={send}>
                  <EmojiPicker value={text} onSelect={setText} />
                  {pending.length > 0 && (
                    <div className="pending-attachments chat-pending">
                      {pending.map(p => (
                        <div className="pending-media" key={p.id}>
                          {p.type === 'photo' && (p.lib ? <img src={p.lib.url} alt="" /> : <img src={URL.createObjectURL(p.file)} alt="" />)}
                          {p.type !== 'photo' && (
                            <span className="pending-chip">{p.lib ? `🎬 ${p.lib.name || 'Видео'}` : p.file?.name}</span>
                          )}
                          <button type="button" className="icon-btn" onClick={() => removePending(p.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <AttachMenu onPick={pick} onPickFromLib={pickFromLib} types={['photo', 'video']} />
                  <input className="input" placeholder="Сообщение…" value={text} maxLength={MAX_LEN}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }} />
                  {text.length > 0 && <span className={`chat-count ${text.length > MAX_LEN - 50 ? 'warn' : ''}`}>{text.length}/{MAX_LEN}</span>}
                  <button className="btn primary" disabled={(!text.trim() && !pending.length) || sending}>{sending ? '…' : '➤'}</button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
      {videoOpen && (
        <VideoModal url={videoOpen.url} youtube={videoOpen.youtube} title={videoOpen.title} onClose={() => setVideoOpen(null)} />
      )}
    </div>
  )
}

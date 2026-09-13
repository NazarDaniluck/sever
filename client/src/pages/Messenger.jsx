import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { messagesApi, usersApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar } from '../components/Navbar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import AttachMenu from '../components/AttachMenu.jsx'
import MessageBubble from '../components/MessageBubble.jsx'
import ForwardModal from '../components/ForwardModal.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import { io } from 'socket.io-client'
import { timeAgo } from '../utils.js'

let uid = 0
const nextId = () => `m${Date.now()}-${uid++}`

const MEDIA = ['photo', 'video']
const MAX_LEN = 512

export default function Messenger() {
  const { conversationId } = useParams()
  const nav = useNavigate()
  const { user: me } = useAuth()
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [socket, setSocket] = useState(null)
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [typing, setTyping] = useState(null)
  const [pending, setPending] = useState([])
  const [requests, setRequests] = useState([])
  const [err, setErr] = useState('')
  const [nsfw, setNsfw] = useState(false)
  const [mutedUntil, setMutedUntil] = useState(me.mutedUntil && new Date(me.mutedUntil) > new Date() ? me.mutedUntil : null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    const s = io('/', { auth: { token: localStorage.getItem('sever_token') } })
    setSocket(s)
    if (conversationId) {
      s.emit('subscribe-conversation', Number(conversationId))
      s.emit('view-conversation', Number(conversationId))
    }
    s.on('message', (msg) => {
      setMessages(list => {
        const existing = list.find(m => (m.id && String(m.id).startsWith('tmp-') && m.body === msg.body) || Number(m.id) === Number(msg.id))
        if (!existing) return [...list, msg]
        return list.map(m => m.id === existing.id ? msg : m)
      })
      if (Number(msg.conversationId) === Number(conversationId)) s.emit('view-conversation', Number(msg.conversationId))
      messagesApi.conversations().then(setConversations)
    })
    s.on('conversation:update', () => messagesApi.conversations().then(setConversations))
    s.on('typing', ({ user }) => setTyping(user))
    s.on('message:updated', (msg) => {
      setMessages(list => list.map(m => Number(m.id) === Number(msg.id) ? msg : m))
    })
    s.on('message:read', ({ messageIds }) => {
      if (!Array.isArray(messageIds)) return
      const ids = new Set(messageIds.map(Number))
      setMessages(list => list.map(m => ids.has(Number(m.id)) && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m))
    })
    s.on('muted', ({ until }) => setMutedUntil(until))
    s.on('message:error', ({ error }) => {
      setErr(error)
      setMessages(list => list.filter(m => !String(m.id).startsWith('tmp-')))
    })
    s.on('presence', ({ userId, online }) => {
      setConversations(list => list.map(c =>
        c.participants.some(p => p.id === userId)
          ? { ...c, participants: c.participants.map(p => p.id === userId ? { ...p, online } : p) }
          : c))
    })
    return () => s.close()
  }, [conversationId])

  const loadConversations = () => messagesApi.conversations().then(setConversations)

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    messagesApi.requests().then(setRequests).catch(() => {})
  }, [])

  useEffect(() => {
    if (conversationId) {
      messagesApi.messages(conversationId).then(setMessages)
    } else {
      setMessages([])
    }
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => {
    if (search.trim()) usersApi.search(search).then(setPeople)
    else setPeople([])
  }, [search])

  const openConv = (id) => {
    nav(`/messages/${id}`)
    setConversations(list => list.map(c => c.id === id ? { ...c, unread: 0 } : c))
  }

  const deleteConversation = async () => {
    if (!window.confirm('Удалить переписку? Это действие нельзя отменить.')) return
    try {
      await messagesApi.delConversation(conversationId)
      await loadConversations()
      nav('/messages')
    } catch { /* ошибка */ }
  }

  const startChat = async (u) => {
    setErr('')
    try {
      const conv = await messagesApi.open(u.id)
      setSearch(''); setPeople([])
      nav(`/messages/${conv.id}`)
    } catch (ex) {
      setSearch(''); setPeople([])
      if (ex.code === 'REQUEST_REQUIRED') {
        try {
          await messagesApi.sendRequest(u.id)
          setErr(`«${u.displayName || u.username}» принимает сообщения по заявке. Заявка отправлена — ждите ответа.`)
        } catch (e2) { setErr(e2.message) }
      } else if (ex.code === 'REQUEST_PENDING') {
        setErr('Заявка этому пользователю уже отправлена — ждите ответа.')
      } else if (ex.code === 'MESSAGES_DISABLED') {
        setErr(`«${u.displayName || u.username}» не принимает сообщения.`)
      } else {
        setErr(ex.message)
      }
    }
  }

  const respondRequest = async (r, approve) => {
    setErr('')
    try {
      await messagesApi.respondRequest(r.from.id, approve)
      setRequests(list => list.filter(x => x.id !== r.id))
    } catch (ex) { setErr(ex.message) }
  }

  const pick = (type, file) => {
    setErr('')
    const isMedia = MEDIA.includes(type)
    const hasSpecial = pending.some(p => !MEDIA.includes(p.type))
    const mediaCount = pending.filter(p => MEDIA.includes(p.type)).length
    if (isMedia) {
      if (hasSpecial) return setErr('Заметку нельзя совмещать с другими вложениями')
      if (mediaCount >= 4) return setErr('Не более 4 медиа-вложений в одном сообщении')
      setPending(list => [...list, { id: nextId(), type, file }])
    } else {
      if (pending.length > 0) return setErr('Заметку можно прикрепить только одну и без других вложений')
      setPending([{ id: nextId(), type, ...(type === 'note' ? { text: '' } : {}) }])
    }
  }

  const pickFromLib = (type, lib) => {
    if (!lib) return
    setErr('')
    const isMedia = MEDIA.includes(type)
    const hasSpecial = pending.some(p => !MEDIA.includes(p.type))
    const mediaCount = pending.filter(p => MEDIA.includes(p.type)).length
    if (isMedia) {
      if (hasSpecial) return setErr('Заметку нельзя совмещать с другими вложениями')
      if (mediaCount >= 4) return setErr('Не более 4 медиа-вложений в одном сообщении')
      setPending(list => [...list, { id: nextId(), type, lib }])
    } else {
      if (pending.length > 0) return setErr('Заметку можно прикрепить только одну и без других вложений')
      setPending([{ id: nextId(), type, lib }])
    }
  }

  const remove = (id) => { setPending(list => list.filter(p => p.id !== id)); setErr('') }
  const patch = (id, upd) => setPending(list => list.map(p => p.id === id ? { ...p, ...upd } : p))

  const canSend = Boolean(text.trim() || pending.length)

  const sendText = () => {
    const optimistic = {
      id: `tmp-${Date.now()}`,
      body: text.trim(),
      conversationId,
      sender: { id: me.id, username: me.username, displayName: me.displayName },
      attachments: [],
      nsfw,
      createdAt: new Date().toISOString(),
      optimistic: true
    }
    setMessages(list => [...list, optimistic])
    setText('')
    setNsfw(false)
    if (socket) socket.emit('send-message', { conversationId: Number(conversationId), body: optimistic.body, nsfw })
  }

  const sendAttached = async () => {
    setErr('')
    const fd = new FormData()
    fd.append('body', text)
    fd.append('nsfw', nsfw ? '1' : '0')
    const meta = pending.map(p => {
      if (p.type === 'note') return { type: 'note', text: p.text }
      if (p.type === 'poll') return { type: 'poll', question: p.question, options: p.options }
      if (p.lib) return { type: p.type, lib: p.lib }
      return null
    }).filter(Boolean)
    fd.append('attachmentMeta', JSON.stringify(meta))
    pending.filter(p => p.file).forEach(p => fd.append('file', p.file))
    try {
      const msg = await messagesApi.sendAttached(conversationId, fd)
      setMessages(list => list.some(m => Number(m.id) === Number(msg.id)) ? list : [...list, msg])
      setText(''); setPending([]); setNsfw(false)
      messagesApi.conversations().then(setConversations)
    } catch (ex) {
      setErr(ex.message)
    }
  }

  const send = async (e) => {
    e.preventDefault()
    if (!canSend || !conversationId) return
    if (pending.length) await sendAttached()
    else sendText()
  }

  const onVoted = (updated) => {
    setMessages(list => list.map(m => Number(m.id) === Number(updated.id) ? updated : m))
  }

  const isMuted = mutedUntil && new Date(mutedUntil) > new Date()
  const peer = conversations.find(c => Number(c.id) === Number(conversationId))?.participants?.[0]
  const fmtMute = isMuted ? new Date(isMuted).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''
  const canModerate = me?.isAdmin || me?.isModerator
  const peerMutedUntil = peer?.mutedUntil && new Date(peer.mutedUntil) > new Date() ? peer.mutedUntil : null
  const fmtPeerMute = peerMutedUntil ? new Date(peerMutedUntil).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''

  const unmutePeer = async () => {
    if (!peer) return
    setErr('')
    try {
      await messagesApi.unmuteUser(peer.id)
      setErr('Мут снят.')
      loadConversations()
    } catch (ex) { setErr(ex.message) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
      <div className={`messenger ${conversationId ? 'has-chat' : ''}`}>
      <aside className="conv-list card">
        <div className="toolbar">
          <input className="input search" placeholder="Поиск людей…" value={search} onChange={e => setSearch(e.target.value)} />
          <Link to="/groups" className="btn ghost small-btn" title="Сообщества и группы">Группы</Link>
        </div>
        {people.length > 0 && (
          <div className="people">
            {people.filter(p => p.id !== me.id).map(p => (
              <button key={p.id} className="conv-row" onClick={() => startChat(p)}>
                <Avatar user={p} size={36} />
                <span>{p.displayName || p.username}</span>
              </button>
            ))}
          </div>
        )}
        <div className="people">
          {conversations.map(c => (
            <button key={c.id} className={`conv-row ${Number(conversationId) === c.id ? 'active' : ''}`} onClick={() => openConv(c.id)}>
              <Link to={`/u/${c.participants[0]?.username || ''}`} onClick={e => e.stopPropagation()} title="Перейти в профиль">
                <Avatar user={c.participants[0]} size={40} />
              </Link>
              <div className="conv-info">
                <Link to={`/u/${c.participants[0]?.username || ''}`} className="author-name" onClick={e => e.stopPropagation()}>
                  {c.participants[0]?.displayName || c.participants[0]?.username}
                </Link>
                <div className="muted small">
                  {c.participants[0]?.online
                    ? <span className="peer-online">в сети</span>
                    : (c.lastMessage || 'Нет сообщений')}
                </div>
              </div>
              <div className="conv-meta">
                {c.unread > 0 && <span className="badge">{c.unread}</span>}
                <div className="muted small">{c.lastAt ? timeAgo(c.lastAt) : ''}</div>
              </div>
            </button>
          ))}
        </div>
        {requests.length > 0 && (
          <div className="req-list card">
            <div className="req-title">Заявки на переписку ({requests.length})</div>
            {requests.map(r => (
              <div className="req-row" key={r.id}>
                <Link to={`/u/${r.from.username}`}>
                  <Avatar user={r.from} size={36} />
                </Link>
                <span className="req-name">{r.from.displayName || r.from.username}</span>
                <span className="req-btns">
                  <button className="req-btn accept" onClick={() => respondRequest(r, true)} title="Одобрить">✓ Одобрить</button>
                  <button className="req-btn decline" onClick={() => respondRequest(r, false)} title="Отклонить">✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {conversations.length === 0 && people.length === 0 && <div className="muted pad">Начните диалог — найдите человека выше.</div>}
      </aside>

      <section className="chat card">
        {conversationId ? (
          <>
            <div className="chat-header">
              {peer ? (
                <span className="chat-peer">
                  <Link to={`/u/${peer.username}`} className="author-name" title="Перейти в профиль">
                    <strong>{peer.displayName || peer.username}</strong>
                  </Link>
                  {peer.online ? <span className="peer-online">в сети</span> : <span className="peer-offline">не в сети</span>}
                </span>
              ) : <strong>Диалог</strong>}
              {typing && <span className="muted typing">печатает…</span>}
              {canModerate && peerMutedUntil && (
                <span className="peer-muted" title={`Собеседник в муте до ${fmtPeerMute}`}>🔇 мут</span>
              )}
              {canModerate && peerMutedUntil && (
                <button className="icon-btn" title="Снять мут с собеседника" onClick={unmutePeer}>🔓 Снять мут</button>
              )}
              <span className="ml-auto" />
              <button className="icon-btn danger" title="Удалить переписку" onClick={deleteConversation}>🗑</button>
            </div>
            <div className="chat-messages">
              {messages.map(m => (
                <MessageBubble key={m.id} m={m} me={me} onVoted={onVoted}
                  onForward={(msg) => setForwardMsg(msg)}
                  onUpdated={(updated) => setMessages(list => list.map(x => Number(x.id) === Number(updated.id) ? updated : x))} />
              ))}
              <div ref={bottomRef} />
            </div>
            {isMuted && (
              <div className="chat-muted">
                🔇 Вы в муте до {fmtMute}. Сообщения временно нельзя отправлять.
              </div>
            )}
            {pending.length > 0 && (
              <div className="pending-attachments chat-pending">
                {pending.map(p => (
                  <div className="pending-media" key={p.id}>
                    {p.type === 'photo' && p.lib && <img src={p.lib.url} alt="" />}
                    {p.type === 'photo' && !p.lib && <img src={URL.createObjectURL(p.file)} alt="" />}
                    {p.type !== 'photo' && (
                      <span className="pending-chip">
                        {p.lib
                          ? `📎 ${p.lib.name || 'Видео'}`
                          : p.type === 'note'
                            ? '📎 Заметка'
                            : p.file?.name}
                      </span>
                    )}
                    <button type="button" className="icon-btn" onClick={() => remove(p.id)}>✕</button>
                  </div>
                ))}
                {pending.find(p => p.type === 'note') && (
                  <textarea className="textarea" rows={2} placeholder="Текст заметки…"
                    value={pending.find(p => p.type === 'note').text || ''}
                    onChange={e => patch(pending.find(p => p.type === 'note').id, { text: e.target.value })} />
                )}
              </div>
            )}
            {err && <div className="error-text chat-err">{err}</div>}
            <div className="chat-toolbar">
              <AttachMenu onPick={pick} onPickFromLib={pickFromLib} disabled={!!isMuted} types={['photo', 'video', 'note']} />
            </div>
            <form className="chat-input" onSubmit={send}>
              <EmojiPicker value={text} onSelect={setText} />
              <input className="input" placeholder="Сообщение…" value={text} maxLength={MAX_LEN} disabled={!!isMuted}
                onChange={e => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }} />
              <label className="nsfw-check chat-nsfw" title="Пометить сообщение как 18+: текст и медиа будут размыты до нажатия">
                <input type="checkbox" checked={nsfw} onChange={e => setNsfw(e.target.checked)} />
                <span>NSFW</span>
              </label>
              {text.length > 0 && <span className={`chat-count ${text.length > MAX_LEN - 50 ? 'warn' : ''}`}>{text.length}/{MAX_LEN}</span>}
              <button className="btn primary" disabled={!canSend || !!isMuted}>➤</button>
            </form>
          </>
        ) : (
          <div className="chat-empty muted">Выберите диалог слева, чтобы начать общение.</div>
        )}
      </section>
      </div>
      </div>
      {forwardMsg && (
        <ForwardModal messageId={forwardMsg.id}
          onClose={() => setForwardMsg(null)}
          onDone={() => loadConversations()} />
      )}
    </div>
  )
}

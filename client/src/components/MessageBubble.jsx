import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { postsApi, messagesApi, mediaUrl } from '../api.js'
import { timeAgo } from '../utils.js'
import { Avatar } from './Navbar.jsx'
import AdminBadge from './AdminBadge.jsx'
import ForwardEmbed from './ForwardEmbed.jsx'
import VideoModal from './VideoModal.jsx'

function PostEmbed({ postId }) {
  const [post, setPost] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setPost(null); setErr(false)
    postsApi.get(postId).then(d => setPost(d.post)).catch(() => setErr(true))
  }, [postId])
  if (err) return <div className="msg-embed muted">Запись недоступна</div>
  if (!post) return <div className="msg-embed muted">Загрузка записи…</div>
  const img = post.attachments?.find(a => a.type === 'photo')?.url || post.image
  return (
    <Link to={`/post/${post.id}`} className="msg-embed">
      <div className="msg-embed-head">
        <Avatar user={post.author} size={20} />
        <strong>{post.author.displayName || post.author.username}</strong>
      </div>
      <p>{post.body || <span className="muted">Запись без текста</span>}</p>
      {img && <img src={img} alt="" className="msg-embed-img" />}
    </Link>
  )
}

function MessagePoll({ poll, messageId, me, onVoted }) {
  const [busy, setBusy] = useState(false)
  const total = poll.total || 0
  const vote = async (i) => {
    if (busy || poll.myVote != null) return
    setBusy(true)
    const d = await messagesApi.pollVote(messageId, i).catch(() => null)
    if (d) onVoted(d)
    setBusy(false)
  }
  const cancel = async () => {
    if (busy) return
    setBusy(true)
    const d = await messagesApi.pollVote(messageId, null).catch(() => null)
    if (d) onVoted(d)
    setBusy(false)
  }
  return (
    <div className="post-poll msg-poll">
      <div className="poll-question">{poll.question}</div>
      {(poll.options || []).map((o, i) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0
        const mine = poll.myVote === i
        return (
          <button key={i} className={`poll-option ${mine ? 'mine' : ''}`} disabled={poll.myVote != null} onClick={() => vote(i)}>
            <span className="poll-bar" style={{ width: `${total ? pct : 0}%` }} />
            <span className="poll-name">{o.name}</span>
            <span className="poll-pct">{total ? `${pct}%` : ''}</span>
          </button>
        )
      })}
      <div className="poll-footer">
        {poll.myVote != null ? (<><span>✓ Вы проголосовали</span> <button type="button" className="poll-cancel" onClick={cancel}>Отменить голос</button></>) : 'Проголосуйте'} · голосов: {total}
      </div>
    </div>
  )
}

function AttachView({ a, messageId, me, onVoted, onVideoOpen }) {
  switch (a.type) {
    case 'photo':
      return <img src={a.url} className="msg-media" alt="" />
    case 'video':
      return a.videoId ? (
        <button
          type="button"
          className="post-video-link"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVideoOpen && onVideoOpen({ url: a.url, youtube: a.youtube, title: a.name }) }}
        >
          <span className="post-video-thumb">▶</span>
          <span className="post-video-info">
            <strong>{a.name || 'Видеозапись'}</strong>
            <span className="muted small">Смотреть →</span>
          </span>
        </button>
      ) : (
        <video src={mediaUrl(a.url)} controls className="msg-media" />
      )
    case 'audio':
      return <audio src={mediaUrl(a.url)} controls className="msg-audio" />
    case 'document':
      return (
        <a href={a.url} target="_blank" rel="noreferrer" className="post-doc msg-doc">
          <span className="doc-icon">📄</span>
          <span className="doc-name">{a.name || 'Документ'}</span>
          <span className="doc-open">Открыть →</span>
        </a>
      )
    case 'note':
      return <div className="post-note msg-note">{a.text}</div>
    case 'poll':
      return <MessagePoll poll={a} messageId={messageId} me={me} onVoted={onVoted} />
    case 'post':
      return <PostEmbed postId={a.postId} />
    case 'forward':
      return <ForwardEmbed f={a} />
    default:
      return null
  }
}

const HOUR = 60 * 60 * 1000

export default function MessageBubble({ m, me, onVoted, onUpdated, onForward }) {
  const mine = m.sender?.id === me.id
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(m.body || '')
  const [busy, setBusy] = useState(false)
  const [videoOpen, setVideoOpen] = useState(null)
  const nsfwHidden = !!m.nsfw && !revealed
  const editable = mine && !m.deleted && Date.now() - new Date(m.createdAt).getTime() <= 24 * HOUR

  const startEdit = () => { setEditText(m.body || ''); setEditing(true) }

  const saveEdit = async () => {
    if (!editText.trim() || busy) return
    setBusy(true)
    try {
      const updated = await messagesApi.edit(m.conversationId, m.id, editText.trim())
      if (onUpdated) onUpdated(updated)
      setEditing(false)
    } catch { /* ошибку видно сверху? */ } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (busy || !window.confirm('Удалить сообщение?')) return
    setBusy(true)
    try {
      const updated = await messagesApi.delMessage(m.conversationId, m.id)
      if (onUpdated) onUpdated(updated)
    } catch { } finally { setBusy(false) }
  }

  const content = (
    <>
      {m.body && <p>{m.body}</p>}
      {(m.attachments || []).map((a, i) => (
        <AttachView key={i} a={a} messageId={m.id} me={me} onVoted={onVoted} onVideoOpen={setVideoOpen} />
      ))}
    </>
  )

  return (
    <div className={`bubble ${mine ? 'mine' : ''} ${m.nsfw ? 'nsfw' : ''} ${m.deleted ? 'deleted' : ''}`}>
      <div className="bubble-meta">
        <span className="bubble-sender">{m.sender?.displayName || m.sender?.username}</span>
        <AdminBadge user={m.sender} />
        {m.nsfw && <span className="nsfw-dot" title="Сообщение помечено как 18+">🔞</span>}
        {!m.deleted && onForward && (
          <button type="button" className="icon-btn" title="Переслать" onClick={() => onForward(m)}>↗</button>
        )}
        {editable && (
          <span className="bubble-actions">
            <button type="button" className="icon-btn" title="Изменить" onClick={startEdit}>✎</button>
            <button type="button" className="icon-btn danger" title="Удалить" onClick={doDelete}>🗑</button>
          </span>
        )}
      </div>
      {m.deleted ? (
        <div className="muted small">Сообщение удалено</div>
      ) : editing ? (
        <div className="bubble-edit">
          <input className="input" value={editText} maxLength={512} autoFocus
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } }} />
          <div className="bubble-edit-actions">
            <button className="btn primary small-btn" disabled={!editText.trim() || busy} onClick={saveEdit}>Сохранить</button>
            <button className="btn ghost small-btn" disabled={busy} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      ) : m.nsfw ? (
        <div className={`nsfw-box ${nsfwHidden ? 'nsfw-hidden' : ''}`}>
          <div className="nsfw-blur">{content}</div>
          {nsfwHidden && (
            <button type="button" className="nsfw-veil" onClick={() => setRevealed(true)}>
              <span className="nsfw-veil-title">🔞 Сообщение 18+</span>
              <span className="nsfw-veil-hint">Нажмите, чтобы показать</span>
            </button>
          )}
        </div>
      ) : content}
      <span className="muted small">
        {timeAgo(m.createdAt)}{m.editedAt && <span title={`Изменено ${timeAgo(m.editedAt)}`}> · изменено</span>}
        {mine && !m.deleted && (
          <span className="msg-status" title={m.readAt ? 'Прочитано' : 'Отправлено'}>
            {m.readAt
              ? <span className="msg-status-read">✓✓</span>
              : <span className="msg-status-sent">✓</span>}
          </span>
        )}
      </span>
      {videoOpen && (
        <VideoModal url={videoOpen.url} youtube={videoOpen.youtube} title={videoOpen.title} onClose={() => setVideoOpen(null)} />
      )}
    </div>
  )
}

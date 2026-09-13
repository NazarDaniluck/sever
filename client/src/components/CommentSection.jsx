import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Navbar.jsx'
import AdminBadge from './AdminBadge.jsx'
import BodyText from './BodyText.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import { timeAgo } from '../utils.js'

// Комментарии с ответами (один уровень дерева: ответы вкладываются под корневой комментарий).
export default function CommentSection({ comments = [], me, onSubmit, busy = false }) {
  const [text, setText] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)

  const byId = new Map(comments.map(c => [c.id, c]))

  const findRoot = (c) => {
    let cur = c
    let guard = 0
    while (cur.parentId && byId.has(cur.parentId) && guard < 50) {
      cur = byId.get(cur.parentId)
      guard++
    }
    return cur
  }

  const roots = comments.filter(c => !c.parentId)
  const repliesOf = new Map()
  for (const c of comments) {
    if (!c.parentId) continue
    const root = findRoot(c)
    if (root.id === c.id) continue
    if (!repliesOf.has(root.id)) repliesOf.set(root.id, [])
    repliesOf.get(root.id).push(c)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim() || busy) return
    onSubmit(text.trim(), replyingTo ? replyingTo.id : null)
    setText('')
    setReplyingTo(null)
  }

  const renderComment = (c, key) => {
    const replies = repliesOf.get(c.id) || []
    return (
      <div className="comment-row" key={key}>
        <div className="comment">
          <Link to={`/u/${c.author.username}`}><Avatar user={c.author} size={32} /></Link>
          <div className="comment-body">
            <div className="comment-head">
              <Link to={`/u/${c.author.username}`} className="author-name">{c.author.displayName || c.author.username}</Link>
              <AdminBadge user={c.author} />
              {c.replyTo && (
                <Link to={`/u/${c.replyTo.username}`} className="comment-reply-to">→ {c.replyTo.displayName || c.replyTo.username}</Link>
              )}
              <span className="muted">{timeAgo(c.createdAt)}</span>
            </div>
            <p className="comment-text"><BodyText text={c.body} /></p>
            <button type="button" className="comment-reply-btn" onClick={() => setReplyingTo(c)}>Ответить</button>
          </div>
        </div>
        {replies.length > 0 && (
          <div className="comment-replies">{replies.map(r => renderComment(r, r.id))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="comments">
      {roots.map(c => renderComment(c, c.id))}
      {comments.length === 0 && <div className="muted">Комментариев пока нет.</div>}
      <form className="comment-form" onSubmit={submit}>
        <Avatar user={me} size={32} />
        <input
          className="input"
          placeholder={replyingTo
            ? `Ответ для ${replyingTo.author.displayName || replyingTo.author.username}…`
            : 'Написать комментарий…'}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <EmojiPicker value={text} onSelect={setText} />
        {replyingTo && (
          <button type="button" className="icon-btn" title="Отменить ответ" onClick={() => setReplyingTo(null)}>✕</button>
        )}
        <button className="btn primary" disabled={!text.trim() || busy}>Отправить</button>
      </form>
    </div>
  )
}

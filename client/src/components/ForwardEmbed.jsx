import { Link } from 'react-router-dom'
import BodyText from './BodyText.jsx'
import { mediaUrl } from '../api.js'

function InnerAttach({ a }) {
  switch (a.type) {
    case 'photo':
      return <img src={a.url} className="forward-photo" alt="" />
    case 'video':
      return <video src={mediaUrl(a.url)} controls className="msg-media" />
    case 'audio':
      return <audio src={mediaUrl(a.url)} controls className="msg-audio" />
    case 'note':
      return <div className="post-note msg-note">{a.text}</div>
    case 'post':
      return <Link to={`/post/${a.postId}`} className="forward-post-link">↦ Запись на стене</Link>
    case 'document':
      return (
        <a href={a.url} target="_blank" rel="noreferrer" className="post-doc msg-doc">
          <span className="doc-icon">📄</span>
          <span className="doc-name">{a.name || 'Документ'}</span>
          <span className="doc-open">Открыть →</span>
        </a>
      )
    case 'forward':
      return <ForwardEmbed f={a} />
    default:
      return null
  }
}

export default function ForwardEmbed({ f }) {
  return (
    <div className="msg-embed forward-embed">
      <div className="forward-head">↩ Переслано от {f.senderName || f.senderUsername}</div>
      {f.body && (
        <p><BodyText text={f.body} /></p>
      )}
      {(f.atts || []).map((a, i) => <InnerAttach key={i} a={a} />)}
    </div>
  )
}

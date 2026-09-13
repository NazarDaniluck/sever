import { Link } from 'react-router-dom'

const YT_RE = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/
const TOKEN_RE = /(https?:\/\/[^\s]+)|(?<![\w])@([A-Za-z0-9_-]{3,30})(?![\w-])/g

function ytId(url) {
  const m = String(url).match(YT_RE)
  return m ? m[1] : null
}

function clip(str) {
  return str.length > 80 ? str.slice(0, 80) + '…' : str
}

export default function BodyText({ text, className = '' }) {
  if (!text) return null

  const renderLine = (line, li) => {
    const nodes = []
    let last = 0
    let mm
    TOKEN_RE.lastIndex = 0
    while ((mm = TOKEN_RE.exec(line)) !== null) {
      if (mm.index > last) nodes.push(<span key={`t-${li}-${last}`}>{line.slice(last, mm.index)}</span>)
      const url = mm[1]
      const mention = mm[2]
      if (url) {
        const id = ytId(url)
        if (id) {
          nodes.push(
            <span className="body-yt" key={`y-${li}-${mm.index}`}>
              <a href={url} target="_blank" rel="noreferrer" className="body-link">{clip(url)}</a>
              <iframe
                src={`https://www.youtube.com/embed/${id}`}
                title="YouTube видео"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </span>
          )
        } else {
          nodes.push(<a key={`l-${li}-${mm.index}`} href={url} target="_blank" rel="noreferrer" className="body-link">{clip(url)}</a>)
        }
      } else if (mention) {
        nodes.push(
          <Link key={`m-${li}-${mm.index}`} to={`/u/${mention}`} className="body-mention">
            @{mention}
          </Link>
        )
      }
      last = mm.index + mm[0].length
    }
    if (last < line.length) nodes.push(<span key={`t-${li}-end`}>{line.slice(last)}</span>)
    return <span key={`line-${li}`}>{nodes}</span>
  }

  return (
    <span className={className}>
      {text.split('\n').map((line, li) => (
        <span key={`linespan-${li}`}>{renderLine(line, li)}<span className="body-br" /></span>
      ))}
    </span>
  )
}

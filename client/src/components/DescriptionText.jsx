// Рендер описания: обычный текст + кликабельные ссылки (https/http),
// без встраивания iframe YouTube.
const URL_RE = /https?:\/\/[^\s]+/g

function stripTrailing(url) {
  return url.replace(/[.,;:!?'")\]}>]+$/, '')
}

export default function DescriptionText({ text, className = '' }) {
  if (!text) return null
  return (
    <span className={className}>
      {text.split('\n').map((line, li) => {
        const nodes = []
        let last = 0
        let mm
        URL_RE.lastIndex = 0
        while ((mm = URL_RE.exec(line)) !== null) {
          if (mm.index > last) nodes.push(<span key={`t-${li}-${last}`}>{line.slice(last, mm.index)}</span>)
          const raw = mm[0]
          const url = stripTrailing(raw)
          nodes.push(
            <a key={`l-${li}-${mm.index}`} href={url} target="_blank" rel="noreferrer" className="body-link">{url}</a>
          )
          last = mm.index + mm[0].length
        }
        if (last < line.length) nodes.push(<span key={`t-${li}-end`}>{line.slice(last)}</span>)
        return <span key={`line-${li}`}>{nodes}<span className="body-br" /></span>
      })}
    </span>
  )
}

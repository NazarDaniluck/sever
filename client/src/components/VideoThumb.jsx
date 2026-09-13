import { mediaUrl } from '../api.js'

export default function VideoThumb({ v }) {
  if (v.preview) return <img className="feed-thumb-img" src={mediaUrl(v.preview)} alt="" />
  if (v.youtube) return <img className="feed-thumb-img" src={`https://img.youtube.com/vi/${v.youtube}/mqdefault.jpg`} alt={v.title} />
  if (v.url) return <video src={mediaUrl(v.url)} preload="metadata" muted playsInline />
  return <div className="feed-thumb-fallback">Видео</div>
}

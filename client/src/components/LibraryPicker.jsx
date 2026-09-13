import { useEffect, useState } from 'react'
import { libraryApi, mediaUrl } from '../api.js'

export default function LibraryPicker({ type, onClose, onPick }) {
  const [albums, setAlbums] = useState([])
  const [flatPhotos, setFlatPhotos] = useState([])
  const [videos, setVideos] = useState([])
  const [audios, setAudios] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const isPhoto = type === 'photo'
  const isVideo = type === 'video'
  const isAudio = type === 'audio'

  useEffect(() => {
    ;(async () => {
      setBusy(true)
      try {
        if (isPhoto || isVideo) {
          const [al, vi] = await Promise.all([libraryApi.albums(), libraryApi.videos()])
          setAlbums(al || [])
          setVideos(vi || [])
          if (isPhoto) {
            const withPhotos = await Promise.all((al || []).map(async a => {
              try { return { ...a, photos: (await libraryApi.album(a.id)).photos || [] } } catch { return { ...a, photos: [] } }
            }))
            setFlatPhotos(withPhotos.flatMap(a => (a.photos || []).map(p => ({ ...p, albumTitle: a.title }))))
          }
        } else if (isAudio) {
          setAudios(await libraryApi.audios())
        }
      } catch (e) { setErr(e.message) } finally { setBusy(false) }
    })()
  }, [type])

  const header = isPhoto ? 'Выбор фотографии из альбомов' : isVideo ? 'Выбор видео из фонда' : 'Выбор аудио из фонда'

  const choosePhoto = (p) => onPick && onPick({ kind: 'photo', url: p.url, name: p.url.split('/').pop() })
  const chooseVideo = (v) => onPick && onPick({ kind: 'video', id: v.id, url: v.url, youtube: v.youtube, name: v.title })
  const chooseAudio = (a) => onPick && onPick({ kind: 'audio', id: a.id, url: a.url, name: a.title, cover: a.cover })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal lib-picker" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{header}</span>
          <button type="button" className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {err && <div className="error-text">{err}</div>}
          {busy && <div className="muted">Загрузка…</div>}

          {isPhoto && flatPhotos.length > 0 && (
            <div className="picker-grid">
              {flatPhotos.map(p => (
                <button type="button" key={p.id} className="picker-tile" title={p.albumTitle} onClick={() => choosePhoto(p)}>
                  <img src={p.url} alt="" />
                </button>
              ))}
            </div>
          )}
          {isPhoto && flatPhotos.length === 0 && !busy && (
            <div className="muted">В сохранённых альбомах нет фотографий.</div>
          )}

          {isVideo && videos.length > 0 && (
            <div className="picker-list">
              {videos.map(v => (
                <button type="button" key={v.id} className="picker-row" onClick={() => chooseVideo(v)}>
                  {v.youtube ? (
                    <span className="picker-thumb yt glyph">▶</span>
                  ) : (
                    <video src={mediaUrl(v.url)} className="picker-thumb" preload="metadata" muted />
                  )}
                  <span className="picker-label">{v.title}</span>
                </button>
              ))}
            </div>
          )}
          {isVideo && videos.length === 0 && !busy && (
            <div className="muted">В фонде нет видеозаписей.</div>
          )}

          {isAudio && audios.length > 0 && (
            <div className="picker-list">
              {audios.map(a => (
                <button type="button" key={a.id} className="picker-row" onClick={() => chooseAudio(a)}>
                  {a.cover
                    ? <img className="picker-thumb" src={a.cover} alt="" />
                    : <span className="picker-thumb glyph">🎵</span>}
                  <span className="picker-label">{a.artist ? `${a.artist} — ${a.title}` : a.title}</span>
                </button>
              ))}
            </div>
          )}
          {isAudio && audios.length === 0 && !busy && (
            <div className="muted">В фонде нет аудиозаписей.</div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useState } from 'react'
import { libraryApi } from '../api.js'

// Кнопка «плейлист»: показывает выбранные плейлисты, куда можно добавить/убрать видео.
export default function PlaylistButton({ videoId, title = 'Плейлист' }) {
  const [open, setOpen] = useState(false)
  const [playlists, setPlaylists] = useState([])
  const [inPl, setInPl] = useState({})      // playlistId -> { adding: bool }
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const openModal = async () => {
    setOpen(!open)
    if (open) return
    setErr(''); setMsg(''); setLoading(true)
    try {
      const [pls, mine] = await Promise.all([
        libraryApi.playlists(),
        libraryApi.video(id)
      ])
      setPlaylists(pls || [])
      const map = {}
      ;(mine?.playlists || []).forEach(p => { map[p.id] = true })
      setInPl(map)
    } catch (ex) { setErr(ex.message) } finally { setLoading(false) }
  }

  const toggle = async (pid) => {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    const on = !inPl[pid]
    try {
      await libraryApi.addVideoToPlaylist(videoId, pid, on)
      setInPl(m => ({ ...m, [pid]: on }))
      setMsg(on ? 'Добавлено в плейлист.' : 'Убрано из плейлиста.')
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  return (
    <>
      <button className="icon-btn" title="Плейлисты" aria-label="Плейлисты" onClick={openModal}>▶ Плейлисты</button>
      {open && (
        <div className="report-modal-backdrop" onClick={openModal}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-title">Плейлисты</div>
            {loading && <div className="muted">Загрузка…</div>}
            {!loading && err && <div className="error-text">{err}</div>}
            {!loading && msg && <div className="success-text">{msg}</div>}
            {!loading && playlists.length === 0 && !err && (
              <div className="muted">Плейлистов пока нет. Создайте их во вкладке «Мои видеозаписи».</div>
            )}
            {!loading && playlists.length > 0 && (
              <div className="pl-list">
                {playlists.map(pl => (
                  <label key={pl.id} className="pl-row">
                    <input
                      type="checkbox"
                      checked={!!inPl[pl.id]}
                      disabled={busy}
                      onChange={() => toggle(pl.id)}
                    />
                    <span>{pl.title} <span className="muted small">({pl.videoCount || 0})</span></span>
                  </label>
                ))}
              </div>
            )}
            <div className="row-custom">
              <button className="btn ghost small" onClick={openModal}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
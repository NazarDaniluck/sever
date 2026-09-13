import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { libraryApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import ReportButton from '../components/ReportButton.jsx'

export default function Albums() {
  const { id } = useParams()
  const nav = useNavigate()
  const [albums, setAlbums] = useState([])
  const [album, setAlbum] = useState(null)
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const addRef = useRef(null)

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const load = async () => {
    try { setAlbums(await libraryApi.albums()) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (id) libraryApi.album(id).then(setAlbum).catch(() => setAlbum(null))
    else setAlbum(null)
  }, [id])

  const create = async () => {
    if (!title.trim() || !files.length) return setErr('Укажите название и выберите фото')
    setBusy(true); setErr('')
    try {
      await libraryApi.createAlbum(title, files)
      flash('Альбом создан.')
      setTitle(''); setFiles([]); inputRef.current.value = ''
      load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const addToAlbum = async () => {
    if (!files.length) return setErr('Выберите фото')
    setBusy(true); setErr('')
    try {
      await libraryApi.addPhotos(id, files)
      setFiles([]); addRef.current.value = ''
      setAlbum(await libraryApi.album(id))
      flash('Фотографии добавлены.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const removeAlbum = async (aid) => {
    if (!confirm('Удалить альбом и все фото?')) return
    try { await libraryApi.deleteAlbum(aid); load() } catch (e) { setErr(e.message) }
  }
  const renameAlbum = async (a) => {
    const title = prompt('Новое название альбома', a.title)
    if (!title || !title.trim() || title.trim() === a.title) return
    try {
      await libraryApi.renameAlbum(a.id, title.trim())
      if (album && album.id === a.id) setAlbum(await libraryApi.album(a.id))
      load()
      flash('Альбом переименован.')
    } catch (e) { setErr(e.message) }
  }
  const removePhoto = async (pid) => {
    if (!confirm('Удалить фото?')) return
    try { await libraryApi.deletePhoto(id, pid); setAlbum(await libraryApi.album(id)) } catch (e) { setErr(e.message) }
  }

  const isOwner = album?.isOwner

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои фотографии</div>
        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        {album ? (
          <>
            <div className="row-custom" style={{ marginBottom: 6 }}>
              <button className="btn ghost small-btn" onClick={() => nav('/photos')}>← Ко всем альбомам</button>
              {isOwner && <button className="btn ghost small-btn" onClick={() => renameAlbum(album)}>Переименовать</button>}
            </div>
            <div className="boxhead">
              {album.title} ({album.photos.length})
              {!isOwner && album.owner && (
                <span className="muted small"> · альбом <Link to={`/u/${album.owner.username}`}>{album.owner.displayName || album.owner.username}</Link></span>
              )}
              {!isOwner && <span className="muted small"> · </span>}
              {!isOwner && <ReportButton targetType="album" targetId={album.id} text />}
            </div>

            {isOwner ? (
              <div className="card">
                <div className="settings_title">Добавить фото (до 10 за раз, максимум 100 в альбоме)</div>
                <input ref={addRef} type="file" accept="image/*" multiple
                  onChange={e => { setFiles([...e.target.files]); if (files.length >= 10) setErr('Можно выбрать до 10 фото') }} />
                {files.length > 0 && <p className="muted small">Выбрано: {files.length}</p>}
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn primary" disabled={busy || !files.length} onClick={addToAlbum}>Добавить</button>
                </div>
              </div>
            ) : (
              <div className="card muted no-access">
                🔒 Это чужой альбом — вы не можете добавлять в него фотографии.
              </div>
            )}

            <div className="photo-grid">
              {album.photos.map(p => (
                  <Link to={`/photo/${p.id}`} className="photo-tile" key={p.id}>
                    <img src={p.url} alt="" loading="lazy" />
                    <ReportButton targetType="photo" targetId={p.id} />
                    {isOwner && (
                    <button className="photo-del" title="Удалить фото" onClick={e => { e.preventDefault(); removePhoto(p.id) }}>✕</button>
                  )}
                </Link>
              ))}
            </div>
            {album.photos.length === 0 && <div className="card muted">В альбоме пока нет фото.</div>}
          </>
        ) : (
          <>
            <div className="card">
              <div className="settings_title">Создать альбом</div>
              <input className="input" placeholder="Название альбома" value={title} onChange={e => setTitle(e.target.value)} maxLength={50} />
              <input ref={inputRef} type="file" accept="image/*" multiple
                onChange={e => { setFiles([...e.target.files]); if (e.target.files.length > 10) setErr('Можно выбрать до 10 фото') }} />
              {files.length > 0 && <p className="muted small">Выбрано: {files.length} (максимум 10 за раз)</p>}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn primary" disabled={busy || !title.trim() || !files.length} onClick={create}>Создать альбом</button>
              </div>
            </div>

            <div className="album-grid">
              {albums.map(a => (
                <div className="album-card" key={a.id}>
                  <Link to={`/photos/${a.id}`}>
                    <div className="album-cover">
                      {a.cover
                        ? <img src={a.cover} alt="" loading="lazy" />
                        : <span className="album-empty">🖼</span>}
                    </div>
                    <div className="album-title"><strong>{a.title}</strong></div>
                    <div className="muted small">{a.photoCount} фото</div>
                  </Link>
                  <div className="album-actions">
                    <button className="btn ghost small-btn" onClick={() => removeAlbum(a.id)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
            {albums.length === 0 && <div className="card muted">Альбомов пока нет. Создайте первый выше.</div>}
          </>
        )}
      </div>
    </div>
  )
}
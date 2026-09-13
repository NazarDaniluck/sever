import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { libraryApi, mediaUrl } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import VideoThumb from '../components/VideoThumb.jsx'
import DescriptionText from '../components/DescriptionText.jsx'
import { timeAgo } from '../utils.js'

const ACCESS = [
  { id: 'private', label: 'Только мне' },
  { id: 'link', label: 'По ссылке' },
  { id: 'friends', label: 'Только для друзей' },
  { id: 'open', label: 'Открыто' }
]
const accessLabel = (id) => (ACCESS.find(a => a.id === id) || {}).label || id

export default function Videos() {
  const nav = useNavigate()
  const [videos, setVideos] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [openPlaylist, setOpenPlaylist] = useState(null)

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const load = async () => {
    try {
      const [vs, pls] = await Promise.all([libraryApi.videos(), libraryApi.playlists()])
      setVideos(vs); setPlaylists(pls)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const setVideoAccess = async (v, next) => {
    try {
      const d = await libraryApi.updateVideo(v.id, { access: next })
      setVideos(list => list.map(x => x.id === v.id ? { ...x, ...d } : x))
      flash(next === 'private' ? 'Видео скрыто из ленты.' : 'Видео выложено в ленту.')
    } catch (e) { setErr(e.message) }
  }

  const hide = async (v) => {
    if (!confirm('Снять видео с площадки? Его смогут видеть только вы. Вернуть в ленту можно будет повторной публикацией.')) return
    try {
      const d = await libraryApi.hideVideo(v.id)
      setVideos(list => list.map(x => x.id === v.id ? { ...x, ...d } : x))
      flash('Видео снято с площадки.')
    } catch (e) { setErr(e.message) }
  }

  const saveVideoEdit = async (v, title, description, previewFile, removePreview) => {
    let d = null
    if (previewFile) {
      const fd = new FormData()
      fd.append('preview', previewFile)
      d = await libraryApi.changeVideoPreview(v.id, fd)
    }
    const u = await libraryApi.updateVideo(v.id, { title, description, preview: removePreview ? null : undefined })
    setVideos(list => list.map(x => x.id === v.id ? { ...x, ...(d || {}), ...u } : x))
    setEditing(null)
    flash('Видео обновлено.')
  }

  const remove = async (id) => {
    if (!confirm('Удалить видеозапись?')) return
    try { await libraryApi.deleteVideo(id); load() } catch (e) { setErr(e.message) }
  }

  const published = v => v.access !== 'private'

  const openPlaylistPage = async (pl) => {
    try {
      setOpenPlaylist(await libraryApi.playlist(pl.id))
    } catch (e) { setErr(e.message) }
  }

  const removeFromPlaylist = async (v) => {
    if (!openPlaylist) return
    try {
      await libraryApi.setVideoPlaylist(v.id, openPlaylist.id, false)
      setOpenPlaylist(p => ({ ...p, videos: p.videos.filter(x => x.id !== v.id) }))
      setPlaylists(list => list.map(x => x.id === openPlaylist.id ? { ...x, videoCount: x.videoCount - 1 } : x))
    } catch (e) { setErr(e.message) }
  }

  const renamePlaylist = async () => {
    const title = prompt('Новое название плейлиста', openPlaylist?.title)
    if (!title || !title.trim() || title.trim() === openPlaylist?.title) return
    try {
      await libraryApi.renamePlaylist(openPlaylist.id, title.trim())
      setOpenPlaylist(p => ({ ...p, title: title.trim() }))
      setPlaylists(list => list.map(x => x.id === openPlaylist.id ? { ...x, title: title.trim() } : x))
    } catch (e) { setErr(e.message) }
  }

  const deletePlaylist = async () => {
    if (!confirm('Удалить плейлист? Видео останутся в вашей библиотеке.')) return
    try {
      await libraryApi.deletePlaylist(openPlaylist.id)
      setOpenPlaylist(null)
      load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои видеозаписи
          <Link to="/videos/feed" className="count"> · Лента видео →</Link>
        </div>
        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        <div className="row-custom" style={{ marginBottom: 14 }}>
          <button className="btn primary" onClick={() => setModalOpen(true)}>＋ Опубликовать видео</button>
        </div>

        {playlists.length > 0 && (
          <>
            <div className="settings_title">Плейлисты</div>
            <div className="playlist-grid">
              {playlists.map(pl => (
                <div className="playlist-card" key={pl.id} onClick={() => openPlaylistPage(pl)}>
                  <div className="playlist-thumb">
                    {pl.cover
                      ? (pl.cover.match(/\.(png|jpe?g|gif|webp)/i) ? <img src={mediaUrl(pl.cover)} alt="" /> : <video src={mediaUrl(pl.cover)} preload="metadata" muted playsInline />)
                      : <span className="muted">Нет видео</span>}
                  </div>
                  <div className="playlist-body">
                    <strong>{pl.title}</strong>
                    <div className="playlist-count">{pl.videoCount} видео</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="settings_title">Видеозаписи ({videos.length})</div>
        <div className="video-feed-list">
          {videos.map(v => (
            <div className="feed-card" key={v.id}>
              <div className="feed-thumb-wrap clickable" onClick={() => nav(`/video/${v.id}`)}>
                <VideoThumb v={v} />
                <span className="feed-play">▶</span>
              </div>
              <div className="feed-body">
                <Link to={`/video/${v.id}`} className="feed-title">{v.title}</Link>
                {v.pinned && <span className="pinned-badge">📌 Закреплено</span>}
                <div className="muted small">
                  {v.views} просмотров · загружено {timeAgo(v.createdAt)}
                </div>
                {v.description && <div className="muted small feed-desc"><DescriptionText text={v.description} /></div>}
                <div className="video-actions">
                  {published(v) ? (
                    <span className="access-badge" title="Доступ задан при выкладке и не меняется">Доступ: {accessLabel(v.access)}</span>
                  ) : (
                    <label className="nsfw-check" title="Кто может смотреть видео">
                      <span>Доступ:</span>
                      <select className="input" value={v.access} onChange={e => setVideoAccess(v, e.target.value)}>
                        {ACCESS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </label>
                  )}
                  <span className="video-actions-buttons">
                    {published(v) && <button className="btn ghost small-btn" onClick={() => hide(v)}>Скрыть</button>}
                    <button className="btn ghost small-btn" onClick={() => setEditing(v)}>Изменить</button>
                    <button className="btn ghost small-btn" onClick={() => remove(v.id)}>Удалить</button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {videos.length === 0 && <div className="card muted">Видеозаписей пока нет.</div>}
      </div>

      {modalOpen && <PublishModal
        playlists={playlists}
        onClose={() => setModalOpen(false)}
        onDone={(text) => { setModalOpen(false); flash(text); load() }}
        onError={setErr}
      />}

      {editing && <EditVideoModal
        video={editing}
        onClose={() => setEditing(null)}
        onSave={(title, description) => saveVideoEdit(editing, title, description)}
        onError={setErr}
      />}

      {openPlaylist && (
        <div className="modal-overlay" onClick={() => setOpenPlaylist(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Плейлист: {openPlaylist.title}</strong>
              <button className="icon-btn" onClick={() => setOpenPlaylist(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="row-custom" style={{ marginBottom: 10 }}>
                <button className="btn ghost small-btn" onClick={renamePlaylist}>Переименовать</button>
                {openPlaylist.isMine && <button className="btn danger small-btn" onClick={deletePlaylist}>Удалить плейлист</button>}
              </div>
              {openPlaylist.videos.length === 0 && <div className="muted">В плейлисте пока нет видео.</div>}
              <div className="video-feed-list">
                {openPlaylist.videos.map(v => (
                  <div className="feed-card" key={v.id}>
                    <div className="feed-thumb-wrap clickable" onClick={() => nav(`/video/${v.id}`)}>
                      <VideoThumb v={v} />
                      <span className="feed-play">▶</span>
                    </div>
                    <div className="feed-body">
                      <Link to={`/video/${v.id}`} className="feed-title">{v.title}</Link>
                      <div className="muted small">{v.views} просмотров</div>
                      {openPlaylist.isMine && <button className="btn ghost small-btn" onClick={() => removeFromPlaylist(v)}>Убрать из плейлиста</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PublishModal({ playlists, onClose, onDone, onError }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [access, setAccess] = useState('private')
  const [playlistId, setPlaylistId] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const previewRef = useRef(null)

  const onPickPreview = (f) => {
    setPreview(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(f ? URL.createObjectURL(f) : '')
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const createPlaylist = async () => {
    if (!newTitle.trim()) return
    try {
      const pl = await libraryApi.createPlaylist(newTitle.trim())
      setPlaylistId(String(pl.id))
      setShowNew(false); setNewTitle('')
      onDone('Плейлист создан.')
    } catch (e) { setErr(e.message) }
  }

  const submit = async () => {
    if (!title.trim()) return setErr('Укажите название видео')
    if (!file) return setErr('Прикрепите видеофайл')
    setBusy(true); setErr('')
    try {
      const v = await libraryApi.uploadVideo(title.trim(), file, {
        description: description.trim(),
        preview,
        playlistId: playlistId ? Number(playlistId) : null
      })
      if (access !== 'private') await libraryApi.updateVideo(v.id, { access })
      onDone(access === 'private' ? 'Видео сохранено как черновик (только мне).' : 'Видео выложено в ленту.')
    } catch (e) { setErr(e.message); onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Опубликовать видео</strong>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="auth-field">
            <span>Видеофайл:</span>
            <input ref={fileRef} type="file" accept="video/*" onChange={e => setFile(e.target.files[0])} />
          </label>
          <label className="auth-field">
            <span>Название:</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Название видеозаписи" />
          </label>
          <label className="auth-field">
            <span>Описание:</span>
            <textarea className="textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="Описание видеозаписи" />
          </label>
          <div className="auth-field">
            <span>Плейлист:</span>
            <select className="input" value={playlistId} onChange={e => { setPlaylistId(e.target.value); setShowNew(false) }}>
              <option value="">Без плейлиста</option>
              {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
            </select>
            {!showNew ? (
              <button type="button" className="btn ghost small-btn" onClick={() => { setShowNew(true); setPlaylistId('') }}>+ Новый плейлист</button>
            ) : (
              <div className="row-custom">
                <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Название нового плейлиста" maxLength={80} />
                <button className="btn ghost small-btn" onClick={createPlaylist}>Создать</button>
              </div>
            )}
          </div>
          <div className="auth-field">
            <span>Превью (миниатюра):</span>
            <input ref={previewRef} type="file" accept="image/*" onChange={e => onPickPreview(e.target.files[0])} />
            {previewUrl && <img src={previewUrl} alt="" style={{ maxWidth: 240, marginTop: 6, borderRadius: 4 }} />}
          </div>
          <div className="auth-field">
            <span>Кто может смотреть (задаётся до выкладки):</span>
            <select className="input" value={access} onChange={e => setAccess(e.target.value)}>
              {ACCESS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          {err && <div className="error-text">{err}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy || !title.trim() || !file} onClick={submit}>
              {busy ? 'Загружаем…' : access === 'private' ? 'Опубликовать (черновик)' : 'Опубликовать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditVideoModal({ video, onClose, onSave, onError }) {
  const [title, setTitle] = useState(video.title || '')
  const [description, setDescription] = useState(video.description || '')
  const [previewFile, setPreviewFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [removePreview, setRemovePreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const previewRef = useRef(null)

  const onPickPreview = (f) => {
    setPreviewFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(f ? URL.createObjectURL(f) : '')
    if (f) setRemovePreview(false)
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const save = async () => {
    if (!title.trim()) return setErr('Укажите название видео')
    setBusy(true); setErr('')
    try {
      await onSave(title.trim(), description.trim(), previewFile, removePreview)
    } catch (e) { setErr(e.message); onError(e.message) } finally { setBusy(false) }
  }

  const shownThumb = previewUrl || (removePreview ? null : (video.preview || video.url || null))
  const isImageThumb = shownThumb && shownThumb.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Изменить видео</strong>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="muted small" style={{ marginBottom: 10 }}>Название, описание и превью можно менять в любой момент, без ограничений по времени.</div>
          <label className="auth-field">
            <span>Название:</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Название видеозаписи" />
          </label>
          <label className="auth-field">
            <span>Описание:</span>
            <textarea className="textarea" rows={4} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="Описание видеозаписи" />
          </label>
          <div className="auth-field">
            <span>Превью (миниатюра):</span>
            {shownThumb ? (
              isImageThumb
                ? <img src={mediaUrl(shownThumb)} alt="" style={{ maxWidth: 240, marginTop: 6, borderRadius: 4 }} />
                : <video src={mediaUrl(shownThumb)} style={{ maxWidth: 240, marginTop: 6, borderRadius: 4 }} preload="metadata" muted />
            ) : (
              <div className="muted small" style={{ marginTop: 4 }}>Без превью — в ленте будет первый кадр видео.</div>
            )}
            <div className="row-custom" style={{ marginTop: 6 }}>
              <label className="btn ghost small-btn">
                {previewFile ? 'Выбрать другое…' : 'Сменить превью'}
                <input ref={previewRef} type="file" accept="image/*" hidden onChange={e => onPickPreview(e.target.files[0])} />
              </label>
              {previewFile && (
                <button type="button" className="btn ghost small-btn" onClick={() => { onPickPreview(null); if (previewRef.current) previewRef.current.value = '' }}>
                  Отменить
                </button>
              )}
              {!removePreview && video.preview && (
                <button type="button" className="btn ghost small-btn" onClick={() => { setRemovePreview(true); setPreviewFile(null); if (previewRef.current) previewRef.current.value = '' }}>
                  Убрать превью
                </button>
              )}
            </div>
          </div>
          {err && <div className="error-text">{err}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy || !title.trim()} onClick={save}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

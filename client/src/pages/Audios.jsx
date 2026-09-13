import { useEffect, useRef, useState } from 'react'
import { libraryApi } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import ReportButton from '../components/ReportButton.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { timeAgo } from '../utils.js'

export default function Audios() {
  const [audios, setAudios] = useState([])
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [file, setFile] = useState(null)
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const coverRef = useRef(null)
  const { track, play, stop } = usePlayer()
  const currentId = track && track.type === 'audio' ? track.url : null

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const load = async () => {
    try { setAudios(await libraryApi.audios()) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const publish = async () => {
    if (!title.trim()) return setErr('Название обязательно')
    if (!file) return setErr('Прикрепите аудиофайл')
    setBusy(true); setErr('')
    try {
      await libraryApi.uploadAudio(title, artist, file, cover)
      flash('Аудиозапись добавлена.')
      setTitle(''); setArtist(''); setFile(null); setCover(null); inputRef.current.value = ''; coverRef.current.value = ''
      load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async (id) => {
    if (!confirm('Удалить аудиозапись?')) return
    try { await libraryApi.deleteAudio(id); load() } catch (e) { setErr(e.message) }
  }

  const togglePlay = (a) => {
    if (currentId === a.url) {
      stop()
    } else {
      play({ type: 'audio', url: a.url, title: a.title, cover: a.cover })
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои аудиозаписи [В доработке]</div>
        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        <div className="card">
          <div className="settings_title">Добавить аудиозапись</div>
          <label className="auth-field">
            <span>Название (обязательно):</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Название трека" />
          </label>
          <label className="auth-field">
            <span>Исполнитель (необязательно):</span>
            <input className="input" value={artist} onChange={e => setArtist(e.target.value)} maxLength={100} placeholder="Имя исполнителя" />
          </label>
          <label className="auth-field">
            <span>Аудиофайл:</span>
            <input ref={inputRef} type="file" accept="audio/*" onChange={e => { setFile(e.target.files[0]); if (e.target.files[0]) setTitle(t => t || e.target.files[0].name) }} />
          </label>
          <label className="auth-field">
            <span>Обложка (необязательно):</span>
            <input ref={coverRef} type="file" accept="image/*" onChange={e => setCover(e.target.files[0] || null)} />
          </label>
          <p className="muted small">Если обложку не загрузить, она будет извлечена из ID3-тегов файла (если есть).</p>
          <div className="row">
            <button className="btn primary" disabled={busy || !title.trim() || !file} onClick={publish}>{busy ? 'Загружаем…' : 'Добавить'}</button>
          </div>
        </div>

        <div className="audio-list">
          {audios.map(a => (
            <div className={`audio-card${currentId === a.url ? ' active' : ''}`} key={a.id}>
              <AudioIcon audio={a} />
              <div className="audio-info">
                <strong>{a.title}</strong>
                {a.artist && <span className="muted small">{a.artist}</span>}
                <div className="muted small">Добавлено {timeAgo(a.createdAt)}</div>
              </div>
              <button className="icon-btn" title={currentId === a.url ? 'Пауза' : 'Играть'} onClick={() => togglePlay(a)}>
                {currentId === a.url ? '⏸' : '▶'}
              </button>
              <ReportButton targetType="audio" targetId={a.id} />
              <button className="icon-btn danger" title="Удалить" onClick={() => remove(a.id)}>🗑</button>
            </div>
          ))}
        </div>
        {audios.length === 0 && <div className="card muted">Аудиозаписей пока нет.</div>}
      </div>
    </div>
  )
}

export function AudioIcon({ audio, size = 'normal' }) {
  if (audio?.cover) return <img className={`audio-icon audio-cover ${size}`} src={audio.cover} alt="" />
  return <span className="audio-icon">🎵</span>
}
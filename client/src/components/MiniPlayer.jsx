import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../context/PlayerContext.jsx'
import { mediaUrl } from '../api.js'

const fmt = (s) => {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Мини-плеер: аудио/видео продолжают играть при переходах по сайту.
// Управление аудио — своя панель (крупный ползунок), а не системный <audio controls>.
export default function MiniPlayer() {
  const { track, stop } = usePlayer()
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [volume, setVolume] = useState(1)
  const [volOpen, setVolOpen] = useState(false)

  const src = track ? mediaUrl(track.url) : null

  useEffect(() => {
    if (!track) { setPlaying(false); setTime(0); setDur(0); return }
    setPlaying(false); setTime(track.startTime || 0)
    const el = audioRef.current
    if (el) {
      el.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [track])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play().then(() => setPlaying(true)).catch(() => {}) }
    else { el.pause(); setPlaying(false) }
  }

  const seek = (e) => {
    const el = audioRef.current
    if (!el) return
    const v = Number(e.target.value)
    el.currentTime = v
    setTime(v)
  }

  const changeVolume = (e) => {
    const el = audioRef.current
    if (!el) return
    const v = Number(e.target.value)
    el.volume = v
    setVolume(v)
  }

  if (!track) return null

  return (
    <div className="mini-player">
      {track.cover ? (
        <img className="mini-player-cover" src={mediaUrl(track.cover)} alt="" />
      ) : (
        <div className="mini-player-cover mini-player-cover-fallback">💿</div>
      )}
      <div className="mini-player-info">
        <div className="mini-player-title" title={track.title}>{track.title}</div>
        <div className="muted small">{track.type === 'audio' ? 'Аудиозапись' : 'Видео'}</div>
      </div>
      <div className="mini-player-body">
        {track.type === 'audio' ? (
          <>
            <audio ref={audioRef} src={src} autoPlay
              onTimeUpdate={() => setTime(audioRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDur(audioRef.current?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <button className="mini-player-toggle" title={playing ? 'Пауза' : 'Играть'} onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
            <span className="mini-player-time">{fmt(time)}</span>
            <input className="mini-player-range" type="range" min="0" max={dur || 0} step="0.1" value={time}
              style={{ ['--mp-progress']: `${dur ? (time / dur) * 100 : 0}%` }}
              onChange={seek} />
            <span className="mini-player-time">{fmt(dur)}</span>
            <span className="mini-player-vol-wrap">
              <button className={`mini-player-vol-btn ${volOpen ? 'open' : ''}`} title={volume === 0 ? 'Включить звук' : 'Громкость'}
                onClick={() => setVolOpen(v => !v)}>{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</button>
              {volOpen && (
                <span className="mini-player-vol-pop" onClick={e => e.stopPropagation()}>
                  <input className="mini-player-vol-range" type="range" min="0" max="1" step="0.01"
                    value={volume} title={Math.round(volume * 100) + '%'}
                    style={{ ['--mp-vol-progress']: `${volume * 100}%` }}
                    onChange={changeVolume} />
                  <span className="mini-player-vol-label">{Math.round(volume * 100)}%</span>
                </span>
              )}
            </span>
          </>
        ) : (
          <video src={src} controls autoPlay style={{ height: 110, maxWidth: '100%' }} />
        )}
      </div>
      <button className="mini-player-close" title="Закрыть" onClick={stop}>✕</button>
    </div>
  )
}

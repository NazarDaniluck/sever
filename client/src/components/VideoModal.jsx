import { useCallback, useEffect, useRef } from 'react'
import { mediaUrl } from '../api.js'

export default function VideoModal({ url, youtube, title, onClose }) {
  const overlayRef = useRef(null)

  const onKey = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onKey])

  return (
    <div
      ref={overlayRef}
      className="report-modal-backdrop"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{ zIndex: 400, cursor: 'zoom-out' }}
    >
      <div
        className="video-page-main"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', alignSelf: 'center', width: 800, cursor: 'default' }}
      >
        <div className="video-player" style={{ aspectRatio: '16 / 9', borderRadius: 0 }}>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, fontSize: 18, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
            aria-label="Закрыть"
          >✕</button>
          {youtube ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtube}`}
              title={title || 'Видео'}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            />
          ) : (
            <video
              src={mediaUrl(url)}
              controls
              autoPlay
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: '#000' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

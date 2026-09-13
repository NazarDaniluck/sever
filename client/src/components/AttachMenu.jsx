import { useState, useRef } from 'react'
import LibraryPicker from './LibraryPicker.jsx'

export const ATTACH_TYPES = [
  { type: 'photo', label: 'Фотографии', accept: 'image/*', icon: '🖼', lib: true },
  { type: 'video', label: 'Видеозапись', accept: 'video/*', icon: '🎬', lib: true },
  { type: 'audio', label: 'Аудиозапись', accept: 'audio/*', icon: '🎵', lib: true },
  { type: 'document', label: 'Документ', accept: '.pdf,.doc,.docx,.txt,.md,.xls,.xlsx,.ppt,.pptx,.zip,.rar', icon: '📄' },
  { type: 'note', label: 'Заметка', icon: '📝' },
  { type: 'poll', label: 'Опрос', icon: '🗳' }
]

export default function AttachMenu({ onPick, onPickFromLib, disabled = false, types }) {
  const list = types ? ATTACH_TYPES.filter(t => types.includes(t.type)) : ATTACH_TYPES
  const [open, setOpen] = useState(false)
  const [pickLib, setPickLib] = useState(null)
  const inputRef = useRef(null)
  const current = useRef(null)

  const choose = (type, file) => {
    setOpen(false)
    onPick(type, file || null)
  }

  const clickFile = (type) => {
    const t = list.find(x => x.type === type)
    if (t?.accept) {
      current.current = type
      inputRef.current.click()
    } else {
      choose(type, null)
    }
  }

  const clickLib = (type) => {
    setOpen(false)
    setPickLib(type)
  }

  return (
    <div className="attach-wrap">
      <input ref={inputRef} type="file" hidden accept={list.map(t => t.accept).filter(Boolean).join(',')}
        onChange={e => { choose(current.current, e.target.files[0]); e.target.value = '' }} />
      <button type="button" className="attach-btn" disabled={disabled} onClick={() => setOpen(v => !v)}>
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a4 4 0 0 0 8 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg>
        Прикрепить
      </button>
      {open && (
        <div className="dropdown attach-menu">
          {list.map(t => (
            <span key={t.type} className="attach-group">
              <button type="button" className="attach-item" onClick={() => clickFile(t.type)}>
                {t.icon} {t.label}
              </button>
              {t.lib && (
                <button type="button" className="attach-item sub" onClick={() => clickLib(t.type)}>
                  ↥ Из сохранённых
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {pickLib && onPickFromLib && (
        <LibraryPicker
          type={pickLib}
          onClose={() => setPickLib(null)}
          onPick={lib => { setPickLib(null); onPickFromLib(pickLib, lib) }}
        />
      )}
    </div>
  )
}

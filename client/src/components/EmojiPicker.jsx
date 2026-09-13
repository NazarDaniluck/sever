import { useState } from 'react'

const EMOJI = [
  '😀','😁','😂','🤣','😃','😄','😅','😊','😇','🙂','😉','😍','😘','😜','🤪','😎','🤩','🥳','😢','😭','😡','🤬','😱','😴','🤔','🙄','😬','🤗','🤫','🤭','😐','😶','🥺','😤','😈','👻','💀','🤖','👽','🎃','😺','🙈','🙉','🙊','💪','👍','👎','👏','🙏','🤝','✌️','🤞','👌','☝️','👊','🫶','💅','👀','🧠','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','🔥','✨','⭐','🌟','💫','⚡','❄️','☀️','🌙','🌈','☁️','🌍','🌊','🍀','🎉','🎊','🎁','🎂','🍰','🍕','🍔','🍟','🌮','🍣','🍩','🍪','☕','🍺','🍷','🥂','💯','✅','❌','⚠️','❗','❓','💡','📚','📖','✏️','📌','📎','📷','🎬','🎵','🎧','🎤','🎮','🏆','⚽','🏀','🚀','✈️','🚗','🏠','💻','📱','🖥️','⌨️','🕹️','🧩','🎲','♟️','🔔','🔒','🔑','🛡️','⚙️','🔧','🧨','💣','🗿'
]

const openToText = (value, emoji) => {
  const text = value || ''
  return text ? (text.endsWith(' ') || text.endsWith('\n') ? text + emoji + ' ' : text + ' ' + emoji + ' ') : emoji + ' '
}

// Кнопка с выпадающим каталогом эмодзи. Вставляет выбранный эмодзи в text через onSelect(emoji).
export default function EmojiPicker({ value, onSelect, className = '', title = 'Эмодзи' }) {
  const [open, setOpen] = useState(false)

  const insert = (em) => {
    onSelect?.(openToText(value, em))
    setOpen(false)
  }

  return (
    <span className={`emoji-picker-wrap ${className}`}>
      <button
        type="button"
        className={`icon-btn emoji-picker-btn ${open ? 'open' : ''}`}
        title={title}
        onClick={() => setOpen(v => !v)}
      >
        🙂
      </button>
      {open && (
        <div className="emoji-picker-pop" onClick={e => e.stopPropagation()}>
          <div className="emoji-grid">
            {EMOJI.map((em, i) => (
              <button key={i} type="button" className="emoji-cell" onClick={() => insert(em)}>
                {em}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}

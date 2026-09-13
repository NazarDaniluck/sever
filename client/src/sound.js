let enabled = localStorage.getItem('sever_sound') !== '0'

export function setSoundEnabled(v) {
  enabled = v
  localStorage.setItem('sever_sound', v ? '1' : '0')
}

export function isSoundEnabled() {
  return enabled
}

export function playMessageSound() {
  if (!enabled) return
  try {
    const a = new Audio('/sounds/oh-dear-hl.mp3')
    a.volume = 0.5
    a.play().catch(() => {})
  } catch { /* без звука */ }
}

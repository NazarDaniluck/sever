import { createContext, useContext, useEffect, useState } from 'react'

const SettingsContext = createContext(null)

export const BACKDROPS = [
  { id: 'ocean',  name: 'Океан',   css: 'linear-gradient(120deg, #4a90c2 0%, #1b3a5c 100%)' },
  { id: 'sunset', name: 'Закат',   css: 'linear-gradient(120deg, #f2c57c 0%, #c1713f 100%)' },
  { id: 'forest', name: 'Лес',     css: 'linear-gradient(120deg, #79b07a 0%, #2c4a34 100%)' },
  { id: 'night',  name: 'Ночь',    css: 'linear-gradient(120deg, #6a6f9e 0%, #121a33 100%)' },
  { id: 'metro',  name: 'Графит',  css: 'linear-gradient(120deg, #c5cbd4 0%, #4b5058 100%)' }
]

export function hexToColor(value) {
  return value && /^#[0-9a-fA-F]{6}$/.test(String(value).trim()) ? String(value).trim().toLowerCase() : null
}

// Палитра «вырвиглазных» цветов для фона страницы профиля (передняк)
export const PAGE_COLORS = [
  { id: 'sky',    name: 'Небесный',      css: 'linear-gradient(135deg,#7fdbff 0%,#2979ff 100%)' },
  { id: 'ocean',  name: 'Океан',         css: 'linear-gradient(135deg,#00c6ff 0%,#0072ff 100%)' },
  { id: 'mint',   name: 'Мята',          css: 'linear-gradient(135deg,#00e5d0 0%,#00b09b 100%)' },
  { id: 'emerald',name: 'Изумруд',       css: 'linear-gradient(135deg,#2ecc71 0%,#0a8f4f 100%)' },
  { id: 'lime',   name: 'Лайм',          css: 'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)' },
  { id: 'lemon',  name: 'Лимон',         css: 'linear-gradient(135deg,#f7ff00 0%,#d4af37 100%)' },
  { id: 'amber',  name: 'Янтарь',        css: 'linear-gradient(135deg,#ffd54f 0%,#ff8f00 100%)' },
  { id: 'tangerine', name: 'Мандарин',   css: 'linear-gradient(135deg,#ffb347 0%,#ff6a00 100%)' },
  { id: 'sunset', name: 'Закат',         css: 'linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)' },
  { id: 'rose',   name: 'Роза',          css: 'linear-gradient(135deg,#ff9a9e 0%,#fecfef 100%)' },
  { id: 'candy',  name: 'Карамель',      css: 'linear-gradient(135deg,#ff6fd8 0%,#3813c2 100%)' },
  { id: 'magenta',name: 'Пурпур',        css: 'linear-gradient(135deg,#ff00cc 0%,#333399 100%)' },
  { id: 'violet', name: 'Фиолет',        css: 'linear-gradient(135deg,#a18cd1 0%,#fbc2eb 100%)' },
  { id: 'grape',  name: 'Виноград',      css: 'linear-gradient(135deg,#7f00ff 0%,#e100ff 100%)' },
  { id: 'indigo', name: 'Индиго',        css: 'linear-gradient(135deg,#4776e6 0%,#8e54e9 100%)' },
  { id: 'blue',   name: 'Синий',         css: 'linear-gradient(135deg,#2193b0 0%,#6dd5ed 100%)' },
  { id: 'navy',   name: 'Тёмно-синий',   css: 'linear-gradient(135deg,#1a2980 0%,#26d0ce 100%)' },
  { id: 'slate',  name: 'Сланец',        css: 'linear-gradient(135deg,#536976 0%,#292e49 100%)' },
  { id: 'graphite',name: 'Графит',       css: 'linear-gradient(135deg,#616161 0%,#9bc5c3 100%)' },
  { id: 'fire',   name: 'Пламя',         css: 'linear-gradient(135deg,#f12711 0%,#f5af19 100%)' },
  { id: 'crimson',name: 'Багрянец',      css: 'linear-gradient(135deg,#c31432 0%,#240b36 100%)' },
  { id: 'blood',  name: 'Кровь',         css: 'linear-gradient(135deg,#ee0979 0%,#ff6a00 100%)' },
  { id: 'peach',  name: 'Персик',        css: 'linear-gradient(135deg,#fddb92 0%,#d1fdff 100%)' },
  { id: 'lavender',name: 'Лаванда',      css: 'linear-gradient(135deg,#c2e9fb 0%,#a1c4fd 100%)' },
  { id: 'lilac',  name: 'Сирень',        css: 'linear-gradient(135deg,#e0c3fc 0%,#8ec5fc 100%)' },
  { id: 'teal',   name: 'Бирюза',        css: 'linear-gradient(135deg,#11998e 0%,#38ef7d 100%)' },
  { id: 'cyan',   name: 'Циан',          css: 'linear-gradient(135deg,#00c3ff 0%,#ffff1c 100%)' },
  { id: 'gold',   name: 'Золото',        css: 'linear-gradient(135deg,#bf953f 0%,#fcf6ba 50%,#b38728 100%)' },
  { id: 'silver', name: 'Серебро',       css: 'linear-gradient(135deg,#bdc3c7 0%,#ececce 100%)' },
  { id: 'cherry', name: 'Вишня',         css: 'linear-gradient(135deg,#eb3349 0%,#f45c43 100%)' }
]

export function backdropToStyle(backdrop) {
  if (!backdrop || backdrop.type === 'none') return {}
  if (backdrop.type === 'color' && backdrop.value) return { background: hexToColor(backdrop.value) }
  if (backdrop.type === 'custom' && backdrop.value) return { backgroundImage: `url(${backdrop.value})` }
  const preset = BACKDROPS.find(b => b.id === backdrop.value)
  return preset ? { backgroundImage: preset.css } : {}
}

// Стиль фона страницы профиля (передняк): цвет, пресет-градиент или картинка по URL
// с настраиваемой прозрачностью (opacity 0.05..1, по умолчанию 1).
export function pageBgToStyle(pageBg) {
  if (!pageBg || pageBg.type === 'none') return {}
  const op = typeof pageBg.opacity === 'number' ? pageBg.opacity : 1
  if (pageBg.type === 'color') {
    const c = hexToColor(pageBg.value)
    return c ? { background: c, opacity: op } : {}
  }
  if (pageBg.type === 'image' && pageBg.value) {
    return { backgroundImage: `url(${pageBg.value})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: op }
  }
  const preset = PAGE_COLORS.find(p => p.id === pageBg.value)
  return preset ? { backgroundImage: preset.css, opacity: op } : {}
}

export function pageColorToStyle(pageColor) {
  const c = hexToColor(pageColor)
  return c ? { background: c } : {}
}

// ---------- Вспомогательные утилиты для адаптации под цвет фона страницы ----------

// '#rrggbb' -> 'r, g, b' или null
export function hexToRgb(hex) {
  const c = hexToColor(hex)
  if (!c) return null
  return `${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}`
}

// Усредняет все hex-цвета внутри CSS-градиента 'linear-gradient(...)' -> 'r, g, b'
export function gradientToRgb(css) {
  const m = String(css).match(/#[0-9a-fA-F]{6}/g)
  if (!m || !m.length) return null
  let r = 0, g = 0, b = 0
  m.forEach(h => {
    r += parseInt(h.slice(1, 3), 16)
    g += parseInt(h.slice(3, 5), 16)
    b += parseInt(h.slice(5, 7), 16)
  })
  return `${Math.round(r / m.length)}, ${Math.round(g / m.length)}, ${Math.round(b / m.length)}`
}

// Репрезентативный цвет фона страницы ('r, g, b') или null, если цвет неизвестен (картинка/нет)
export function pageBgToRgb(pageBg) {
  if (!pageBg || pageBg.type === 'none') return null
  if (pageBg.type === 'color') return hexToRgb(pageBg.value)
  if (pageBg.type === 'preset') {
    const preset = PAGE_COLORS.find(p => p.id === pageBg.value)
    return preset ? gradientToRgb(preset.css) : null
  }
  return null
}

// Относительная светимость (0..1) по 'r, g, b' или null
export function rgbLuma(rgb) {
  if (!rgb) return null
  const parts = String(rgb).split(',').map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  const [r, g, b] = parts
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Значение по умолчанию — подстраиваемся под систему один раз при первом входе
function defaultTheme() {
  return systemPrefersDark() ? 'dark' : 'light'
}

function normalizeStored(t) {
  if (t === 'light' || t === 'dark') return t
  if (t === 'system') return defaultTheme() // устаревшее значение
  return defaultTheme()
}

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(() => normalizeStored(readStored('sever_theme', null)))
  const [backdrop, setBackdrop] = useState(() => readStored('sever_backdrop', { type: 'preset', value: 'ocean' }))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const changeTheme = (t) => { setTheme(normalizeStored(t)); localStorage.setItem('sever_theme', JSON.stringify(normalizeStored(t))) }
  const changeBackdrop = (b) => { setBackdrop(b); localStorage.setItem('sever_backdrop', JSON.stringify(b)) }

  const backdropStyle = backdropToStyle(backdrop)

  return (
    <SettingsContext.Provider value={{ theme, changeTheme, backdrop, changeBackdrop, backdropStyle }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
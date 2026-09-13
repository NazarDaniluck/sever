export function timeAgo(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'только что'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days} дн`
  return d.toLocaleDateString('ru-RU')
}

export function fullDate(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Дата рождения хранится как «YYYY-MM-DD» — форматируем без сдвига часового пояса.
export function birthdayText(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function pluralYears(n) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'год'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'года'
  return 'лет'
}

export function ageText(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return ''
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  if (age < 0) age = 0
  return `${age} ${pluralYears(age)}`
}

// «11 сентября 2011 г. (14 лет)»
export function birthdayWithAge(dateStr) {
  const t = birthdayText(dateStr)
  const a = ageText(dateStr)
  return t && a ? `${t} (${a})` : (t || a)
}

export function initials(name) {
  return (name || '?').charAt(0).toUpperCase()
}

// Текущее смещение часового пояса от UTC с учётом летнего времени.
// Например: 'Europe/Kyiv' -> '(UTC+03:00) Europe/Kyiv'
export function tzLabel(tz) {
  const zone = tz || 'Europe/Kyiv'
  let offset = ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const name = parts.find(p => p.type === 'timeZoneName')?.value || ''
    // «GMT+3» или «GMT+03:00» -> «UTC+03:00»
    offset = name.replace('GMT', 'UTC')
  } catch { /* игнорируем — оставим только имя */ }
  return offset ? `(${offset}) ${zone}` : zone
}
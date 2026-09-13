import { postsApi } from './api.js'

// Трекер просмотров постов при листании ленты.
// Собирает id попавших в зону видимости постов и отправляет пачкой (1 запрос на скролл),
// а затем рассылает обновлённые счётчики подписчикам.
let pending = new Set()
let timer = null
const listeners = new Set()

export function trackPostView(id) {
  if (!id || pending.has(id)) return
  pending.add(id)
  if (timer == null) timer = setTimeout(flush, 600)
}

export function onPostViews(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function flush() {
  timer = null
  if (!pending.size) return
  const ids = [...pending]
  pending = new Set()
  postsApi.views(ids).then((d) => {
    if (d.views) for (const fn of listeners) fn(d.views)
  }).catch(() => {})
}

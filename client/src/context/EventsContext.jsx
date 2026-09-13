import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { eventsApi } from '../api.js'
import { playMessageSound } from '../sound.js'

const EventsContext = createContext(null)

// Куда ведёт событие
export function eventUrl(evt) {
  const t = evt.target
  switch (t && t.type) {
    case 'post': return `/post/${t.id}`
    case 'photo': return `/photo/${t.id}`
    case 'video': return `/video/${t.id}`
    case 'avatar': return `/avatar/${t.username}`
    case 'community': return `/c/${t.id}`
    case 'group': return `/groups/${t.id}`
    case 'message': return '/messages'
    case 'friend': return `/u/${evt.actor?.username || ''}`
    default: return '/events'
  }
}

// Текст события для списка/уведомления
export function eventText(evt) {
  const name = evt.actor?.displayName || evt.actor?.username || 'Кто-то'
  switch (evt.type) {
    case 'mention': return `${name} упомянул(а) вас`
    case 'reply': return `${name} ответил(а) на ваш комментарий`
    case 'avatar_comment': return `${name} прокомментировал(а) вашу аватарку`
    case 'message_request': return `${name} хочет написать вам`
    case 'message_request_approved': return `${name} одобрил(а) вашу заявку на переписку`
    case 'message_request_rejected': return `${name} отклонил(а) вашу заявку на переписку`
    case 'community_join_request': return `${name} хочет вступить в ваше сообщество`
    case 'community_join_approved': return `${name} принял(а) вашу заявку в сообщество`
    case 'community_join_rejected': return `${name} отклонил(а) вашу заявку в сообщество`
    case 'group_invite': return `${name} пригласил(а) вас в группу`
    case 'role_changed': return `${name} изменил(а) ваш статус — ${evt.body || ''}`
    case 'friend_request': return `${name} хочет добавить вас в друзья`
    case 'friend_accepted': return `${name} — теперь вы друзья`
    case 'friend_rejected': return `${name} отклонил(а) вашу заявку в друзья`
    case 'report_response': return `Ответ по вашей жалобе: ${evt.body || ''}`
    default: return `${name} — новое событие`
  }
}

// Браузерное уведомление (если разрешено и не показываем «внутри» страницы события)
export function browserNotify(title, opts = {}) {
  if (typeof Notification === 'undefined') return
  if (localStorage.getItem('sever_notify') !== '1') return
  if (Notification.permission !== 'granted') return
  if (opts.insidePath && window.location.pathname.startsWith(opts.insidePath)) return
  try {
    const n = new Notification(title, {
      body: opts.body || '',
      icon: opts.icon || undefined
    })
    if (opts.url) n.onclick = () => { window.focus(); window.location.href = opts.url }
    if (typeof n.onshow === 'function') n.onshow = () => n.close()
  } catch { /* нет поддержки */ }
}

export function EventsProvider({ children, enabled = true }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!enabled) return
    eventsApi.unread().then(d => setUnread(d.unread)).catch(() => {})
    const s = io('/', { auth: { token: localStorage.getItem('sever_token') } })
    s.on('event', (evt) => {
      setUnread(u => u + 1)
      playMessageSound()
      browserNotify(eventText(evt), {
        body: evt.body || '',
        icon: evt.actor?.avatar || undefined,
        url: eventUrl(evt),
        insidePath: '/events'
      })
    })
    return () => s.close()
  }, [enabled])

  const refresh = () => eventsApi.unread().then(d => setUnread(d.unread)).catch(() => {})

  return (
    <EventsContext.Provider value={{ unread, refresh }}>
      {children}
    </EventsContext.Provider>
  )
}

export function useEvents() {
  return useContext(EventsContext)
}

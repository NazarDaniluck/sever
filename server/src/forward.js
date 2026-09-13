import { utcIso } from './db.js'

// Вложения, которые клиенты умеют рисовать внутри блока «переслано»:
// фотография, видео, аудио, заметка, ссылка на запись, документ
// и вложенная пересылка (это уже готовый снимок — копируется целиком,
// поэтому цепочка «переслано от …» при пересылке пересланного не теряется).
const RENDERABLE = new Set(['photo', 'video', 'audio', 'note', 'post', 'document', 'forward'])

function copyAttachment(a) {
  if (!RENDERABLE.has(a.type)) return null
  if (a.type === 'forward') return a
  if (a.type === 'photo') return { type: 'photo', url: a.url, photoId: a.photoId }
  if (a.type === 'video') return { type: 'video', url: a.url, youtube: a.youtube, name: a.name, videoId: a.videoId }
  if (a.type === 'audio') return { type: 'audio', url: a.url, name: a.name, cover: a.cover }
  if (a.type === 'note') return { type: 'note', text: a.text }
  if (a.type === 'post') return { type: 'post', postId: a.postId }
  if (a.type === 'document') return { type: 'document', url: a.url, name: a.name }
  return null
}

// Собирает вложение «пересланное сообщение» из сообщения-источника.
// Опросы в пересылку не попадают (интерактивная механика, снапшот обманет).
// Возвращает null, если показывать нечего (нет текста и нет рисуемых вложений,
// например сообщение, состоящее только из опроса) — тогда пересылка запрещена.
export function buildForwardAttachment(srcRow, senderRow) {
  let atts = []
  try { atts = JSON.parse(srcRow.attachments || '[]') } catch { atts = [] }
  const media = atts.map(copyAttachment).filter(Boolean)
  if (!(srcRow.body || '').trim() && !media.length) return null
  return [{
    type: 'forward',
    id: srcRow.id,
    senderName: senderRow.display_name || senderRow.username,
    senderUsername: senderRow.username,
    body: srcRow.body || '',
    createdAt: utcIso(srcRow.created_at),
    atts: media
  }]
}

// Справочники анкеты профиля (значения + подписи) — используются в настройках
// (форма) и на странице профиля (отображение). Значения хранятся в БД.

export const MARITAL_OPTIONS = [
  { value: 'not_selected', label: 'Не указано' },
  { value: 'single', label: 'Не женат / не замужем' },
  { value: 'in_relationship', label: 'В отношениях' },
  { value: 'engaged', label: 'Помолвлен(а)' },
  { value: 'married', label: 'Женат / замужем' },
  { value: 'complicated', label: 'Всё сложно' },
  { value: 'active_search', label: 'В активном поиске' },
  { value: 'in_love', label: 'Влюблён(а)' },
  { value: 'civil_marriage', label: 'В гражданском браке' }
]

export const POLITICAL_OPTIONS = [
  { value: 'not_selected', label: 'Не указаны' },
  { value: 'communist', label: 'Коммунистические' },
  { value: 'socialist', label: 'Социалистические' },
  { value: 'moderate', label: 'Умеренные' },
  { value: 'liberal', label: 'Либеральные' },
  { value: 'conservative', label: 'Консервативные' },
  { value: 'monarchist', label: 'Монархические' },
  { value: 'ultraconservative', label: 'Ультраконсервативные' },
  { value: 'libertarian', label: 'Либертарианские' },
  { value: 'indifferent', label: 'Индифферентные' }
]

export const PSYCHOTYPE_OPTIONS = [
  { value: 'not_selected', label: 'Не указано' },
  { value: 'introvert', label: 'Интроверт' },
  { value: 'extrovert', label: 'Экстраверт' },
  { value: 'social_introvert', label: 'Социальные интроверты' },
  { value: 'ambivert', label: 'Амбиверты' },
  { value: 'textrovert', label: 'Текстроверты' }
]

export const THINKING_TYPE_OPTIONS = [
  { value: 'not_selected', label: 'Не указано' },
  { value: 'techie', label: 'Технарь' },
  { value: 'humanities', label: 'Гуманитарий' }
]

export const BIRTHDAY_VIS_OPTIONS = [
  { value: 'everyone', label: 'Все' },
  { value: 'friends', label: 'Друзья' },
  { value: 'only_me', label: 'Только я' }
]

// Статусы, в которых можно указать партнёра (по желанию)
export const PARTNER_STATUSES = ['in_relationship', 'engaged', 'married', 'complicated', 'in_love', 'civil_marriage']

export const PARTNER_PREFIX = {
  in_relationship: 'В отношениях с',
  engaged: 'Помолвлен(а) с',
  married: 'В браке с',
  complicated: 'Всё сложно с',
  in_love: 'Влюблён(а) в',
  civil_marriage: 'В гражданском браке с'
}

export function labelOf(list, value) {
  const o = (list || []).find(x => x.value === value)
  return o ? o.label : ''
}

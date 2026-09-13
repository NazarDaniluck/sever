import db from './db.js'

const DEFAULTS = {
  app_mode: 'normal',     // normal | maintenance — «штатный» / «тех. работы»
  reg_mode: 'free',       // free | invite — «свободный» / «по приглашениям»
  invite_key: 'sever2026', // ключ, обязательный при reg_mode = invite
  sidebar_ad_enabled: '0',
  sidebar_ad_image: '',
  sidebar_ad_title: '',
  sidebar_ad_desc: '',
  sidebar_ad_link: ''
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), String(value))
}

export function getSetting(key) {
  let row = db.prepare('SELECT value FROM settings WHERE key = ?').get(String(key))
  if (!row) {
    if (!(key in DEFAULTS)) return null
    setSetting(key, DEFAULTS[key])
    row = db.prepare('SELECT value FROM settings WHERE key = ?').get(String(key))
  }
  return row.value
}

export const getAppMode = () => getSetting('app_mode')
export const getRegMode = () => getSetting('reg_mode')
export const getInviteKey = () => getSetting('invite_key')

export const getSidebarAd = () => ({
  enabled: getSetting('sidebar_ad_enabled') === '1',
  image: getSetting('sidebar_ad_image') || '',
  title: getSetting('sidebar_ad_title') || '',
  desc: getSetting('sidebar_ad_desc') || '',
  link: getSetting('sidebar_ad_link') || ''
})

export const publicConfig = () => ({
  appMode: getSetting('app_mode'),
  regMode: getSetting('reg_mode'),
  sidebarAd: getSidebarAd()
})
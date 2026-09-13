import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar.jsx'
import { Avatar } from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettings, BACKDROPS, PAGE_COLORS, hexToColor } from '../context/SettingsContext.jsx'
import { usersApi, authApi } from '../api.js'
import { setSoundEnabled } from '../sound.js'
import { tzLabel } from '../utils.js'
import TwoFactorHelp from '../components/TwoFactorHelp.jsx'
import { MARITAL_OPTIONS, POLITICAL_OPTIONS, PSYCHOTYPE_OPTIONS, THINKING_TYPE_OPTIONS, BIRTHDAY_VIS_OPTIONS, PARTNER_STATUSES } from '../profileMeta.js'

const TABS = [
  { id: 'about', label: 'Описание профиля' },
  { id: 'appearance', label: 'Оформление' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'privacy', label: 'Приватность' },
  { id: 'security', label: 'Безопасность' },
  { id: 'securitylog', label: 'Журнал безопасности' }
]

export default function Settings() {
  const { user, setUser } = useAuth()
  const { theme, changeTheme, backdrop, changeBackdrop } = useSettings()

  const [tab, setTab] = useState('about')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [secBusy, setSecBusy] = useState(false)
  const [customUrl, setCustomUrl] = useState(backdrop.type === 'custom' ? backdrop.value : '')
  const [customColor, setCustomColor] = useState(backdrop.type === 'color' ? backdrop.value : '#4a90c2')
  const [pageColorHex, setPageColorHex] = useState(user.pageColor || '')
  const [pageBgType, setPageBgType] = useState(() => user.pageBg?.type || 'none')
  const [pageBgPreset, setPageBgPreset] = useState(user.pageBg?.type === 'preset' ? user.pageBg.value : '')
  const [pageBgImage, setPageBgImage] = useState(user.pageBg?.type === 'image' ? user.pageBg.value : '')
  const [pageBgOpacity, setPageBgOpacity] = useState(() => {
    const op = Number(user.pageBg?.opacity)
    return !Number.isNaN(op) && op >= 0.05 && op <= 1 ? op : 1
  })
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('sever_sound') !== '0')
  const [notifyOn, setNotifyOn] = useState(() => localStorage.getItem('sever_notify') === '1')
  const [avatarScale, setAvatarScale] = useState(user.avatarScale || 1)
  const [pendingAvatar, setPendingAvatar] = useState(null)

  // Безопасность
  const [emailPassword, setEmailPassword] = useState('')
  const [tfaStep, setTfaStep] = useState('idle') // idle | setup | codes
  const [tfaPassword, setTfaPassword] = useState('')
  const [tfaCode, setTfaCode] = useState('')
  const [tfaSetup, setTfaSetup] = useState(null) // { secret, otpauthUrl, qrDataUrl }
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [sessions, setSessions] = useState([])
  const [securityLog, setSecurityLog] = useState([])
  const [secMsg, setSecMsg] = useState('')

  // Анкета «О себе»
  const [about, setAbout] = useState({})
  const [aboutPassword, setAboutPassword] = useState('')

  useEffect(() => {
    setEmail(user.email || '')
    setAbout({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      username: user.username || '',
      status: user.status || '',
      hometown: user.hometown || '',
      maritalStatus: user.maritalStatus || 'not_selected',
      maritalPartner: user.maritalPartner || '',
      politicalViews: user.politicalViews || 'not_selected',
      birthday: user.birthday || '',
      birthdayVisibility: user.birthdayVisibility || 'everyone',
      interests: user.interests || '',
      favoriteMusic: user.favoriteMusic || '',
      favoriteMovies: user.favoriteMovies || '',
      favoriteTv: user.favoriteTv || '',
      favoriteBooks: user.favoriteBooks || '',
      favoriteQuotes: user.favoriteQuotes || '',
      favoriteGames: user.favoriteGames || '',
      aboutMe: user.aboutMe || user.bio || '',
      telegram: user.telegram || '',
      contactEmail: user.contactEmail || '',
      website: user.website || '',
      city: user.city || '',
      address: user.address || '',
      psychotype: user.psychotype || 'not_selected',
      thinkingType: user.thinkingType || 'not_selected'
    })
  }, [user])

  // Если на сервере сохранён задник, показываем его (а не локальное значение)
  useEffect(() => {
    if (user.backdrop && JSON.stringify(user.backdrop) !== JSON.stringify(backdrop)) {
      changeBackdrop(user.backdrop)
      setCustomUrl(user.backdrop.type === 'custom' ? user.backdrop.value || '' : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.backdrop])

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2500) }

  const saveEmail = async (e) => {
    e.preventDefault()
    setSecBusy(true); setErr('')
    try {
      const u = await usersApi.update({ email, currentPassword: emailPassword || undefined })
      setUser(u)
      setEmailPassword('')
      flash('Email обновлён.')
    } catch (ex) { setErr(ex.message) }
    finally { setSecBusy(false) }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setErr('')
    if (newPassword.length < 8) return setErr('Пароль должен быть не короче 8 символов')
    if (newPassword !== confirmPassword) return setErr('Пароли не совпадают')
    setSecBusy(true)
    try {
      const res = await usersApi.changePassword({ currentPassword, newPassword })
      if (res.token) localStorage.setItem('sever_token', res.token)
      if (res.user) setUser(res.user)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      flash('Пароль изменён. Остальные сессии завершены.')
    } catch (ex) { setErr(ex.message) }
    finally { setSecBusy(false) }
  }

  const onAvatarPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    setPendingAvatar(file)
    setAvatarScale(user.avatarScale || 1)
  }

  const saveAvatar = async () => {
    if (!pendingAvatar) return
    setErr('')
    try {
      const fd = new FormData()
      fd.append('avatar', pendingAvatar)
      fd.append('scale', String(avatarScale))
      const u = await usersApi.uploadAvatar(fd)
      setUser(u)
      setPendingAvatar(null)
      flash('Аватар обновлён.')
    } catch (ex) { setErr(ex.message) }
  }

  const cancelAvatar = () => {
    setPendingAvatar(null)
    setAvatarScale(user.avatarScale || 1)
  }

  const saveCover = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    try {
      const fd = new FormData()
      fd.append('cover', file)
      const u = await usersApi.uploadCover(fd)
      setUser(u)
      flash('Обложка обновлена.')
    } catch (ex) { setErr(ex.message) }
  }

  const setAboutField = (k) => (e) => setAbout(a => ({ ...a, [k]: e.target.value }))

  const saveAbout = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const wantsUsernameChange = about.username.trim() !== (user.username || '')
    try {
      const payload = {
        firstName: about.firstName,
        lastName: about.lastName,
        status: about.status,
        hometown: about.hometown,
        maritalStatus: about.maritalStatus,
        maritalPartner: PARTNER_STATUSES.includes(about.maritalStatus) ? about.maritalPartner : '',
        politicalViews: about.politicalViews,
        birthday: about.birthday || null,
        birthdayVisibility: about.birthdayVisibility,
        interests: about.interests,
        favoriteMusic: about.favoriteMusic,
        favoriteMovies: about.favoriteMovies,
        favoriteTv: about.favoriteTv,
        favoriteBooks: about.favoriteBooks,
        favoriteQuotes: about.favoriteQuotes,
        favoriteGames: about.favoriteGames,
        aboutMe: about.aboutMe,
        telegram: about.telegram,
        contactEmail: about.contactEmail,
        website: about.website,
        city: about.city,
        address: about.address,
        psychotype: about.psychotype,
        thinkingType: about.thinkingType
      }
      if (wantsUsernameChange) {
        if (!aboutPassword) return setErr('Для смены никнейма введите текущий пароль')
        payload.username = about.username.trim()
        payload.currentPassword = aboutPassword
      }
      const u = await usersApi.update(payload)
      setUser(u)
      setAboutPassword('')
      flash('Анкета сохранена.')
    } catch (ex) { setErr(ex.message) }
    finally { setBusy(false) }
  }

  const loadSecurity = async () => {
    try {
      const [s, l] = await Promise.all([authApi.sessions(), authApi.securityLog()])
      setSessions(s)
      setSecurityLog(l)
    } catch (ex) { setErr(ex.message) }
  }

  useEffect(() => {
    if (tab === 'security' || tab === 'securitylog') loadSecurity()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const start2fa = async () => {
    setErr(''); setSecMsg('')
    if (!tfaPassword) return setErr('Введите текущий пароль')
    try {
      const d = await authApi.twoFactorSetup(tfaPassword)
      setTfaSetup(d)
      setTfaCode('')
      setTfaStep('setup')
    } catch (ex) { setErr(ex.message) }
  }

  const confirm2fa = async () => {
    setErr(''); setSecMsg('')
    if (!tfaCode) return setErr('Введите код из приложения')
    try {
      const res = await authApi.twoFactorEnable(tfaPassword, tfaCode)
      if (res.token) localStorage.setItem('sever_token', res.token)
      if (res.user) setUser(res.user)
      setRecoveryCodes(res.recoveryCodes || [])
      setTfaPassword(''); setTfaCode('')
      setTfaStep('codes')
    } catch (ex) { setErr(ex.message) }
  }

  const cancel2fa = async () => {
    setErr(''); setSecMsg('')
    setTfaSetup(null); setTfaPassword(''); setTfaCode('')
    setTfaStep('idle')
  }

  const disable2fa = async () => {
    setErr(''); setSecMsg('')
    if (!tfaPassword || !tfaCode) return setErr('Введите пароль и код 2FA')
    try {
      const res = await authApi.twoFactorDisable(tfaPassword, tfaCode)
      if (res.token) localStorage.setItem('sever_token', res.token)
      if (res.user) setUser(res.user)
      setTfaPassword(''); setTfaCode('')
      setSecMsg('Двухфакторная аутентификация отключена.')
    } catch (ex) { setErr(ex.message) }
  }

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setSecMsg('Резервные коды скопированы.')
    } catch {
      setErr('Не удалось скопировать — скопируйте вручную.')
    }
  }

  const revokeSession = async (id) => {
    setErr(''); setSecMsg('')
    try {
      await authApi.revokeSession(id)
      setSessions(await authApi.sessions())
      setSecMsg('Сессия завершена.')
    } catch (ex) { setErr(ex.message) }
  }

  const logoutAllDevices = async () => {
    setErr(''); setSecMsg('')
    try {
      await authApi.logoutAll()
      setSessions([])
      setSecMsg('Все остальные сессии завершены.')
    } catch (ex) { setErr(ex.message) }
  }

  const saveBackdrop = async (b) => {
    changeBackdrop(b)
    setErr('')
    try {
      const u = await usersApi.update({ backdrop: b })
      setUser(u)
      flash('Задник страницы обновлён.')
    } catch (ex) { setErr(ex.message) }
  }

  const applyCustom = () => {
    if (customUrl.trim()) saveBackdrop({ type: 'custom', value: customUrl.trim() })
  }

  const applyCustomColor = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(customColor.trim())) saveBackdrop({ type: 'color', value: customColor.trim() })
    else setErr('Некорректный цвет: нужен формат #RRGGBB')
  }

  const savePageColor = async (color) => {
    setErr('')
    const pc = color ? String(color).trim() : null
    if (pc && !/^#[0-9a-fA-F]{6}$/.test(pc)) { setErr('Некорректный цвет: нужен формат #RRGGBB'); return }
    try {
      const u = await usersApi.update({ pageColor: pc })
      setUser(u)
      flash(pc ? 'Цвет страницы обновлён.' : 'Цвет страницы сброшен.')
    } catch (ex) { setErr(ex.message) }
  }

  // Сохранить фон страницы профиля (передняк): пресет / цвет / картинка по URL / нет.
  const savePageBg = async (bg) => {
    setErr('')
    if (bg && bg.type === 'image' && !String(bg.value || '').trim()) {
      setErr('Введите ссылку на изображение'); return
    }
    try {
      const payload = { pageBg: bg }
      const u = await usersApi.update(payload)
      setUser(u)
      flash('Фон страницы обновлён.')
    } catch (ex) { setErr(ex.message) }
  }

  const toggleOnline = async () => {
    setErr('')
    try {
      const u = await usersApi.update({ showOnline: !user.showOnline })
      setUser(u)
      flash(u.showOnline ? 'Статус «в сети» теперь виден другим.' : 'Статус «в сети» скрыт.')
    } catch (ex) { setErr(ex.message) }
  }

  const togglePublic = async () => {
    setErr('')
    try {
      const u = await usersApi.update({ publicProfile: !user.publicProfile })
      setUser(u)
      flash(u.publicProfile ? 'Профиль теперь открыт для просмотра без входа.' : 'Профиль закрыт для гостей.')
    } catch (ex) { setErr(ex.message) }
  }

  const toggleAlwaysBackdrop = async () => {
    setErr('')
    const next = !user.alwaysBackdrop
    try {
      const payload = { alwaysBackdrop: next }
      if (next && !user.backdrop) payload.backdrop = backdrop
      const u = await usersApi.update(payload)
      setUser(u)
      flash(u.alwaysBackdrop ? 'Ваш задник теперь показывается на всём сайте.' : 'Задник показывается только на странице профиля.')
    } catch (ex) { setErr(ex.message) }
  }

  const toggleSound = () => {
    const v = !soundOn
    setSoundOn(v)
    setSoundEnabled(v)
    flash(v ? 'Звук уведомлений включён.' : 'Звук уведомлений выключен.')
  }

  const toggleNotify = async () => {
    const v = !notifyOn
    if (v) {
      if (!('Notification' in window)) { setErr('Этот браузер не поддерживает всплывающие уведомления'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setErr('Разрешение на уведомления не получено — включите его в настройках браузера'); return }
    }
    setNotifyOn(v)
    localStorage.setItem('sever_notify', v ? '1' : '0')
    flash(v ? 'Всплывающие уведомления включены.' : 'Всплывающие уведомления выключены.')
  }

  const toggleMentions = async () => {
    setErr('')
    const next = !(user.allowMentions !== false)
    try {
      const u = await usersApi.update({ allowMentions: next })
      setUser(u)
      flash(u.allowMentions ? 'Ваш логин снова можно упоминать.' : 'Упоминания вашего логина отключены.')
    } catch (ex) { setErr(ex.message) }
  }

  const changeMessageMode = async (mode) => {
    setErr('')
    try {
      const u = await usersApi.update({ messageMode: mode })
      setUser(u)
      const label = mode === 'none' ? 'никто' : mode === 'requests' ? 'только по заявке' : 'все'
      flash(`Теперь писать вам могут ${label}.`)
    } catch (ex) { setErr(ex.message) }
  }

  const toggleProfileVisibility = async () => {
    setErr('')
    const next = user.profileVisibility === 'friends' ? 'open' : 'friends'
    try {
      const u = await usersApi.update({ profileVisibility: next })
      setUser(u)
      flash(next === 'friends' ? 'Профиль закрыт — теперь он виден только друзьям.' : 'Профиль снова открыт для всех.')
    } catch (ex) { setErr(ex.message) }
  }

  const toggleHideGroupPosts = async () => {
    setErr('')
    try {
      const u = await usersApi.update({ hideGroupPosts: !user.hideGroupPosts })
      setUser(u)
      flash(u.hideGroupPosts ? 'Посты от имени сообществ/групп скрыты.' : 'Посты от имени сообществ/групп снова видны.')
    } catch (ex) { setErr(ex.message) }
  }

  const toggleShowLocalTime = async () => {
    setErr('')
    try {
      const u = await usersApi.update({ showLocalTime: !user.showLocalTime })
      setUser(u)
    } catch (ex) { setErr(ex.message) }
  }

  const saveTimezone = async (e) => {
    setErr('')
    try {
      const u = await usersApi.update({ timezone: e.target.value })
      setUser(u)
    } catch (ex) { setErr(ex.message) }
  }

  const TIMEZONES = [
    'Etc/GMT+12',
    'Etc/GMT+11',
    'Pacific/Pago_Pago',
    'Pacific/Honolulu',
    'America/Adak',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Vancouver',
    'America/Denver',
    'America/Phoenix',
    'America/Chicago',
    'America/Mexico_City',
    'America/New_York',
    'America/Toronto',
    'America/Bogota',
    'America/Caracas',
    'America/Santiago',
    'America/Asuncion',
    'America/Sao_Paulo',
    'America/Buenos_Aires',
    'America/Halifax',
    'America/St_Johns',
    'Atlantic/Azores',
    'Europe/London',
    'Europe/Lisbon',
    'Africa/Casablanca',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Rome',
    'Europe/Madrid',
    'Europe/Warsaw',
    'Europe/Prague',
    'Europe/Amsterdam',
    'Europe/Belgrade',
    'Europe/Athens',
    'Europe/Bucharest',
    'Europe/Helsinki',
    'Europe/Kyiv',
    'Africa/Cairo',
    'Europe/Kaliningrad',
    'Europe/Moscow',
    'Europe/Minsk',
    'Europe/Istanbul',
    'Europe/Samara',
    'Asia/Tbilisi',
    'Asia/Yerevan',
    'Asia/Baku',
    'Asia/Dubai',
    'Asia/Yekaterinburg',
    'Asia/Karachi',
    'Asia/Tashkent',
    'Asia/Almaty',
    'Asia/Kolkata',
    'Asia/Kathmandu',
    'Asia/Omsk',
    'Asia/Dhaka',
    'Asia/Yangon',
    'Asia/Novosibirsk',
    'Asia/Krasnoyarsk',
    'Asia/Bangkok',
    'Asia/Jakarta',
    'Asia/Ho_Chi_Minh',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Singapore',
    'Asia/Irkutsk',
    'Asia/Ulaanbaatar',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Yakutsk',
    'Australia/Adelaide',
    'Australia/Sydney',
    'Asia/Vladivostok',
    'Pacific/Guam',
    'Asia/Magadan',
    'Pacific/Noumea',
    'Asia/Kamchatka',
    'Pacific/Auckland',
    'Pacific/Fiji',
    'Pacific/Tongatapu',
    'Pacific/Kiritimati'
  ]

  const themeOptions = [
    { id: 'light', label: 'Светлая' },
    { id: 'dark', label: 'Тёмная' }
  ]

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        <div className="boxhead">Мои настройки</div>

        <div className="card admin-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {err && <div className="error-text">{err}</div>}
        {msg && <div className="success-text">{msg}</div>}

        {tab === 'about' && (
          <form className="card settings_section" onSubmit={saveAbout}>
            <div className="settings_title">Основная информация</div>
            <div className="form-grid">
              <div>
                <label className="field-label">Имя</label>
                <input className="input" value={about.firstName || ''} onChange={setAboutField('firstName')} />
              </div>
              <div>
                <label className="field-label">Фамилия</label>
                <input className="input" value={about.lastName || ''} onChange={setAboutField('lastName')} />
              </div>
            </div>
            <label className="field-label">Никнейм (адрес страницы)</label>
            <input className="input" value={about.username || ''} onChange={setAboutField('username')} />
            {about.username?.trim() !== user.username && (
              <p className="muted small">Никнейм изменится — понадобится текущий пароль.</p>
            )}
            <label className="field-label">Статус</label>
            <input className="input" value={about.status || ''} onChange={setAboutField('status')} placeholder="Например: «В поисках новых друзей»" />
            <div className="form-grid">
              <div>
                <label className="field-label">Родной город</label>
                <input className="input" value={about.hometown || ''} onChange={setAboutField('hometown')} />
              </div>
              <div>
                <label className="field-label">Семейное положение</label>
                <select value={about.maritalStatus || 'not_selected'} onChange={setAboutField('maritalStatus')}>
                  {MARITAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {PARTNER_STATUSES.includes(about.maritalStatus) && (
                <div>
                  <label className="field-label">С кем (никнейм, по желанию)</label>
                  <input className="input" placeholder="username" value={about.maritalPartner || ''} onChange={setAboutField('maritalPartner')} />
                </div>
              )}
              <div>
                <label className="field-label">Политические взгляды</label>
                <select value={about.politicalViews || 'not_selected'} onChange={setAboutField('politicalViews')}>
                  {POLITICAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Психотип</label>
                <select value={about.psychotype || 'not_selected'} onChange={setAboutField('psychotype')}>
                  {PSYCHOTYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Тип мышления</label>
                <select value={about.thinkingType || 'not_selected'} onChange={setAboutField('thinkingType')}>
                  {THINKING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">День рождения</label>
                <input className="input" type="date" value={about.birthday || ''} onChange={setAboutField('birthday')} />
              </div>
              <div>
                <label className="field-label">Кто видит дату рождения</label>
                <select value={about.birthdayVisibility || 'everyone'} onChange={setAboutField('birthdayVisibility')}>
                  {BIRTHDAY_VIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="settings_title">Личные интересы</div>
            {[
              ['interests', 'Интересы'],
              ['favoriteMusic', 'Любимая музыка'],
              ['favoriteMovies', 'Любимые фильмы'],
              ['favoriteTv', 'Любимые ТВ-шоу'],
              ['favoriteBooks', 'Любимые книги'],
              ['favoriteGames', 'Любимые игры']
            ].map(([k, label]) => (
              <div key={k}>
                <label className="field-label">{label}</label>
                <input className="input" value={about[k] || ''} onChange={setAboutField(k)} />
              </div>
            ))}
            <div>
              <label className="field-label">Любимые цитаты</label>
              <textarea className="textarea" rows={2} value={about.favoriteQuotes || ''} onChange={setAboutField('favoriteQuotes')} />
            </div>
            <div>
              <label className="field-label">Описание профиля</label>
              <textarea className="textarea" rows={4} value={about.aboutMe || ''} onChange={setAboutField('aboutMe')} />
            </div>

            <div className="settings_title">Контактная информация</div>
            <div className="form-grid">
              <div>
                <label className="field-label">Телеграм (без @)</label>
                <input className="input" placeholder="username" value={about.telegram || ''} onChange={setAboutField('telegram')} />
              </div>
              <div>
                <label className="field-label">Электронная почта</label>
                <input className="input" type="email" value={about.contactEmail || ''} onChange={setAboutField('contactEmail')} placeholder="you@example.com" />
              </div>
              <div>
                <label className="field-label">Личный сайт</label>
                <input className="input" value={about.website || ''} onChange={setAboutField('website')} placeholder="https://…" />
              </div>
              <div>
                <label className="field-label">Город</label>
                <input className="input" value={about.city || ''} onChange={setAboutField('city')} />
              </div>
              <div>
                <label className="field-label">Адрес</label>
                <input className="input" value={about.address || ''} onChange={setAboutField('address')} />
              </div>
            </div>

            {about.username?.trim() !== user.username && (
              <>
                <label className="field-label">Текущий пароль (нужен для смены никнейма)</label>
                <input className="input" type="password" value={aboutPassword} onChange={e => setAboutPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              </>
            )}
            <button className="btn primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить анкету'}</button>
          </form>
        )}

        {tab === 'appearance' && (
          <div className="card settings_section">
            <div className="settings_title">Аватар и обложка</div>
            <div className="settings_avatar">
              <Avatar user={user} size={72} />
              <label className="btn ghost file">
                Сменить фото
                <input type="file" accept="image/*" hidden onChange={onAvatarPick} />
              </label>
            </div>
            <p className="muted small">При загрузке фото можно подобрать масштаб — файл при этом не обрезается.</p>
            {pendingAvatar && (
              <div className="settings_section" style={{ marginTop: 12 }}>
                <div className="settings_title">Масштаб аватара при загрузке</div>
                <div className="settings_avatar">
                  <div style={{ width: 180, height: 180, overflow: 'hidden', border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={URL.createObjectURL(pendingAvatar)}
                      alt="Предпросмотр аватара"
                      style={{ objectFit: 'cover', width: '100%', height: '100%', transform: `scale(${avatarScale})` }}
                    />
                  </div>
                </div>
                <div className="row-custom">
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.01}
                    value={avatarScale}
                    onChange={e => setAvatarScale(Number(e.target.value))}
                  />
                  <span className="muted small">{avatarScale.toFixed(2)}</span>
                </div>
                <div className="row-custom">
                  <button className="btn primary" onClick={saveAvatar}>Загрузить</button>
                  <button className="btn ghost" onClick={cancelAvatar}>Отмена</button>
                </div>
              </div>
            )}
            <div className="settings_cover">
              <div className="cover-thumb" style={{ backgroundImage: user.cover ? `url(${user.cover})` : undefined }} />
              <label className="btn ghost file">
                🖼 Обложка страницы
                <input type="file" accept="image/*" hidden onChange={saveCover} />
              </label>
            </div>

            <div className="settings_title">Тема оформления</div>
            <div className="theme-options">
              {themeOptions.map(opt => (
                <label key={opt.id} className={`theme-option ${theme === opt.id ? 'selected' : ''}`}>
                  <input type="radio" name="theme" checked={theme === opt.id} onChange={() => changeTheme(opt.id)} />
                  {opt.label}
                </label>
              ))}
            </div>

            <div className="settings_title">Задник страницы (по бокам)</div>
            <label className="toggle-row">
              <span>Показывать мой задник на всём сайте (лента, сообщения, фото/видео)</span>
              <span className={`toggle ${user.alwaysBackdrop ? 'on' : ''}`} onClick={toggleAlwaysBackdrop}>
                <span className="toggle-knob" />
              </span>
            </label>
            <div className="backdrop-grid">
              <button
                className={`backdrop-item ${backdrop.type === 'none' ? 'selected' : ''}`}
                onClick={() => saveBackdrop({ type: 'none', value: null })}
              >
                <div className="back-thumb none">Без</div>
                <span>Без задника</span>
              </button>
              {BACKDROPS.map(b => (
                <button
                  key={b.id}
                  className={`backdrop-item ${backdrop.type === 'preset' && backdrop.value === b.id ? 'selected' : ''}`}
                  onClick={() => saveBackdrop({ type: 'preset', value: b.id })}
                >
                  <div className="back-thumb" style={{ background: b.css }} />
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
            <div className="row-custom">
              <input
                className="input"
                placeholder="Ссылка на своё изображение…"
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
              />
              <button className="btn ghost" onClick={applyCustom}>Применить URL</button>
            </div>
            <div className="row-custom">
              <input
                type="color"
                className="color-input"
                value={/^#[0-9a-fA-F]{6}$/.test(customColor) ? customColor : '#4a90c2'}
                onChange={e => setCustomColor(e.target.value)}
              />
              <input
                className="input"
                placeholder="#RRGGBB"
                value={customColor}
                onChange={e => setCustomColor(e.target.value)}
              />
              <button className="btn ghost" onClick={applyCustomColor}>Применить цвет</button>
            </div>
            <p className="muted small">Задник виден по бокам страницы; посетители профиля увидят его у вас на странице. Включите «на всём сайте», чтобы он показывался и вам в ленте и сообщениях.</p>

            <div className="settings_title">Фон страницы (передняя часть)</div>
            <p className="muted small">Оформление области, где показываются профиль и посты. Выберите готовый цвет, задайте свой по HEX или вставьте ссылку на картинку и отрегулируйте её прозрачность. Виден всем посетителям вашей страницы.</p>

            <div className="backdrop-grid pagecolor-grid">
              <button
                className={`backdrop-item ${pageBgType === 'none' ? 'selected' : ''}`}
                onClick={() => { setPageBgType('none'); savePageBg({ type: 'none', value: null, opacity: pageBgOpacity }) }}
              >
                <div className="back-thumb none">Без</div>
                <span>Без фона</span>
              </button>
              {PAGE_COLORS.map(pc => (
                <button
                  key={pc.id}
                  className={`backdrop-item ${pageBgType === 'preset' && pageBgPreset === pc.id ? 'selected' : ''}`}
                  title={pc.name}
                  onClick={() => {
                    setPageBgType('preset')
                    setPageBgPreset(pc.id)
                    savePageBg({ type: 'preset', value: pc.id, opacity: pageBgOpacity })
                  }}
                >
                  <div className="back-thumb" style={{ background: pc.css }} />
                  <span>{pc.name}</span>
                </button>
              ))}
              <button
                className={`backdrop-item ${pageBgType === 'color' ? 'selected' : ''}`}
                onClick={() => {
                  setPageBgType('color')
                  savePageBg({ type: 'color', value: hexToColor(pageColorHex) || '#ff6fd8', opacity: pageBgOpacity })
                }}
              >
                <div className="back-thumb" style={{ background: hexToColor(pageColorHex) || '#ff6fd8' }} />
                <span>Свой цвет</span>
              </button>
            </div>

            <div className="row-custom">
              <input
                type="color"
                className="color-input"
                value={hexToColor(pageColorHex) || '#ff6fd8'}
                onChange={e => setPageColorHex(e.target.value)}
              />
              <input
                className="input"
                placeholder="#RRGGBB"
                value={pageColorHex}
                onChange={e => setPageColorHex(e.target.value)}
              />
              <button className="btn ghost" onClick={() => {
                if (!hexToColor(pageColorHex)) { setErr('Некорректный цвет: нужен формат #RRGGBB'); return }
                setPageBgType('color')
                savePageBg({ type: 'color', value: hexToColor(pageColorHex), opacity: pageBgOpacity })
              }}>Применить цвет</button>
            </div>

            <div className="row-custom">
              <input
                className="input"
                placeholder="Ссылка на своё изображение…"
                value={pageBgImage}
                onChange={e => setPageBgImage(e.target.value)}
              />
              <button className="btn ghost" onClick={() => {
                setPageBgType('image')
                savePageBg({ type: 'image', value: pageBgImage.trim(), opacity: pageBgOpacity })
              }}>Применить URL</button>
            </div>

            <div className="row-custom opacity-row">
              <span className="muted small">Прозрачность</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={pageBgOpacity}
                onChange={e => setPageBgOpacity(Number(e.target.value))}
              />
              <span className="muted small">{Math.round(pageBgOpacity * 100)}%</span>
              <button className="btn ghost" onClick={() => savePageBg({ type: pageBgType === 'none' ? 'none' : pageBgType, value: pageBgType === 'preset' ? pageBgPreset : pageBgType === 'image' ? pageBgImage.trim() : hexToColor(pageColorHex), opacity: pageBgOpacity })}>Применить</button>
            </div>

            <div className="row-custom">
              <button className="btn ghost" onClick={() => {
                setPageBgType('none'); setPageBgPreset(''); setPageBgImage(''); setPageColorHex('')
                savePageBg({ type: 'none', value: null, opacity: 1 })
              }}>Сбросить фон</button>
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card settings_section">
            <div className="settings_title">Уведомления</div>
            <label className="toggle-row">
              <span>Звук при новых сообщениях и событиях</span>
              <span className={`toggle ${soundOn ? 'on' : ''}`} onClick={toggleSound}>
                <span className="toggle-knob" />
              </span>
            </label>
            <label className="toggle-row">
              <span>Всплывающие уведомления браузера</span>
              <span className={`toggle ${notifyOn ? 'on' : ''}`} onClick={toggleNotify}>
                <span className="toggle-knob" />
              </span>
            </label>
            <p className="muted small">Звук и всплывающие уведомления работают на всех вкладках и страницах. Всплывающие не показываются, когда вы открыли мессенджер или «Мои события».</p>
          </div>
        )}

        {tab === 'privacy' && (
          <div className="card settings_section">
            <div className="settings_title">Приватность</div>
            <label className="toggle-row">
              <span>Показывать статус «в сети»</span>
              <span className={`toggle ${user.showOnline ? 'on' : ''}`} onClick={toggleOnline}>
                <span className="toggle-knob" />
              </span>
            </label>
            <label className="toggle-row">
              <span>Открыть профиль для просмотра без входа</span>
              <span className={`toggle ${user.publicProfile ? 'on' : ''}`} onClick={togglePublic}>
                <span className="toggle-knob" />
              </span>
            </label>
            <label className="toggle-row">
              <span>Разрешать упоминания моего логина (@логин)</span>
              <span className={`toggle ${user.allowMentions !== false ? 'on' : ''}`} onClick={toggleMentions}>
                <span className="toggle-knob" />
              </span>
            </label>
            <p className="muted small">Если отключено — ваш логин не будет срабатывать как упоминание, и вы не получите уведомления об упоминаниях.</p>
            <label className="toggle-row">
              <span>Закрыть профиль (виден только друзьям)</span>
              <span className={`toggle ${user.profileVisibility === 'friends' ? 'on' : ''}`} onClick={toggleProfileVisibility}>
                <span className="toggle-knob" />
              </span>
            </label>
            <label className="toggle-row">
              <span>Скрывать мои посты, опубликованные от имени сообществ/групп</span>
              <span className={`toggle ${user.hideGroupPosts ? 'on' : ''}`} onClick={toggleHideGroupPosts}>
                <span className="toggle-knob" />
              </span>
            </label>
            <div className="settings_title">Время и часовой пояс</div>
            <label className="toggle-row">
              <span>Показывать моё локальное время на странице</span>
              <span className={`toggle ${user.showLocalTime ? 'on' : ''}`} onClick={toggleShowLocalTime}>
                <span className="toggle-knob" />
              </span>
            </label>
            <div>
              <span className="field-label">Часовой пояс</span>
              <select value={user.timezone || 'Europe/Kyiv'} onChange={saveTimezone}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
              </select>
            </div>
            <div className="msg-mode">
              <span className="field-label">Кто может писать вам</span>
              <label className={`theme-option ${(user.messageMode || 'all') === 'all' ? 'selected' : ''}`}>
                <input type="radio" name="msgMode" checked={(user.messageMode || 'all') === 'all'} onChange={() => changeMessageMode('all')} />
                Все
              </label>
              <label className={`theme-option ${(user.messageMode || 'all') === 'requests' ? 'selected' : ''}`}>
                <input type="radio" name="msgMode" checked={(user.messageMode || 'all') === 'requests'} onChange={() => changeMessageMode('requests')} />
                По заявке
              </label>
              <label className={`theme-option ${(user.messageMode || 'all') === 'none' ? 'selected' : ''}`}>
                <input type="radio" name="msgMode" checked={(user.messageMode || 'all') === 'none'} onChange={() => changeMessageMode('none')} />
                Никто
              </label>
            </div>
            <p className="muted small">«По заявке» — собеседник отправит заявку, и вы решите, одобрить её или отклонить (в мессенджере).</p>
            <p className="muted small">Если открыт — по ссылке профиль можно посмотреть без аккаунта, но лайки, комментарии, фото и «поделиться» будут вести на вход.</p>
          </div>
        )}

        {tab === 'security' && (
          <div className="card settings_section">
            <div className="settings_title">Двухфакторная аутентификация (2FA)</div>
            {!user.twoFactorEnabled && tfaStep === 'idle' && (
              <>
                <p className="muted small">
                  2FA защищает аккаунт от взлома: кроме пароля потребуется код из приложения-аутентификатора.
                  Код работает офлайн и не требует SMS или почты.
                </p>
                <TwoFactorHelp />
                <label className="field-label">Текущий пароль</label>
                <input className="input" type="password" value={tfaPassword} onChange={e => setTfaPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
                <button className="btn primary" onClick={start2fa}>Включить 2FA</button>
              </>
            )}

            {!user.twoFactorEnabled && tfaStep === 'setup' && tfaSetup && (
              <div className="tfa-setup">
                <p className="muted small">
                  1) Отсканируйте QR-код приложением-аутентификатором или введите ключ вручную.<br />
                  2) Введите 6-значный код, который приложение покажет, чтобы подтвердить настройку.
                </p>
                <TwoFactorHelp />
                {tfaSetup.qrDataUrl ? (
                  <div className="tfa-qr"><img src={tfaSetup.qrDataUrl} alt="QR-код 2FA" /></div>
                ) : (
                  <p className="muted small">QR-код недоступен — введите ключ вручную.</p>
                )}
                <label className="field-label">Секретный ключ</label>
                <input className="input" readOnly value={tfaSetup.secret} onFocus={e => e.target.select()} />
                <label className="field-label">Код из приложения</label>
                <input className="input" inputMode="numeric" autoComplete="one-time-code" value={tfaCode} onChange={e => setTfaCode(e.target.value)} placeholder="000000" />
                <div className="row-custom">
                  <button className="btn primary" onClick={confirm2fa}>Подтвердить и включить</button>
                  <button className="btn ghost" onClick={cancel2fa}>Отмена</button>
                </div>
              </div>
            )}

            {user.twoFactorEnabled && tfaStep === 'idle' && (
              <>
                <p className="muted small">2FA включена. При входе теперь требуется код из приложения-аутентификатора.</p>
                {!user.isAdmin && (
                  <>
                    <label className="field-label">Текущий пароль</label>
                    <input className="input" type="password" value={tfaPassword} onChange={e => setTfaPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
                    <label className="field-label">Код 2FA</label>
                    <input className="input" inputMode="numeric" autoComplete="one-time-code" value={tfaCode} onChange={e => setTfaCode(e.target.value)} placeholder="000000" />
                    <button className="btn danger" onClick={disable2fa}>Отключить 2FA</button>
                  </>
                )}
                {user.isAdmin && <p className="muted small">Администраторам отключение 2FA недоступно.</p>}
              </>
            )}

            {tfaStep === 'codes' && (
              <div className="tfa-setup">
                <div className="warn-box">
                  <div className="warn-title">Сохраните резервные коды</div>
                  <div className="warn-body">
                    <p>Каждый код можно использовать только один раз — для входа, если потеряете доступ к приложению.
                    Никто другой их не увидит. После исчерпания перевключите 2FA, чтобы получить новые.</p>
                  </div>
                </div>
                <div className="recovery-codes">
                  {recoveryCodes.map((c, i) => <span key={c}>{i + 1}. {c}</span>)}
                </div>
                <div className="row-custom">
                  <button className="btn primary" onClick={copyRecoveryCodes}>Скопировать</button>
                  <button className="btn ghost" onClick={() => { setRecoveryCodes([]); setTfaStep('idle') }}>Готово</button>
                </div>
              </div>
            )}

            {secMsg && <div className="success-text">{secMsg}</div>}

            <div className="settings_title">Сессии и устройства</div>
            <p className="muted small">Список активных входов в аккаунт. Текущее устройство отмечено.</p>
            {sessions.length === 0
              ? <p className="muted small">Загрузка…</p>
              : (
                <div className="sessions-list">
                  {sessions.map(s => (
                    <div key={s.id} className={`session-item ${s.revoked ? 'revoked' : ''} ${s.current ? 'current' : ''}`}>
                      <div className="session-icon">{s.twoFactor ? '🔐' : '💻'}</div>
                      <div className="session-body">
                        <div className="session-title">
                          <strong>{s.userAgent || 'Неизвестное устройство'}</strong>
                          {s.current && <span className="session-badge current">Это устройство</span>}
                          {s.twoFactor && <span className="session-badge tfa">2FA</span>}
                          {s.revoked && <span className="session-badge revoked">Завершена</span>}
                        </div>
                        <div className="muted small">IP: {s.ip || '—'}</div>
                        <div className="muted small">Вход: {new Date(s.createdAt).toLocaleString('ru-RU')} · Активность: {new Date(s.lastSeen).toLocaleString('ru-RU')}</div>
                        {!s.revoked && <div className="muted small">Действует до {new Date(s.expiresAt).toLocaleString('ru-RU')}</div>}
                      </div>
                      {!s.revoked && !s.current && (
                        <button className="btn danger small" onClick={() => revokeSession(s.id)}>Завершить</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            <div className="row-custom">
              <button className="btn ghost" onClick={logoutAllDevices}>Выйти со всех устройств</button>
              <button className="btn ghost" onClick={loadSecurity}>Обновить</button>
            </div>

            <div className="settings_title">Смена email</div>
            <p className="muted small">Email используется для входа в аккаунт. Для смены нужен текущий пароль.</p>
            <form onSubmit={saveEmail}>
              <label className="field-label">Новый email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              <label className="field-label">Текущий пароль</label>
              <input className="input" type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              <button className="btn primary" disabled={secBusy || !email.trim() || !emailPassword}>{secBusy ? 'Сохраняем…' : 'Сменить email'}</button>
            </form>

            <div className="settings_title">Смена пароля</div>
            <form onSubmit={savePassword}>
              <label className="field-label">Текущий пароль</label>
              <input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              <label className="field-label">Новый пароль</label>
              <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="8–64 символа" minLength={8} maxLength={64} autoComplete="new-password" />
              <label className="field-label">Повторите новый пароль</label>
              <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              <p className="muted small">После смены пароля все остальные сессии будут завершены.</p>
              <button className="btn primary" disabled={secBusy || !currentPassword || !newPassword || !confirmPassword}>
                {secBusy ? 'Сохраняем…' : 'Сменить пароль'}
              </button>
            </form>
          </div>
        )}

        {tab === 'securitylog' && (
          <div className="card settings_section">
            <div className="settings_title">Журнал безопасности</div>
            <p className="muted small">Все действия, связанные с вашим аккаунтом: входы, смена пароля, настройка 2FA и другое.</p>
            {securityLog.length === 0
              ? <p className="muted small">Загрузка…</p>
              : (
                <div className="sessions-list">
                  {securityLog.map(l => (
                    <div key={l.id} className="session-item">
                      <div className="session-icon">🛡</div>
                      <div className="session-body">
                        <div className="session-title">
                          <strong>{({ login_success: 'Вход', login_failed: 'Неудачный вход', login_step1: 'Пароль принят', login_2fa_success: 'Вход с 2FA', login_2fa_failed: 'Неверный код 2FA', register: 'Регистрация', password_changed: 'Смена пароля', '2fa_enabled': 'Включена 2FA', '2fa_disabled': 'Отключена 2FA', '2fa_setup': 'Настройка 2FA', logout_all: 'Выход со всех устройств', session_revoked: 'Сессия завершена' }[l.event] || l.event) }</strong>
                        </div>
                        <div className="muted small">{new Date(l.createdAt).toLocaleString('ru-RU')} · {l.ip || '—'}{l.detail ? ` · ${l.detail}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            <div className="row-custom">
              <button className="btn ghost" onClick={loadSecurity}>Обновить</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

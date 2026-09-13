import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db.js'
import { signToken, signLoginToken, verifyLoginToken, requireAuth, selfUser } from '../auth.js'
import { isUserBlocked } from '../moderation.js'
import { getRegMode, getInviteKey } from '../settings.js'
import {
  reqMeta, logSecurity,
  createSession, revokeSession, revokeAllExcept, invalidateTokens, userSessions, userSecurityLog,
  generateTotpSecret, totpUri, totpQrDataUrl, verifyTotp,
  generateRecoveryCodes, hashRecoveryCode, consumeRecoveryCode,
  authLimiter
} from '../security.js'

const router = Router()

// Хэш «заглушка»: логин с несуществующей почтой делает такую же bcrypt-сверку,
// что и с существующей, — чтобы по времени ответа нельзя было перечислить пользователей.
const DUMMY_HASH = bcrypt.hashSync('sever-timing-dummy', 10)

router.post('/register', authLimiter(60 * 60 * 1000, 5, 'Слишком много регистраций. Подождите час.'), (req, res) => {
  const { email, username, displayName, password, inviteKey } = req.body || {}
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Заполните email, логин и пароль' })
  }
  if (getRegMode() === 'invite') {
    const key = String(inviteKey || '').trim()
    if (!key || key !== getInviteKey()) {
      return res.status(403).json({ error: 'Регистрация только по приглашению. Нужен ключ.' })
    }
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Некорректный email' })
  if (String(email).length > 254) return res.status(400).json({ error: 'Email слишком длинный (максимум 254 символа)' })
  if (!/^[\w-]{3,30}$/.test(String(username))) return res.status(400).json({ error: 'Логин: 3–30 символов, допустимы буквы, цифры, "_" и "-"' })
  if (String(displayName || '').length > 50) return res.status(400).json({ error: 'Имя слишком длинное (максимум 50 символов)' })
  if (String(password).length < 8) return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' })
  if (String(password).length > 64) return res.status(400).json({ error: 'Пароль слишком длинный (максимум 64 символа)' })

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)
  if (existing) return res.status(409).json({ error: 'Не удалось зарегистрироваться. Такой email или логин может уже использоваться.' })

  const hash = bcrypt.hashSync(password, 10)
  const info = db.prepare(`
    INSERT INTO users (email, username, display_name, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(email, username, displayName || username, hash)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  const meta = reqMeta(req)
  const sessionId = createSession(user.id, { ...meta })
  logSecurity(user.id, 'register', { ...meta, detail: 'Регистрация аккаунта' })
  res.status(201).json({ token: signToken(user, sessionId), user: selfUser(user) })
})

router.post('/login', authLimiter(15 * 60 * 1000, 10, 'Слишком много попыток входа. Подождите 15 минут.'), (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль' })
  const meta = reqMeta(req)
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email)
  const ok = user ? bcrypt.compareSync(password, user.password_hash) : bcrypt.compareSync(password, DUMMY_HASH)
  if (!user || !ok) {
    logSecurity(user ? user.id : null, 'login_failed', { ...meta, detail: 'Неверный email или пароль' })
    return res.status(401).json({ error: 'Неверный email или пароль' })
  }

  if (user.memorialized) {
    return res.status(403).json({ error: 'Этот аккаунт в режиме памяти. Вход невозможен.' })
  }
  if (isUserBlocked(user.id)) {
    const b = isUserBlocked(user.id)
    return res.status(403).json({ error: 'Аккаунт заблокирован' + (b.until && b.until !== '9999-12-31T23:59:59.000Z' ? ` до ${new Date(b.until).toLocaleString('ru-RU')}` : '') })
  }

  if (user.totp_enabled) {
    logSecurity(user.id, 'login_step1', { ...meta, detail: 'Пароль принят, требуется код 2FA' })
    return res.json({ twoFactorRequired: true, loginToken: signLoginToken(user) })
  }

  const sessionId = createSession(user.id, { ...meta })
  logSecurity(user.id, 'login_success', { ...meta, detail: 'Вход в аккаунт' })
  res.json({ token: signToken(user, sessionId), user: selfUser(user) })
})

// Второй шаг входа: проверка кода 2FA или резервного кода
router.post('/verify-2fa', authLimiter(15 * 60 * 1000, 8, 'Слишком много попыток ввода кода. Подождите 15 минут.'), (req, res) => {
  const { loginToken, code } = req.body || {}
  if (!loginToken || !code) return res.status(400).json({ error: 'Введите код' })
  const meta = reqMeta(req)
  const user = verifyLoginToken(loginToken)
  if (!user) return res.status(401).json({ error: 'Сессия входа истекла. Войдите заново.' })
  if (!user.totp_enabled) return res.status(401).json({ error: 'Сессия входа истекла. Войдите заново.' })

  const ok = verifyTotp(code, user.totp_secret) || consumeRecoveryCode(user.id, code)
  if (!ok) {
    logSecurity(user.id, 'login_2fa_failed', { ...meta, detail: 'Неверный код 2FA' })
    return res.status(401).json({ error: 'Неверный код. Проверьте приложение или резервный код.' })
  }

  const sessionId = createSession(user.id, { ...meta, twoFactor: true })
  logSecurity(user.id, 'login_2fa_success', { ...meta, detail: 'Вход с подтверждением 2FA' })
  res.json({ token: signToken(user, sessionId), user: selfUser(user) })
})

router.get('/me', requireAuth, (req, res) => res.json(selfUser(req.user)))

// ------------------------- Управление 2FA -------------------------

// Шаг 1: подготовка — создаём секрет и показываем QR/ключ
router.post('/2fa/setup', requireAuth, authLimiter(15 * 60 * 1000, 10, 'Слишком много попыток. Подождите 15 минут.'), async (req, res) => {
  const { password } = req.body || {}
  if (req.user.totp_enabled) return res.status(400).json({ error: '2FA уже включена' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'Неверный пароль' })
  }
  const secret = generateTotpSecret()
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, req.user.id)
  const uri = totpUri(user, secret)
  const meta = reqMeta(req)
  logSecurity(req.user.id, '2fa_setup', { ...meta, detail: 'Начата настройка 2FA' })
  res.json({ secret, otpauthUrl: uri, qrDataUrl: await totpQrDataUrl(uri) })
})

router.post('/2fa/enable', requireAuth, authLimiter(15 * 60 * 1000, 10, 'Слишком много попыток. Подождите 15 минут.'), async (req, res) => {
  const { password, code } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'Неверный пароль' })
  }
  if (!user.totp_secret) return res.status(400).json({ error: 'Сначала начните настройку 2FA' })
  if (!verifyTotp(code, user.totp_secret)) return res.status(400).json({ error: 'Неверный код. Проверьте приложение.' })

  const meta = reqMeta(req)
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id)
  revokeAllExcept(user.id, req.sessionId)
  const codes = generateRecoveryCodes(10)
  const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)')
  for (const c of codes) insert.run(user.id, hashRecoveryCode(c))
  logSecurity(user.id, '2fa_enabled', { ...meta, detail: 'Двухфакторная аутентификация включена' })

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ token: signToken(fresh, req.sessionId), user: selfUser(fresh), recoveryCodes: codes })
})

router.post('/2fa/disable', requireAuth, authLimiter(15 * 60 * 1000, 10, 'Слишком много попыток. Подождите 15 минут.'), (req, res) => {
  const { password, code } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user.totp_enabled) return res.status(400).json({ error: '2FA не включена' })
  if (user.is_admin) return res.status(403).json({ error: 'Администраторам нельзя отключать 2FA' })
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'Неверный пароль' })
  }
  if (!verifyTotp(code, user.totp_secret)) return res.status(400).json({ error: 'Неверный код. Проверьте приложение.' })

  const meta = reqMeta(req)
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id)
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id)
  revokeAllExcept(user.id, req.sessionId)
  logSecurity(user.id, '2fa_disabled', { ...meta, detail: 'Двухфакторная аутентификация отключена' })

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ token: signToken(fresh, req.sessionId), user: selfUser(fresh) })
})

router.get('/2fa/status', requireAuth, (req, res) => res.json({ enabled: !!req.user.totp_enabled }))

// ------------------------- Сессии -------------------------

router.post('/logout-all', requireAuth, (req, res) => {
  const meta = reqMeta(req)
  invalidateTokens(req.user.id)
  logSecurity(req.user.id, 'logout_all', { ...meta, detail: 'Выход со всех устройств' })
  res.json({ ok: true })
})

router.get('/sessions', requireAuth, (req, res) => {
  res.json(userSessions(req.user.id, req.sessionId))
})

router.delete('/sessions/:id', requireAuth, (req, res) => {
  const s = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!s) return res.status(404).json({ error: 'Сессия не найдена' })
  revokeSession(s.id)
  logSecurity(req.user.id, 'session_revoked', { ...reqMeta(req), detail: 'Сессия завершена вручную' })
  res.json({ ok: true })
})

router.get('/security-log', requireAuth, (req, res) => {
  res.json(userSecurityLog(req.user.id, 40))
})

export default router

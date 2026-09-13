import crypto from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { generateSecret, generateURI, generateSync, verifySync } from 'otplib'
import QRCode from 'qrcode'
import db, { utcIso } from './db.js'

// ---------------------------------------------------------------------------
// TOTP (2FA через приложение-аутентификатор)
// ---------------------------------------------------------------------------

export function generateTotpSecret() {
  return generateSecret()
}

export function totpUri(user, secret) {
  return generateURI({
    strategy: 'totp',
    issuer: 'Север',
    label: String(user.username || user.id),
    secret,
    algorithm: 'sha1',
    digits: 6,
    period: 30
  })
}

export async function totpQrDataUrl(uri) {
  try {
    return await QRCode.toDataURL(uri, { margin: 1, width: 240 })
  } catch {
    return null
  }
}

export function verifyTotp(code, secret) {
  if (!code || !secret) return false
  const c = String(code).replace(/\s+/g, '')
  if (!/^\d{6}$/.test(c)) return false
  try {
    const r = verifySync({ secret, token: c, digits: 6, period: 30, epochTolerance: 1 })
    return !!(r && r.valid)
  } catch {
    return false
  }
}

// Текущий код для выбранного секрета (используется в тестах и диагностике).
export function currentTotpCode(secret, epoch = Math.floor(Date.now() / 1000)) {
  return generateSync({ secret, digits: 6, period: 30, epoch })
}

// ---------------------------------------------------------------------------
// Резервные коды (одноразовые, хранятся только хэшами)
// ---------------------------------------------------------------------------

export function generateRecoveryCodes(count = 10) {
  const codes = []
  for (let i = 0; i < count; i++) {
    const block = () => String(crypto.randomInt(0, 10000)).padStart(4, '0')
    codes.push(`${block()}-${block()}-${block()}`)
  }
  return codes
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code).replace(/\s+/g, '')).digest('hex')
}

// Проверяет код, помечает использованным и возвращает true при совпадении.
export function consumeRecoveryCode(userId, code) {
  if (!code) return false
  const target = hashRecoveryCode(code)
  const row = db.prepare(
    'SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used = 0 LIMIT 1'
  ).get(userId, target)
  if (!row) return false
  db.prepare("UPDATE recovery_codes SET used = 1, used_at = datetime('now') WHERE id = ?").run(row.id)
  return true
}

// ---------------------------------------------------------------------------
// Сессии
// ---------------------------------------------------------------------------

const SESSION_DAYS = 30

export function createSession(userId, { ip = '', userAgent = '', twoFactor = false } = {}) {
  const id = crypto.randomBytes(24).toString('hex')
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip, user_agent, two_factor, last_seen)
    VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'), ?, ?, ?, datetime('now'))
  `).run(id, userId, ip, userAgent, twoFactor ? 1 : 0)
  return id
}

export function touchSession(sessionId) {
  // Обновляем last_seen не чаще раза в 5 минут, чтобы не писать в БД на каждый запрос.
  db.prepare(`
    UPDATE sessions SET last_seen = datetime('now')
    WHERE id = ? AND last_seen < datetime('now', '-5 minutes')
  `).run(sessionId)
}

export function isValidSession(userId, sessionId) {
  if (!sessionId) return false
  const s = db.prepare('SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND revoked = 0 AND expires_at > datetime(\'now\')').get(sessionId, userId)
  return !!s
}

export function revokeSession(sessionId) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(sessionId)
}

export function revokeAllSessions(userId) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId)
}

// Завершает все сессии пользователя, кроме текущей (например, после смены пароля).
export function revokeAllExcept(userId, keepSessionId) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?').run(userId, keepSessionId || '')
}

// Отзывает все сессии пользователя и делает все выданные JWT недействительными.
export function invalidateTokens(userId) {
  revokeAllSessions(userId)
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId)
}

export function userSessions(userId, currentId = null) {
  return db.prepare(`
    SELECT id, created_at, last_seen, expires_at, ip, user_agent, revoked, two_factor
    FROM sessions WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC
  `).all(userId).map(s => ({
    id: s.id,
    createdAt: utcIso(s.created_at),
    lastSeen: utcIso(s.last_seen),
    expiresAt: utcIso(s.expires_at),
    ip: s.ip,
    userAgent: s.user_agent,
    revoked: !!s.revoked,
    twoFactor: !!s.two_factor,
    current: !!currentId && s.id === currentId
  }))
}

// ---------------------------------------------------------------------------
// Журнал безопасности
// ---------------------------------------------------------------------------

export function logSecurity(userId, event, { detail = '', ip = '', userAgent = '' } = {}) {
  try {
    db.prepare('INSERT INTO security_log (user_id, event, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
      .run(userId || null, String(event), String(detail).slice(0, 500), String(ip).slice(0, 64), String(userAgent).slice(0, 200))
  } catch { /* журнал не должен ломать запрос */ }
}

export function userSecurityLog(userId, limit = 30) {
  return db.prepare(`
    SELECT id, event, detail, ip, created_at FROM security_log
    WHERE user_id = ? ORDER BY id DESC LIMIT ?
  `).all(userId, limit).map(r => ({
    id: r.id,
    event: r.event,
    detail: r.detail,
    ip: r.ip,
    createdAt: utcIso(r.created_at)
  }))
}

// ---------------------------------------------------------------------------
// Клиентский IP (сайт за Cloudflare-туннелем — cloudpub)
// ---------------------------------------------------------------------------

export function clientIp(req) {
  // Заголовок CF-Connecting-IP доверяем ТОЛЬКО от loopback: именно с localhost
  // к Express подключается cloudflared (cloudpub-туннель), который приносит
  // реальный IP клиента. Иначе любой может подставить этот заголовок и обойти
  // ограничение частоты запросов (каждый запрос — «новый» IP).
  const peer = req.socket?.remoteAddress || ''
  const fromLoopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1'
  const cf = req.headers['cf-connecting-ip']
  if (fromLoopback && typeof cf === 'string' && cf.trim()) return cf.trim().split(',')[0]
  return req.ip || peer || ''
}

export function reqMeta(req) {
  return { ip: clientIp(req), userAgent: req.headers['user-agent'] || '' }
}

// ---------------------------------------------------------------------------
// Ограничение частоты запросов (защита от перебора пароля/кода)
// ---------------------------------------------------------------------------

export function authLimiter(windowMs = 15 * 60 * 1000, limit = 10, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: message || 'Слишком много попыток. Подождите немного и повторите.' },
    skipSuccessfulRequests: false
  })
}

// ---------------------------------------------------------------------------
// Базовые заголовки безопасности (для API и загрузок)
// ---------------------------------------------------------------------------

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

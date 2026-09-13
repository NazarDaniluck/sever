import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { configApi } from '../api.js'
import SecurityWarning from '../components/SecurityWarning.jsx'
import InstanceInfo from '../components/InstanceInfo.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '', inviteKey: '' })
  const [regMode, setRegMode] = useState('free')
  const [agreed, setAgreed] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    configApi.get().then(c => setRegMode(c.regMode)).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await register(form)
      nav('/')
    } catch (ex) {
      setErr(ex.message)
    } finally { setBusy(false) }
  }

  const inviteOnly = regMode === 'invite'

  return (
    <div className="auth-screen">
      <header className="auth-header">
        <Link to="/" className="auth-logo"><img src="/sever-logo.png" alt="" className="auth-logo-img" />Север</Link>
        <nav className="auth-nav">
          <Link to="/login">вход</Link>
          <Link to="/register" className="active">регистрация</Link>
          <Link to="/privacy">политика конфиденциальности</Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="auth-main">
        <div className="auth-layout">
          <InstanceInfo />
          <div className="auth-card card">
          <div className="auth-title">Регистрация</div>
          <div className="auth-body">
            <SecurityWarning />
            <form onSubmit={submit}>
              <label className="auth-field">
                <span>Электронная почта:</span>
                <input className="input" type="email" placeholder="mail@example.com" value={form.email} onChange={set('email')} maxLength={254} required />
              </label>
              <label className="auth-field">
                <span>Логин (латиница, 3–30 символов):</span>
                <input className="input" placeholder="username" value={form.username} onChange={set('username')} maxLength={30} minLength={3} required />
              </label>
              <label className="auth-field">
                <span>Имя (как вас зовут, до 50 символов):</span>
                <input className="input" placeholder="Имя" value={form.displayName} onChange={set('displayName')} maxLength={50} />
              </label>
              <label className="auth-field">
                <span>Пароль (8–64 символа):</span>
                <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} maxLength={64} minLength={8} required />
              </label>
              {inviteOnly && (
                <>
                  <label className="auth-field">
                    <span>Ключ приглашения:</span>
                    <input className="input" placeholder="🔑 ключ" value={form.inviteKey} onChange={set('inviteKey')} required />
                  </label>
                  <p className="muted small">Регистрация сейчас только по приглашению — нужен ключ.</p>
                </>
              )}
              {err && <div className="error-text">{err}</div>}

              <div className="settings_title">Прочитайте перед созданием аккаунта</div>
              <Link to="/privacy" className="btn ghost block">Ознакомиться с Политикой конфиденциальности</Link>
              <label className="auth-check">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <span>Я прочитал(а) и соглашаюсь с <Link to="/privacy">Политикой конфиденциальности</Link></span>
              </label>

              <button className="btn primary block" disabled={busy || !agreed}>{busy ? 'Создаём…' : 'Создать аккаунт'}</button>
            </form>
            <p className="muted">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
          </div>
        </div>
        </div>
      </main>

      <footer className="auth-footer">
        <Link to="/privacy">Политика конфиденциальности</Link>
      </footer>
    </div>
  )
}
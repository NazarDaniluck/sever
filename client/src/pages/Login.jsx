import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import SecurityWarning from '../components/SecurityWarning.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

export default function Login() {
  const { login, verifyTwoFactor } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState('password') // password | code
  const [loginToken, setLoginToken] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submitPassword = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const data = await login(email, password)
      if (data && data.twoFactorRequired) {
        setLoginToken(data.loginToken)
        setStep('code')
        setCode('')
        return
      }
      nav('/')
    } catch (ex) {
      setErr(ex.message)
    } finally { setBusy(false) }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await verifyTwoFactor(loginToken, code)
      nav('/')
    } catch (ex) {
      setErr(ex.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-screen">
      <header className="auth-header">
        <Link to="/" className="auth-logo"><img src="/sever-logo.png" alt="" className="auth-logo-img" />Север</Link>
        <nav className="auth-nav">
          <Link to="/login" className="active">вход</Link>
          <Link to="/register">регистрация</Link>
          <Link to="/privacy">политика конфиденциальности</Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="auth-main">
        <div className="auth-card card">
          <div className="auth-title">{step === 'code' ? 'Подтверждение входа' : 'Вход'}</div>
          <div className="auth-body">
            {step === 'password' && <SecurityWarning />}
            {step === 'code' && (
              <div className="warn-box">
                <div className="warn-title">Двухфакторная аутентификация</div>
                <div className="warn-body">
                  <p>Введите 6-значный код из приложения-аутентификатора или резервный код.</p>
                </div>
              </div>
            )}
            {step === 'password' ? (
              <form onSubmit={submitPassword}>
                <label className="auth-field">
                  <span>Электронная почта:</span>
                  <input className="input" type="email" placeholder="mail@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </label>
                <label className="auth-field">
                  <span>Пароль:</span>
                  <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </label>
                {err && <div className="error-text">{err}</div>}
                <button className="btn primary block" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <label className="auth-field">
                  <span>Код 2FA:</span>
                  <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={e => setCode(e.target.value)} required autoFocus />
                </label>
                {err && <div className="error-text">{err}</div>}
                <button className="btn primary block" disabled={busy || code.trim().length < 6}>{busy ? 'Проверяем…' : 'Подтвердить'}</button>
                <button type="button" className="btn ghost block" onClick={() => { setStep('password'); setLoginToken(''); setErr('') }}>← Назад</button>
              </form>
            )}
            {step === 'password' && <p className="muted">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>}
          </div>
        </div>
      </main>

      <footer className="auth-footer">
        <Link to="/privacy">Политика конфиденциальности</Link>
        <a href="mailto:admin@seversite.local">Поддержка</a>
      </footer>
    </div>
  )
}

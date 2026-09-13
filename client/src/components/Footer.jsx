import { Link } from 'react-router-dom'

export const VERSION = '1.1'
export const BUILD = '20260810.1'
export const BUILT_AT = '10.08.2026'
export const UPDATE_NOTE = 'Группы, музыка, мелкие изменения o(*￣▽￣*)o'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-strong"><img src="/sever-logo.png" alt="" className="footer-logo-img" />Север</span> · версия {VERSION} · сборка {BUILD} · обновление {BUILT_AT}
      </div>
      <div>{UPDATE_NOTE}</div>
      <div className="footer-policy">
        <Link to="/privacy">Политика конфиденциальности</Link>
      </div>
    </footer>
  )
}

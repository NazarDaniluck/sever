import { useState } from 'react'

const APPS = [
  'Google Authenticator',
  'Microsoft Authenticator',
  'Authy',
  'Aegis Authenticator',
  '1Password',
  'Bitwarden',
  'Raivo OTP',
  'AndOTP'
]

export default function TwoFactorHelp() {
  const [open, setOpen] = useState(false)

  return (
    <div className="tfa-help">
      <button type="button" className="tfa-help-link" onClick={() => setOpen(o => !o)}>
        <span className="tfa-help-caret">{open ? '▾' : '▸'}</span>
        Что такое приложение-аутентификатор? — нажмите
      </button>
      {open && (
        <div className="tfa-help-body">
          <p>
            Это отдельное приложение на вашем телефоне, которое генерирует 6-значные коды,
            меняющиеся каждые 30 секунд. Оно работает <strong>полностью офлайн</strong> — без
            интернета, SMS и почты.
          </p>
          <p>
            Смысл в том, что даже если кто-то узнает ваш пароль, без кода из приложения он
            не сможет войти в аккаунт — код существует только у вас на устройстве.
          </p>
          <p className="tfa-help-step">Как начать:</p>
          <ol className="tfa-help-list">
            <li>Установите на телефон одно из приложений из списка ниже.</li>
            <li>В приложении нажмите «Добавить аккаунт» (или «+»).</li>
            <li>Отсканируйте камерой телефона QR-код (или введите секретный ключ вручную).</li>
            <li>Приложение начнёт показывать коды — вводите их при входе на сайт.</li>
          </ol>
          <p>
            Примеры приложений: <strong>{APPS.join(', ')}</strong>. Подойдёт любое —
            все они работают по одному стандарту (TOTP).
          </p>
        </div>
      )}
    </div>
  )
}

export default function SecurityWarning() {
  return (
    <div className="warn-box" role="alert">
      <div className="warn-title">ℹ Небольшое сообщество</div>
      <div className="warn-body">
        <p>
          Это небольшой сайт на домашнем сервере. Данные защищены (пароли хэшируются,
          email не показывается другим, доступ ограничен по частоте), но перед сайтом нет
          большого провайдера.
        </p>
        <p>
          Рекомендуем: <strong>придумайте отдельный email и пароль</strong>, не используйте
          рабочие пароли, и включите <strong>двухфакторную аутентификацию</strong> в настройках.
        </p>
      </div>
    </div>
  )
}

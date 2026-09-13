import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { aboutApi } from '../api.js'
import { Avatar } from './Navbar.jsx'
import AdminBadge from './AdminBadge.jsx'

export default function InstanceInfo() {
  const [data, setData] = useState(null)

  useEffect(() => {
    aboutApi.get().then(setData).catch(() => setData(null))
  }, [])

  const s = data?.stats

  return (
    <div className="instance-info card">
      <div className="auth-title">Об этой инстанции</div>
      <div className="instance-info-body">
        <h4>Статистика</h4>
        <p className="muted small">На этой инстанции:</p>
        <ul className="instance-stats">
          <li><span><b>{s ? s.users : '…'}</b> пользователей</span></li>
          <li><span><b>{s ? s.communities : '…'}</b> сообществ</span></li>
          <li><span><b>{s ? s.posts : '…'}</b> записей на стенах</span></li>
          <li><span><b>{s ? s.comments : '…'}</b> комментариев</span></li>
          <li><span><b>{s ? s.messages : '…'}</b> сообщений</span></li>
        </ul>

        {data?.admins?.length > 0 && (
          <>
            <h4>Администраторы</h4>
            <div className="instance-admins">
              {data.admins.map(a => (
                <Link to={`/u/${a.username}`} key={a.id} className="suggest-row big">
                  <Avatar user={a} size={34} />
                  <div className="suggest-info">
                    <div className="suggest-name">{a.displayName || a.username}</div>
                    <div className="suggest-meta">@{a.username}<AdminBadge user={a} /></div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <h4>Ссылки</h4>
        <ul className="instance-stats">
          <li><Link to="/privacy">Политика конфиденциальности</Link></li>
          <li><Link to="/faq">FAQ</Link></li>
          <li><a href="https://t.me/sever_socialnetwork" target="_blank" rel="noreferrer">Телеграм канал</a></li>
        </ul>

        <h4>Правила</h4>
        <p className="muted small">
          Сайт находится в тестировании. Перед использованием прочитайте{' '}
          <Link to="/privacy">Политику конфиденциальности</Link>: не публикуйте запрещённый контент,
          личные данные и не вводите настоящие пароли.
        </p>
      </div>
    </div>
  )
}

export default function AdminBadge({ user }) {
  return (
    <>
      {user?.verified && (
        <span className="verified-badge" title="Проверенный пользователь">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path fill="currentColor" d="M20 6 9 17l-5-5 1.41-1.41L9 14.17l9.59-9.59L20 6z"/>
          </svg>
        </span>
      )}
      {user?.isModerator && (
        <span className="moderator-badge" title="Модератор">🛡</span>
      )}
      {user?.isAdmin && (
        <span className="admin-badge" title="Администратор">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path fill="currentColor" d="M12 1 4 4v6c0 5.1 3.4 9.7 8 11 4.6-1.3 8-5.9 8-11V4l-8-3zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.7-4.7 1.4 1.4-6.1 6.1z"/>
          </svg>
        </span>
      )}
      {user?.isForeignAgent && (
        <span className="foreign-agent-badge" title="Статус иностранного агента">иноагент</span>
      )}
      {user?.isTester && (
        <span className="tester-badge" title="Тестировщик">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 5h2v6h-2zm0 8h2v2h-2z"/>
          </svg>
        </span>
      )}
    </>
  )
}

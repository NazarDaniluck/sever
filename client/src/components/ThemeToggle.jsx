import { useSettings } from '../context/SettingsContext.jsx'

const OPTIONS = [
  { id: 'light', label: '☀ Светлая' },
  { id: 'dark', label: '🌙 Тёмная' }
]

export default function ThemeToggle() {
  const { theme, changeTheme } = useSettings()
  return (
    <div className="theme-toggle">
      {OPTIONS.map(o => (
        <button
          key={o.id}
          type="button"
          className={`theme-toggle-btn ${theme === o.id ? 'active' : ''}`}
          title={o.label}
          onClick={() => changeTheme(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

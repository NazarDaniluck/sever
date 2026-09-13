import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { SettingsProvider, useSettings, backdropToStyle, pageBgToStyle, pageBgToRgb, rgbLuma } from './context/SettingsContext.jsx'
import { EventsProvider } from './context/EventsContext.jsx'
import { PlayerProvider } from './context/PlayerContext.jsx'
import { configApi } from './api.js'
import Navbar from './components/Navbar.jsx'
import Backdrop from './components/Backdrop.jsx'
import Footer from './components/Footer.jsx'
import MiniPlayer from './components/MiniPlayer.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Feed from './pages/Feed.jsx'
import Profile from './pages/Profile.jsx'
import Communities from './pages/Communities.jsx'
import Community from './pages/Community.jsx'
import CommunityMembers from './pages/CommunityMembers.jsx'
import Groups from './pages/Groups.jsx'
import GroupPage from './pages/GroupPage.jsx'
import Messenger from './pages/Messenger.jsx'
import Search from './pages/Search.jsx'
import PostPage from './pages/PostPage.jsx'
import Settings from './pages/Settings.jsx'
import Friends from './pages/Friends.jsx'
import Admin from './pages/Admin.jsx'
import Privacy from './pages/Privacy.jsx'
import Albums from './pages/Albums.jsx'
import Videos from './pages/Videos.jsx'
import VideoFeed from './pages/VideoFeed.jsx'
import VideoPage from './pages/VideoPage.jsx'
import PhotoPage from './pages/PhotoPage.jsx'
import AvatarPhoto from './pages/AvatarPhoto.jsx'
import Audios from './pages/Audios.jsx'
import Notes from './pages/Notes.jsx'
import EventsPage from './pages/EventsPage.jsx'
import Bookmarks from './pages/Bookmarks.jsx'
import FAQ from './pages/FAQ.jsx'

function MaintenanceScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="logo big"><img src="/sever-logo.png" alt="" className="big-logo-img" />Север</div>
        <h1>Технические работы</h1>
        <p className="muted">Мы что-то чиним. Зайдите чуть позже.</p>
      </div>
    </div>
  )
}

function Inner() {
  const { user, loading } = useAuth()
  const { backdrop, backdropStyle } = useSettings()
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    configApi.get().then(setCfg).catch(() => {})
  }, [])

  // Если пользователь включил «задник везде» — его профильный задник заменяет локальный
  const myBackdropStyle = user?.alwaysBackdrop ? backdropToStyle(user.backdrop || backdrop) : null
  const hasMyBackdrop = !!(myBackdropStyle?.backgroundImage || myBackdropStyle?.background)
  const effectiveBackdrop = hasMyBackdrop ? myBackdropStyle : backdropStyle

  // Фон страницы (передняк) — показывается по всему сайту самому владельцу.
  // Для картинки/градиента — background-шорткат с cover; для цвета — сам цвет.
  // Помимо заливки подстраиваем под цвет фона:
  //   --dripper-rgb  — цвет «свечения» по краям (дриппер), совпадает с фоном страницы,
  //                    чтобы переход к цветным бокам был плавным;
  //   --page-bg-text — контрастный цвет текста на фоне (чёрный/белый).
  useEffect(() => {
    const bg = user?.pageBg || (user?.pageColor ? { type: 'color', value: user.pageColor } : null)
    const pc = pageBgToStyle(bg)
    const root = document.documentElement

    if (pc.background) {
      root.style.setProperty('--page-bg', pc.background)
      root.style.setProperty('--page-bg-opacity', String(pc.opacity ?? 1))
    } else if (pc.backgroundImage) {
      root.style.setProperty('--page-bg', `${pc.backgroundImage} center / cover no-repeat`)
      root.style.setProperty('--page-bg-opacity', String(pc.opacity ?? 1))
    } else {
      root.style.removeProperty('--page-bg')
      root.style.removeProperty('--page-bg-opacity')
    }

    // Адаптация дриппера и текста под яркость фона.
    // Для цвета/пресета цвет известен; для картинки — нет, оставляем по теме.
    let rgb = pageBgToRgb(bg)
    if (bg?.type === 'image') rgb = null

    if (rgb) {
      root.style.setProperty('--dripper-rgb', rgb)
      const luma = rgbLuma(rgb)
      // Тёмный фон -> белый текст; светлый -> тёмный. Конкретные цвета,
      // чтобы не зависеть от CSS-темы (иначе на тёмном фоне в светлой теме
      // текст остался бы чёрным).
      root.style.setProperty('--page-bg-text', luma > 0.5 ? '#1b1b1b' : '#ffffff')
    } else {
      root.style.removeProperty('--dripper-rgb')
      root.style.removeProperty('--page-bg-text')
    }
  }, [user?.pageBg, user?.pageColor])

  const maintenance = cfg && cfg.appMode === 'maintenance' && !(user && (user.isAdmin || user.isTester))
  if (maintenance) {
    return (
      <div className="app">
        <Backdrop style={backdropStyle} />
        <main className="main"><MaintenanceScreen /></main>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app">
        <Backdrop style={backdropStyle} />
        <main className="main">
          <div className="center muted">Загрузка…</div>
        </main>
      </div>
    )
  }

  return (
    <EventsProvider enabled={!!user}>
      <PlayerProvider>
        <div className="app">
          <Backdrop style={effectiveBackdrop} />
          {user && <Navbar />}
        <main className={user ? 'main has-nav' : 'main'}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
            <Route path="/" element={user ? <Navigate to={`/u/${user.username}`} replace /> : <Navigate to="/login" replace />} />
            <Route path="/feed" element={user ? <Feed /> : <Navigate to="/login" replace />} />
            <Route path="/search" element={user ? <Search /> : <Navigate to="/login" replace />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/friends/:username" element={user ? <Friends /> : <Navigate to="/login" replace />} />
            <Route path="/communities" element={user ? <Communities /> : <Navigate to="/login" replace />} />
            <Route path="/c/:id" element={user ? <Community /> : <Navigate to="/login" replace />} />
            <Route path="/c/:id/members" element={user ? <CommunityMembers /> : <Navigate to="/login" replace />} />
            <Route path="/groups" element={user ? <Groups /> : <Navigate to="/login" replace />} />
            <Route path="/groups/:id" element={user ? <GroupPage /> : <Navigate to="/login" replace />} />
            <Route path="/messages" element={user ? <Messenger /> : <Navigate to="/login" replace />} />
            <Route path="/messages/:conversationId" element={user ? <Messenger /> : <Navigate to="/login" replace />} />
            <Route path="/post/:id" element={user ? <PostPage /> : <Navigate to="/login" replace />} />
            <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
            <Route path="/events" element={user ? <EventsPage /> : <Navigate to="/login" replace />} />
            <Route path="/photos" element={user ? <Albums /> : <Navigate to="/login" replace />} />
            <Route path="/photos/:id" element={user ? <Albums /> : <Navigate to="/login" replace />} />
            <Route path="/videos" element={user ? <Videos /> : <Navigate to="/login" replace />} />
            <Route path="/videos/feed" element={user ? <VideoFeed /> : <Navigate to="/login" replace />} />
            <Route path="/video/:id" element={user ? <VideoPage /> : <Navigate to="/login" replace />} />
            <Route path="/photo/:photoId" element={user ? <PhotoPage /> : <Navigate to="/login" replace />} />
            <Route path="/avatar/:username" element={user ? <AvatarPhoto /> : <Navigate to="/login" replace />} />
            <Route path="/audios" element={user ? <Audios /> : <Navigate to="/login" replace />} />
            <Route path="/notes" element={user ? <Notes /> : <Navigate to="/login" replace />} />
            <Route path="/bookmarks" element={user ? <Bookmarks /> : <Navigate to="/login" replace />} />
            <Route path="/admin" element={user?.isAdmin ? <Admin /> : <Navigate to="/" replace />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <MiniPlayer />
        {user && <Footer />}
        </div>
      </PlayerProvider>
    </EventsProvider>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <Inner />
    </SettingsProvider>
  )
}
import { useEffect, useState } from 'react'
import { postsApi, usersApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import PostForm from '../components/PostForm.jsx'
import PostCard from '../components/PostCard.jsx'
import Pagination from '../components/Pagination.jsx'
import Sidebar from '../components/Sidebar.jsx'

export default function Feed() {
  const { user, setUser } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('new')
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)

  const load = async (m = mode, pg = page) => {
    setLoading(true); setErr('')
    try {
      const data = await postsApi.feed(m, pg)
      setPosts(data.posts)
      setPages(data.pages)
    } catch (ex) { setErr(ex.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load(mode, page)
  }, [mode, page, nonce])

  const onUpdated = (updated) => {
    setPosts(list => list.map(p => {
      if (p.id !== updated.id) return p
      const next = { ...p, ...updated }
      if (updated.reactions === undefined) next.reactions = p.reactions
      if (updated.reactionsCount === undefined) next.reactionsCount = p.reactionsCount
      return next
    }))
  }

  const switchMode = (m) => { setMode(m); setPage(1) }

  // Включение показа NSFW — с подтверждением пароля
  const enableNsfw = async (e) => {
    e.preventDefault()
    setPwdBusy(true); setPwdErr('')
    try {
      const fresh = await usersApi.setNsfw(true, pwd)
      setUser(fresh)
      setPwdOpen(false); setPwd('')
      setNonce(n => n + 1)
    } catch (ex) { setPwdErr(ex.message) }
    finally { setPwdBusy(false) }
  }

  // Скрыть NSFW обратно — без пароля
  const hideNsfw = async () => {
    try {
      const fresh = await usersApi.setNsfw(false)
      setUser(fresh)
      setNonce(n => n + 1)
    } catch (ex) { setErr(ex.message) }
  }

  const toggleNsfw = async () => {
    if (user?.showNsfw) { await hideNsfw() }
    else { setPwdErr(''); setPwd(''); setPwdOpen(true) }
  }

  return (
    <div className="layout">
      <Sidebar />

      <div className="column main-col">
        <div className="tabs feed-tabs">
          <button className={mode === 'new' ? 'tab active' : 'tab'} onClick={() => switchMode('new')}>Новое</button>
          <button className={mode === 'home' ? 'tab active' : 'tab'} onClick={() => switchMode('home')}>Моя лента</button>
          <button className={mode === 'trending' ? 'tab active' : 'tab'} onClick={() => switchMode('trending')}>Популярное</button>
          {user && (
            <label className="nsfw-filter-toggle" title="Показывать или скрывать посты с пометкой 18+">
              <input type="checkbox" checked={!user.showNsfw} onChange={toggleNsfw} />
              <span className="nsfw-filter-label">Скрыть 18+</span>
            </label>
          )}
        </div>
        <PostForm onPosted={() => { setPage(1); setNonce(n => n + 1) }} />
        {err && <div className="error-text">{err}</div>}
        {loading && <div className="center muted">Загрузка…</div>}
        <div className="card">
          {posts.map(p => (
            <PostCard key={p.id} post={p} canDelete={p.authorId === user.id} onUpdated={onUpdated} trackView
              onDelete={async (id) => { await postsApi.del(id); setNonce(n => n + 1) }} />
          ))}
          {posts.length === 0 && !loading && <div className="muted">В ленте пока пусто.</div>}
        </div>
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>

      {pwdOpen && (
        <div className="modal-backdrop" onClick={() => !pwdBusy && setPwdOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Показать посты 18+</h3>
            <div className="muted small">Для подтверждения введите пароль от аккаунта.</div>
            <form onSubmit={enableNsfw}>
              <input
                className="input"
                type="password"
                placeholder="Пароль"
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                autoFocus
              />
              {pwdErr && <div className="error-text">{pwdErr}</div>}
              <div className="modal-actions">
                <button type="button" className="btn ghost" disabled={pwdBusy} onClick={() => setPwdOpen(false)}>Отмена</button>
                <button className="btn primary" disabled={pwdBusy || !pwd}>{pwdBusy ? 'Проверка…' : 'Подтвердить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

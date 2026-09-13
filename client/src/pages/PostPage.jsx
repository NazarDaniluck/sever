import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { postsApi } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import PostCard from '../components/PostCard.jsx'
import Sidebar from '../components/Sidebar.jsx'

export default function PostPage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const [data, setData] = useState(null)

  const load = () => postsApi.get(id).then(setData)

  useEffect(() => {
    load()
    let active = true
    postsApi.view(id).then(r => { if (active) setData(d => d && ({ ...d, post: { ...d.post, views: r.views } })) }).catch(() => {})
    return () => { active = false }
  }, [id])

  if (!data) return <div className="center muted">Загрузка…</div>

  const { post } = data

  return (
    <div className="layout">
      <Sidebar />
      <div className="column main-col">
        {post.parentId && <Link to={`/post/${post.parentId}`} className="muted small">↩ Ответ на пост</Link>}
      <PostCard post={post} canDelete={post.authorId === me.id} expandComments videoModal={false}
        onUpdated={(u) => setData(d => ({ ...d, post: { ...d.post, ...u } }))}
        onComment={(c) => setData(d => ({ ...d, post: { ...d.post, commentsCount: (d.post.commentsCount || 0) + 1 } }))}
        onDelete={async (pid) => { await postsApi.del(pid); load() }} />
      </div>
    </div>
  )
}

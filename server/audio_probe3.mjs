const BASE = 'http://localhost:4000'
async function go() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 't_auth@x.com', password: 'testpass123' })
  })
  if (!login.ok) { console.log('login fail', login.status); process.exit(1) }
  const token = (await login.json()).token
  const feed = await fetch(`${BASE}/api/posts?feed=home`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  const withAudio = feed.posts.filter(p => (p.attachments || []).some(a => a.type === 'audio'))
  console.log('posts with audio found:', withAudio.length)
  withAudio.slice(0, 5).forEach(p => console.log(p.id, JSON.stringify(p.attachments)))
}
go().catch(e => { console.error(e); process.exit(1) })
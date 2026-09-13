const BASE = 'http://localhost:4000'
async function go() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 't_auth@x.com', password: 'testpass123' })
  })
  if (!login.ok) { console.log('login fail', login.status); process.exit(1) }
  const token = (await login.json()).token
  // fetch the post we created
  const posts = await fetch(`${BASE}/api/posts?feed=home`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  const target = posts.posts.find(p => p.body === 'тест аудио в посте 2')
  console.log('found post', target?.id, JSON.stringify(target?.attachments))
  // fetch audio with token
  const r = await fetch(`${BASE}/uploads/1785869913879-886861549.mp3?token=${token}`, { method: 'GET' })
  console.log('audio fetch status', r.status, 'type', r.headers.get('content-type'), 'len', r.headers.get('content-length'))
  const buf = await r.arrayBuffer()
  console.log('audio bytes', buf.byteLength)
}
go().catch(e => { console.error(e); process.exit(1) })
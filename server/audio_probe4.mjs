import fs from 'node:fs'
const BASE = 'http://localhost:4000'
async function go() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 't_auth@x.com', password: 'testpass123' })
  })
  if (!login.ok) { console.log('login fail', login.status); process.exit(1) }
  const token = (await login.json()).token

  const fd = new FormData()
  fd.append('body', 'тест аудио файлом напрямую')
  fd.append('communityId', '')
  fd.append('nsfw', '0')
  const buf = fs.readFileSync('uploads/1785869913879-886861549.mp3')
  fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'direct-test.mp3')
  const post = await fetch(`${BASE}/api/posts`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
  })
  console.log('post status', post.status)
  const pb = await post.json().catch(() => ({}))
  console.log('attachments:', JSON.stringify(pb.attachments))
}
go().catch(e => { console.error(e); process.exit(1) })
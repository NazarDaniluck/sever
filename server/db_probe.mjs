import db from './src/db.js'
const a = db.prepare('SELECT id,title,artist,url,cover FROM library_audios LIMIT 5').all()
console.log('audios:', JSON.stringify(a))
const usr = db.prepare('SELECT id,username,email FROM users WHERE is_admin=1 LIMIT 1').get()
console.log('admin:', JSON.stringify(usr))
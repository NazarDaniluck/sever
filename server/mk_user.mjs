import db from './src/db.js'
import bcrypt from 'bcryptjs'
const pw = bcrypt.hashSync('testpass123', 10)
let u = db.prepare('SELECT * FROM users WHERE username=?').get('t_auth')
if (!u) db.prepare('INSERT INTO users (email, username, display_name, password_hash) VALUES (?,?,?,?)').run('t_auth@x.com','t_auth','Test Auth',pw)
u = db.prepare('SELECT * FROM users WHERE username=?').get('t_auth')
console.log('user id', u.id, 'is_admin', u.is_admin)
// Назначение пользователя администратором.
// Запуск (из папки server):  node make-admin.js <логин>
// Останови сервер перед запуском (закрой окно npm run dev), иначе БД может быть занята.
import db from './src/db.js'

const username = process.argv[2]
if (!username) {
  console.error('Использование: node make-admin.js <логин>')
  process.exit(1)
}
const u = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username)
if (!u) {
  console.error('Пользователь с таким логином не найден. Сначала зарегистрируйтесь на сайте.')
  process.exit(1)
}
db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id)
console.log(`OK: пользователь «${u.username}» теперь администратор.`)

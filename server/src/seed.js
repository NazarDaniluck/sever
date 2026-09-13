// Полная очистка БД: удаляет всех пользователей, посты, диалоги и т.п.
// Тестовые данные и «заготовленные» аккаунты не создаются — остаётся чистая
// социальная сеть. Регистрация свободная; ключ приглашения сбрасывается.
import db from './db.js'

db.pragma('busy_timeout = 5000')

db.prepare('DELETE FROM messages').run()
db.prepare('DELETE FROM message_poll_votes').run()
db.prepare('DELETE FROM comments').run()
db.prepare('DELETE FROM reactions').run()
db.prepare('DELETE FROM posts').run()
db.prepare('DELETE FROM poll_votes').run()
db.prepare('DELETE FROM follows').run()
db.prepare('DELETE FROM community_members').run()
db.prepare('DELETE FROM communities').run()
db.prepare('DELETE FROM conversation_participants').run()
db.prepare('DELETE FROM conversations').run()
db.prepare('DELETE FROM users').run()

// Режимы по умолчанию: штатный, свободная регистрация
db.prepare(`INSERT INTO settings (key, value) VALUES ('app_mode','normal'),('reg_mode','free'),('invite_key','sever2026')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()

console.log('✔ База данных очищена. Тестовые данные и аккаунты удалены.')
console.log('   Регистрация: свободная. Администратор не задан (можно выставить is_admin=1 вручную).')

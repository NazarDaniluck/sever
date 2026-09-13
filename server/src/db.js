import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const uploadsDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const dbPath = path.join(dataDir, 'sever-1.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Unicode-безопасный поиск без учёта регистра (SQLite LIKE игнорирует регистр только для ASCII).
db.function('contains_no_case', (haystack, needle) => {
  return String(haystack ?? '').toLowerCase().includes(String(needle ?? '').toLowerCase()) ? 1 : 0
})

// ---------------------------------------------------------------------------
// Схема. Колонки/типы портативны: для PostgreSQL достаточно заменить
// подключение (см. README) и маппинг INTEGER PRIMARY KEY AUTOINCREMENT -> BIGSERIAL.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  password_hash TEXT NOT NULL,
  bio           TEXT DEFAULT '',
  avatar        TEXT,
  cover         TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS communities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  avatar      TEXT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',  -- owner | moderator | member
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  INTEGER REFERENCES communities(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  image         TEXT,
  attachments   TEXT NOT NULL DEFAULT '[]',
  parent_id     INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  repost_of_id  INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  nsfw          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reactions (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type    TEXT NOT NULL DEFAULT 'like',  -- like | heart | laugh | wow | sad | angry
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  attachments     TEXT NOT NULL DEFAULT '[]',
  nsfw            INTEGER NOT NULL DEFAULT 0,
  read_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_poll_votes (
  message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS albums (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS album_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id   INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_videos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  url        TEXT,
  youtube    TEXT,
  published  INTEGER NOT NULL DEFAULT 0,
  is_premiere INTEGER NOT NULL DEFAULT 0,
  views      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_likes (
  video_id INTEGER NOT NULL REFERENCES library_videos(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (video_id, user_id)
);

-- Учёт просмотров с защитой от накрутки:
-- viewer = 'u<id>' для авторизованных, 'ip<ip>' для гостей;
-- один зритель засчитывается не чаще раза в сутки на одно видео.
CREATE TABLE IF NOT EXISTS video_views (
  video_id  INTEGER NOT NULL REFERENCES library_videos(id) ON DELETE CASCADE,
  viewer    TEXT NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (video_id, viewer)
);

CREATE TABLE IF NOT EXISTS post_views (
  post_id   INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer    TEXT NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, viewer)
);

CREATE TABLE IF NOT EXISTS video_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   INTEGER NOT NULL REFERENCES library_videos(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_playlist_items (
  playlist_id INTEGER NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
  video_id    INTEGER NOT NULL REFERENCES library_videos(id) ON DELETE CASCADE,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playlist_id, video_id)
);

CREATE TABLE IF NOT EXISTS photo_likes (
  photo_id INTEGER NOT NULL REFERENCES album_photos(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (photo_id, user_id)
);

CREATE TABLE IF NOT EXISTS photo_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id   INTEGER NOT NULL REFERENCES album_photos(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avatar_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_audios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  artist     TEXT DEFAULT '',
  url        TEXT,
  cover      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- mention | reply | avatar_comment
  target_type TEXT NOT NULL,   -- post | photo | video | avatar
  target_id   INTEGER,
  comment_id  INTEGER,
  body        TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_album_photos ON album_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_videos_owner ON library_videos(owner_id);
CREATE INDEX IF NOT EXISTS idx_audios_owner ON library_audios(owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON user_notes(owner_id);
CREATE INDEX IF NOT EXISTS idx_video_comments ON video_comments(video_id, created_at);
CREATE INDEX IF NOT EXISTS idx_photo_comments ON photo_comments(photo_id, created_at);
CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON video_playlist_items(video_id);
CREATE INDEX IF NOT EXISTS idx_playlists_owner ON video_playlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_avatar_comments ON avatar_comments(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, id DESC);

CREATE TABLE IF NOT EXISTS bookmarks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,   -- post | video
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, target_type, id DESC);

-- Безопасность: сессии, журнал безопасности, резервные коды 2FA
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  revoked    INTEGER NOT NULL DEFAULT 0,
  two_factor INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at);

CREATE TABLE IF NOT EXISTS security_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  ip         TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_log_user ON security_log(user_id, id DESC);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);
`)

// Лёгкая миграция для старых баз, где нет колонки is_admin
const userCols = db.pragma('table_info(users)').map(c => c.name)
if (!userCols.includes('is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
}

// Миграция: posts.attachments (прикрепления: фото/видео/аудио/документ/заметка/опрос)
const postCols = db.pragma('table_info(posts)').map(c => c.name)
if (!postCols.includes('attachments')) {
  db.exec("ALTER TABLE posts ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
}

// Миграция: messages.attachments (вложения в сообщениях)
const msgCols = db.pragma('table_info(messages)').map(c => c.name)
if (!msgCols.includes('attachments')) {
  db.exec("ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
}

// Миграция: флаг NSFW для постов и сообщений
if (!db.pragma('table_info(posts)').map(c => c.name).includes('nsfw')) {
  db.exec("ALTER TABLE posts ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0")
}
if (!db.pragma('table_info(messages)').map(c => c.name).includes('nsfw')) {
  db.exec("ALTER TABLE messages ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0")
}

// Миграция: настройка «показывать NSFW-посты» (по умолчанию скрыто — 0)
const userColsNsfw = db.pragma('table_info(users)').map(c => c.name)
if (!userColsNsfw.includes('show_nsfw')) {
  db.exec('ALTER TABLE users ADD COLUMN show_nsfw INTEGER NOT NULL DEFAULT 0')
}

// Миграция: видео-библиотека (feed-поля)
const vdoCols = db.pragma('table_info(library_videos)').map(c => c.name)
if (!vdoCols.includes('published')) db.exec("ALTER TABLE library_videos ADD COLUMN published INTEGER NOT NULL DEFAULT 0")
if (!vdoCols.includes('is_premiere')) db.exec("ALTER TABLE library_videos ADD COLUMN is_premiere INTEGER NOT NULL DEFAULT 0")
if (!vdoCols.includes('views')) db.exec("ALTER TABLE library_videos ADD COLUMN views INTEGER NOT NULL DEFAULT 0")

// Миграция: обложка аудиозаписи
const audCols = db.pragma('table_info(library_audios)').map(c => c.name)
if (!audCols.includes('cover')) db.exec("ALTER TABLE library_audios ADD COLUMN cover TEXT")

// Миграция: редактирование/удаление сообщений (edited_at, deleted)
const msgCols2 = db.pragma('table_info(messages)').map(c => c.name)
if (!msgCols2.includes('edited_at')) db.exec("ALTER TABLE messages ADD COLUMN edited_at TEXT")
if (!msgCols2.includes('deleted')) db.exec("ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0")

// Миграция: редактирование постов (edited_at)
const postCols2 = db.pragma('table_info(posts)').map(c => c.name)
if (!postCols2.includes('edited_at')) db.exec("ALTER TABLE posts ADD COLUMN edited_at TEXT")

// Миграция: привилегия тестировщика, скрытие онлайн-статуса, глобальный мут
const userCols2 = db.pragma('table_info(users)').map(c => c.name)
if (!userCols2.includes('is_tester')) db.exec("ALTER TABLE users ADD COLUMN is_tester INTEGER NOT NULL DEFAULT 0")
if (!userCols2.includes('show_online')) db.exec("ALTER TABLE users ADD COLUMN show_online INTEGER NOT NULL DEFAULT 1")
if (!userCols2.includes('muted_until')) db.exec("ALTER TABLE users ADD COLUMN muted_until TEXT")
if (!userCols2.includes('verified')) db.exec("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")

// Миграция: метка «иноагент» (показывается возле ника и под постами)
const userColsAgent = db.pragma('table_info(users)').map(c => c.name)
if (!userColsAgent.includes('is_foreign_agent')) {
  db.exec('ALTER TABLE users ADD COLUMN is_foreign_agent INTEGER NOT NULL DEFAULT 0')
}

// Миграция: публичный профиль, задник страницы, контакты
const userCols3 = db.pragma('table_info(users)').map(c => c.name)
if (!userCols3.includes('public_profile')) db.exec("ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0")
if (!userCols3.includes('always_backdrop')) db.exec("ALTER TABLE users ADD COLUMN always_backdrop INTEGER NOT NULL DEFAULT 0")
if (!userCols3.includes('backdrop')) db.exec("ALTER TABLE users ADD COLUMN backdrop TEXT")
if (!userCols3.includes('page_color')) db.exec('ALTER TABLE users ADD COLUMN page_color TEXT')
if (!userCols3.includes('telegram')) db.exec("ALTER TABLE users ADD COLUMN telegram TEXT DEFAULT ''")
if (!userCols3.includes('contact_email')) db.exec("ALTER TABLE users ADD COLUMN contact_email TEXT DEFAULT ''")

// Миграция: ответы на комментарии (parent_id в комментариях постов/видео/фото)
const addParentCol = (table) => {
  const cols = db.pragma('table_info(' + table + ')').map(c => c.name)
  if (!cols.includes('parent_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN parent_id INTEGER`)
}
addParentCol('comments')
addParentCol('video_comments')
addParentCol('photo_comments')

// Миграция: закрепление постов и видео админом (pinned_until; NULL = навсегда)
const addPinnedCol = (table) => {
  const cols = db.pragma('table_info(' + table + ')').map(c => c.name)
  if (!cols.includes('pinned_until')) db.exec(`ALTER TABLE ${table} ADD COLUMN pinned_until TEXT`)
}
addPinnedCol('posts')
addPinnedCol('library_videos')

// Миграция: отдельное закрепление постов внутри сообщества (community_pinned_until).
// Не влияет на общую ленту — только на ленту самого сообщества.
const postColsCommunityPin = db.pragma('table_info(posts)').map(c => c.name)
if (!postColsCommunityPin.includes('community_pinned_until')) db.exec("ALTER TABLE posts ADD COLUMN community_pinned_until TEXT")
// Новый столбец у существующих постов = NULL, а NULL означает «закреплено навсегда».
// Раззакрепляем всё по умолчанию ('' = не закреплено).
db.exec("UPDATE posts SET community_pinned_until = '' WHERE community_pinned_until IS NULL")

// Миграция: настройка «не упоминать мой логин»
const userCols4 = db.pragma('table_info(users)').map(c => c.name)
if (!userCols4.includes('allow_mentions')) db.exec("ALTER TABLE users ADD COLUMN allow_mentions INTEGER NOT NULL DEFAULT 1")

// Миграция: из-за «NULL = навсегда» новые посты/видео попадали в закреплённые.
// Раззакрепляем всё, что было закреплено по умолчанию ('' = не закреплено).
db.exec("UPDATE posts SET pinned_until = '' WHERE pinned_until IS NULL")
db.exec("UPDATE library_videos SET pinned_until = '' WHERE pinned_until IS NULL")

// Миграция: уровень доступа видео (private | link | friends | open)
const vdoCols2 = db.pragma('table_info(library_videos)').map(c => c.name)
if (!vdoCols2.includes('access')) db.exec("ALTER TABLE library_videos ADD COLUMN access TEXT NOT NULL DEFAULT 'private'")

// Миграция: описание и превью видеозаписи
const vdoCols3 = db.pragma('table_info(library_videos)').map(c => c.name)
if (!vdoCols3.includes('description')) db.exec("ALTER TABLE library_videos ADD COLUMN description TEXT NOT NULL DEFAULT ''")
if (!vdoCols3.includes('preview')) db.exec('ALTER TABLE library_videos ADD COLUMN preview TEXT')

// Миграция: счётчик просмотров поста
const postCols3 = db.pragma('table_info(posts)').map(c => c.name)
if (!postCols3.includes('views')) db.exec('ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0')

// Миграция: кто может писать пользователю (all | requests | none)
const userCols5 = db.pragma('table_info(users)').map(c => c.name)
if (!userCols5.includes('message_mode')) db.exec("ALTER TABLE users ADD COLUMN message_mode TEXT NOT NULL DEFAULT 'all'")

// Заявки на переписку (по заявке). Одобрение разрешает создать диалог.
db.exec(`
CREATE TABLE IF NOT EXISTS message_requests (
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_user_id, to_user_id)
);
`)

// Миграция: лимит заявок на переписку — счётчик отказов и время последнего отказа
// (после отклонения можно отправить ещё 2 раза, КД 72 часа между попытками)
const mreqCols = db.pragma('table_info(message_requests)').map(c => c.name)
if (!mreqCols.includes('reject_count')) db.exec('ALTER TABLE message_requests ADD COLUMN reject_count INTEGER NOT NULL DEFAULT 0')
if (!mreqCols.includes('last_rejected_at')) db.exec('ALTER TABLE message_requests ADD COLUMN last_rejected_at TEXT')

// Миграция: безопасность — версия токенов (для отзыва всех сессий) и 2FA (TOTP)
const userColsSec = db.pragma('table_info(users)').map(c => c.name)
if (!userColsSec.includes('token_version')) db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
if (!userColsSec.includes('totp_secret')) db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT')
if (!userColsSec.includes('totp_enabled')) db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0')

// Миграция: настройки сообществ (обложка, задник, вступление по заявке, кто пишет)
const commCols = db.pragma('table_info(communities)').map(c => c.name)
if (!commCols.includes('cover')) db.exec('ALTER TABLE communities ADD COLUMN cover TEXT')
if (!commCols.includes('backdrop')) db.exec('ALTER TABLE communities ADD COLUMN backdrop TEXT')
if (!commCols.includes('join_mode')) db.exec("ALTER TABLE communities ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'open'")
if (!commCols.includes('post_mode')) db.exec("ALTER TABLE communities ADD COLUMN post_mode TEXT NOT NULL DEFAULT 'member'")

// Миграция: писать в сообществе от имени сообщества или от своей страницы
// post_as: 'user' (по умолчанию, от своей страницы) | 'community' (от имени сообщества)
const commCols2 = db.pragma('table_info(communities)').map(c => c.name)
if (!commCols2.includes('post_as')) db.exec("ALTER TABLE communities ADD COLUMN post_as TEXT NOT NULL DEFAULT 'user'")
const postColsAuthor = db.pragma('table_info(posts)').map(c => c.name)
if (!postColsAuthor.includes('author_community_id')) {
  db.exec('ALTER TABLE posts ADD COLUMN author_community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE')
}

// Заявки на вступление в закрытые/по-заявке сообщества
db.exec(`
CREATE TABLE IF NOT EXISTS community_join_requests (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (community_id, user_id)
);
`)

// Миграция: анкета пользователя (основная информация, интересы, контакты)
const userColsAbout = db.pragma('table_info(users)').map(c => c.name)
if (!userColsAbout.includes('first_name')) db.exec("ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT ''")
if (!userColsAbout.includes('last_name')) db.exec("ALTER TABLE users ADD COLUMN last_name TEXT DEFAULT ''")
if (!userColsAbout.includes('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT ''")
if (!userColsAbout.includes('hometown')) db.exec("ALTER TABLE users ADD COLUMN hometown TEXT DEFAULT ''")
if (!userColsAbout.includes('marital_status')) db.exec("ALTER TABLE users ADD COLUMN marital_status TEXT NOT NULL DEFAULT 'not_selected'")
if (!userColsAbout.includes('marital_partner')) db.exec("ALTER TABLE users ADD COLUMN marital_partner TEXT DEFAULT ''")
if (!userColsAbout.includes('political_views')) db.exec("ALTER TABLE users ADD COLUMN political_views TEXT NOT NULL DEFAULT 'not_selected'")
if (!userColsAbout.includes('pronouns')) db.exec("ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT 'not_selected'")
if (!userColsAbout.includes('birthday')) db.exec('ALTER TABLE users ADD COLUMN birthday TEXT')
if (!userColsAbout.includes('birthday_visibility')) db.exec("ALTER TABLE users ADD COLUMN birthday_visibility TEXT NOT NULL DEFAULT 'everyone'")
if (!userColsAbout.includes('interests')) db.exec("ALTER TABLE users ADD COLUMN interests TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_music')) db.exec("ALTER TABLE users ADD COLUMN favorite_music TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_movies')) db.exec("ALTER TABLE users ADD COLUMN favorite_movies TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_tv')) db.exec("ALTER TABLE users ADD COLUMN favorite_tv TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_books')) db.exec("ALTER TABLE users ADD COLUMN favorite_books TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_quotes')) db.exec("ALTER TABLE users ADD COLUMN favorite_quotes TEXT DEFAULT ''")
if (!userColsAbout.includes('favorite_games')) db.exec("ALTER TABLE users ADD COLUMN favorite_games TEXT DEFAULT ''")
if (!userColsAbout.includes('about_me')) db.exec("ALTER TABLE users ADD COLUMN about_me TEXT DEFAULT ''")
if (!userColsAbout.includes('website')) db.exec("ALTER TABLE users ADD COLUMN website TEXT DEFAULT ''")
if (!userColsAbout.includes('city')) db.exec("ALTER TABLE users ADD COLUMN city TEXT DEFAULT ''")
if (!userColsAbout.includes('address')) db.exec("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''")
if (!userColsAbout.includes('psychotype')) db.exec("ALTER TABLE users ADD COLUMN psychotype TEXT NOT NULL DEFAULT 'not_selected'")
if (!userColsAbout.includes('thinking_type')) db.exec("ALTER TABLE users ADD COLUMN thinking_type TEXT NOT NULL DEFAULT 'not_selected'")

// Одноразовый перенос старого поля «О себе» (bio) в анкету «Описание профиля» (about_me),
// чтобы текст не потерялся после удаления вкладки «Профиль». Сам bio сохраняется.
const aboutBioMigrated = db.prepare("SELECT value FROM settings WHERE key = 'about_bio_migration_v1'").get()
if (!aboutBioMigrated) {
  db.prepare("UPDATE users SET about_me = bio WHERE (about_me IS NULL OR about_me = '') AND (bio IS NOT NULL AND bio != '')").run()
  db.prepare("INSERT INTO settings (key, value) VALUES ('about_bio_migration_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
}

// ---------------------------------------------------------------------------
// Пакет «почти финал»: модератор, мемориал, блокировки, муты контента,
// друзья, группы, жалобы, бан по IP, last seen, локальное время, масштаб аватара
// ---------------------------------------------------------------------------

// Роли и состояния аккаунта: модератор, мемориал, блокировка аккаунта
const userColsFinal = db.pragma('table_info(users)').map(c => c.name)
if (!userColsFinal.includes('is_moderator')) db.exec('ALTER TABLE users ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0')
if (!userColsFinal.includes('memorialized')) db.exec('ALTER TABLE users ADD COLUMN memorialized INTEGER NOT NULL DEFAULT 0')
if (!userColsFinal.includes('memorialized_at')) db.exec('ALTER TABLE users ADD COLUMN memorialized_at TEXT')
if (!userColsFinal.includes('memorialized_by')) db.exec('ALTER TABLE users ADD COLUMN memorialized_by INTEGER REFERENCES users(id)')
if (!userColsFinal.includes('blocked_until')) db.exec('ALTER TABLE users ADD COLUMN blocked_until TEXT')
if (!userColsFinal.includes('blocked_reason')) db.exec("ALTER TABLE users ADD COLUMN blocked_reason TEXT DEFAULT ''")

// Время последнего посещения и локальное время пользователя
if (!userColsFinal.includes('last_seen')) db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT')
if (!userColsFinal.includes('show_local_time')) db.exec('ALTER TABLE users ADD COLUMN show_local_time INTEGER NOT NULL DEFAULT 0')
if (!userColsFinal.includes('timezone')) db.exec("ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Europe/Kyiv'")

// Масштаб аватара (редактирование без кадрирования файла)
if (!userColsFinal.includes('avatar_scale')) db.exec('ALTER TABLE users ADD COLUMN avatar_scale REAL NOT NULL DEFAULT 1')

// Фон страницы профиля (передняк): структурированный объект JSON
// { type: 'none' | 'preset' | 'color' | 'image', value, opacity? }.
// Приходит на смену простого page_color, но старый page_color остаётся для обратной совместимости.
if (!userColsFinal.includes('page_bg')) db.exec('ALTER TABLE users ADD COLUMN page_bg TEXT')

// Скрывать свои посты, опубликованные от лица сообщества/группы
if (!userColsFinal.includes('hide_group_posts')) db.exec('ALTER TABLE users ADD COLUMN hide_group_posts INTEGER NOT NULL DEFAULT 0')

// Закрытый профиль (open | friends | closed)
if (!userColsFinal.includes('profile_visibility')) db.exec("ALTER TABLE users ADD COLUMN profile_visibility TEXT NOT NULL DEFAULT 'open'")

// Муты по типам контента: посты / аудио / видео (NULL = не в муте)
if (!userColsFinal.includes('mute_posts_until')) db.exec('ALTER TABLE users ADD COLUMN mute_posts_until TEXT')
if (!userColsFinal.includes('mute_audios_until')) db.exec('ALTER TABLE users ADD COLUMN mute_audios_until TEXT')
if (!userColsFinal.includes('mute_videos_until')) db.exec('ALTER TABLE users ADD COLUMN mute_videos_until TEXT')

// Сообщества: скрывать владельца в авторах постов сообщества
const commColsFinal = db.pragma('table_info(communities)').map(c => c.name)
if (!commColsFinal.includes('hide_owner')) db.exec('ALTER TABLE communities ADD COLUMN hide_owner INTEGER NOT NULL DEFAULT 0')

// Друзья: таблица дружбы (симметричная, одна строка на пару) и заявки в друзья
db.exec(`
CREATE TABLE IF NOT EXISTS friends (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id < friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);

CREATE TABLE IF NOT EXISTS friend_requests (
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_user_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id, status);
`)

// Группы: отдельная сущность (до 100 участников) + участники
db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  avatar      TEXT,
  cover       TEXT,
  access      TEXT NOT NULL DEFAULT 'open',   -- open | link | closed
  member_limit INTEGER NOT NULL DEFAULT 100,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, id);

CREATE TABLE IF NOT EXISTS group_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_group_invites_user ON group_invites(user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id, status);
`)

// Миграция: вложения в сообщениях группы (фото/видео из поста-кнопки)
const gmCols = db.pragma('table_info(group_messages)').map(c => c.name)
if (!gmCols.includes('attachments')) {
  db.exec("ALTER TABLE group_messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
}

// Жалобы на контент (пост/видео/аудио/альбом/фото) с ответом админа
db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,   -- post | video | audio | album | photo
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | dismissed
  response    TEXT DEFAULT '',
  handled_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  handled_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
`)

// Баны по IP
db.exec(`
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip         TEXT PRIMARY KEY,
  reason     TEXT DEFAULT '',
  handled_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);
`)

// Индексы для быстрых проверок доступа к медиа (маршрут /uploads/:file)
db.exec(`
CREATE INDEX IF NOT EXISTS idx_videos_url ON library_videos(url);
CREATE INDEX IF NOT EXISTS idx_videos_preview ON library_videos(preview);
CREATE INDEX IF NOT EXISTS idx_audios_url ON library_audios(url);
`)

// Миграция групп: доступ (open/link/closed) и лимит участников
{
  const groupCols = db.pragma('table_info(groups)').map(c => c.name)
  if (!groupCols.includes('access')) db.exec("ALTER TABLE groups ADD COLUMN access TEXT NOT NULL DEFAULT 'open'")
  if (!groupCols.includes('member_limit')) db.exec('ALTER TABLE groups ADD COLUMN member_limit INTEGER NOT NULL DEFAULT 100')
  if (!groupCols.includes('invite_token')) db.exec('ALTER TABLE groups ADD COLUMN invite_token TEXT')
  // Существующим группам без токена выдаём случайный (для ссылок-приглашений)
  db.prepare("SELECT id FROM groups WHERE invite_token IS NULL OR invite_token=''").all()
    .forEach(g => db.prepare('UPDATE groups SET invite_token=? WHERE id=?').run(crypto.randomBytes(18).toString('base64url'), g.id))
}

export default db

// Одноразовый «сброс» всех ранее выданных JWT после обновления безопасности:
// без этого старые токены (без номера сессии) остались бы действительными навсегда.
const secUpgrade = db.prepare("SELECT value FROM settings WHERE key = 'security_upgrade_v1'").get()
if (!secUpgrade) {
  db.prepare('UPDATE users SET token_version = token_version + 1').run()
  db.prepare("INSERT INTO settings (key, value) VALUES ('security_upgrade_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
}

// SQLite хранит created_at как UTC «YYYY-MM-DD HH:MM:SS» без кода зоны.
// Превращаем в ISO с «Z», чтобы клиент парсил как UTC, а не как локальное время.
export function utcIso(s) {
  return s == null || s === '' ? s : String(s).replace(' ', 'T') + 'Z'
}

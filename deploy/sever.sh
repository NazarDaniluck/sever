#!/usr/bin/env bash
# =============================================================================
#  «Север» — скрипт запуска для Debian/Ubuntu (systemd или вручную)
#
#  Как это работает (проверено по коду):
#    * сервер:  node server/src/index.js   — порт 4000, слушает только 127.0.0.1
#    * рабочий каталог ОБЯЗАТЕЛЬНО server/ : там process.loadEnvFile() ищет .env
#    * БД создаётся сама:  server/data/sever.db  (SQLite, WAL)
#    * файлы:   server/uploads/
#    * клиент:  сначала надо собрать  client/dist  (server раздаёт его сам,
#      если dist существует — сайт и API живут на одном порту)
#    * наружу порт отдаёт reverse-proxy (nginx) или туннель (cloudflared)
#      потому что сам сервер привязан к 127.0.0.1
#
#  Требования:
#    * Node.js >= 20.12 (используется process.loadEnvFile)
#    * better-sqlite3 — нативный модуль: если не подошёл prebuild,
#      понадобятся:  apt install build-essential python3
#
#  Команды:
#    ./sever.sh install      — поставить зависимости и собрать клиент
#    ./sever.sh build        — только собрать клиент
#    ./sever.sh start|stop|restart|status|logs|db-reset
#
#  Переменные окружения (можно задать в server/.env или в окружении):
#    PORT, CLIENT_ORIGIN, JWT_SECRET, SEVER_USER, SEVER_LOG, SEVER_PID
# =============================================================================

set -euo pipefail

# --- пути -------------------------------------------------------------------
# скрипт лежит либо в deploy/, либо прямо в корне репозитория
_self="$(readlink -f "${BASH_SOURCE[0]:-${0:-}}")"
_here="$(dirname "$_self")"
if [ "$(basename "$_here")" = "deploy" ]; then
  APP_DIR="$(dirname "$_here")"
else
  APP_DIR="$_here"
fi

SERVER_DIR="$APP_DIR/server"
CLIENT_DIR="$APP_DIR/client"
DIST_DIR="$CLIENT_DIR/dist"
ENV_FILE="$SERVER_DIR/.env"

SEVER_LOG="${SEVER_LOG:-$SERVER_DIR/sever.log}"
SEVER_PID="${SEVER_PID:-$SERVER_DIR/sever.pid}"
SEVER_USER="${SEVER_USER:-}"
NODE_BIN="${NODE_BIN:-node}"

PORT="${PORT:-4000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

# --- выполнение команд от имени SEVER_USER (если задан и мы root) -----------
as_user() {
  if [ -n "$SEVER_USER" ] && [ "$(id -u)" = "0" ]; then
    runuser -u "$SEVER_USER" -- "$@"
  else
    "$@"
  fi
}

# --- безопасная загрузка .env (комментарии, кавычки, пробелы) ----------------
load_env() {
  [ -f "$ENV_FILE" ] || return 0
  local line key val
  while IFS= read -r line; do
    line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [ -n "$line" ] || continue
    case "$line" in
      \#*|'') continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%\"}" ; val="${val#\"}"
    val="${val%\'}" ; val="${val#\'}"
    export "$key=$val"
  done < "$ENV_FILE"
}

node_major() { "$NODE_BIN" --version | sed -E 's/v([0-9]+).*/\1/'; }

check_node() {
  command -v "$NODE_BIN" >/dev/null 2>&1 || fail "'$NODE_BIN' не найден. Поставьте Node.js >= 20 (например из nodesource)."
  local maj
  maj="$(node_major)"
  [ "$maj" -ge 20 ] || fail "Нужен Node.js >= 20, у вас v$maj. См. https://github.com/nodesource/distributions"
}

is_running() {
  [ -f "$SEVER_PID" ] || return 1
  local pid
  pid="$(cat "$SEVER_PID" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start() {
  check_node
  if is_running; then
    log "Сервер уже запущен (pid $(cat "$SEVER_PID"))."
    return 0
  fi
  [ -d "$SERVER_DIR" ] || fail "Не найдена папка сервера: $SERVER_DIR"
  [ -d "$SERVER_DIR/node_modules" ] || fail "Зависимости сервера не установлены. Сначала: $(basename "$0") install"
  if [ ! -f "$DIST_DIR/index.html" ]; then
    log "Не собран клиент ($DIST_DIR отсутствует) — запускаю только API на порту $PORT."
    log "Соберите клиент: $(basename "$0") build"
  fi

  load_env
  log "Запуск «Севера» на 127.0.0.1:$PORT (лог: $SEVER_LOG)"

  # Важно: запускаем именно из server/ — там .env подхватится process.loadEnvFile.
  # nohup + фоновый запуск напрямую (без cd && ... &), чтобы в pid-файл попал
  # настоящий PID node-процесса, а не PID промежуточной подоболочки.
  cd "$SERVER_DIR"
  nohup "$NODE_BIN" src/index.js >>"$SEVER_LOG" 2>&1 &
  echo $! > "$SEVER_PID"

  local i
  for i in $(seq 1 30); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      log "Сервер поднялся: $HEALTH_URL"
      return 0
    fi
    sleep 1
  done
  log "Сервер стартовал, но не ответил на $HEALTH_URL. Смотрите лог: $SEVER_LOG"
  return 1
}

stop() {
  if ! is_running; then
    log "Сервер не запущен."
    rm -f "$SEVER_PID"
    return 0
  fi
  local pid
  pid="$(cat "$SEVER_PID")"
  log "Останавливаю сервер (pid $pid)…"
  kill "$pid" 2>/dev/null || true
  local i
  for i in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    log "Не остановился за 10с — принудительно (SIGKILL)."
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$SEVER_PID"
  log "Остановлен."
}

restart() { stop; sleep 1; start; }

status() {
  if is_running; then
    log "Сервер запущен: pid $(cat "$SEVER_PID")"
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      log "Здоровье: OK ($HEALTH_URL)"
    else
      log "Здоровье: сервер не отвечает на $HEALTH_URL (возможно, ещё грузится)"
    fi
  else
    log "Сервер не запущен."
    return 1
  fi
}

install_deps() {
  check_node
  log "Установка зависимостей сервера…"
  as_user npm install --prefix "$SERVER_DIR" || as_user npm ci --prefix "$SERVER_DIR"
  log "Установка зависимостей клиента…"
  as_user npm install --prefix "$CLIENT_DIR" || as_user npm ci --prefix "$CLIENT_DIR"
}

build() {
  check_node
  [ -d "$CLIENT_DIR/node_modules" ] || fail "Зависимости клиента не установлены. Сначала: $(basename "$0") install"
  log "Сборка клиента (client/dist)…"
  as_user npm --prefix "$CLIENT_DIR" run build
  log "Клиент собран: $DIST_DIR"
}

db_reset() {
  stop || true
  load_env
  log "Полная очистка базы (server/data/sever.db)…"
  ( cd "$SERVER_DIR" && "$NODE_BIN" src/seed.js )
  log "База очищена."
}

logs() {
  [ -f "$SEVER_LOG" ] || fail "Лог ещё не создан: $SEVER_LOG"
  tail -n 100 -f "$SEVER_LOG"
}

usage() {
  cat <<EOF
Использование: $0 {install|build|start|stop|restart|status|logs|db-reset}

  install   — установить зависимости и собрать клиент (первый запуск)
  build     — пересобрать клиент (после изменений фронтенда)
  start     — запустить сервер в фоне
  stop      — остановить
  restart   — перезапустить
  status    — проверить статус и здоровье
  logs      — смотреть лог в реальном времени
  db-reset  — ПОЛНАЯ очистка базы (удаляет всех пользователей!)

Переменные: PORT, CLIENT_ORIGIN, JWT_SECRET, SEVER_USER, SEVER_LOG, SEVER_PID
EOF
}

case "${1:-}" in
  install) install_deps; build; log "Готово. Запуск: $0 start" ;;
  build)   build ;;
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  status)  status ;;
  logs)    logs ;;
  db-reset) db_reset ;;
  *) usage ;;
esac

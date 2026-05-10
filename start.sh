#!/usr/bin/env bash
# start.sh — единая точка входа для локального запуска Sky Strife.
#
# Что делает:
#   1. Подгружает nvm (если установлен) и проверяет, что нужные версии
#      Node / pnpm / Foundry стоят и совпадают с тем, что нужно проекту.
#      См. INSTALL.md.
#   2. Проверяет, что MUD клонирован сиблингом и на правильном коммите.
#   3. Проверяет, что один важный патч в MUD CLI применён.
#   4. Гарантирует, что порты 8545 / 1337 / 1993 свободны.
#   5. Запускает `pnpm dev` (он внутри поднимает mprocs:
#      dev:node, dev:contracts → dev:upload-map → dev:create-debug-matches,
#      dev:client, dev:plugins).
#
# Использование:
#   ./start.sh                # обычный запуск (pnpm dev → mprocs, нужен TTY)
#   ./start.sh --check        # только проверки, без pnpm dev
#   ./start.sh --kill-ports   # убить процессы, висящие на 8545/1337/1993, и запустить
#   ./start.sh --background   # запустить все 4 сервиса в фоне через nohup,
#                              логи в .start-logs/ (полезно если нет TTY,
#                              напр. ssh -T или из CI)
#   ./start.sh --stop         # остановить процессы, запущенные через --background
#
# Скрипт намеренно НЕ устанавливает Node/pnpm/Foundry за вас — он только
# проверяет версии и подсказывает что чинить. Полная установка — в INSTALL.md.

set -euo pipefail

# ---------- цвета ----------
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_RESET=""
fi
ok()   { echo "${C_GREEN}[ok]${C_RESET}   $*"; }
info() { echo "${C_BLUE}[info]${C_RESET} $*"; }
warn() { echo "${C_YELLOW}[warn]${C_RESET} $*"; }
err()  { echo "${C_RED}[err]${C_RESET}  $*" >&2; }
die()  { err "$*"; exit 1; }

# ---------- параметры ----------
CHECK_ONLY=0
KILL_PORTS=0
BACKGROUND=0
STOP=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --kill-ports) KILL_PORTS=1 ;;
    --background|-b) BACKGROUND=1; KILL_PORTS=1 ;;
    --stop) STOP=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"; exit 0 ;;
    *) die "Unknown arg: $arg (try --help)" ;;
  esac
done

SKYSTRIFE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUD_DIR="$(cd "$SKYSTRIFE_DIR/.." && pwd)/mud"
LOG_DIR="$SKYSTRIFE_DIR/.start-logs"
PID_DIR="$SKYSTRIFE_DIR/.start-logs/pids"

# --stop отдельной веткой, до всех проверок.
if [ "$STOP" -eq 1 ]; then
  if [ ! -d "$PID_DIR" ]; then
    info "Не вижу .start-logs/pids — нечего останавливать."
    exit 0
  fi
  for f in "$PID_DIR"/*.pid; do
    [ -e "$f" ] || continue
    pid="$(cat "$f")"
    name="$(basename "$f" .pid)"
    if kill -0 "$pid" 2>/dev/null; then
      # Бьём по группе процессов, иначе anvil/vite остаются орфанами.
      pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
      if [ -n "$pgid" ]; then
        kill -- -"$pgid" 2>/dev/null || true
      else
        kill "$pid" 2>/dev/null || true
      fi
      ok "остановил $name (pid $pid)"
    else
      info "$name (pid $pid) уже не живёт"
    fi
    rm -f "$f"
  done

  # На всякий случай добиваем всё, что висит на наших портах.
  for p in 8545 1337 1993; do
    pids="$(ss -ltnp 2>/dev/null | awk -v pp=":$p" '$4 ~ pp"$" {print $0}' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | tr '\n' ' ')"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  exit 0
fi

# Версии и значения, на которых проект гарантированно стартует.
REQUIRED_NODE="v18.16.1"
REQUIRED_PNPM_MAJOR="8"
REQUIRED_FORGE_PREFIX="forge Version: 1.0.0"
REQUIRED_MUD_COMMIT="e85dc5349"

# ---------- nvm ----------
if [ -z "${NVM_DIR:-}" ] && [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
fi
if [ -n "${NVM_DIR:-}" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  if nvm ls "${REQUIRED_NODE#v}" >/dev/null 2>&1; then
    nvm use "${REQUIRED_NODE#v}" >/dev/null
  fi
fi

# ---------- foundry ----------
if [ -d "$HOME/.foundry/bin" ]; then
  export PATH="$HOME/.foundry/bin:$PATH"
fi

fail=0

# Node
if ! command -v node >/dev/null 2>&1; then
  err "node не найден. Поставь Node $REQUIRED_NODE (см. INSTALL.md §2)."
  fail=1
else
  cur="$(node -v)"
  if [ "$cur" != "$REQUIRED_NODE" ]; then
    err "Node $cur, нужен $REQUIRED_NODE. nvm install ${REQUIRED_NODE#v} && nvm use ${REQUIRED_NODE#v}"
    fail=1
  else
    ok "Node $cur"
  fi
fi

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm не найден. npm install -g pnpm@$REQUIRED_PNPM_MAJOR"
  fail=1
else
  cur="$(pnpm -v)"
  major="${cur%%.*}"
  if [ "$major" != "$REQUIRED_PNPM_MAJOR" ]; then
    err "pnpm $cur, нужен major $REQUIRED_PNPM_MAJOR. npm install -g pnpm@$REQUIRED_PNPM_MAJOR"
    fail=1
  else
    ok "pnpm $cur"
  fi
fi

# Foundry
if ! command -v forge >/dev/null 2>&1; then
  err "forge не найден. Поставь Foundry 1.0.0: foundryup -i 1.0.0 (см. INSTALL.md §5)."
  fail=1
else
  if forge --version 2>/dev/null | grep -q "^$REQUIRED_FORGE_PREFIX"; then
    ok "Foundry 1.0.0"
  else
    err "forge: $(forge --version | head -1). Нужна 1.0.0: foundryup -i 1.0.0"
    fail=1
  fi
fi
if ! command -v anvil >/dev/null 2>&1; then
  err "anvil не найден (входит в Foundry). foundryup -i 1.0.0"
  fail=1
fi

# MUD сиблинг и коммит
if [ ! -d "$MUD_DIR/.git" ]; then
  err "MUD не найден по пути $MUD_DIR. См. INSTALL.md §6–§8: git clone https://github.com/latticexyz/mud.git ../mud && (cd ../mud && git checkout $REQUIRED_MUD_COMMIT && npm i -g pnpm@9 && pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm build && npm i -g pnpm@$REQUIRED_PNPM_MAJOR)"
  fail=1
else
  head_short="$(cd "$MUD_DIR" && git rev-parse --short=9 HEAD)"
  if [ "$head_short" != "$REQUIRED_MUD_COMMIT" ]; then
    warn "MUD HEAD = $head_short, ожидаемый $REQUIRED_MUD_COMMIT. Если деплой упадёт — переключись: (cd $MUD_DIR && git checkout $REQUIRED_MUD_COMMIT && pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm build)"
  else
    ok "MUD на $head_short"
  fi
  # sed-патч MUD CLI
  if compgen -G "$MUD_DIR/packages/cli/dist/commands-*.js" >/dev/null; then
    if grep -q '"-vvv",s?"--aws":""' "$MUD_DIR"/packages/cli/dist/commands-*.js 2>/dev/null; then
      warn "Применяю sed-патч к MUD CLI (см. INSTALL.md §9)…"
      sed -i 's|"-vvv",s?"--aws":""|"-vvv",...(s?["--aws"]:[])|' "$MUD_DIR"/packages/cli/dist/commands-*.js
      ok "MUD CLI пропатчен"
    elif grep -q '"-vvv",\.\.\.(s?\["--aws"\]:\[\])' "$MUD_DIR"/packages/cli/dist/commands-*.js 2>/dev/null; then
      ok "MUD CLI уже пропатчен"
    else
      warn "MUD CLI не выглядит так, как ожидалось — пропускаю sed-патч. Если PostDeploy упадёт с 'encode length mismatch' — см. INSTALL.md §9."
    fi
  else
    err "MUD CLI dist не собран. cd $MUD_DIR && NODE_OPTIONS=--max-old-space-size=8192 pnpm build"
    fail=1
  fi
fi

# Конфиг devnode — auto-mine
if grep -q '"devnode": "anvil --base-fee 0 --block-time' "$SKYSTRIFE_DIR/packages/contracts/package.json"; then
  warn "devnode всё ещё с --block-time. Это даст гонку nonce при деплое. См. INSTALL.md §11."
fi

if [ "$fail" -ne 0 ]; then
  die "Не все проверки прошли. Поправь по подсказкам выше и запусти снова."
fi

# node_modules
if [ ! -d "$SKYSTRIFE_DIR/node_modules" ]; then
  info "node_modules нет — запускаю pnpm install (первый раз 5–10 минут)…"
  (cd "$SKYSTRIFE_DIR" && pnpm install)
fi

# Порты
in_use() {
  local p="$1"
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -E ":(${p})$" -q
}
PORTS=(8545 1337 1993)
busy=()
for p in "${PORTS[@]}"; do
  if in_use "$p"; then busy+=("$p"); fi
done
if [ "${#busy[@]}" -gt 0 ]; then
  if [ "$KILL_PORTS" -eq 1 ]; then
    warn "Порты заняты: ${busy[*]}. Убиваю процессы…"
    for p in "${busy[@]}"; do
      pids="$(ss -ltnp 2>/dev/null | awk -v p=":$p" '$4 ~ p {print $0}' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | tr '\n' ' ')"
      [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done
    sleep 2
  else
    err "Порты заняты: ${busy[*]}. Запусти './start.sh --kill-ports' или вручную освободи их."
    exit 1
  fi
fi
ok "Порты 8545 / 1337 / 1993 свободны"

if [ "$CHECK_ONLY" -eq 1 ]; then
  ok "Все проверки прошли. Запусти без --check, чтобы стартовать."
  exit 0
fi

if [ "$BACKGROUND" -eq 1 ]; then
  mkdir -p "$LOG_DIR" "$PID_DIR"
  cd "$SKYSTRIFE_DIR"

  info "Запускаю сервисы в фоне; логи: $LOG_DIR"

  start_bg() {
    local name="$1"; shift
    local pidfile="$PID_DIR/$name.pid"
    local logfile="$LOG_DIR/$name.log"
    # setsid — чтобы потом можно было убить всю группу с anvil/vite/всеми детьми.
    setsid bash -c "exec \"\$@\" >\"$logfile\" 2>&1" _ "$@" &
    echo $! > "$pidfile"
    ok "$name → pid $(cat "$pidfile"), лог: $logfile"
  }

  start_bg node    pnpm run dev:node
  # Ждём, пока anvil начнёт слушать.
  for _ in $(seq 1 30); do
    if in_use 8545; then break; fi
    sleep 1
  done
  in_use 8545 || die "anvil не поднялся за 30с. Смотри $LOG_DIR/node.log"

  info "Деплою контракты (это займёт ~30с)…"
  if ! (cd "$SKYSTRIFE_DIR" && pnpm run dev:contracts) >"$LOG_DIR/contracts.log" 2>&1; then
    err "dev:contracts упал. См. $LOG_DIR/contracts.log"
    exit 1
  fi
  ok "dev:contracts OK"

  info "Загружаю карты…"
  if ! (cd "$SKYSTRIFE_DIR" && pnpm run dev:upload-map) >"$LOG_DIR/upload-map.log" 2>&1; then
    err "dev:upload-map упал. См. $LOG_DIR/upload-map.log"
    exit 1
  fi
  ok "dev:upload-map OK"

  # create-debug-matches — это long-running matchmaker, а не one-shot.
  # В mprocs он висит в одной панели и периодически создаёт новые матчи.
  start_bg debug-matches pnpm run dev:create-debug-matches
  start_bg client        pnpm run dev:client
  start_bg plugins       pnpm run dev:plugins

  info "Жду пока встанут client (1337) и plugins (1993)…"
  for _ in $(seq 1 60); do
    if in_use 1337 && in_use 1993; then break; fi
    sleep 1
  done
  in_use 1337 || die "client не встал. См. $LOG_DIR/client.log"
  in_use 1993 || die "plugins не встал. См. $LOG_DIR/plugins.log"

  ok "Всё работает:"
  ok "  client:  http://localhost:1337"
  ok "  plugins: http://localhost:1993"
  ok "  RPC:     http://localhost:8545"
  echo
  info "Чтобы остановить всё: ./start.sh --stop"
  exit 0
fi

if [ ! -t 1 ]; then
  warn "stdout не TTY, mprocs не сможет нарисовать UI."
  warn "Используй './start.sh --background' для headless-режима."
fi

info "Стартую 'pnpm dev'. Откроется mprocs c 4 панелями:"
info "  • dev:contracts → dev:upload-map → dev:create-debug-matches (одноразовый pipeline)"
info "  • dev:client      (Vite, http://localhost:1337)"
info "  • dev:node        (anvil, :8545)"
info "  • dev:plugins     (WS, :1993)"
info "Чтобы выйти из mprocs — Ctrl-A затем Q (или :q)."

cd "$SKYSTRIFE_DIR"
exec pnpm dev

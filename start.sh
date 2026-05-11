#!/usr/bin/env bash
# start.sh — single entry point for running Sky Strife locally.
#
# What it does:
#   1. Loads nvm (if installed) and verifies the required versions of
#      Node / pnpm / Foundry are present. See INSTALL.md.
#   2. Verifies MUD is cloned as a sibling at the right commit.
#   3. Verifies that one important patch in the MUD CLI is applied.
#   4. Ensures ports 8545 / 1337 / 1993 / 3002 are free.
#   5. Runs `pnpm dev` (which internally spins up mprocs:
#      dev:node, dev:contracts -> dev:upload-map -> dev:create-debug-matches,
#      dev:client, dev:plugins).
#
# Usage:
#   ./start.sh                # normal launch (pnpm dev -> mprocs, needs a TTY)
#   ./start.sh --check        # checks only, no pnpm dev
#   ./start.sh --kill-ports   # kill anything on 8545/1337/1993/3002 and start
#   ./start.sh --background   # run all services in the background via setsid,
#                              logs go to .start-logs/ (useful if no TTY,
#                              e.g. ssh -T or from CI)
#   ./start.sh --stop         # stop processes that were launched via --background
#
# The script deliberately does NOT install Node/pnpm/Foundry for you —
# it only checks versions and tells you what to fix. Full install: INSTALL.md.

set -euo pipefail

# ---------- colors ----------
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

# ---------- args ----------
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
      sed -n '2,26p' "$0"; exit 0 ;;
    *) die "Unknown arg: $arg (try --help)" ;;
  esac
done

SKYSTRIFE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUD_DIR="$(cd "$SKYSTRIFE_DIR/.." && pwd)/mud"
LOG_DIR="$SKYSTRIFE_DIR/.start-logs"
PID_DIR="$SKYSTRIFE_DIR/.start-logs/pids"

# --stop branch runs before any other checks.
if [ "$STOP" -eq 1 ]; then
  if [ ! -d "$PID_DIR" ]; then
    info "No .start-logs/pids found — nothing to stop."
    exit 0
  fi
  for f in "$PID_DIR"/*.pid; do
    [ -e "$f" ] || continue
    pid="$(cat "$f")"
    name="$(basename "$f" .pid)"
    if kill -0 "$pid" 2>/dev/null; then
      # Kill the whole process group, otherwise anvil/vite become orphans.
      pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
      if [ -n "$pgid" ]; then
        kill -- -"$pgid" 2>/dev/null || true
      else
        kill "$pid" 2>/dev/null || true
      fi
      ok "stopped $name (pid $pid)"
    else
      info "$name (pid $pid) is already dead"
    fi
    rm -f "$f"
  done

  # Just in case, kill anything still listening on our ports.
  for p in 8545 1337 1993 3002; do
    pids="$(ss -ltnp 2>/dev/null | awk -v pp=":$p" '$4 ~ pp"$" {print $0}' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | tr '\n' ' ')"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  exit 0
fi

# Versions / values the project is known to work with.
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
  err "node not found. Install Node $REQUIRED_NODE (see INSTALL.md section 2)."
  fail=1
else
  cur="$(node -v)"
  if [ "$cur" != "$REQUIRED_NODE" ]; then
    err "Node $cur, need $REQUIRED_NODE. nvm install ${REQUIRED_NODE#v} && nvm use ${REQUIRED_NODE#v}"
    fail=1
  else
    ok "Node $cur"
  fi
fi

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm not found. npm install -g pnpm@$REQUIRED_PNPM_MAJOR"
  fail=1
else
  cur="$(pnpm -v)"
  major="${cur%%.*}"
  if [ "$major" != "$REQUIRED_PNPM_MAJOR" ]; then
    err "pnpm $cur, need major $REQUIRED_PNPM_MAJOR. npm install -g pnpm@$REQUIRED_PNPM_MAJOR"
    fail=1
  else
    ok "pnpm $cur"
  fi
fi

# Foundry
if ! command -v forge >/dev/null 2>&1; then
  err "forge not found. Install Foundry 1.0.0: foundryup -i 1.0.0 (see INSTALL.md section 5)."
  fail=1
else
  if forge --version 2>/dev/null | grep -q "^$REQUIRED_FORGE_PREFIX"; then
    ok "Foundry 1.0.0"
  else
    err "forge: $(forge --version | head -1). Need 1.0.0: foundryup -i 1.0.0"
    fail=1
  fi
fi
if ! command -v anvil >/dev/null 2>&1; then
  err "anvil not found (ships with Foundry). foundryup -i 1.0.0"
  fail=1
fi

# MUD sibling + commit
if [ ! -d "$MUD_DIR/.git" ]; then
  err "MUD not found at $MUD_DIR. See INSTALL.md sections 6-8: git clone https://github.com/latticexyz/mud.git ../mud && (cd ../mud && git checkout $REQUIRED_MUD_COMMIT && npm i -g pnpm@9 && pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm build && npm i -g pnpm@$REQUIRED_PNPM_MAJOR)"
  fail=1
else
  head_short="$(cd "$MUD_DIR" && git rev-parse --short=9 HEAD)"
  if [ "$head_short" != "$REQUIRED_MUD_COMMIT" ]; then
    warn "MUD HEAD = $head_short, expected $REQUIRED_MUD_COMMIT. If deploy fails: (cd $MUD_DIR && git checkout $REQUIRED_MUD_COMMIT && pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm build)"
  else
    ok "MUD at $head_short"
  fi
  # sed patch for MUD CLI
  if compgen -G "$MUD_DIR/packages/cli/dist/commands-*.js" >/dev/null; then
    if grep -q '"-vvv",s?"--aws":""' "$MUD_DIR"/packages/cli/dist/commands-*.js 2>/dev/null; then
      warn "Applying sed patch to MUD CLI (see INSTALL.md section 9)…"
      sed -i 's|"-vvv",s?"--aws":""|"-vvv",...(s?["--aws"]:[])|' "$MUD_DIR"/packages/cli/dist/commands-*.js
      ok "MUD CLI patched"
    elif grep -q '"-vvv",\.\.\.(s?\["--aws"\]:\[\])' "$MUD_DIR"/packages/cli/dist/commands-*.js 2>/dev/null; then
      ok "MUD CLI already patched"
    else
      warn "MUD CLI does not look as expected — skipping sed patch. If PostDeploy fails with 'encode length mismatch', see INSTALL.md section 9."
    fi
  else
    err "MUD CLI dist is not built. cd $MUD_DIR && NODE_OPTIONS=--max-old-space-size=8192 pnpm build"
    fail=1
  fi
fi

# devnode config — auto-mine
if grep -q '"devnode": "anvil --base-fee 0 --block-time' "$SKYSTRIFE_DIR/packages/contracts/package.json"; then
  warn "devnode still has --block-time. This causes nonce races on deploy. See INSTALL.md section 11."
fi

if [ "$fail" -ne 0 ]; then
  die "Some checks failed. Fix the issues above and re-run."
fi

# node_modules
if [ ! -d "$SKYSTRIFE_DIR/node_modules" ]; then
  info "node_modules missing — running pnpm install (5-10 min first time)…"
  (cd "$SKYSTRIFE_DIR" && pnpm install)
fi

# Ports
in_use() {
  local p="$1"
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -E ":(${p})$" -q
}
PORTS=(8545 1337 1993 3002)
busy=()
for p in "${PORTS[@]}"; do
  if in_use "$p"; then busy+=("$p"); fi
done
if [ "${#busy[@]}" -gt 0 ]; then
  if [ "$KILL_PORTS" -eq 1 ]; then
    warn "Ports busy: ${busy[*]}. Killing processes…"
    for p in "${busy[@]}"; do
      pids="$(ss -ltnp 2>/dev/null | awk -v p=":$p" '$4 ~ p {print $0}' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | tr '\n' ' ')"
      [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done
    sleep 2
  else
    err "Ports busy: ${busy[*]}. Run './start.sh --kill-ports' or free them manually."
    exit 1
  fi
fi
ok "Ports 8545 / 1337 / 1993 / 3002 are free"

if [ "$CHECK_ONLY" -eq 1 ]; then
  ok "All checks passed. Run without --check to start."
  exit 0
fi

if [ "$BACKGROUND" -eq 1 ]; then
  mkdir -p "$LOG_DIR" "$PID_DIR"
  cd "$SKYSTRIFE_DIR"

  info "Starting services in the background; logs: $LOG_DIR"

  start_bg() {
    local name="$1"; shift
    local pidfile="$PID_DIR/$name.pid"
    local logfile="$LOG_DIR/$name.log"
    # setsid — so we can later kill the whole group with anvil/vite/children.
    setsid bash -c "exec \"\$@\" >\"$logfile\" 2>&1" _ "$@" &
    echo $! > "$pidfile"
    ok "$name -> pid $(cat "$pidfile"), log: $logfile"
  }

  start_bg node    pnpm run dev:node
  # Wait until anvil starts listening.
  for _ in $(seq 1 30); do
    if in_use 8545; then break; fi
    sleep 1
  done
  in_use 8545 || die "anvil did not come up within 30s. See $LOG_DIR/node.log"

  info "Deploying contracts (~30s)…"
  if ! (cd "$SKYSTRIFE_DIR" && pnpm run dev:contracts) >"$LOG_DIR/contracts.log" 2>&1; then
    err "dev:contracts failed. See $LOG_DIR/contracts.log"
    exit 1
  fi
  ok "dev:contracts OK"

  info "Uploading maps…"
  if ! (cd "$SKYSTRIFE_DIR" && pnpm run dev:upload-map) >"$LOG_DIR/upload-map.log" 2>&1; then
    err "dev:upload-map failed. See $LOG_DIR/upload-map.log"
    exit 1
  fi
  ok "dev:upload-map OK"

  # create-debug-matches is a long-running matchmaker, not a one-shot.
  # In mprocs it sits in one panel and periodically creates new matches.
  start_bg debug-matches pnpm run dev:create-debug-matches
  start_bg client        pnpm run dev:client
  start_bg plugins       pnpm run dev:plugins

  # auth-server hosts Discord OAuth, JWT sessions and Solana stake escrow.
  # It only starts if .env exists and node_modules are installed.
  if [ -f "$SKYSTRIFE_DIR/packages/auth-server/.env" ]; then
    if [ ! -d "$SKYSTRIFE_DIR/packages/auth-server/node_modules" ]; then
      info "auth-server: pnpm install…"
      (cd "$SKYSTRIFE_DIR/packages/auth-server" && pnpm install) >"$LOG_DIR/auth-install.log" 2>&1
    fi
    start_bg auth pnpm --filter auth-server run start
  else
    warn "packages/auth-server/.env not found — Discord+Solana auth-server not started."
    warn "Copy packages/auth-server/.env.example to .env, fill it in, then restart."
  fi

  info "Waiting for client (1337) and plugins (1993) to come up…"
  for _ in $(seq 1 60); do
    if in_use 1337 && in_use 1993; then break; fi
    sleep 1
  done
  in_use 1337 || die "client did not come up. See $LOG_DIR/client.log"
  in_use 1993 || die "plugins did not come up. See $LOG_DIR/plugins.log"

  if [ -f "$SKYSTRIFE_DIR/packages/auth-server/.env" ]; then
    for _ in $(seq 1 30); do
      if in_use 3002; then break; fi
      sleep 1
    done
    in_use 3002 && ok "auth-server: http://localhost:3002" || warn "auth-server did not come up, see $LOG_DIR/auth.log"
  fi

  ok "All up:"
  ok "  client:  http://localhost:1337"
  ok "  plugins: http://localhost:1993"
  ok "  RPC:     http://localhost:8545"
  ok "  auth:    http://localhost:3002 (Discord+Solana)"
  echo
  info "To stop everything: ./start.sh --stop"
  exit 0
fi

if [ ! -t 1 ]; then
  warn "stdout is not a TTY; mprocs cannot draw its UI."
  warn "Use './start.sh --background' for headless mode."
fi

info "Starting 'pnpm dev'. mprocs will open with 4 panels:"
info "  - dev:contracts -> dev:upload-map -> dev:create-debug-matches (one-shot pipeline)"
info "  - dev:client      (Vite, http://localhost:1337)"
info "  - dev:node        (anvil, :8545)"
info "  - dev:plugins     (WS, :1993)"
info "To exit mprocs: Ctrl-A then Q (or :q)."

cd "$SKYSTRIFE_DIR"
exec pnpm dev

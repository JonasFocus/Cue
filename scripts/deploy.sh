#!/usr/bin/env bash
# Deploys whatever is on origin/main. Run this ON the VPS:
#
#   ssh root@172.236.109.208 '/opt/cue/scripts/deploy.sh'
#   ssh root@172.236.109.208 '/opt/cue/scripts/deploy.sh --verbose'
#
# Idempotent and safe to re-run. Never touches .env — secrets live only on the
# box and are never in the repo.
set -euo pipefail

cd "$(dirname "$0")/.."
VERBOSE=false
[ "${1:-}" = "--verbose" ] && VERBOSE=true

step() { printf '\033[1m%s\033[0m\n' "$1"; }

# Quiet on success, full log on failure. A successful docker build has nothing
# in it you need; a failed one has everything.
run() {
  local label="$1"
  shift
  local log
  log="$(mktemp)"
  printf '  %-22s' "$label"

  if [ "$VERBOSE" = true ]; then
    echo
    "$@" || { echo "✗ $label failed" >&2; exit 1; }
    return
  fi

  if "$@" >"$log" 2>&1; then
    printf '\033[32mok\033[0m\n'
    rm -f "$log"
  else
    printf '\033[31mfailed\033[0m\n\n'
    tail -40 "$log" >&2
    rm -f "$log"
    exit 1
  fi
}

# The deploy pulls new code, which rewrites THIS FILE while bash is executing
# it. Bash reads scripts incrementally by byte offset, so a length change
# mid-run can make it resume at garbage. Wrapping everything in a function
# forces bash to parse the whole body up front, before git touches the file.
main() {
  if [ ! -f .env ]; then
    echo "✗ .env missing — refusing to deploy without secrets" >&2
    exit 1
  fi

  before="$(git rev-parse --short HEAD 2>/dev/null || echo none)"

  step "▸ deploying"
  run "fetch" git fetch --quiet origin main
  git reset --hard --quiet origin/main
  after="$(git rev-parse --short HEAD)"

  if [ "$before" = "$after" ]; then
    echo "  $after (unchanged, rebuilding)"
  else
    echo "  $before → $after"
    git --no-pager log --oneline "$before..$after" 2>/dev/null | sed 's/^/    /' || true
  fi

  run "build" docker compose build app
  run "start" docker compose up -d

  # Postgres must be accepting connections before migrations run.
  for _ in $(seq 1 30); do
    docker compose exec -T postgres pg_isready -U cue -d cue >/dev/null 2>&1 && break
    sleep 2
  done

  printf '  %-22s' "migrations"
  migration_log="$(mktemp)"
  if ./scripts/migrate.sh >"$migration_log" 2>&1; then
    printf '\033[32m%s\033[0m\n' "$(grep -oE 'up to date|applied [0-9]+' "$migration_log" | tail -1)"
    rm -f "$migration_log"
  else
    printf '\033[31mfailed\033[0m\n\n'
    cat "$migration_log" >&2
    rm -f "$migration_log"
    exit 1
  fi

  printf '  %-22s' "health"
  for _ in $(seq 1 30); do
    if [ "$(docker compose ps app --format '{{.Health}}' 2>/dev/null)" = "healthy" ]; then
      printf '\033[32mok\033[0m\n'
      healthy=true
      break
    fi
    sleep 2
  done

  if [ "${healthy:-false}" != true ]; then
    printf '\033[31mfailed\033[0m\n\n'
    echo "app never became healthy — last 30 log lines:" >&2
    docker compose logs app --tail 30 >&2
    exit 1
  fi

  # Build cache grows ~400MB per deploy and is never reclaimed on its own. Cap it
  # by size, not age: an age filter never catches cache that is always fresh, so
  # frequent deploys would grow it without bound.
  docker builder prune --force --max-used-space 2GB >/dev/null 2>&1 || true
  docker image prune --force >/dev/null 2>&1 || true

  down="$(docker compose ps --format '{{.Service}} {{.State}}' | grep -cv running || true)"
  if [ "$down" -gt 0 ]; then
    echo
    echo "⚠ some services are not running:" >&2
    docker compose ps --format 'table {{.Service}}\t{{.Status}}' >&2
  fi

  printf '\033[32m✓ deployed %s\033[0m — https://staging.cue.krevo.io\n' "$after"
}

main "$@"

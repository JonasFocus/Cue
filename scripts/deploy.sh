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

# One deploy at a time. Two overlapping runs share a git tree, an image tag and
# a database — the second one's `git reset` would yank the tree out from under
# the first one's build. Re-exec under an exclusive lock; exit 75 means busy.
LOCK=/var/lock/cue-deploy.lock
STATE=/var/lib/cue
# The commit that last built, migrated AND passed its health check. Kept
# outside the repo so `git reset --hard` cannot rewrite it.
LAST_GOOD=$STATE/last-good
# Advisory "a deploy is in flight" marker for the watchdog, which must not test
# the lock by taking it. See scripts/cue-health.sh.
DEPLOY_MARK=$STATE/deploy.pid
if [ -z "${CUE_DEPLOY_LOCKED:-}" ]; then
  lock_status=0
  CUE_DEPLOY_LOCKED=1 flock -n -E 75 "$LOCK" "$0" "$@" || lock_status=$?
  if [ "$lock_status" -eq 75 ]; then
    echo "✗ another deploy is already running (lock: $LOCK)" >&2
  fi
  exit "$lock_status"
fi

step() { printf '\033[1m%s\033[0m\n' "$1"; }

# Copy a timer-driven script into /usr/local/bin. Written to a temp name and
# renamed, so a timer firing mid-install runs either the old script or the new
# one, never half of one. Never fatal: a failure here leaves the previously
# installed copy in place and still running.
install_timer_script() {
  local label="$1" src="$2" dest="$3"
  printf '  %-22s' "$label"
  if install -m 755 "$src" "/usr/local/bin/.$dest.new" \
    && mv -f "/usr/local/bin/.$dest.new" "/usr/local/bin/$dest"; then
    printf '\033[32mok\033[0m\n'
  else
    printf '\033[31mfailed (keeping the installed copy)\033[0m\n'
  fi
}

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

# True once the app container reports healthy, false after ~60s of waiting.
wait_healthy() {
  for _ in $(seq 1 30); do
    if [ "$(docker compose ps app --format '{{.Health}}' 2>/dev/null)" = "healthy" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Last-resort recovery: put the tree back on the last known-good commit and
# rebuild, so a failed deploy ends with the box serving code that is known to
# work instead of a broken container. Called exactly once, from the
# health-failure path, and it never calls back into the deploy — there is no
# loop to run away with.
#
# Migrations are NOT reversed (there are no down-migrations). That is safe while
# migrations stay additive, which is also what makes rolling code back safe.
rollback() {
  echo "⚠ rolling back to $before" >&2

  if [ "$before" = none ] || [ "$before" = "$after" ]; then
    echo "✗ nothing to roll back to — the tree was already at $after" >&2
    return 1
  fi

  if [ "$before_verified" != true ]; then
    echo "  (no recorded known-good commit yet; $before is the tree's previous" >&2
    echo "   HEAD and has not been verified by this script)" >&2
  fi

  git reset --hard --quiet "$before" || { echo "✗ rollback checkout failed" >&2; return 1; }

  local log
  log="$(mktemp)"
  # timeout so a wedged build cannot leave the owner staring at a dead terminal.
  if ! timeout 900 docker compose build app >"$log" 2>&1; then
    echo "✗ rollback build failed:" >&2
    tail -20 "$log" >&2
    rm -f "$log"
    return 1
  fi
  if ! timeout 300 docker compose up -d >"$log" 2>&1; then
    echo "✗ rollback start failed:" >&2
    tail -20 "$log" >&2
    rm -f "$log"
    return 1
  fi
  rm -f "$log"

  wait_healthy || { echo "✗ $before is not healthy either" >&2; return 1; }

  # It just built and passed health, so it is known-good by the same standard
  # as a normal deploy. This is what heals the unverified first-deploy case.
  git rev-parse --short HEAD >"$LAST_GOOD"
  return 0
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

  mkdir -p "$STATE"
  # Tell the watchdog to stand down while containers churn, and make sure the
  # marker cannot outlive this process even if it dies badly.
  echo $$ >"$DEPLOY_MARK"
  trap 'rm -f "$DEPLOY_MARK"' EXIT

  # The rollback target must be a commit that is known to WORK, not whatever
  # the tree happens to be on. A build or migration failure leaves the tree on
  # the new commit while the old containers keep running, so `git rev-parse
  # HEAD` on the next deploy would hand rollback a commit that never built.
  if [ -s "$LAST_GOOD" ]; then
    before="$(cat "$LAST_GOOD")"
    before_verified=true
  else
    # First deploy since this was introduced: HEAD is the running code, it just
    # has not been verified by this script yet. Degrade to it and say so.
    before="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
    before_verified=false
  fi

  step "▸ deploying"
  run "fetch" git fetch --quiet origin main
  git reset --hard --quiet origin/main
  after="$(git rev-parse --short HEAD)"

  # Timer-driven scripts run from /usr/local/bin so a `git reset --hard` cannot
  # delete the copy that is executing; this keeps those copies in step with the
  # tracked source.
  install_timer_script watchdog scripts/cue-health.sh cue-health
  install_timer_script backup   scripts/cue-backup.sh cue-backup

  if [ "$before" = "$after" ]; then
    echo "  $after (unchanged, rebuilding)"
  else
    echo "  $before → $after"
    git --no-pager log --oneline "$before..$after" 2>/dev/null | sed 's/^/    /' || true
  fi

  run "build" docker compose build app

  # Order matters: migrations first, THEN the new image. Starting the app first
  # gave new code a window of serving requests against the old schema — fine
  # while migrations are additive, a 500 on every request the first time a
  # migration adds a column the new code reads.
  run "database" docker compose up -d postgres redis

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

  run "start" docker compose up -d

  printf '  %-22s' "health"
  if wait_healthy; then
    printf '\033[32mok\033[0m\n'
    # Built, migrated, healthy: only now is this commit a safe rollback target.
    echo "$after" >"$LAST_GOOD"
  else
    printf '\033[31mfailed\033[0m\n\n'
    # Original failure first: the rollback output must never bury the reason.
    echo "app never became healthy at $after — last 30 log lines:" >&2
    docker compose logs app --tail 30 >&2
    echo >&2

    if rollback; then
      printf '\033[33m⚠ deploy of %s failed — rolled back to %s, the site is serving the previous commit\033[0m\n' "$after" "$before" >&2
    else
      printf '\033[31m✗ deploy of %s failed AND rollback failed — the site is down, recover by hand:\033[0m\n' "$after" >&2
      echo "    cd /opt/cue && git log --oneline -5 && docker compose ps" >&2
    fi
    exit 1
  fi

  # A healthy container only proves the process answers /api/ping. It does not
  # prove the auth gate is shut or that sign-out revokes — both of which have
  # shipped broken while the health check stayed green. Smoke asserts that
  # against the running deployment, over the public URL, through Caddy.
  #
  # A failed assertion rolls back. The failures this catches are "the new
  # commit is serving something it must not" (an open guest list, a session
  # that outlives sign-out); for those, the previous commit is strictly the
  # safer thing to be serving, and rollback is already proven by the health
  # path. It costs a rebuild when the cause is really a Caddy or .env change
  # that rollback cannot fix — accepted, because the alternative is leaving
  # unmasked email addresses exposed while someone reads the log.
  #
  # SMOKE_EMAIL/SMOKE_PASSWORD live in /opt/cue/.env, never in the repo.
  # Without them the signed-in half cannot run (exit 2): that is reported
  # loudly but is not a deploy failure.
  printf '  %-22s' "smoke"
  smoke_log="$(mktemp)"
  smoke_status=0
  ( set -a; . ./.env; set +a
    SMOKE_BASE="${SMOKE_BASE:-https://cue.krevo.io}" \
      ./scripts/smoke.sh ) >"$smoke_log" 2>&1 || smoke_status=$?

  if [ "$smoke_status" -eq 0 ]; then
    printf '\033[32mok\033[0m\n'
    rm -f "$smoke_log"
  elif [ "$smoke_status" -eq 2 ]; then
    printf '\033[33mincomplete\033[0m\n'
    echo "⚠ smoke ran unauthenticated — set SMOKE_EMAIL and SMOKE_PASSWORD in" >&2
    echo "  /opt/cue/.env to cover sign-in, the guest list and sign-out revocation." >&2
    rm -f "$smoke_log"
  else
    printf '\033[31mfailed\033[0m\n\n'
    echo "✗ SMOKE TEST FAILED at $after — the container is healthy but the" >&2
    echo "  deployment is not behaving. Failed assertions:" >&2
    cat "$smoke_log" >&2
    rm -f "$smoke_log"
    echo >&2

    # The health block already recorded $after as known-good. It is not:
    # un-record it before rolling back, or the next deploy would treat this
    # commit as a safe target.
    echo "$before" >"$LAST_GOOD"

    if rollback; then
      printf '\033[33m⚠ deploy of %s failed smoke — rolled back to %s\033[0m\n' "$after" "$before" >&2
    else
      printf '\033[31m✗ deploy of %s failed smoke AND rollback failed — recover by hand:\033[0m\n' "$after" >&2
      echo "    cd /opt/cue && git log --oneline -5 && ./scripts/smoke.sh" >&2
    fi
    exit 1
  fi

  # Build cache grows ~400MB per deploy and is never reclaimed on its own. Cap it
  # by size, not age: an age filter never catches cache that is always fresh, so
  # frequent deploys would grow it without bound.
  docker builder prune --force --max-used-space 2GB >/dev/null 2>&1 || true
  docker image prune --force >/dev/null 2>&1 || true

  # `image prune` only reclaims *dangling* images, so tagged leftovers from
  # renamed or retired services (cue-tools, cue-tools-cli — 2.8GB) sit there
  # forever. Only cue-* images are considered, so base images the next build
  # needs stay put, and `docker image rm` without --force refuses to touch an
  # image any container still references, including the live one.
  docker image ls --format '{{.Repository}}:{{.Tag}}' \
    | grep '^cue-' \
    | xargs -r docker image rm >/dev/null 2>&1 || true

  down="$(docker compose ps --format '{{.Service}} {{.State}}' | grep -cv running || true)"
  if [ "$down" -gt 0 ]; then
    echo
    echo "⚠ some services are not running:" >&2
    docker compose ps --format 'table {{.Service}}\t{{.Status}}' >&2
  fi

  printf '\033[32m✓ deployed %s\033[0m — https://cue.krevo.io\n' "$after"
}

main "$@"

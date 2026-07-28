#!/usr/bin/env bash
# Cue staging database backup. This file is the source of truth; deploy.sh
# installs it to /usr/local/bin/cue-backup, which lives outside /opt/cue so a
# `git reset --hard` mid-deploy cannot rewrite the copy that is executing.
#
#   run by:   cue-backup.timer (daily at 00:00 UTC, Persistent=true)
#   writes:   /var/backups/cue/cue-<UTC timestamp>.sql.gz
#             /var/log/cue-backup.log   (incidents and one line per success)
#   keeps:    RETENTION_DAYS of dumps, pruned oldest-first
#
# Deliberately NOT under /opt/cue: that is a git checkout deploy.sh runs
# `git reset --hard` against, and the one thing a backup must survive is
# somebody's bad day with the repo.
#
# It cannot page anyone — nothing on this box can reach the owner without an
# external service. It leaves evidence and exits non-zero so `systemctl status
# cue-backup` and the journal both show the failure.
set -uo pipefail

DIR=/var/backups/cue
LOG=/var/log/cue-backup.log
STATE=/var/lib/cue
DEPLOY_MARK=$STATE/deploy.pid
RETENTION_DAYS=30

log() { printf '%s  %s\n' "$(date -Is)" "$*" >>"$LOG"; }
fail() { log "FAILED  $*"; echo "cue-backup: $*" >&2; exit 1; }

mkdir -p "$DIR" "$STATE"
chmod 700 "$DIR"   # dumps contain email addresses and password hashes
cd /opt/cue || fail "no /opt/cue"

# One backup at a time. Its OWN lock, deliberately not /var/lock/cue-deploy.lock:
# taking that one makes a deploy starting in the same window exit 75. Same
# reasoning as the watchdog's lock.
exec 9>"$STATE/backup.lock"
flock -n 9 || { log "SKIPPED  another backup is already running"; exit 0; }

# A deploy applies migrations. Dumping halfway through one captures a schema
# that never existed as a committed state. Read the deploy's advisory marker
# rather than testing its lock; the PID check makes a killed deploy
# self-clearing. Missing a night is survivable — a torn dump is not, because it
# looks exactly like a good one until the day you need it.
if [ -f "$DEPLOY_MARK" ]; then
  deploy_pid="$(cat "$DEPLOY_MARK" 2>/dev/null || echo)"
  if [ -n "$deploy_pid" ] && kill -0 "$deploy_pid" 2>/dev/null; then
    log "SKIPPED  deploy in flight (pid $deploy_pid)"
    exit 0
  fi
fi

docker compose exec -T postgres pg_isready -U cue -d cue >/dev/null 2>&1 \
  || fail "postgres is not accepting connections"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$DIR/cue-$stamp.sql.gz"
tmp="$out.partial"

# Written to .partial and renamed only after it verifies. A truncated dump
# sitting at a real filename is worse than no dump at all: it reports as a
# backup, restores as a broken database, and you find out on the one day it
# matters.
#
# pipefail is doing real work in the next line. Without it `pg_dump | gzip`
# reports gzip's exit status, so a pg_dump that dies mid-table still looks like
# a clean backup.
if ! docker compose exec -T postgres pg_dump -U cue -d cue --clean --if-exists \
     | gzip -9 >"$tmp"; then
  rm -f "$tmp"
  fail "pg_dump failed"
fi

gzip -t "$tmp" 2>/dev/null || { rm -f "$tmp"; fail "dump is not valid gzip"; }

# pg_dump writes this as its last line. Its absence means the dump was cut
# short — the exact failure the .partial dance exists to catch.
if ! gunzip -c "$tmp" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  rm -f "$tmp"
  fail "dump is truncated (no completion marker)"
fi

# A dump that parses but restores an empty database is the other silent
# failure. These four tables are the ones whose loss is unrecoverable.
for table in waitlist studio cue cue_event; do
  gunzip -c "$tmp" | grep -q "CREATE TABLE public.$table " \
    || { rm -f "$tmp"; fail "dump is missing table $table"; }
done

mv "$tmp" "$out"
chmod 600 "$out"

# Prune by age, oldest-first. Dumps are ~6KB so this is about keeping the
# directory readable, not about disk.
pruned="$(find "$DIR" -maxdepth 1 -name 'cue-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"

# Any .partial older than a day is debris from a crashed run, not an in-flight
# backup. The lock means a live one cannot be this old.
find "$DIR" -maxdepth 1 -name 'cue-*.sql.gz.partial' -mtime +1 -delete 2>/dev/null

size="$(stat -c %s "$out")"
count="$(find "$DIR" -maxdepth 1 -name 'cue-*.sql.gz' | wc -l)"
log "OK  $(basename "$out")  ${size}B  ${count} kept  ${pruned} pruned"

# ponytail: local retention only. Survives a bad migration or a dropped table,
# not the loss of the Linode. Off-box copies need an R2 bucket and credentials
# in /opt/cue/.env — the upgrade is `rclone copy` on the tail of this script.
if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 1000000 ]; then
  tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

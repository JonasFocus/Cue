#!/usr/bin/env bash
# Applies any db/migrations/*.sql not yet recorded in schema_migrations.
#
# ponytail: a shell loop and one tracking table, not a migration framework.
# Files are applied in filename order, each in its own transaction. Upgrade path
# if this ever gets complicated: a real tool with down-migrations.
#
#   ./scripts/migrate.sh            apply pending
#   ./scripts/migrate.sh --status   list applied vs pending, change nothing
#
# A migration whose FIRST line is exactly `-- no-transaction` is piped to psql
# without BEGIN/COMMIT, for the statements Postgres refuses to run inside a
# transaction block: CREATE INDEX CONCURRENTLY, ALTER TYPE … ADD VALUE, VACUUM.
# Such a file is NOT atomic — it can fail half-applied and is then not recorded,
# so it must be written to be safe to re-run (they all must, but that one for
# real). Everything else keeps the transaction.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set (expected in .env)}"

# Arbitrary constant, only has to be the same in every copy of this script.
# Session-scoped: psql holds it for its whole run and Postgres drops it when the
# process disconnects, so a killed migration cannot leave the lock held.
ADVISORY_LOCK=4919001

psql_run() {
  # client-min-messages=warning drops the "already exists, skipping" NOTICEs
  # that idempotent migrations emit on every run.
  docker compose exec -T \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    -e PGOPTIONS="--client-min-messages=warning" \
    postgres psql -U cue -d cue -v ON_ERROR_STOP=1 "$@"
}

# sha256sum on the box, shasum on a developer's macOS.
checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# ADD COLUMN IF NOT EXISTS, not a migration file: this table is the runner's own
# bookkeeping and has to be current *before* the pending list can be computed.
# Rows written before the column existed keep checksum NULL — "applied, content
# unverifiable" — which --status reports rather than treating as a mismatch.
psql_run -q -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text;" >/dev/null

applied="$(psql_run -tA -F'|' -c "SELECT filename, coalesce(checksum, '') FROM schema_migrations;")"

pending=()
drifted=0
for f in db/migrations/*.sql; do
  name="$(basename "$f")"
  # The "=" sentinel separates "recorded with a NULL checksum" (pre-checksum
  # row, prints "=") from "not recorded at all" (prints nothing).
  row="$(awk -F'|' -v n="$name" '$1 == n { print "=" $2; exit }' <<<"$applied")"

  if [ -n "$row" ]; then
    [ "${1:-}" = "--status" ] || continue
    recorded="${row#=}"
    if [ -z "$recorded" ]; then
      echo "  applied  $name  (applied before checksums existed — content unverified)"
    elif [ "$recorded" = "$(checksum "$f")" ]; then
      echo "  applied  $name"
    else
      echo "  CHANGED  $name  — the file has been edited since it was applied;"
      echo "                   this database does NOT contain what the file now says."
      drifted=$((drifted + 1))
    fi
  else
    pending+=("$f")
    [ "${1:-}" = "--status" ] && echo "  PENDING  $name"
  fi
done

if [ "${1:-}" = "--status" ]; then
  # A recorded name with no file behind it means a migration was renamed or
  # deleted. The rename then shows up as PENDING and re-runs — survivable only
  # because every file is re-runnable, so say it out loud.
  while IFS='|' read -r recorded_name _; do
    [ -n "$recorded_name" ] || continue
    [ -f "db/migrations/$recorded_name" ] ||
      echo "  ORPHAN   $recorded_name  — recorded as applied, no such file"
  done <<<"$applied"
  [ "$drifted" -eq 0 ] || echo "  $drifted applied migration(s) no longer match their file"
  exit 0
fi

if [ ${#pending[@]} -eq 0 ]; then
  echo "migrations: up to date"
  exit 0
fi

for f in "${pending[@]}"; do
  name="$(basename "$f")"
  sum="$(checksum "$f")"
  echo "migrations: applying $name"

  {
    # Serialises concurrent runners. deploy.sh already holds a host flock, but
    # migrate.sh is also run by hand, and two psql sessions interleaving DDL is
    # worse than one waiting. Taken before anything else so the wait happens
    # before any work, and released by the disconnect at the end of the pipe.
    # PERFORM inside DO rather than a bare SELECT, purely so the lock does not
    # print a result table into the deploy's migration log. Session-level locks
    # are not transactional, so the DO block's implicit commit does not drop it.
    echo "DO \$cuelock\$ BEGIN PERFORM pg_advisory_lock($ADVISORY_LOCK); END \$cuelock\$;"

    if [ "$(head -1 "$f")" = "-- no-transaction" ]; then
      cat "$f"
      echo "INSERT INTO schema_migrations (filename, checksum) VALUES ('$name', '$sum');"
    else
      echo "BEGIN;"
      # The bookkeeping insert goes FIRST, inside the same transaction. It is a
      # plain INSERT against a PRIMARY KEY, so a second runner that computed the
      # same pending list before this one committed aborts here — before its
      # copy of the DDL runs — instead of applying the file twice. Deliberate:
      # the previous version inserted last and relied on the key catching it
      # only after the DDL had already run.
      echo "INSERT INTO schema_migrations (filename, checksum) VALUES ('$name', '$sum');"
      cat "$f"
      echo "COMMIT;"
    fi
  } | psql_run -q
done

echo "migrations: applied ${#pending[@]}"

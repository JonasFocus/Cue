#!/usr/bin/env bash
# Read-only post-restore verification for a temporary Neon branch/database.
#
# Create the restore target in Neon first, then supply its direct connection
# URL. This script never creates, changes, or deletes a database. It verifies
# that a restored copy has the expected migration history and core signed
# record tables before anyone points production at it.
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to the direct URL of a temporary restored database}"

case "$RESTORE_DATABASE_URL" in
  *-pooler.*|*pgbouncer=true*)
    echo "refusing a pooled endpoint; use the restored branch's direct URL" >&2
    exit 1
    ;;
esac

if [ $# -ne 0 ]; then
  echo "usage: $0" >&2
  exit 2
fi

psql_run() {
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -qAt "$@"
}

required_tables=(user studio cue cue_party cue_event schema_migrations)
for table in "${required_tables[@]}"; do
  found="$(psql_run -c "SELECT to_regclass('public.${table}') IS NOT NULL;")"
  if [ "$found" != "t" ]; then
    echo "restore check failed: missing required table ${table}" >&2
    exit 1
  fi
done

expected_migrations="$(find db/migrations -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sort)"
applied_migrations="$(psql_run -c "SELECT filename FROM schema_migrations ORDER BY filename;")"

if [ "$expected_migrations" != "$applied_migrations" ]; then
  echo "restore check failed: migration history does not match this checkout" >&2
  echo "Compare the restored branch to the commit that was live at the recovery point." >&2
  exit 1
fi

printf 'restore verification passed: schema, migration history, and signed-record tables are present\n'

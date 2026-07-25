#!/usr/bin/env bash
# Applies any db/migrations/*.sql not yet recorded in schema_migrations.
#
# ponytail: a shell loop and one tracking table, not a migration framework.
# Files are applied in filename order inside a transaction each. Upgrade path
# if this ever gets complicated: a real tool with down-migrations.
#
#   ./scripts/migrate.sh            apply pending
#   ./scripts/migrate.sh --status   list applied vs pending, change nothing
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set (expected in .env)}"

psql_run() {
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" \
    postgres psql -U cue -d cue -v ON_ERROR_STOP=1 "$@"
}

psql_run -q -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );" >/dev/null

applied="$(psql_run -tA -c 'SELECT filename FROM schema_migrations;')"

pending=()
for f in db/migrations/*.sql; do
  name="$(basename "$f")"
  if grep -qxF "$name" <<<"$applied"; then
    [ "${1:-}" = "--status" ] && echo "  applied  $name"
  else
    pending+=("$f")
    [ "${1:-}" = "--status" ] && echo "  PENDING  $name"
  fi
done

[ "${1:-}" = "--status" ] && exit 0

if [ ${#pending[@]} -eq 0 ]; then
  echo "migrations: up to date"
  exit 0
fi

for f in "${pending[@]}"; do
  name="$(basename "$f")"
  echo "migrations: applying $name"
  # Each file runs in its own transaction with the bookkeeping insert, so a
  # failure leaves neither the change nor the record behind.
  {
    echo "BEGIN;"
    cat "$f"
    echo "INSERT INTO schema_migrations (filename) VALUES ('$name');"
    echo "COMMIT;"
  } | psql_run -q
done

echo "migrations: applied ${#pending[@]}"

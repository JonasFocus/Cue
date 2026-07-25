#!/usr/bin/env bash
# Deploys whatever is on origin/main. Run this ON the VPS:
#
#   ssh root@172.236.109.208 '/opt/cue/scripts/deploy.sh'
#
# Idempotent and safe to re-run. Does not touch .env — secrets live only on
# the box and are never in the repo.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

echo "▸ deploying $REPO_DIR"

if [ ! -f .env ]; then
  echo "✗ .env missing — refusing to deploy without secrets" >&2
  exit 1
fi

before="$(git rev-parse --short HEAD 2>/dev/null || echo none)"

echo "▸ fetching origin/main"
git fetch --quiet origin main
git reset --hard --quiet origin/main

after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then
  echo "  already at $after — rebuilding anyway"
else
  echo "  $before → $after"
  git --no-pager log --oneline "$before..$after" 2>/dev/null | sed 's/^/    /' || true
fi

echo "▸ building"
docker compose build app

echo "▸ starting"
docker compose up -d

echo "▸ waiting for postgres"
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U cue -d cue >/dev/null 2>&1 && break
  sleep 2
done

echo "▸ migrations"
./scripts/migrate.sh

echo "▸ waiting for app health"
healthy=false
for _ in $(seq 1 30); do
  if [ "$(docker compose ps app --format '{{.Health}}' 2>/dev/null)" = "healthy" ]; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "✗ app did not become healthy — last 30 log lines:" >&2
  docker compose logs app --tail 30 >&2
  exit 1
fi

# Build cache grows ~400MB per deploy and is never reclaimed on its own. Cap it
# by size, not age: an age filter never catches cache that is always fresh, so
# frequent deploys would grow it without bound.
echo "▸ pruning build cache"
docker builder prune --force --max-used-space 2GB >/dev/null 2>&1 || true
docker image prune --force >/dev/null 2>&1 || true

echo
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo
echo "✓ deployed $after — https://staging.cue.krevo.io"

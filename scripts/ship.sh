#!/usr/bin/env bash
# Ship local work to staging: verify → commit → push → deploy.
#
#   npm run ship                  push already-committed work and deploy
#   npm run ship "fix: the thing" commit everything with that message, then ship
#
# Checks run locally first, on purpose: a type error caught here costs seconds,
# the same error caught on the VPS costs a ~90s rebuild and leaves you staring
# at a failed deploy.
set -euo pipefail

cd "$(dirname "$0")/.."
HOST="${CUE_HOST:-root@172.236.109.208}"
MESSAGE="${1:-}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "✗ on branch '$branch' — staging deploys origin/main. Merge or switch first." >&2
  exit 1
fi

dirty="$(git status --porcelain)"
if [ -n "$dirty" ] && [ -z "$MESSAGE" ]; then
  echo "✗ you have uncommitted changes:" >&2
  git status --short >&2
  echo >&2
  echo "  Pass a commit message:  npm run ship \"feat: what changed\"" >&2
  echo "  Or commit them yourself first." >&2
  exit 1
fi

bold "▸ checking"
npx tsc --noEmit
npm run --silent lint
npm run --silent test >/dev/null
npm run --silent build >/dev/null
echo "  types, lint, tests and build all pass"

if [ -n "$dirty" ]; then
  bold "▸ committing"
  git add -A
  git commit -q -m "$MESSAGE"
  echo "  $(git rev-parse --short HEAD) $MESSAGE"
fi

bold "▸ pushing"
git push --quiet origin main
echo "  origin/main is at $(git rev-parse --short HEAD)"

bold "▸ deploying"
ssh -o StrictHostKeyChecking=accept-new "$HOST" '/opt/cue/scripts/deploy.sh'

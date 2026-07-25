#!/usr/bin/env bash
# Ship local work to staging: verify → commit → push → deploy.
#
#   npm run ship                  push already-committed work and deploy
#   npm run ship "fix: the thing" commit everything with that message, then ship
#   npm run ship -- --verbose     same, but stream every command's output
#
# Checks run locally first, on purpose: a type error caught here costs seconds,
# the same error caught on the VPS costs a ~90s rebuild and leaves a broken
# commit on main.
set -euo pipefail

cd "$(dirname "$0")/.."
HOST="${CUE_HOST:-root@172.236.109.208}"

VERBOSE=false
MESSAGE=""
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    *) MESSAGE="$arg" ;;
  esac
done

step() { printf '\033[1m%s\033[0m\n' "$1"; }

# Runs a command quietly and only shows its output if it fails. Deploy logs are
# noise on the happy path and the first thing you want on the unhappy one.
run() {
  local label="$1"
  shift
  local log
  log="$(mktemp)"
  printf '  %-22s' "$label"

  if [ "$VERBOSE" = true ]; then
    echo
    if ! "$@"; then
      echo "✗ $label failed" >&2
      exit 1
    fi
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

step "▸ checking"
run "types"  npx tsc --noEmit
run "lint"   npm run --silent lint
run "tests"  npm run --silent test
run "build"  npm run --silent build

if [ -n "$dirty" ]; then
  step "▸ committing"
  git add -A
  git commit -q -m "$MESSAGE"
  echo "  $(git rev-parse --short HEAD)  $MESSAGE"
fi

step "▸ pushing"
run "origin/main" git push origin main

# deploy.sh prints its own "▸ deploying" header.
ssh -o StrictHostKeyChecking=accept-new "$HOST" \
  "/opt/cue/scripts/deploy.sh$([ "$VERBOSE" = true ] && echo ' --verbose')"

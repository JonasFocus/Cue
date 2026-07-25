#!/usr/bin/env bash
# Post-deploy smoke test: curls the RUNNING deployment and asserts the contract
# that has actually broken in production, rather than the pure functions that
# never have. Read-only — it never mutates a guest row.
#
#   SMOKE_EMAIL=op@example.com SMOKE_PASSWORD=... ./scripts/smoke.sh
#   SMOKE_BASE=https://staging.cue.krevo.io ./scripts/smoke.sh
#
# Without SMOKE_EMAIL/SMOKE_PASSWORD the signed-in half is skipped and the run
# is reported as INCOMPLETE (exit 2), never as a pass. Safe to run repeatedly.
set -uo pipefail

BASE="${SMOKE_BASE:-https://staging.cue.krevo.io}"
BASE="${BASE%/}"
HOST="${BASE#https://}"
HOST="${HOST#http://}"
TIMEOUT="${SMOKE_TIMEOUT:-15}"

JAR="$(mktemp)"
HDRS="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$JAR" "$HDRS" "$BODY"' EXIT

failed=0
checks=0
pass() { checks=$((checks + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() {
  checks=$((checks + 1))
  failed=$((failed + 1))
  printf '  \033[31m✗ %s\033[0m\n' "$1" >&2
}

# ── primitives ──────────────────────────────────────────────────────────────

# status METHOD PATH [curl args...] → prints the HTTP status code
status() {
  local method="$1" path="$2"
  shift 2
  curl -s -o "$BODY" -w '%{http_code}' -X "$method" --max-time "$TIMEOUT" \
    "$@" "$BASE$path" 2>/dev/null || echo 000
}

expect() { # expect LABEL EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 — expected $2, got $3"; fi
}

# ── 1. the gate: everything operator-only is closed to a stranger ────────────

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

step "unauthenticated"
expect "GET /api/health is 401" 401 "$(status GET /api/health)"
expect "GET /api/waitlist is 401" 401 "$(status GET /api/waitlist)"
# 401 and not 400: the gate must run before body validation, or an anonymous
# caller learns the shape of the endpoint by probing it.
expect "PATCH /api/waitlist is 401" 401 \
  "$(status PATCH /api/waitlist -H 'content-type: application/json' \
    --data '{"id":1,"status":"approved"}')"
expect "PATCH with junk body is still 401" 401 \
  "$(status PATCH /api/waitlist -H 'content-type: application/json' --data 'not json')"

step "public surface"
expect "GET / is 200" 200 "$(status GET /)"
expect "GET /legal/privacy is 200" 200 "$(status GET /legal/privacy)"
expect "GET /legal/terms is 200" 200 "$(status GET /legal/terms)"
expect "GET /api/ping is 200" 200 "$(status GET /api/ping)"
expect "GET /console redirects (307)" 307 "$(status GET /console)"

location="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time "$TIMEOUT" "$BASE/console")"
case "$location" in
  */console/login) pass "/console redirects to /console/login" ;;
  *) fail "/console redirects to '$location', expected /console/login" ;;
esac
expect "GET /console/login is 200" 200 "$(status GET /console/login)"

# ── 2. transport and headers ────────────────────────────────────────────────

step "transport"
expect "http:// redirects with 308" 308 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "http://$HOST/")"

curl -s -D "$HDRS" -o /dev/null --max-time "$TIMEOUT" "$BASE/" 2>/dev/null || true

has_header() { grep -qi "^$1:" "$HDRS"; }
require_header() { # require_header NAME [substring]
  if ! has_header "$1"; then
    fail "$1 is missing"
  elif [ $# -gt 1 ] && ! grep -qi "^$1:.*$2" "$HDRS"; then
    fail "$1 does not contain '$2' — $(grep -i "^$1:" "$HDRS" | tr -d '\r')"
  else
    pass "$1 present"
  fi
}
# Absent, not merely empty: these name the stack to anyone who asks.
forbid_header() {
  if has_header "$1"; then
    fail "$1 must not be sent — $(grep -i "^$1:" "$HDRS" | tr -d '\r')"
  else
    pass "$1 absent"
  fi
}

require_header "strict-transport-security" "max-age="
require_header "content-security-policy" "frame-ancestors 'none'"
require_header "x-frame-options" "DENY"
require_header "x-content-type-options" "nosniff"
forbid_header "x-powered-by"
forbid_header "server"
forbid_header "via"

# ── 3. signed in ────────────────────────────────────────────────────────────

if [ -z "${SMOKE_EMAIL:-}" ] || [ -z "${SMOKE_PASSWORD:-}" ]; then
  printf '\n\033[33m⚠ SMOKE_EMAIL/SMOKE_PASSWORD unset — skipped every signed-in check\033[0m\n' >&2
  printf '\033[33m  (sign-in, the guest list, PATCH validation and sign-out revocation)\033[0m\n' >&2
  [ "$failed" -gt 0 ] && exit 1
  printf '\033[33m⚠ %d/%d checks passed, but the run is INCOMPLETE\033[0m\n' "$checks" "$checks" >&2
  exit 2
fi

step "sign-in"
signin="$(curl -s -o "$BODY" -w '%{http_code}' --max-time "$TIMEOUT" \
  -c "$JAR" -X POST "$BASE/api/auth/sign-in/email" \
  -H 'content-type: application/json' -H "Origin: $BASE" \
  --data "$(printf '{"email":%s,"password":%s}' \
    "\"$SMOKE_EMAIL\"" "\"$SMOKE_PASSWORD\"")" 2>/dev/null || echo 000)"
expect "sign-in returns 200" 200 "$signin"

# Rebuilt by hand because sign-out clears the jar, and the whole point of the
# last check is to replay the cookie the operator was holding.
cookie_header() {
  awk '
    /^#HttpOnly_/ { sub(/^#HttpOnly_/, "") }
    /^#/ { next }
    NF >= 7 { printf "%s%s=%s", (n++ ? "; " : ""), $6, $7 }
  ' "$JAR"
}
COOKIE="$(cookie_header)"
if [ -z "$COOKIE" ]; then
  fail "sign-in set no session cookie — every signed-in check below is void"
  echo "  response: $(head -c 200 "$BODY")" >&2
  exit 1
fi
pass "sign-in set a session cookie"

authed() { status "$1" "$2" -H "Cookie: $COOKIE" "${@:3}"; }
json='content-type: application/json'

step "guest list"
expect "GET /api/waitlist is 200" 200 "$(authed GET /api/waitlist)"
if grep -q '"guests"' "$BODY"; then
  pass "the guest list is shaped { guests: [...] }"
else
  fail "the guest list has no \"guests\" key — $(head -c 120 "$BODY")"
fi
expect "GET /api/health is 200" 200 "$(authed GET /api/health)"

step "PATCH validation"
# Validation only. A successful PATCH would rewrite a real guest's triage
# status, and restoring it to `pending` afterwards could clobber a decision the
# operator made by hand. The 404 below runs the identical UPDATE with a WHERE
# that matches nothing, so it still proves auth, parsing, the SQL and the
# not-found branch — without touching a row.
expect "unknown status is 400" 400 \
  "$(authed PATCH /api/waitlist -H "$json" --data '{"id":1,"status":"vip"}')"
expect "non-integer id is 400" 400 \
  "$(authed PATCH /api/waitlist -H "$json" --data '{"id":"1","status":"pending"}')"
expect "fractional id is 400" 400 \
  "$(authed PATCH /api/waitlist -H "$json" --data '{"id":1.5,"status":"pending"}')"
expect "malformed json is 400" 400 \
  "$(authed PATCH /api/waitlist -H "$json" --data '{oops')"
expect "unknown id is 404" 404 \
  "$(authed PATCH /api/waitlist -H "$json" --data '{"id":987654321,"status":"pending"}')"

step "sign-out revokes"
# Better Auth rejects a body-less POST with 415 and never revokes the session:
# the operator was sent to the login page while the cookie stayed valid for its
# full week. On a shared machine that is a live session handed to the next
# person. This is the one check that would have caught it.
#
# The Origin header is not decoration: Better Auth's CSRF check rejects a
# cookie-authenticated POST without one (403 MISSING_OR_NULL_ORIGIN). A browser
# always sends it, so this stays faithful to what the console does.
expect "sign-out returns 200" 200 \
  "$(status POST /api/auth/sign-out -H "Cookie: $COOKIE" -H "$json" \
    -H "Origin: $BASE" --data '{}')"
expect "the replayed cookie is rejected (401)" 401 \
  "$(status GET /api/waitlist -H "Cookie: $COOKIE")"

# ── verdict ─────────────────────────────────────────────────────────────────

if [ "$failed" -gt 0 ]; then
  printf '\n\033[31m✗ smoke test FAILED — %d of %d checks failed against %s\033[0m\n' \
    "$failed" "$checks" "$BASE" >&2
  exit 1
fi
printf '\n\033[32m✓ smoke test passed — %d checks against %s\033[0m\n' "$checks" "$BASE"

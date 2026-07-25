#!/usr/bin/env bash
# Cue staging health watchdog. This file is the source of truth; deploy.sh
# installs it to /usr/local/bin/cue-health, which lives outside /opt/cue so a
# `git reset --hard` mid-deploy cannot delete the copy that is executing.
#
#   run by:   cue-health.timer (every 2 minutes)
#   writes:   /var/lib/cue/status.json  (last check, mounted read-only into app)
#             /var/log/cue-health.log   (incidents only, capped)
#   does:     restarts a container that is unhealthy or stopped, backing off
#             after each attempt and giving up after MAX_ATTEMPTS. A service it
#             has given up on is reported in status.json and the log and is
#             never bounced again until it recovers or a human clears it.
#
# It cannot page anyone. Nothing on this box can reach the owner without an
# external service; this only keeps the box self-healing and leaves evidence.
set -uo pipefail

URL=https://staging.cue.krevo.io/api/ping
DIR=/var/lib/cue
STATUS=$DIR/status.json
LOG=/var/log/cue-health.log
DEPLOY_MARK=$DIR/deploy.pid

# Restart 1 is immediate, then 10m, 20m, 40m, 80m between attempts. After five
# a service is genuinely broken, not flapping, and restarting it again for the
# rest of the week only hides that.
BACKOFF_BASE=600
MAX_ATTEMPTS=5

mkdir -p "$DIR"
cd /opt/cue || exit 1

# One watchdog at a time. Two overlapping runs read the same .restart-<svc>
# stamp before either writes it, so both see the same attempt count and the
# same `last`, and the backoff — which is the only thing stopping a restart
# loop — is computed from stale state. A burst on 2026-07-25 drove redis from
# attempt 1 to GAVE UP in ten seconds that way.
#
# Its OWN lock file, deliberately not /var/lock/cue-deploy.lock: touching that
# one makes a deploy starting in the same window exit 75. The deploy is still
# detected by the advisory PID marker below, exactly as before. Missing the
# occasional check is free — the timer fires again in two minutes.
exec 9>"$DIR/health.lock"
flock -n 9 || exit 0

log() { printf '%s  %s\n' "$(date -Is)" "$*" >>"$LOG"; }

# A deploy recreates containers on purpose. Don't fight it — but do NOT test
# for one by taking /var/lock/cue-deploy.lock: acquiring it, even for the
# microsecond `flock … true` holds it, makes a deploy that starts in that
# window exit 75 "another deploy is already running". Read the deploy's
# advisory marker instead; the PID check makes a killed deploy self-clearing.
if [ -f "$DEPLOY_MARK" ]; then
  deploy_pid="$(cat "$DEPLOY_MARK" 2>/dev/null || echo)"
  if [ -n "$deploy_pid" ] && kill -0 "$deploy_pid" 2>/dev/null; then
    exit 0
  fi
fi

read -r code secs < <(curl -sS -o /dev/null -m 10 \
  -w '%{http_code} %{time_total}' "$URL" 2>/dev/null || echo "000 0")
ms=$(awk -v s="${secs:-0}" 'BEGIN { printf "%d", s * 1000 }')
[ "${code:-000}" = "200" ] && endpoint_ok=true || endpoint_ok=false

services_json=""
problems=()
gave_up=()

# Enumerate first, decide after. If this command fails or comes back empty the
# loop body never runs, and treating "we learned nothing" as "nothing is wrong"
# is how a total Docker outage used to report as partially healthy.
ps_out="$(docker compose ps -a --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)"
if [ -z "$ps_out" ]; then
  problems+=("docker:unreachable")
  log "DOCKER UNREACHABLE  could not enumerate services"
else
  while read -r svc state health; do
    [ -n "$svc" ] || continue
    services_json="$services_json{\"service\":\"$svc\",\"state\":\"$state\",\"health\":\"${health:-none}\"},"

    stamp="$DIR/.restart-$svc"
    gave_up_flag="$DIR/.gaveup-$svc"

    if [ "$state" = "running" ] && [ "$health" != "unhealthy" ]; then
      # Healthy again: forget the history so the next incident starts fresh.
      if [ -e "$gave_up_flag" ]; then
        log "RECOVERED $svc (was given up on)"
        rm -f "$gave_up_flag"
      fi
      rm -f "$stamp"
      continue
    fi

    problems+=("$svc:$state/${health:-none}")

    attempts=0
    last=0
    [ -f "$stamp" ] && read -r attempts last <"$stamp"
    # A stamp truncated by a crash mid-write reads back as empty, and an empty
    # string in the arithmetic below aborts the whole check with a bash error.
    [[ "$attempts" =~ ^[0-9]+$ && "$last" =~ ^[0-9]+$ ]] || { attempts=0; last=0; }
    now="$(date +%s)"

    if [ "$attempts" -ge "$MAX_ATTEMPTS" ]; then
      gave_up+=("$svc")
      if [ ! -e "$gave_up_flag" ]; then
        touch "$gave_up_flag"
        log "GAVE UP $svc after $attempts restarts (still $state/${health:-none}) — needs a human"
      fi
    elif [ "$((now - last))" -ge "$((BACKOFF_BASE << attempts))" ]; then
      attempts=$((attempts + 1))
      printf '%s %s\n' "$attempts" "$now" >"$stamp"
      if docker compose restart "$svc" >/dev/null 2>&1; then
        log "RESTARTED $svc (was $state/${health:-none}, attempt $attempts/$MAX_ATTEMPTS)"
      else
        log "RESTART FAILED $svc (was $state/${health:-none}, attempt $attempts/$MAX_ATTEMPTS)"
      fi
    fi
  done <<<"$ps_out"
fi

ok=true
[ "$endpoint_ok" = true ] || ok=false
[ ${#problems[@]} -eq 0 ] || ok=false

json_list() {
  local out=""
  for item in "${@}"; do out="$out\"$item\","; done
  printf '%s' "${out%,}"
}

cat >"$STATUS.tmp" <<JSON
{
  "checkedAt": "$(date -Is)",
  "ok": $ok,
  "endpoint": { "url": "$URL", "status": ${code:-0}, "latencyMs": $ms },
  "services": [${services_json%,}],
  "problems": [$(json_list "${problems[@]+"${problems[@]}"}")],
  "gaveUp": [$(json_list "${gave_up[@]+"${gave_up[@]}"}")],
  "load": "$(cut -d' ' -f1-3 /proc/loadavg)",
  "memAvailableMb": $(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo),
  "diskUsedPct": $(df --output=pcent / | tail -1 | tr -dc '0-9')
}
JSON
mv "$STATUS.tmp" "$STATUS"

# Log transitions only, so the log stays readable: every failure, and the first
# success after one.
flag=$DIR/.last-failed
if [ "$ok" = true ]; then
  if [ -e "$flag" ]; then
    log "RECOVERED  http=$code ${ms}ms"
    rm -f "$flag"
  fi
else
  touch "$flag"
  log "UNHEALTHY  http=$code ${ms}ms problems=${problems[*]:-none}"
fi

# No logrotate entry to install or forget.
if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 1000000 ]; then
  tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readHealth,
  readWatchdogStatus,
  uptimeFrom,
  watchdogAlert,
  WATCHDOG_STALE_MS,
} from "./docker.ts";

/* Docker's status column is prose produced by go-units.HumanDuration, so these
   are the real strings the console has to parse. Every expected number below is
   the unit table done by hand: second 1, minute 60, hour 3600, day 86400,
   week 604800, month 2592000 (30 days), year 31536000 (365 days). */

test("parses plain durations", () => {
  const cases: [string, number][] = [
    ["Up 4 minutes", 240], // 4 × 60
    ["Up 2 hours", 7200], // 2 × 3600
    ["Up 3 days", 259200], // 3 × 86400
    ["Up 5 weeks", 3024000], // 5 × 604800
    ["Up 2 years", 63072000], // 2 × 31536000
    ["Up 45 seconds", 45],
  ];
  for (const [status, seconds] of cases) {
    assert.equal(uptimeFrom(status), seconds, status);
  }
});

test("treats the word forms of one as one", () => {
  // HumanDuration writes "About a minute"/"About an hour" rather than "1
  // minute", and drops "About" for the bare article in some ranges.
  assert.equal(uptimeFrom("Up About a minute"), 60);
  assert.equal(uptimeFrom("Up About an hour"), 3600);
  assert.equal(uptimeFrom("Up a minute"), 60);
  assert.equal(uptimeFrom("Up an hour"), 3600);
});

test("sub-second uptime is reported as one second", () => {
  // "Up Less than a second" has no numeric part at all. Pinned at 1 rather
  // than 0 because the container *is* up — a 0 here would render as "down"
  // for the first second of every deploy. Change the parser, not this number,
  // if that ever needs to be 0.
  assert.equal(uptimeFrom("Up Less than a second"), 1);
});

test("months use Docker's 30-day approximation", () => {
  // go-units treats a month as 30 days flat, so this is deliberately not
  // calendar-accurate. Pinned so a future "fix" to real months is a conscious
  // decision that also has to update the console's copy.
  assert.equal(uptimeFrom("Up 2 months"), 5184000); // 2 × 30 × 86400
  assert.equal(uptimeFrom("Up 1 month"), 2592000);
});

test("health suffixes do not disturb the duration", () => {
  assert.equal(uptimeFrom("Up 4 minutes (healthy)"), 240);
  assert.equal(uptimeFrom("Up 20 seconds (health: starting)"), 20);
  assert.equal(uptimeFrom("Up 6 hours (unhealthy)"), 21600);
});

test("a downtime is never read as uptime", () => {
  // Regression: an unanchored pattern matched the "3 minutes" inside
  // "Exited (0) 3 minutes ago" and the console showed a dead container as
  // having been up for three minutes. The parse must be anchored at "Up ".
  for (const status of [
    "Exited (0) 3 minutes ago",
    "Exited (137) 2 hours ago",
    "Restarting (1) 5 seconds ago",
    "Dead",
    "Created",
    "Paused",
    "",
    "up 4 minutes", // case matters; Docker always capitalises
  ]) {
    assert.equal(uptimeFrom(status), 0, JSON.stringify(status));
  }
});

test("unknown units contribute nothing", () => {
  assert.equal(uptimeFrom("Up 3 fortnights"), 0);
});

test("reads the health suffix", () => {
  assert.equal(readHealth("Up 4 minutes (healthy)"), "healthy");
  assert.equal(readHealth("Up 4 minutes (unhealthy)"), "unhealthy");
  assert.equal(readHealth("Up 20 seconds (health: starting)"), "starting");
  // No healthcheck declared on the service — absence, not failure.
  assert.equal(readHealth("Up 4 minutes"), "none");
  assert.equal(readHealth("Exited (0) 3 minutes ago"), "none");
  assert.equal(readHealth(""), "none");
});

/* ── The watchdog status file ──

   `scripts/cue-health.sh` publishes /var/lib/cue/status.json every 2 minutes
   and compose mounts it read-only into the app. It is the only place two facts
   exist: which services the watchdog has stopped restarting, and when it last
   ran at all.

   The parser is defensive because the writer is a shell script assembling JSON
   by string concatenation. `problems` entries come from `docker compose ps`
   output, and an unset `memAvailableMb` awk result would emit a bare `":"` with
   no value — both produce a file that is present, non-empty, and not JSON.
   "Present but unparseable" is therefore a real state and not a theoretical
   one, and it has to be distinguishable from "the timer was never installed". */

const GOOD = JSON.stringify({
  checkedAt: "2026-07-28T03:49:44+00:00",
  ok: true,
  endpoint: { url: "https://staging.cue.krevo.io/api/ping", status: 200, latencyMs: 173 },
  services: [{ service: "app", state: "running", health: "healthy" }],
  problems: [],
  gaveUp: [],
  load: "0.78 0.33 0.25",
  memAvailableMb: 2641,
  diskUsedPct: 10,
});

const CHECKED_AT_MS = Date.parse("2026-07-28T03:49:44+00:00");

test("a fresh, healthy status file reads as ok", () => {
  const w = readWatchdogStatus(GOOD, CHECKED_AT_MS + 30_000);
  assert.equal(w.state, "ok");
  assert.equal(w.ok, true);
  assert.equal(w.needsAttention, false);
  assert.deepEqual(w.gaveUp, []);
  assert.equal(w.checkedAt, "2026-07-28T03:49:44+00:00");
});

test("a status file older than the stale window reads as stale", () => {
  // The timer fires every 2 minutes, so this is the signal that the watchdog
  // itself has stopped running — the one failure nothing else on the box can
  // detect, because the watchdog is what detects everything else.
  const w = readWatchdogStatus(GOOD, CHECKED_AT_MS + WATCHDOG_STALE_MS + 1);
  assert.equal(w.state, "stale");
  assert.equal(w.needsAttention, true);
  // The last known verdict is still reported; it is simply no longer current.
  assert.equal(w.ok, true);
});

test("the stale window is inclusive at its edge", () => {
  assert.equal(readWatchdogStatus(GOOD, CHECKED_AT_MS + WATCHDOG_STALE_MS).state, "ok");
});

test("a clock skewed behind the watchdog is fresh, not stale", () => {
  // The container clock and the host clock are not the same clock. A negative
  // age must not underflow into "stale" — or worse, into a negative duration
  // rendered on the dashboard.
  //
  // The skew tested is deliberately LARGER than the stale window. A small one
  // passes whether the comparison is signed or takes an absolute value, so it
  // proves nothing: a report from the future is a clock problem, never a dead
  // watchdog, and `Math.abs` here would raise the wrong alarm.
  for (const skew of [60_000, WATCHDOG_STALE_MS + 60_000, 86_400_000]) {
    const w = readWatchdogStatus(GOOD, CHECKED_AT_MS - skew);
    assert.equal(w.state, "ok", `skew ${skew}`);
    assert.equal(w.needsAttention, false, `skew ${skew}`);
  }
});

test("services the watchdog gave up on are surfaced and demand attention", () => {
  // Real incident, 2026-07-25: redis went to GAVE UP after 5 restarts and the
  // only trace was a log line on the box.
  const raw = JSON.stringify({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: ["redis:exited/none"],
    gaveUp: ["redis"],
  });
  const w = readWatchdogStatus(raw, CHECKED_AT_MS + 30_000);
  assert.equal(w.state, "ok", "the report is current; its contents are the problem");
  assert.equal(w.ok, false);
  assert.deepEqual(w.gaveUp, ["redis"]);
  assert.deepEqual(w.problems, ["redis:exited/none"]);
  assert.equal(w.needsAttention, true);
});

test("a missing file is reported as missing, not as an error", () => {
  // The common case on a rebuilt box: deploy.sh installs the scripts but the
  // systemd units are deliberately left out of it, so status.json does not
  // exist until somebody enables the timer.
  const w = readWatchdogStatus(null, CHECKED_AT_MS);
  assert.equal(w.state, "missing");
  assert.equal(w.needsAttention, true);
  assert.equal(w.checkedAt, null);
  assert.deepEqual(w.gaveUp, []);
});

test("a truncated or non-JSON file reads as unreadable", () => {
  for (const raw of [
    GOOD.slice(0, 40), // killed mid-write
    "",
    "   ",
    "not json at all",
    '{"checkedAt": "2026-07-28T03:49:44+00:00", "memAvailableMb": }', // unset awk result
    "null",
    "[]",
    '"a string"',
    "42",
  ]) {
    const w = readWatchdogStatus(raw, CHECKED_AT_MS);
    assert.equal(w.state, "unreadable", JSON.stringify(raw));
    assert.equal(w.needsAttention, true, JSON.stringify(raw));
  }
});

test("a file with no usable checkedAt is unreadable rather than silently fresh", () => {
  // Without a timestamp there is no way to know whether the watchdog is still
  // running, and defaulting to "fresh" would hide exactly the failure this
  // parser exists to catch.
  for (const checkedAt of [undefined, null, "", "yesterday", 1753674584, {}]) {
    const raw = JSON.stringify({ ok: true, checkedAt, problems: [], gaveUp: [] });
    assert.equal(
      readWatchdogStatus(raw, CHECKED_AT_MS).state,
      "unreadable",
      JSON.stringify(checkedAt),
    );
  }
});

test("a timestamp that is not a string is rejected even when it would parse", () => {
  /* `Date.parse` coerces its argument, and a one-element JSON array stringifies
     to that element — so ["2026-07-28T03:49:44+00:00"] parses to a valid time.
     Without the `typeof === "string"` check the array would sail through as a
     current report AND be handed to the banner as `checkedAt`, which then
     renders a value typed `string` that is not one. The NaN guard alone does
     not catch this; only the type check does. */
  const raw = JSON.stringify({
    ok: true,
    checkedAt: ["2026-07-28T03:49:44+00:00"],
    problems: [],
    gaveUp: [],
  });
  const w = readWatchdogStatus(raw, CHECKED_AT_MS);
  assert.equal(w.state, "unreadable");
  assert.equal(w.checkedAt, null);
});

test("malformed list fields degrade to empty rather than throwing", () => {
  // The writer emits `[$(json_list ...)]`, which is an empty array when the
  // bash array is unset. Anything else here means the file was mangled, and a
  // mangled list must not take down the one screen that reports it.
  const raw = JSON.stringify({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: "redis:exited",
    gaveUp: null,
  });
  const w = readWatchdogStatus(raw, CHECKED_AT_MS);
  assert.equal(w.state, "ok");
  assert.deepEqual(w.problems, []);
  assert.deepEqual(w.gaveUp, []);
  assert.equal(w.needsAttention, true, "ok:false alone still demands attention");
});

test("non-string entries are dropped from the lists", () => {
  const raw = JSON.stringify({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: ["redis:exited/none", 7, null, "app:unhealthy"],
    gaveUp: ["redis", { service: "app" }],
  });
  const w = readWatchdogStatus(raw, CHECKED_AT_MS);
  assert.deepEqual(w.problems, ["redis:exited/none", "app:unhealthy"]);
  assert.deepEqual(w.gaveUp, ["redis"]);
});

test("a report that omits its own verdict is not treated as healthy", () => {
  // `ok` is written by the shell as a bare true/false. If it is absent the
  // writer did not finish saying whether things were fine, and the safe
  // reading of "did not say" is not "said yes".
  const raw = JSON.stringify({ checkedAt: "2026-07-28T03:49:44+00:00" });
  const w = readWatchdogStatus(raw, CHECKED_AT_MS);
  assert.equal(w.state, "ok", "the file itself is current and parseable");
  assert.equal(w.ok, false);
  assert.equal(w.needsAttention, true);
});

/* ── The banner rule ──

   Which watchdog state is somebody's night and which is tomorrow's task. It
   lives in lib rather than in the console component for two reasons: a
   component cannot be unit tested in this repo (node:test, no DOM), and
   `lib/docker` is server-only by boundary.test.ts, so the console physically
   cannot import the rule and would have to hold a hand-copy of it. */

function alertFor(body: Record<string, unknown>, now = CHECKED_AT_MS) {
  return watchdogAlert(readWatchdogStatus(JSON.stringify(body), now));
}

test("a healthy, current watchdog raises no banner at all", () => {
  assert.equal(watchdogAlert(readWatchdogStatus(GOOD, CHECKED_AT_MS + 30_000)), null);
});

test("only a given-up service is critical", () => {
  // The distinction the operator acts on: the watchdog retries on its own until
  // it gives up, and after that nothing will happen without a person. Every
  // other state is real but still self-healing or merely unobserved, and
  // colouring those red is how a red banner stops being read.
  const critical = alertFor({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: ["redis:exited/none"],
    gaveUp: ["redis"],
  });
  assert.equal(critical?.tone, "critical");
  assert.match(critical!.message, /redis/);
  assert.match(critical!.message, /needs a human/i);

  const retrying = alertFor({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: ["redis:exited/none"],
    gaveUp: [],
  });
  assert.equal(retrying?.tone, "warn");
  assert.match(retrying!.message, /still retrying/i);
});

test("every service given up on is named, not just the first", () => {
  const alert = alertFor({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: ["redis:exited/none", "postgres:exited/none"],
    gaveUp: ["redis", "postgres"],
  });
  assert.match(alert!.message, /redis/);
  assert.match(alert!.message, /postgres/);
});

test("a stale or missing watchdog warns, and says what it means", () => {
  const stale = watchdogAlert(
    readWatchdogStatus(GOOD, CHECKED_AT_MS + WATCHDOG_STALE_MS + 1),
  );
  assert.equal(stale?.tone, "warn");
  // The timestamp has to be in the copy: "recently" is not actionable and the
  // operator needs to know whether this is five minutes or five days.
  assert.match(stale!.message, /2026-07-28T03:49:44\+00:00/);
  assert.match(stale!.message, /nothing is restarting failed containers/i);

  const missing = watchdogAlert(readWatchdogStatus(null, CHECKED_AT_MS));
  assert.equal(missing?.tone, "warn");
  assert.match(missing!.message, /cue-health\.timer/);

  const unreadable = watchdogAlert(readWatchdogStatus("{oops", CHECKED_AT_MS));
  assert.equal(unreadable?.tone, "warn");
  assert.match(unreadable!.message, /cue-health\.log/);
});

test("a problem with no named cause still produces readable copy", () => {
  // `ok:false` with an empty problems array should not render as
  // "reports a problem: ." — the shell can emit that combination.
  const alert = alertFor({
    checkedAt: "2026-07-28T03:49:44+00:00",
    ok: false,
    problems: [],
    gaveUp: [],
  });
  assert.equal(alert?.tone, "warn");
  assert.match(alert!.message, /cause not given/);
});

test("a given-up service outranks staleness in the banner", () => {
  // Both are true at once during a real incident. The one that needs a person
  // is the one that must be on screen.
  const alert = watchdogAlert(
    readWatchdogStatus(
      JSON.stringify({
        checkedAt: "2026-07-28T03:49:44+00:00",
        ok: false,
        problems: ["redis:exited/none"],
        gaveUp: ["redis"],
      }),
      CHECKED_AT_MS + WATCHDOG_STALE_MS + 1,
    ),
  );
  assert.equal(alert?.tone, "critical");
});

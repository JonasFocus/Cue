import { test } from "node:test";
import assert from "node:assert/strict";
import { readHealth, uptimeFrom } from "./docker.ts";

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

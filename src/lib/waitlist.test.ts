import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  GUEST_STATUSES,
  isGuestStatus,
  isValidEmail,
  MAX_EMAIL_LENGTH,
  nameFromEmail,
  normaliseEmail,
  parseStatusPatch,
  WAITLIST_HOURLY_SIGNUP_CEILING,
  WAITLIST_IP_ATTEMPT_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
  joinedStamp,
} from "./waitlist.ts";

test("launch limits allow a real traffic spike without dropping abuse protection", () => {
  assert.equal(WAITLIST_IP_ATTEMPT_LIMIT, 100);
  assert.equal(WAITLIST_RATE_WINDOW_SECONDS, 60 * 60);
  assert.equal(WAITLIST_HOURLY_SIGNUP_CEILING, 10_000);
});

test("accepts ordinary addresses", () => {
  for (const email of [
    "jonas@krevo.io",
    "amelia.harper@harperstudio.co",
    "a+tag@sub.domain.com",
    "n.okafor@okafor-visuals.com",
  ]) {
    assert.equal(isValidEmail(email), true, email);
  }
});

test("rejects junk", () => {
  for (const email of [
    "",
    "jonas",
    "jonas@",
    "@krevo.io",
    "jonas@krevo",
    "jonas @krevo.io",
    "jonas@krevo.io, other@x.com", // comma-separated list, not one address
    `${"a".repeat(250)}@krevo.io`, // over the 254 cap
  ]) {
    assert.equal(isValidEmail(email), false, JSON.stringify(email));
  }
});

test("normalises case and surrounding whitespace", () => {
  assert.equal(normaliseEmail("  Jonas@Krevo.IO \n"), "jonas@krevo.io");
  assert.equal(normaliseEmail(undefined), "");
  assert.equal(normaliseEmail(null), "");
});

test("derives a readable name from an address", () => {
  assert.equal(nameFromEmail("jonas.bubela@krevo.io"), "Jonas Bubela");
  assert.equal(nameFromEmail("n_okafor@x.com"), "N Okafor");
  assert.equal(nameFromEmail("tom-brandt@x.com"), "Tom Brandt");
  assert.equal(nameFromEmail("km@marshportraits.com"), "Km");
  // Digits are dropped; an address that is only digits leaves nothing behind.
  assert.equal(nameFromEmail("12345@x.com"), "—");
});


test("the length cap is exact at 254", () => {
  // 254 is the RFC 5321 maximum path length, and the SQL CHECK in
  // 004_waitlist_constraints.sql uses the same bound — an address that passes
  // here and fails there would be a 500 instead of a validation message.
  const domain = "@krevo.io"; // 9 characters
  const atLimit = `${"a".repeat(MAX_EMAIL_LENGTH - domain.length)}${domain}`;
  assert.equal(atLimit.length, 254);
  assert.equal(isValidEmail(atLimit), true);

  const overLimit = `a${atLimit}`;
  assert.equal(overLimit.length, 255);
  assert.equal(isValidEmail(overLimit), false);
});

test("normalises non-string input without throwing", () => {
  // The value arrives from FormData / JSON.parse, so it is `unknown` for real.
  assert.equal(normaliseEmail(42), "42");
  assert.equal(normaliseEmail({}), "[object object]");
  assert.equal(normaliseEmail(["A@B.io"]), "a@b.io");
});

test("isGuestStatus accepts exactly the known vocabulary", () => {
  for (const status of GUEST_STATUSES) {
    assert.equal(isGuestStatus(status), true, status);
  }
});

test("isGuestStatus rejects everything else", () => {
  for (const value of [
    // The retired signup-funnel vocabulary, dropped in migration 003. A row
    // set to one of these would violate the CHECK constraint and 500 the PATCH.
    "joined",
    "invited",
    "",
    " pending",
    "PENDING", // the constraint is case-sensitive; so is this guard
    null,
    undefined,
    0,
    1,
    true,
    ["pending"],
    { status: "pending" },
  ]) {
    assert.equal(isGuestStatus(value), false, JSON.stringify(value));
  }
});

/* Drift guard. The status vocabulary is written down twice — once as
   GUEST_STATUSES, once as the SQL CHECK constraint — and nothing at build time
   connects them. When 003 renamed the vocabulary, a stale TypeScript list would
   have let the console offer a status the database rejects, turning every PATCH
   with it into a 500. The console dropdown derives from GUEST_STATUSES, so it
   cannot drift on its own and needs no test. */
test("the SQL CHECK constraint matches GUEST_STATUSES", () => {
  const dir = new URL("../../db/migrations/", import.meta.url);

  // Take the last migration that defines the constraint, so re-vocabularising
  // in a later file moves this test's target with it instead of stranding it.
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .filter((sql) => /CONSTRAINT\s+waitlist_status_check/i.test(sql))
    .at(-1);

  assert.ok(defining, "no migration defines waitlist_status_check");

  const check = /CONSTRAINT\s+waitlist_status_check\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(
    defining,
  );
  assert.ok(check, "could not read the status list out of the CHECK constraint");

  const fromSql = check[1]!
    .split(",")
    .map((s) => s.trim().replace(/^'([^']*)'$/, "$1"));

  assert.deepEqual(fromSql, [...GUEST_STATUSES]);
});

/* The PATCH validator guards the only authenticated write in the product, and
   it is the layer that turns a bad request into a 400 instead of letting the
   database CHECK constraint surface as a 500. Two prior audits found defects
   in exactly this area and the suite covered none of it. */

test("parseStatusPatch accepts a well-formed body", () => {
  for (const status of GUEST_STATUSES) {
    assert.deepEqual(parseStatusPatch({ id: 13, status }), {
      ok: true,
      id: 13,
      status,
    });
  }
});

test("parseStatusPatch rejects every bad id", () => {
  for (const id of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    "13", // a JSON string id would reach the query as text
    null,
    undefined,
    true,
    [13],
  ]) {
    assert.deepEqual(
      parseStatusPatch({ id, status: "pending" }),
      { ok: false, error: "invalid id" },
      JSON.stringify(id),
    );
  }
});

test("parseStatusPatch rejects statuses the database would refuse", () => {
  for (const status of [
    // Retired in migration 003 — these are the ones that would 500 on the
    // CHECK constraint rather than being caught here.
    "invited",
    "joined",
    "PENDING",
    "",
    null,
    undefined,
    ["pending"],
  ]) {
    assert.deepEqual(
      parseStatusPatch({ id: 13, status }),
      { ok: false, error: "invalid status" },
      JSON.stringify(status),
    );
  }
});

test("parseStatusPatch survives a body that is not an object", () => {
  // request.json() yields whatever the client sent; null and scalars are legal
  // JSON and must not throw on property access.
  for (const body of [null, undefined, 42, "pending", []]) {
    assert.equal(parseStatusPatch(body).ok, false, JSON.stringify(body));
  }
});

/* ── Arrival times ── */

test("joinedStamp renders Central time with seconds", () => {
  // 22:45:07 UTC is 5:45:07 PM in Chicago during daylight saving.
  const out = joinedStamp("2026-07-28T22:45:07.000Z");
  assert.match(out, /Jul 28, 2026/);
  assert.match(out, /5:45:07\s*PM/);
  assert.match(out, /CT$/);
});

test("joinedStamp holds the zone across the DST boundary", () => {
  // Central is UTC-5 in July and UTC-6 in January. Both must render as CT
  // rather than drifting an hour, which is what a hardcoded offset would do.
  assert.match(joinedStamp("2026-07-28T17:00:00.000Z"), /12:00:00\s*PM/);
  assert.match(joinedStamp("2026-01-28T17:00:00.000Z"), /11:00:00\s*AM/);
});

test("joinedStamp keeps seconds distinct for a burst of signups", () => {
  // The reason seconds exist: a launch puts people on the list in the same
  // minute, and the list is ordered by arrival.
  const a = joinedStamp("2026-07-28T22:45:07.000Z");
  const b = joinedStamp("2026-07-28T22:45:41.000Z");
  assert.notEqual(a, b);
});

test("joinedStamp returns empty rather than 'Invalid Date'", () => {
  assert.equal(joinedStamp("not a date"), "");
  assert.equal(joinedStamp(""), "");
});

test("joinedStamp is Central regardless of the machine's own timezone", () => {
  /* The assertions above pass on a Central machine even if the timeZone option
     were dropped entirely — viewer-local and America/Chicago are the same thing
     here, so they cannot see the bug they exist to catch. Forcing an ambient
     zone makes the difference observable: without the option this renders
     Tokyo's clock while still appending "CT", which is a wrong timestamp
     wearing a correct-looking label.

     Restored in a finally so the rest of the suite is unaffected. */
  const original = process.env.TZ;
  try {
    process.env.TZ = "Asia/Tokyo";
    const out = joinedStamp("2026-07-28T22:45:07.000Z");
    assert.match(out, /5:45:07\s*PM/, `rendered ${out} — that is the ambient zone, not Central`);
    assert.doesNotMatch(out, /7:45:07\s*AM/, "fell back to the machine's own timezone");
  } finally {
    process.env.TZ = original;
  }
});

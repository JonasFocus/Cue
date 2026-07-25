import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  GUEST_STATUSES,
  isGuestStatus,
  isValidEmail,
  MAX_EMAIL_LENGTH,
  maskEmail,
  nameFromEmail,
  normaliseEmail,
} from "./waitlist.ts";

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

test("masks the local part but keeps the domain", () => {
  assert.equal(maskEmail("jonas@krevo.io"), "jo•••@krevo.io");
  // Never leaks length-1 local parts as bare plaintext.
  assert.equal(maskEmail("a@x.com"), "a•@x.com");
  // Nothing guarantees a well-formed address reaches here — a legacy row or a
  // hand-run INSERT predates the CHECK constraint. It must still mask, not throw.
  assert.equal(maskEmail("nobody"), "no••••@");
  assert.equal(maskEmail(""), "•@");
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

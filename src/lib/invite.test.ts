import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accessDecision,
  ACCESS_MESSAGE,
  inviteState,
  INVITE_STATES,
  newInviteToken,
  parseAccessDate,
  toDateInput,
  type InvitePeriod,
} from "./invite.ts";

const source = readFileSync(new URL("./invite.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../db/migrations/009_invites.sql", import.meta.url),
  "utf8",
);

/* Just the SQL, for the structural assertions at the bottom — same trick as
   admin.test.ts. The prose above a statement must not count as the statement. */
const sql = [...source.matchAll(/`([^`]*)`/g)]
  .map((m) => m[1]!)
  .filter((s) => /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/.test(s))
  .join("\n");

const NOW = new Date("2026-08-15T12:00:00.000Z");

function period(over: Partial<InvitePeriod> = {}): InvitePeriod {
  return {
    startsAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    ...over,
  };
}

/* ── The state machine ── */

test("an open-ended invite that has started is active", () => {
  assert.equal(inviteState(period(), NOW), "active");
});

test("an invite whose start is in the future is pending, not active", () => {
  assert.equal(
    inviteState(period({ startsAt: "2026-09-01T00:00:00.000Z" }), NOW),
    "pending",
  );
});

test("the last instant of the final day is still access", () => {
  // parseAccessDate("2026-08-15", "end") lands here. Access "through the 15th"
  // has to include the 15th, or every trial is silently a day short.
  const end = period({ expiresAt: "2026-08-15T23:59:59.999Z" });
  assert.equal(inviteState(end, NOW), "active");
  assert.equal(inviteState(end, new Date("2026-08-15T23:59:59.998Z")), "active");
  assert.equal(inviteState(end, new Date("2026-08-16T00:00:00.000Z")), "expired");
});

test("expiry is exclusive at the boundary instant", () => {
  const at = "2026-08-15T12:00:00.000Z";
  assert.equal(inviteState(period({ expiresAt: at }), new Date(at)), "expired");
});

test("revoked outranks expired, so the reason given is the true one", () => {
  // Both are "no access". They are not the same thing to say to somebody, and
  // the locked screen prints whichever this returns.
  const both = period({
    expiresAt: "2026-08-02T00:00:00.000Z",
    revokedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(inviteState(both, NOW), "revoked");
});

test("revoked outranks pending too", () => {
  const both = period({
    startsAt: "2026-09-01T00:00:00.000Z",
    revokedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(inviteState(both, NOW), "revoked");
});

/* ── The access decision ── */

test("an operator is allowed in with no invite row at all", () => {
  // The operator is seeded by script and has no invite. Consulting the table
  // for them would lock the one account that cannot be let back in.
  assert.deepEqual(accessDecision({ role: "operator", invite: null }, NOW), {
    allowed: true,
    reason: "operator",
  });
});

test("an operator is allowed in even holding a revoked invite", () => {
  const decision = accessDecision(
    { role: "operator", invite: period({ revokedAt: "2026-08-03T00:00:00.000Z" }) },
    NOW,
  );
  assert.equal(decision.allowed, true);
});

test("a creator with no invite is refused — this is the closed door", () => {
  assert.deepEqual(accessDecision({ role: "creator", invite: null }, NOW), {
    allowed: false,
    reason: "no-invite",
  });
});

test("a creator with a live invite is allowed in", () => {
  assert.deepEqual(accessDecision({ role: "creator", invite: period() }, NOW), {
    allowed: true,
    reason: "active",
  });
});

test("every refusal reason carries a message the locked screen can print", () => {
  for (const state of INVITE_STATES) {
    if (state === "active") continue;
    assert.ok(ACCESS_MESSAGE[state], `no message for ${state}`);
  }
  assert.ok(ACCESS_MESSAGE["no-invite"]);
});

test("each non-active state refuses with its own reason", () => {
  const cases: Array<[InvitePeriod, string]> = [
    [period({ startsAt: "2026-09-01T00:00:00.000Z" }), "pending"],
    [period({ expiresAt: "2026-08-02T00:00:00.000Z" }), "expired"],
    [period({ revokedAt: "2026-08-03T00:00:00.000Z" }), "revoked"],
  ];
  for (const [invite, reason] of cases) {
    assert.deepEqual(accessDecision({ role: "creator", invite }, NOW), {
      allowed: false,
      reason,
    });
  }
});

/* ── Dates from the console form ── */

test("a start date is the first instant of that day, an end date the last", () => {
  assert.equal(
    parseAccessDate("2026-08-30", "start")?.toISOString(),
    "2026-08-30T00:00:00.000Z",
  );
  assert.equal(
    parseAccessDate("2026-08-30", "end")?.toISOString(),
    "2026-08-30T23:59:59.999Z",
  );
});

test("a blank or malformed date is null, not today and not a crash", () => {
  for (const raw of ["", "   ", null, undefined, "30/08/2026", "2026-8-30", "soon"]) {
    assert.equal(parseAccessDate(raw, "end"), null, `accepted ${String(raw)}`);
  }
});

test("a day that does not exist is rejected rather than rolled forward", () => {
  // new Date("2026-02-31") silently becomes 3 March. An access period ending on
  // a date the operator did not choose is worse than a rejected form.
  assert.equal(parseAccessDate("2026-02-31", "end"), null);
  assert.equal(parseAccessDate("2026-13-01", "end"), null);
  assert.ok(parseAccessDate("2028-02-29", "end"), "2028 is a leap year");
});

test("toDateInput round-trips a stored timestamp back into the form", () => {
  const at = parseAccessDate("2026-08-30", "end")!;
  assert.equal(toDateInput(at.toISOString()), "2026-08-30");
  assert.equal(toDateInput(null), "");
});

/* ── Tokens ── */

test("invite tokens are URL-safe and not guessable", () => {
  const token = newInviteToken();
  assert.match(token, /^[A-Za-z0-9_-]{32}$/); // 24 bytes, base64url
  const many = new Set(Array.from({ length: 200 }, newInviteToken));
  assert.equal(many.size, 200);
});

/* ── Structure ──
   The rules above are only worth anything if the statements obey them. */

test("no query in this file can rewrite who an invite is for", () => {
  // Changing the email or the token of an existing invite is not an edit, it is
  // a different invite — and it would hand somebody else's access to a new
  // address without an audit story.
  const updates = sql.split("\n").filter((line) => /UPDATE invite SET/.test(line));
  assert.ok(updates.length > 0, "expected UPDATE statements to check");
  for (const statement of updates) {
    assert.doesNotMatch(statement, /\bemail\s*=/, statement);
    assert.doesNotMatch(statement, /\btoken\s*=/, statement);
  }
});

test("the delete path cannot remove an invite somebody is standing on", () => {
  const del = sql.match(/DELETE FROM invite[^`]*/)?.[0] ?? "";
  assert.match(del, /accepted_user_id IS NULL/);
});

test("every email lookup folds case, because the column is lower-cased", () => {
  const constraint = /CHECK \(email = lower\(email\)\)/.test(migration);
  assert.ok(constraint, "migration 009 should pin the column to lower case");
  for (const line of sql.split("\n")) {
    if (!/\bemail\b/.test(line)) continue;
    if (/WHERE email = /.test(line)) assert.match(line, /email = lower\(/, line);
  }
});

test("the migration lets existing accounts keep the access they already have", () => {
  // Closing signup must not evict the people already inside. The backfill is
  // the difference between a security change and a data-loss event.
  assert.match(migration, /INSERT INTO invite[\s\S]*FROM public\."user" u/);
  assert.match(migration, /ON CONFLICT \(email\) DO NOTHING/);
  assert.match(migration, /WHERE u\.role = 'creator'/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDABLE_ROLES,
  canEditField,
  canSend,
  canTransition,
  CONTENT_FIELDS,
  CUE_STATUSES,
  EVENT_KINDS,
  FREE_SENT_ALLOWANCE,
  isCoalescableEvent,
  isCueStatus,
  isFrozen,
  isSealed,
  isShareToken,
  isSignable,
  isOptionalSignature,
  isPubliclySignable,
  isSignatureImage,
  isValidSignerName,
  permittedPatch,
  SIGNATURE_PREFIX,
  shouldLogView,
  signatureMethod,
  STATUS_LABEL,
  VIEW_COALESCE_SECONDS,
  type CueStatus,
} from "./cue.ts";

test("the SQL CHECK constraint matches CUE_STATUSES", () => {
  // The database and this list must not drift: a status the app can write but
  // the constraint rejects is a 500 at the worst possible moment.
  const sql = readFileSync(new URL("../../db/migrations/007_app_schema.sql", import.meta.url), "utf8");
  const match = sql.match(/status\s+text\s+NOT NULL DEFAULT 'draft'\s*\n?\s*CHECK \(status IN \(([^)]+)\)\)/);
  assert.ok(match, "could not find the status CHECK constraint in 007");
  const inSql = match[1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual([...inSql].sort(), [...CUE_STATUSES].sort());
});

test("every status has a label and answers isCueStatus", () => {
  for (const s of CUE_STATUSES) {
    assert.ok(STATUS_LABEL[s], `${s} has no label`);
    assert.equal(isCueStatus(s), true);
  }
  assert.equal(isCueStatus("sealed"), false);
  assert.equal(isCueStatus(undefined), false);
});

test("a signed record is terminal", () => {
  for (const to of CUE_STATUSES) {
    assert.equal(canTransition("signed", to), false, `signed → ${to} must be refused`);
  }
  assert.equal(canTransition("voided", "sent"), false);
  assert.equal(canTransition("declined", "signed"), false);
});

test("the ordinary path is allowed", () => {
  assert.equal(canTransition("draft", "sent"), true);
  assert.equal(canTransition("sent", "opened"), true);
  assert.equal(canTransition("opened", "partially_signed"), true);
  assert.equal(canTransition("partially_signed", "signed"), true);
  // A single-party Cue seals straight from sent, without ever being opened —
  // a client can sign on a link they were handed in person.
  assert.equal(canTransition("sent", "signed"), true);
});

test("a draft cannot skip straight to signed", () => {
  assert.equal(canTransition("draft", "signed"), false);
  assert.equal(canTransition("draft", "opened"), false);
});

test("content is frozen the moment it leaves draft", () => {
  assert.equal(isFrozen("draft"), false);
  for (const s of CUE_STATUSES.filter((s) => s !== "draft")) {
    assert.equal(isFrozen(s), true, `${s} must be frozen`);
  }
});

test("only a signed Cue is sealed, only a live one is signable", () => {
  assert.deepEqual(CUE_STATUSES.filter(isSealed), ["signed"]);
  assert.deepEqual(CUE_STATUSES.filter(isSignable), ["sent", "opened", "partially_signed"]);
});

test("every content field is draft-only, in every non-draft status", () => {
  // This is the rule the whole product rests on: once a client can read it,
  // the creator cannot change what it says.
  for (const field of CONTENT_FIELDS) {
    assert.equal(canEditField(field, "draft"), true, `${field} must be editable in draft`);
    for (const status of CUE_STATUSES.filter((s) => s !== "draft")) {
      assert.equal(
        canEditField(field, status),
        false,
        `${field} must be locked in ${status}`,
      );
    }
  }
});

test("internal notes stay editable forever, including after sealing", () => {
  for (const status of CUE_STATUSES) {
    assert.equal(canEditField("notes", status), true);
  }
});

test("permittedPatch silently drops what the status forbids", () => {
  const patch = { title: "New title", vars: { deposit: false }, notes: "call them back" };

  assert.deepEqual(permittedPatch(patch, "draft"), patch);
  // A creator editing a signed agreement keeps their private note and loses
  // every attempt to alter the document.
  assert.deepEqual(permittedPatch(patch, "signed"), { notes: "call them back" });
  assert.deepEqual(permittedPatch(patch, "sent"), { notes: "call them back" });
});

test("an unknown field is refused rather than passed through", () => {
  assert.deepEqual(permittedPatch({ status: "signed" } as Record<string, unknown>, "sent"), {});
  assert.deepEqual(permittedPatch({ doc_hash: "0" } as Record<string, unknown>, "signed"), {});
  assert.deepEqual(permittedPatch({ studio_id: 2 } as Record<string, unknown>, "signed"), {});
});

/* The share link is one side of the agreement. If it can sign the creator's
   line, whoever holds the link can produce a sealed, hash-stamped record
   showing the photographer signed when they never did — forging the
   counterparty's signature on the one document meant to prove who agreed. */
test("the share link may never sign the creator's line", () => {
  assert.equal(isPubliclySignable("client"), true);
  assert.equal(isPubliclySignable("additional"), true);
  assert.equal(isPubliclySignable("creator"), false);
});

test("a creator party cannot be added, so none can exist to be forged", () => {
  assert.ok(!ADDABLE_ROLES.includes("creator"), "creator must not be addable in v1");
  assert.ok(!ADDABLE_ROLES.includes("client"), "the client is created with the Cue");
  assert.deepEqual([...ADDABLE_ROLES], ["additional"]);
  // Every addable role must be signable through the link it will be sent.
  for (const role of ADDABLE_ROLES) {
    assert.equal(isPubliclySignable(role), true, `${role} is addable but not signable`);
  }
});

test("the free allowance is five total sends, and does not reset", () => {
  assert.equal(canSend("free", 0), true);
  assert.equal(canSend("free", FREE_SENT_ALLOWANCE - 1), true);
  assert.equal(canSend("free", FREE_SENT_ALLOWANCE), false);
  assert.equal(canSend("free", 900), false);
  assert.equal(canSend("creator", 900), true);
  assert.equal(canSend("studio", 900), true);
});

test("share tokens accept what randomBytes(16).base64url produces", () => {
  // 16 bytes → 22 base64url characters, no padding.
  assert.equal(isShareToken("A".repeat(22)), true);
  assert.equal(isShareToken("aZ0_-".padEnd(22, "x")), true);
  assert.equal(isShareToken("short"), false);
  assert.equal(isShareToken("has/slash/and+plus+aaaa"), false);
  assert.equal(isShareToken(""), false);
  assert.equal(isShareToken(undefined), false);
});

test("signature images must be a PNG data URL and nothing else", () => {
  assert.equal(isSignatureImage(`${SIGNATURE_PREFIX}iVBORw0KGgo=`), true);
  assert.equal(isSignatureImage("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isSignatureImage("javascript:alert(1)"), false);
  // Anything base64 cannot contain must be refused, or a crafted data URL could
  // smuggle markup into a page that renders it as an <img src>.
  assert.equal(isSignatureImage(`${SIGNATURE_PREFIX}abc"><script>`), false);
  assert.equal(isSignatureImage(`${SIGNATURE_PREFIX}${"A".repeat(600_000)}`), false);
  assert.equal(isSignatureImage(null), false);
});

/* The accessibility blocker this rule exists to prevent: requiring a drawn
   glyph means a signature can only be produced by dragging a pointer, which
   locks blind, keyboard-only, switch, voice-control and tremor-affected clients
   out of signing a legally meaningful document. The typed legal name is the
   signature; the mark is decoration. */
test("a signature is valid with no drawn mark at all", () => {
  assert.equal(isOptionalSignature(null), true, "typed-only signing must be accepted");
  assert.equal(isOptionalSignature(undefined), true);
  assert.equal(isOptionalSignature(""), true);
});

test("but a mark that IS present still has to be a real PNG data URL", () => {
  // It ends up in an <img src> on the sealed record, so the strict checks hold
  // whenever there is anything to check.
  assert.equal(isOptionalSignature(`${SIGNATURE_PREFIX}iVBORw0KGgo=`), true);
  assert.equal(isOptionalSignature("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isOptionalSignature("javascript:alert(1)"), false);
  assert.equal(isOptionalSignature(`${SIGNATURE_PREFIX}abc"><script>`), false);
  assert.equal(isOptionalSignature(`${SIGNATURE_PREFIX}${"A".repeat(600_000)}`), false);
});

test("the audit record names which method was used", () => {
  assert.equal(signatureMethod(`${SIGNATURE_PREFIX}iVBORw0KGgo=`), "drawn");
  assert.equal(signatureMethod(null), "typed");
});

test("a signer name has to look like a name", () => {
  assert.equal(isValidSignerName("Ava Harper"), true);
  assert.equal(isValidSignerName("  Jo  "), true);
  assert.equal(isValidSignerName("A"), false);
  assert.equal(isValidSignerName(""), false);
  assert.equal(isValidSignerName("   "), false);
  assert.equal(isValidSignerName("x".repeat(121)), false);
  assert.equal(isValidSignerName(42), false);
});

/* Guards the transition table itself: every status must be reachable from
   somewhere, or it is a state the product can describe but never enter. */
test("every non-draft status is reachable", () => {
  const reachable = new Set<CueStatus>(["draft"]);
  for (const from of CUE_STATUSES) {
    for (const to of CUE_STATUSES) {
      if (canTransition(from, to)) reachable.add(to);
    }
  }
  for (const s of CUE_STATUSES) {
    assert.ok(reachable.has(s), `${s} is unreachable`);
  }
});

/* ── Coalescing repeat views ──

   Every load of /s/[token] appends an audit event. The only bound is the view
   rate limiter — 240 per ten minutes per IP — so one client refreshing on bad
   venue wifi could put ~34,500 rows a day into a table whose trigger refuses
   both UPDATE and DELETE. There is no cleanup path and there must not be one:
   this is the record the product promises.

   So the fix is at the write. A run of identical views from one reader inside a
   short window is one act of reading, and recording it 34,000 times does not
   make the record more true — it makes it unreadable, and `/app/cues/[id]/record`
   renders the whole list unpaginated. */

test("only `viewed` may ever be coalesced", () => {
  // The safety property. Everything else in the vocabulary is evidence that
  // something happened once: consent, a signature, a seal, a decline. Losing
  // one of those to a dedupe window would be a record that omits an act.
  for (const kind of EVENT_KINDS) {
    assert.equal(
      isCoalescableEvent(kind),
      kind === "viewed",
      `${kind} must ${kind === "viewed" ? "" : "not "}be coalescable`,
    );
  }
});

test("the first view from a reader is always recorded", () => {
  // No previous view for this key: nothing to coalesce with, and the very first
  // read of a contract is the most meaningful entry in the trail.
  assert.equal(shouldLogView(null, 1_000_000), true);
});

test("a repeat view inside the window is not recorded", () => {
  const last = 1_000_000;
  assert.equal(shouldLogView(last, last + 1), false);
  assert.equal(shouldLogView(last, last + VIEW_COALESCE_SECONDS * 1000 - 1), false);
});

test("a view after the window is recorded again", () => {
  // A client coming back hours later to re-read what they signed is exactly
  // what the trail should show, and is the reason this is a window rather than
  // a one-shot flag.
  const last = 1_000_000;
  assert.equal(shouldLogView(last, last + VIEW_COALESCE_SECONDS * 1000), true);
  assert.equal(shouldLogView(last, last + VIEW_COALESCE_SECONDS * 1000 + 1), true);
  assert.equal(shouldLogView(last, last + 86_400_000), true);
});

test("the window boundary is inclusive, so it cannot suppress forever", () => {
  // Exactly-at-the-window must record. With `>` instead of `>=` a metronomic
  // poller landing precisely on the boundary would be silenced indefinitely.
  const last = 0;
  assert.equal(shouldLogView(last, VIEW_COALESCE_SECONDS * 1000), true);
});

test("a timestamp from the future suppresses rather than double-records", () => {
  // Both stamps come from Postgres's clock so this should not arise, but the
  // arithmetic must not go negative into "record it": that would turn a clock
  // problem into an unbounded write, which is the thing being fixed.
  assert.equal(shouldLogView(2_000_000, 1_000_000), false);
});

test("the coalescing window is long enough to matter and short enough to be honest", () => {
  /* Pinned deliberately. Too short and this does nothing about the 34,500 rows;
     too long and the trail stops showing that a client came back to re-read the
     contract before signing, which is a fact a dispute might turn on. If this
     number changes, that trade is being re-made and should be argued in the
     commit, not slipped in. */
  assert.equal(VIEW_COALESCE_SECONDS, 15 * 60);
  // At most 4 rows an hour per reader, against 24 per hour from the limiter
  // alone today.
  assert.equal(3600 / VIEW_COALESCE_SECONDS, 4);
});

/* ── The chokepoint ──

   `shouldLogView` above is pure and fully covered, but it only decides. What
   makes the decision bind is that every write to cue_event goes through the one
   function that consults it. That is a property of the source, not of a value,
   and there is no database in this suite to observe it any other way — so it is
   asserted the same way the CHECK constraint above is: by reading the file.

   The precedent and the reason are the same. A rule the app can bypass is not a
   rule, and the bypass is silent. */

const CUE_DB = readFileSync(new URL("./cue-db.ts", import.meta.url), "utf8");

test("cue_event has exactly one writer, so the window cannot be bypassed", () => {
  // A second INSERT added later would skip logEvent, skip isCoalescableEvent,
  // and quietly restore unbounded growth on the one table that cannot be
  // pruned. If this count changes, the new writer needs the guard too.
  const inserts = CUE_DB.match(/INSERT INTO cue_event/g) ?? [];
  assert.equal(inserts.length, 1, "expected a single INSERT INTO cue_event in cue-db.ts");
});

test("the single writer is gated on isCoalescableEvent, the right way round", () => {
  assert.match(
    CUE_DB,
    /if \(isCoalescableEvent\(kind\) &&/,
    "logEvent must consult the rule rather than hard-coding a kind",
  );
  /* Negating it is the dangerous typo, not an obvious one: `!isCoalescableEvent`
     reads as sensible English and would coalesce every kind EXCEPT `viewed` —
     silently dropping a repeated `signed` or `sealed` from the record while the
     one kind meant to be capped grew without limit. Both halves of the mistake
     are invisible until a dispute. */
  assert.doesNotMatch(CUE_DB, /!isCoalescableEvent/);
});

test("the coalescing lookup matches a null ip_hash against itself", () => {
  /* `= NULL` is never true in SQL, so an `=` here would match no previous row
     whenever ip_hash is null — and it is null for every reader when IP_SALT is
     unset (see /s/[token]/page.tsx). Every load would record again, which is
     the unbounded growth this item exists to stop, reappearing exactly in the
     configuration where nobody would think to look for it. */
  assert.match(CUE_DB, /ip_hash IS NOT DISTINCT FROM/);
  assert.doesNotMatch(
    CUE_DB,
    /AND ip_hash = \$/,
    "an equality comparison on ip_hash cannot match the null case",
  );
});

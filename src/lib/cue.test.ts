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
  FREE_SENT_ALLOWANCE,
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
  signatureMethod,
  STATUS_LABEL,
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
  assert.equal(canSend("pro", 900), true);
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

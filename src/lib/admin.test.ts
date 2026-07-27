import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_ACTIONS,
  clientKey,
  formatStudioCursor,
  parseStudioCursor,
  searchPattern,
} from "./admin.ts";
// The plan vocabulary lives next to the `Plan` type in cue.ts, which is pure.
// admin.ts deliberately does not re-export it — see the note there.
import { isPlan, PLAN_LABEL, PLANS } from "./cue.ts";

const source = readFileSync(new URL("./admin.ts", import.meta.url), "utf8");

/* Just the SQL. The structural assertions at the bottom of this file are about
   what the *statements* say, and scanning the whole module would fail on the
   prose above them — the comment explaining that signature_png is never read
   would itself count as a read of it. */
const sql = [...source.matchAll(/`([^`]*)`/g)]
  .map((m) => m[1]!)
  .filter((s) => /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|WITH)\b/.test(s))
  .join("\n");

const migration007 = readFileSync(
  new URL("../../db/migrations/007_app_schema.sql", import.meta.url),
  "utf8",
);
const migration008 = readFileSync(
  new URL("../../db/migrations/008_admin_events.sql", import.meta.url),
  "utf8",
);

/* ── Plans ── */

test("PLANS matches the SQL CHECK constraint on studio.plan", () => {
  // A plan the console can write but the constraint rejects is a 500 at the
  // moment an operator is trying to fix somebody's account.
  const match = migration007.match(/plan\s+text\s+NOT NULL DEFAULT 'free' CHECK \(plan IN \(([^)]+)\)\)/);
  assert.ok(match, "could not find the plan CHECK constraint in 007");
  const inSql = match[1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual([...inSql].sort(), [...PLANS].sort());
});

test("every plan has a label and answers isPlan", () => {
  for (const plan of PLANS) {
    assert.ok(PLAN_LABEL[plan], `${plan} has no label`);
    assert.equal(isPlan(plan), true);
  }
  assert.equal(isPlan("enterprise"), false);
  assert.equal(isPlan(""), false);
  assert.equal(isPlan(undefined), false);
  assert.equal(isPlan(null), false);
  // A plan value arriving as an object must not slip through into the UPDATE.
  assert.equal(isPlan({ toString: () => "free" }), false);
});

/* ── Search ── */

test("a blank search is no filter at all", () => {
  assert.equal(searchPattern(undefined), null);
  assert.equal(searchPattern(""), null);
  assert.equal(searchPattern("   "), null);
});

test("ILIKE wildcards from the search box are escaped, not honoured", () => {
  // Without this, typing `%` returns every customer in the database and typing
  // `_` matches any single character — a search box that quietly lies.
  assert.equal(searchPattern("%"), "%\\%%");
  assert.equal(searchPattern("a_b"), "%a\\_b%");
  assert.equal(searchPattern("100%"), "%100\\%%");
  // Backslash is ILIKE's escape character, so it has to be escaped first or
  // escaping the wildcard after it would be undone.
  assert.equal(searchPattern("a\\"), "%a\\\\%");
  assert.equal(searchPattern("\\%"), "%\\\\\\%%");
});

test("an ordinary search is wrapped in wildcards and trimmed", () => {
  assert.equal(searchPattern("  Harper "), "%Harper%");
  assert.equal(searchPattern("ana@studio.com"), "%ana@studio.com%");
});

test("a search is bounded, so a giant query cannot be posted at the database", () => {
  const long = searchPattern("x".repeat(500));
  assert.equal(long, `%${"x".repeat(120)}%`);
});

/* ── Keyset cursor ── */

test("a cursor round-trips", () => {
  const cursor = formatStudioCursor("2026-07-26T14:03:22.123456Z", 42);
  assert.deepEqual(parseStudioCursor(cursor), {
    at: "2026-07-26T14:03:22.123456Z",
    id: 42,
  });
});

test("only a cursor this module produced is accepted", () => {
  assert.equal(parseStudioCursor(undefined), null);
  assert.equal(parseStudioCursor(null), null);
  assert.equal(parseStudioCursor(""), null);
  assert.equal(parseStudioCursor("42"), null);
  assert.equal(parseStudioCursor("|42"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22.123456Z|"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22.123456Z|abc"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22.123456Z|0"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22.123456Z|-1"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22.123456Z|1.5"), null);
  // A timestamp Postgres could not parse must not reach a ::timestamptz cast,
  // where it would be a 500 rather than "start from the beginning".
  assert.equal(parseStudioCursor("yesterday|1"), null);
  assert.equal(parseStudioCursor("2026-07-26 14:03:22.123456Z|1"), null);
  assert.equal(parseStudioCursor("2026-07-26T14:03:22Z|1"), null);
});

test("the cursor keeps sub-millisecond precision", () => {
  // The whole reason the timestamp travels as text: a Date would truncate to
  // milliseconds, and a truncated cursor sorts *after* the row it came from,
  // silently dropping whatever fell between the two.
  const parsed = parseStudioCursor("2026-07-26T14:03:22.000401Z|9");
  assert.equal(parsed?.at, "2026-07-26T14:03:22.000401Z");
  assert.notEqual(parsed?.at, new Date("2026-07-26T14:03:22.000401Z").toISOString());
});

/* ── Who counts as one end-client ── */

test("email identifies a client when there is one", () => {
  assert.equal(clientKey("Ana Ruiz", "ana@x.com"), "ana@x.com");
  // A client who changes their name between the enquiry and the wedding is
  // still one client.
  assert.equal(clientKey("Ana Ruiz-Bell", "ana@x.com"), "ana@x.com");
});

test("the client key folds case and trims, on both sides", () => {
  assert.equal(clientKey("Ana Ruiz", "  Ana@X.com "), "ana@x.com");
  assert.equal(clientKey("  Ana Ruiz  ", null), "ana ruiz");
  assert.equal(clientKey("ANA RUIZ", ""), "ana ruiz");
  assert.equal(clientKey("Ana Ruiz", undefined), "ana ruiz");
});

test("the TypeScript and SQL client keys are the same rule", () => {
  // The count above the client table comes from SQL and the rows come from SQL,
  // but anything computing a key in JS has to agree with them or the two
  // disagree in a way nobody notices until a customer asks.
  assert.match(
    source,
    /COALESCE\(NULLIF\(lower\(trim\(client_email\)\), ''\), lower\(trim\(client_name\)\)\)/,
  );
});

/* ── Rule 2: an operator cannot alter a signed record ──
   These read the source rather than a database, because the guarantee is
   structural: if no statement in this file names those tables in a write, there
   is no code path to audit. */

test("admin.ts writes to exactly two tables", () => {
  const writes = [...sql.matchAll(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+([a-z_."]+)/g)].map(
    (m) => m[1]!,
  );
  assert.deepEqual([...new Set(writes)].sort(), ["admin_event", "studio"]);
});

test("nothing here can touch the record a client signed", () => {
  for (const table of ["cue", "cue_party", "cue_event"]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`\\b(?:UPDATE|DELETE FROM)\\s+${table}\\b`),
      `admin.ts must never write to ${table}`,
    );
  }
});

test("signature evidence and the share token never leave the database", () => {
  // signature_png is selected only inside an IS NOT NULL test. The image
  // itself, the IP hash, the user agent and — most of all — the bearer token
  // that would let an operator open a live signing link are never read.
  assert.doesNotMatch(sql, /signature_png(?!\s+IS NOT NULL)/);
  assert.doesNotMatch(sql, /\bip_hash\b/);
  assert.doesNotMatch(sql, /\buser_agent\b/);
  assert.doesNotMatch(sql, /\bshare_token\b/);
});

test("shoot_date is read through to_char, never as a Date", () => {
  // Same invariant as cue-db.ts: node-postgres parses a `date` at local
  // midnight, so .toISOString() names the previous day west of UTC — which is
  // every US photographer this product is for.
  const reads = sql.replace(/\bAS shoot_date\b/g, "");
  const mentions = [...reads.matchAll(/shoot_date/g)].length;
  const viaToChar = [...reads.matchAll(/to_char\(c?\.?shoot_date, 'YYYY-MM-DD'\)/g)].length;
  assert.ok(mentions > 0, "no shoot_date read to check");
  assert.equal(viaToChar, mentions, "every shoot_date read must go through to_char");
});

/* ── Rule 3: the audit trail ── */

test("every admin action is recordable", () => {
  assert.ok(ADMIN_ACTIONS.length > 0);
  for (const action of ADMIN_ACTIONS) {
    assert.match(action, /^studio\.[a-z]+$/);
  }
});

test("admin_event is append-only in the database, including DELETE", () => {
  assert.match(migration008, /BEFORE UPDATE OR DELETE ON admin_event/);
  assert.match(migration008, /CREATE TABLE IF NOT EXISTS admin_event/);
});

test("admin_event carries no foreign keys", () => {
  // Deliberate. A SET NULL cascade issues an UPDATE, and the append-only
  // trigger refuses UPDATEs — a foreign key to cue would make deleting a draft
  // raise for any Cue an operator had ever touched.
  const body = migration008.slice(
    migration008.indexOf("CREATE TABLE IF NOT EXISTS admin_event"),
  );
  assert.doesNotMatch(body.slice(0, body.indexOf(");")), /REFERENCES/);
});

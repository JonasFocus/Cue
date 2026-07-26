import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entryStamp,
  generateCode,
  groupReleases,
  normaliseRef,
  parseChangelogDraft,
  parseChangelogPatch,
  releaseDate,
  type ChangeEntry,
} from "./changelog.ts";

/* ── Drafts ── */

test("a draft needs only a kind, a title and a version", () => {
  const parsed = parseChangelogDraft({
    kind: "feature",
    title: "  Added dark mode support  ",
    version: "2.4.0",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.fields.title, "Added dark mode support");
  assert.equal(parsed.fields.ref, null);
  assert.match(parsed.fields.code, /^[0-9a-f]{7}$/, "code is generated when absent");
});

test("a supplied code wins over the generated one", () => {
  const parsed = parseChangelogDraft({
    kind: "fix",
    title: "Fixed layout shift",
    version: "2.4.0",
    code: " a1b2c3d ",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.fields.code, "a1b2c3d");
});

test("a draft rejects a bad kind, a blank title and an over-long one", () => {
  const base = { kind: "feature", title: "ok", version: "2.4.0" };

  for (const [body, error] of [
    [{ ...base, kind: "chore" }, "invalid kind"],
    [{ ...base, kind: undefined }, "invalid kind"],
    [{ ...base, title: "   " }, "title is required"],
    [{ ...base, title: "x".repeat(161) }, "title must be 160 characters or fewer"],
    [{ ...base, version: "" }, "version is required"],
    [{ ...base, code: "x".repeat(13) }, "code must be 12 characters or fewer"],
    [{ ...base, ref: "1234567890123" }, "ref must be 12 characters or fewer"],
  ] as const) {
    const parsed = parseChangelogDraft(body);
    assert.equal(parsed.ok, false, JSON.stringify(body));
    if (!parsed.ok) assert.equal(parsed.error, error);
  }
});

test("a title is rejected rather than truncated at the limit", () => {
  const parsed = parseChangelogDraft({
    kind: "feature",
    title: "x".repeat(160),
    version: "2.4.0",
  });
  assert.equal(parsed.ok, true, "160 is inside the bound");
  if (!parsed.ok) return;
  assert.equal(parsed.fields.title.length, 160);
});

/* ── Refs ── */

test("both '#420' and '420' store as '420'", () => {
  assert.equal(normaliseRef("#420"), "420");
  assert.equal(normaliseRef(" 420 "), "420");
  assert.equal(normaliseRef("##420"), "420");
  assert.equal(normaliseRef(""), null);
  assert.equal(normaliseRef("#"), null);
  assert.equal(normaliseRef(undefined), null);
});

/* ── Patches ── */

test("a patch writes only the fields it names", () => {
  const parsed = parseChangelogPatch({ id: 7, kind: "breaking" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.id, 7);
  assert.deepEqual(parsed.fields, { kind: "breaking" });
});

test("a patch can clear a ref but not blank a title", () => {
  const cleared = parseChangelogPatch({ id: 7, ref: "" });
  assert.equal(cleared.ok, true);
  if (cleared.ok) assert.deepEqual(cleared.fields, { ref: null });

  const blanked = parseChangelogPatch({ id: 7, title: "  " });
  assert.equal(blanked.ok, false);
  if (!blanked.ok) assert.equal(blanked.error, "title is required");
});

test("a patch rejects a bad id and a body with nothing to write", () => {
  for (const [body, error] of [
    [{ id: 0, title: "x" }, "invalid id"],
    [{ id: -1, title: "x" }, "invalid id"],
    [{ id: 1.5, title: "x" }, "invalid id"],
    [{ id: "7", title: "x" }, "invalid id"],
    [{ id: 7 }, "nothing to update"],
    [{ id: 7, unknown: "x" }, "nothing to update"],
    [{ id: 7, kind: "chore" }, "invalid kind"],
  ] as const) {
    const parsed = parseChangelogPatch(body);
    assert.equal(parsed.ok, false, JSON.stringify(body));
    if (!parsed.ok) assert.equal(parsed.error, error);
  }
});

/* ── Central time ──
   The operator is US Central and the browser may not be, so these must not
   follow the host zone. 2026-03-15T02:30:00Z is still 14 March in Chicago. */

test("timestamps render in Central time, not the host zone", () => {
  assert.equal(releaseDate("2026-03-15T02:30:00.000Z"), "March 14, 2026");
  assert.equal(releaseDate("2026-03-15T18:00:00.000Z"), "March 15, 2026");
  assert.equal(entryStamp("2026-03-15T20:04:00.000Z"), "Mar 15, 3:04 PM CT");
});

test("the code generator produces a distinct seven-hex-character code", () => {
  const codes = new Set(Array.from({ length: 200 }, generateCode));
  assert.equal(codes.size, 200, "200 codes should not collide");
  for (const code of codes) assert.match(code, /^[0-9a-f]{7}$/);
});

/* ── Grouping ── */

const entry = (
  id: number,
  version: string,
  kind: ChangeEntry["kind"],
  createdAt: string,
): ChangeEntry => ({
  id,
  code: `c${id}`,
  version,
  kind,
  title: `entry ${id}`,
  ref: null,
  createdAt,
});

test("groupReleases folds a newest-first list into releases and types", () => {
  const releases = groupReleases([
    entry(5, "2.4.0", "fix", "2026-03-15T18:00:00.000Z"),
    entry(4, "2.4.0", "feature", "2026-03-15T17:00:00.000Z"),
    entry(3, "2.4.0", "fix", "2026-03-14T17:00:00.000Z"),
    entry(2, "2.3.5", "breaking", "2026-02-28T17:00:00.000Z"),
    entry(1, "2.3.5", "fix", "2026-02-27T17:00:00.000Z"),
  ]);

  assert.deepEqual(
    releases.map((r) => r.version),
    ["2.4.0", "2.3.5"],
    "version order follows first appearance, so newest heads the page",
  );

  assert.equal(
    releases[0]!.date,
    "March 15, 2026",
    "a release is dated by its newest entry, not its oldest",
  );

  assert.deepEqual(
    releases[0]!.groups.map((g) => g.kind),
    ["feature", "fix"],
    "features come before fixes regardless of insert order",
  );

  assert.deepEqual(
    releases[0]!.groups.find((g) => g.kind === "fix")!.entries.map((e) => e.id),
    [5, 3],
    "entries keep the newest-first order they arrived in",
  );

  assert.deepEqual(
    releases[1]!.groups.map((g) => g.kind),
    ["fix", "breaking"],
    "breaking changes come last",
  );
});

test("groupReleases handles an empty list and a single entry", () => {
  assert.deepEqual(groupReleases([]), []);

  const [only] = groupReleases([entry(1, "0.1.0", "feature", "2026-07-25T15:00:00.000Z")]);
  assert.equal(only!.version, "0.1.0");
  assert.equal(only!.date, "July 25, 2026");
  assert.equal(only!.groups.length, 1);
});

test("a version string that sorts badly as text still lands newest-first", () => {
  const releases = groupReleases([
    entry(2, "2.10.0", "feature", "2026-05-01T17:00:00.000Z"),
    entry(1, "2.4.0", "feature", "2026-03-15T17:00:00.000Z"),
  ]);

  assert.deepEqual(
    releases.map((r) => r.version),
    ["2.10.0", "2.4.0"],
    "2.10.0 sorts below 2.4.0 as text — arrival order is what saves it",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../db/migrations/011_record_integrity.sql", import.meta.url),
  "utf8",
);
const cueDb = readFileSync(new URL("./cue-db.ts", import.meta.url), "utf8");
const studioActions = readFileSync(
  new URL("../app/console/studios/actions.ts", import.meta.url),
  "utf8",
);
const inviteActions = readFileSync(
  new URL("../app/console/invites/actions.ts", import.meta.url),
  "utf8",
);

test("sent Cue content and party identity are database invariants", () => {
  assert.match(migration, /CREATE TRIGGER cue_record_no_rewrite/);
  assert.match(migration, /sent Cue content is immutable/);
  assert.match(migration, /CREATE TRIGGER cue_party_record_no_rewrite/);
  assert.match(migration, /sent Cue parties are immutable/);
  assert.match(migration, /a party cannot move between Cues/);
  assert.match(migration, /signature evidence may be written exactly once/);
  assert.match(migration, /FROM cue WHERE id = target_cue_id FOR UPDATE/);
  assert.match(migration, /a sent Cue requires its frozen record and share token/);
  assert.match(migration, /a signed Cue requires a seal and every signature/);
});

test("audit events cannot disappear with a sent record", () => {
  assert.match(migration, /FOREIGN KEY \(cue_id\) REFERENCES cue\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON cue_event/);
  assert.match(cueDb, /DELETE FROM cue_event WHERE cue_id = \$1/);
  assert.match(cueDb, /DELETE FROM cue WHERE studio_id = \$1 AND id = \$2 AND status = 'draft'/);
});

test("party changes and sending serialize on the Cue row", () => {
  for (const name of ["addParty", "removeParty", "sendCue"]) {
    const start = cueDb.indexOf(`export async function ${name}`);
    const end = cueDb.indexOf("\nexport ", start + 1);
    const body = cueDb.slice(start, end < 0 ? undefined : end);
    assert.match(body, /FROM cue[\s\S]*FOR UPDATE/, `${name} does not lock the Cue`);
  }
  assert.match(cueDb, /FROM cue_party WHERE cue_id = \$1 ORDER BY sort_order, id/);
});

test("browser refreshes are coalesced durably", () => {
  assert.match(cueDb, /kind = 'viewed'/);
  assert.match(cueDb, /created_at >= now\(\) - interval '5 minutes'/);
});

test("operator mutations and their audit writes share transactions", () => {
  for (const source of [studioActions, inviteActions]) {
    assert.match(source, /withDatabaseTransaction/);
    assert.match(source, /recordAdminEvent\([\s\S]*?client\)/);
  }
});

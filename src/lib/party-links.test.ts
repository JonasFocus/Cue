import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const db = readFileSync(resolve(root, "src/lib/cue-db.ts"), "utf8");
const actions = readFileSync(resolve(root, "src/app/s/[token]/actions.ts"), "utf8");
const migration = readFileSync(resolve(root, "db/migrations/012_party_signing_links.sql"), "utf8");

test("public signing credentials are issued per party and resolve to one party", () => {
  assert.match(db, /const partyTokens = new Map/);
  assert.match(db, /signing_party\.share_token = \$1/);
  assert.match(db, /publicPartyId: Number\(row\.public_party_id\)/);
});

test("the signing action ignores a forged party form value", () => {
  assert.match(actions, /p\.id === found\.publicPartyId/);
  assert.doesNotMatch(actions, /Number\(formData\.get\("party"\)\)/);
});

test("party credentials are unique, revocable but never replaceable after send", () => {
  assert.match(migration, /cue_party_share_token_unique/);
  assert.match(
    migration,
    /OLD\.share_token IS NOT NULL AND NEW\.share_token IS NOT NULL AND NEW\.share_token IS DISTINCT FROM OLD\.share_token/,
  );
  assert.match(migration, /a sent Cue party signing link can be revoked but not replaced/);
});

test("voiding revokes every party signing link", () => {
  assert.match(db, /UPDATE cue_party SET share_token = NULL WHERE cue_id = \$1/);
});

test("the migration backfills fresh tokens for legacy additional signers", () => {
  assert.match(migration, /gen_random_bytes\(16\)/);
  assert.match(migration, /p\.role = 'additional'/);
});

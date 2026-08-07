import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import {
  canonicalise,
  hasBlanks,
  renderAgreement,
  type Snapshot,
  type StudioIdentity,
  type Vars,
} from "./agreement";
import {
  canSend,
  canTransition,
  permittedPatch,
  signatureMethod,
  SHARE_TOKEN_BYTES,
  type CueStatus,
  type EventKind,
  type PartyRole,
  type Plan,
} from "./cue";
import { templateBySlug } from "./templates";
import type { Studio } from "./studio";

/* Data access for the application. Rules live in cue.ts and agreement.ts, which
   are pure; this file is the I/O that applies them. Anything that decides what
   a creator may do belongs there, not here — but every write path is expected
   to *call* it, and the ones that must be atomic run in a transaction below. */

/* `shoot_date` is a real `date` column, but it is always read back through
   to_char. node-postgres parses a date into a JS Date at local midnight, and
   .toISOString() on that prints the previous day for every timezone west of
   UTC — which is every US photographer this product is for. A contract that
   names the wrong day is not a formatting bug. to_char rather than ::text
   because ::text answers to the session DateStyle and to_char does not. */
const CUE_COLUMNS = `id, studio_id, template_slug, title, client_name, client_email,
                     to_char(shoot_date, 'YYYY-MM-DD') AS shoot_date,
                     location, vars, omitted_clauses, notes, status, share_token,
                     doc_hash, created_at, sent_at, opened_at, sealed_at,
                     -- Keep the database's microsecond precision for accurate
                     -- ordering and display; a JS Date would truncate it.
                     to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

type CueRow = {
  id: string;
  studio_id: string;
  template_slug: string;
  title: string;
  client_name: string;
  client_email: string | null;
  shoot_date: string | null;
  location: string | null;
  vars: Vars;
  omitted_clauses: string[];
  notes: string | null;
  status: CueStatus;
  share_token: string | null;
  doc_hash: string | null;
  created_at: Date;
  updated_at: string;
  sent_at: Date | null;
  opened_at: Date | null;
  sealed_at: Date | null;
};

export type Cue = {
  id: number;
  studioId: number;
  templateSlug: string;
  title: string;
  clientName: string;
  clientEmail: string | null;
  shootDate: string | null;
  location: string | null;
  vars: Vars;
  omittedClauses: string[];
  notes: string | null;
  status: CueStatus;
  shareToken: string | null;
  docHash: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  openedAt: string | null;
  sealedAt: string | null;
};

function toCue(row: CueRow): Cue {
  return {
    id: Number(row.id),
    studioId: Number(row.studio_id),
    templateSlug: row.template_slug,
    title: row.title,
    clientName: row.client_name,
    clientEmail: row.client_email,
    shootDate: row.shoot_date,
    location: row.location,
    vars: row.vars ?? {},
    omittedClauses: row.omitted_clauses ?? [],
    notes: row.notes,
    status: row.status,
    shareToken: row.share_token,
    docHash: row.doc_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at,
    sentAt: row.sent_at?.toISOString() ?? null,
    openedAt: row.opened_at?.toISOString() ?? null,
    sealedAt: row.sealed_at?.toISOString() ?? null,
  };
}

export type Party = {
  id: number;
  cueId: number;
  role: PartyRole;
  name: string;
  email: string | null;
  shareToken: string | null;
  sortOrder: number;
  typedName: string | null;
  signaturePng: string | null;
  consentAt: string | null;
  signedAt: string | null;
};

const PARTY_COLUMNS = `id, cue_id, role, name, email, share_token, sort_order, typed_name,
                       signature_png, consent_at, signed_at`;

type PartyRow = {
  id: string;
  cue_id: string;
  role: PartyRole;
  name: string;
  email: string | null;
  share_token: string | null;
  sort_order: number;
  typed_name: string | null;
  signature_png: string | null;
  consent_at: Date | null;
  signed_at: Date | null;
};

function toParty(row: PartyRow): Party {
  return {
    id: Number(row.id),
    cueId: Number(row.cue_id),
    role: row.role,
    name: row.name,
    email: row.email,
    shareToken: row.share_token,
    sortOrder: row.sort_order,
    typedName: row.typed_name,
    signaturePng: row.signature_png,
    consentAt: row.consent_at?.toISOString() ?? null,
    signedAt: row.signed_at?.toISOString() ?? null,
  };
}

export type CueEvent = {
  id: number;
  kind: EventKind;
  partyId: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/* ── Reads ── */

export type CueSummary = Pick<
  Cue,
  "id" | "title" | "clientName" | "shootDate" | "status" | "templateSlug" | "updatedAt"
>;

/* `status` takes a group as readily as a single value, because the workspace
   filters by group ("Awaiting" is sent + opened + partially_signed). Filtering
   a group in memory instead would silently drop rows past the LIMIT — the cap
   would apply before the filter, so a busy studio's oldest awaiting Cue would
   vanish from the one screen meant to chase it. */
export async function listCues(
  studioId: number,
  opts: { status?: CueStatus | readonly CueStatus[]; query?: string; limit?: number } = {},
): Promise<CueSummary[]> {
  const values: unknown[] = [studioId, Math.min(opts.limit ?? 100, 200)];
  let where = "studio_id = $1";

  const statuses = opts.status === undefined ? [] : [opts.status].flat();
  if (statuses.length) {
    values.push(statuses);
    where += ` AND status = ANY($${values.length}::text[])`;
  }
  if (opts.query?.trim()) {
    values.push(`%${opts.query.trim()}%`);
    // ponytail: ILIKE over two columns, no index, no tsvector. The workspace is
    // one creator's own Cues — hundreds, not millions. Add a trigram index the
    // day a studio has enough of them to notice.
    where += ` AND (title ILIKE $${values.length} OR client_name ILIKE $${values.length})`;
  }

  const { rows } = await pool.query<CueRow>(
    `SELECT ${CUE_COLUMNS} FROM cue WHERE ${where} ORDER BY created_at DESC LIMIT $2`,
    values,
  );
  return rows.map(toCue);
}

export async function countByStatus(studioId: number): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ status: CueStatus; n: string }>(
    `SELECT status, count(*)::text AS n FROM cue WHERE studio_id = $1 GROUP BY status`,
    [studioId],
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

/* Always scoped by studio_id, never by id alone. An authorisation check that
   lives in the WHERE clause cannot be forgotten by a caller. */
export async function getCue(studioId: number, id: number): Promise<Cue | null> {
  const { rows } = await pool.query<CueRow>(
    `SELECT ${CUE_COLUMNS} FROM cue WHERE studio_id = $1 AND id = $2`,
    [studioId, id],
  );
  return rows[0] ? toCue(rows[0]) : null;
}

/* jsonb comes back as `any` in all but name, and `version: 1` was being written
   and never read. That is fine while `renderAgreement` is the only writer — and
   stops being fine the first time the shape changes, because a v1 row reaching a
   v2 renderer throws inside a Server Component. The blast radius is the worst
   available: /s/[token] is the client's only view of a contract they may already
   have signed, and an exception there is a 500 with no fallback.
   Returning null instead lands on the "no longer open for signing" page, which
   both callers already handle. Add the `version === 2` branch when there is one. */
function readSnapshot(value: unknown): Snapshot | null {
  const snapshot = value as Snapshot | null;
  if (!snapshot || snapshot.version !== 1) return null;
  return Array.isArray(snapshot.document?.clauses) ? snapshot : null;
}

/* The frozen document, for the creator's own record page. Kept off `Cue` on
   purpose: the snapshot is the largest column in the table and the workspace
   list would carry one per row for nothing. Scoped by studio_id like every
   other read here, so authorisation lives in the WHERE clause. */
export async function getSnapshot(studioId: number, id: number): Promise<Snapshot | null> {
  const { rows } = await pool.query<{ snapshot: unknown }>(
    `SELECT snapshot FROM cue WHERE studio_id = $1 AND id = $2`,
    [studioId, id],
  );
  return readSnapshot(rows[0]?.snapshot);
}

export async function getParties(cueId: number): Promise<Party[]> {
  const { rows } = await pool.query<PartyRow>(
    `SELECT ${PARTY_COLUMNS} FROM cue_party WHERE cue_id = $1 ORDER BY sort_order, id`,
    [cueId],
  );
  return rows.map(toParty);
}

export async function getEvents(cueId: number): Promise<CueEvent[]> {
  const { rows } = await pool.query<{
    id: string;
    kind: EventKind;
    party_id: string | null;
    meta: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, kind, party_id, meta, created_at FROM cue_event
      WHERE cue_id = $1 ORDER BY created_at, id`,
    [cueId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    partyId: r.party_id ? Number(r.party_id) : null,
    meta: r.meta,
    createdAt: r.created_at.toISOString(),
  }));
}

/* Qualified copy of CUE_COLUMNS for the one query that joins. Spelled out
   rather than derived from the unqualified list, because deriving it means a
   regex over SQL and that is worse than eleven repeated words. */
const CUE_COLUMNS_C = `c.id, c.studio_id, c.template_slug, c.title, c.client_name,
                       c.client_email, to_char(c.shoot_date, 'YYYY-MM-DD') AS shoot_date,
                       c.location, c.vars, c.omitted_clauses, c.notes, c.status,
                       c.share_token, c.doc_hash, c.created_at,
                       c.sent_at, c.opened_at, c.sealed_at,
                       to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

/** The signing page's only read. Returns the frozen snapshot, never a template. */
export async function getCueByToken(
  token: string,
): Promise<{
  cue: Cue;
  snapshot: Snapshot;
  parties: Party[];
  /** The sole party the bearer credential authorises. */
  publicPartyId: number;
  studio: Pick<Studio, "name" | "legalName" | "email" | "brandColor">;
} | null> {
  const { rows } = await pool.query<
    CueRow & {
      snapshot: Snapshot | null;
      public_party_id: string;
      s_name: string;
      s_legal_name: string | null;
      s_email: string | null;
      s_brand_color: string | null;
    }
  >(
    `SELECT ${CUE_COLUMNS_C},
            c.snapshot,
            signing_party.id AS public_party_id,
            s.name         AS s_name,
            s.legal_name   AS s_legal_name,
            s.email        AS s_email,
            s.brand_color  AS s_brand_color
       FROM cue c
       JOIN studio s ON s.id = c.studio_id
      JOIN cue_party signing_party ON signing_party.cue_id = c.id
      WHERE signing_party.share_token = $1
         /* A Cue sent by pre-012 code carries only the cue-level token. Accept
            it for the client line alone — the same line it always signed — so
            no shared link ever reaches another party's row. */
         OR (c.share_token = $1 AND signing_party.role = 'client')
      ORDER BY (signing_party.share_token = $1) DESC NULLS LAST
      LIMIT 1`,
    [token],
  );

  const row = rows[0];
  // A row with no snapshot means the token was issued without the send
  // transaction completing, which cannot happen — but a signing page that
  // renders a half-built document is worse than a 404. `readSnapshot` extends
  // the same reasoning from "absent" to "not a shape this build can render".
  const snapshot = row ? readSnapshot(row.snapshot) : null;
  if (!row || !snapshot) return null;

  return {
    cue: toCue(row),
    snapshot,
    parties: await getParties(Number(row.id)),
    publicPartyId: Number(row.public_party_id),
    studio: {
      name: row.s_name,
      legalName: row.s_legal_name,
      email: row.s_email,
      brandColor: row.s_brand_color,
    },
  };
}

/* ── Writes ── */

export async function createCue(
  studioId: number,
  input: { templateSlug: string; title: string; clientName: string; clientEmail?: string | null },
): Promise<Cue> {
  const template = templateBySlug(input.templateSlug);
  if (!template) throw new Error(`unknown template: ${input.templateSlug}`);

  return withTransaction(async (client) => {
    const { rows } = await client.query<CueRow>(
      `INSERT INTO cue (studio_id, template_slug, title, client_name, client_email, vars)
            VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${CUE_COLUMNS}`,
      [
        studioId,
        template.slug,
        input.title,
        input.clientName,
        input.clientEmail || null,
        JSON.stringify(defaultsFor(template.slug)),
      ],
    );
    const cue = toCue(rows[0]!);

    // The client is a party from the moment the Cue exists — they are the one
    // person who is always signing.
    await client.query(
      `INSERT INTO cue_party (cue_id, role, name, email, sort_order)
            VALUES ($1, 'client', $2, $3, 0)`,
      [cue.id, input.clientName || "Client", input.clientEmail || null],
    );

    await logEvent(client, cue.id, "created", {});
    return cue;
  });
}

function defaultsFor(slug: string): Vars {
  const template = templateBySlug(slug);
  if (!template) return {};
  const vars: Vars = {};
  for (const q of template.questions) if (q.default !== undefined) vars[q.key] = q.default;
  return vars;
}

export type CuePatch = Partial<{
  title: string;
  client_name: string;
  client_email: string | null;
  shoot_date: string | null;
  location: string | null;
  vars: Vars;
  omitted_clauses: string[];
  notes: string | null;
}>;

/* Column names come from this literal tuple, never from the keys of the
   submitted patch — the same rule as updateChangelogEntry in db.ts. */
const CUE_PATCH_COLUMNS = [
  "title",
  "client_name",
  "client_email",
  "shoot_date",
  "location",
  "vars",
  "omitted_clauses",
  "notes",
] as const;

/**
 * Applies the subset of `patch` the Cue's current status permits.
 *
 * Two gates, and both are needed. `permittedPatch` decides what a creator may
 * change (the rule, tested in cue.test.ts); the `status = 'draft'` predicate in
 * the SQL below decides whether the row is still what we think it is. Without
 * the second one, a Cue sent from another tab between the read and the write
 * would accept an edit to a document a client is already reading.
 */
export async function updateCue(
  studioId: number,
  id: number,
  patch: CuePatch,
): Promise<Cue | null> {
  const current = await getCue(studioId, id);
  if (!current) return null;

  const allowed = permittedPatch(patch as Record<string, unknown>, current.status);
  if (!Object.keys(allowed).length) return current;

  const assignments: string[] = [];
  const values: unknown[] = [studioId, id];

  for (const column of CUE_PATCH_COLUMNS) {
    if (!(column in allowed)) continue;
    values.push(column === "vars" ? JSON.stringify(allowed[column]) : allowed[column]);
    assignments.push(`${column} = $${values.length}`);
  }

  // After draft, `permittedPatch` can only have left `notes` — internal, never
  // part of the document — so no draft predicate applies. Before that, every
  // field is content and the predicate is mandatory.
  const guard = current.status === "draft" ? "AND status = 'draft'" : "";
  const syncClientParty =
    current.status === "draft" &&
    ("client_name" in allowed || "client_email" in allowed);

  /* Client identity lives on both `cue` (document tokens) and the client
     `cue_party` row (signing UI / snapshot.parties). Those two writes have to
     land together or a rename mid-draft freezes a mismatched record at send. */
  if (syncClientParty) {
    return withTransaction(async (client) => {
      const { rows } = await client.query<CueRow>(
        `UPDATE cue SET ${assignments.join(", ")}
          WHERE studio_id = $1 AND id = $2 ${guard}
          RETURNING ${CUE_COLUMNS}`,
        values,
      );
      if (!rows[0]) return getCue(studioId, id);

      const cue = toCue(rows[0]);
      // Same fallback as createCue: a blank name still needs a party label the
      // signing UI can render.
      await client.query(
        `UPDATE cue_party SET name = $2, email = $3
          WHERE cue_id = $1 AND role = 'client'`,
        [cue.id, cue.clientName || "Client", cue.clientEmail],
      );
      return cue;
    });
  }

  const { rows } = await pool.query<CueRow>(
    `UPDATE cue SET ${assignments.join(", ")}
      WHERE studio_id = $1 AND id = $2 ${guard}
      RETURNING ${CUE_COLUMNS}`,
    values,
  );

  // Zero rows means the guard fired: the Cue was sent underneath us. Report the
  // row as it actually is rather than pretending the edit landed.
  return rows[0] ? toCue(rows[0]) : getCue(studioId, id);
}

export async function deleteCue(studioId: number, id: number): Promise<boolean> {
  // Drafts only. A sent Cue is a record somebody may have read; voiding is the
  // remedy, and it keeps the audit trail.
  return withTransaction(async (client) => {
    const { rowCount: cueCount } = await client.query(
      `SELECT id FROM cue
        WHERE studio_id = $1 AND id = $2 AND status = 'draft'
        FOR UPDATE`,
      [studioId, id],
    );
    if (cueCount !== 1) return false;

    // Migration 011 makes the event FK restrictive so a signed trail cannot
    // disappear through a cascade. A draft's created event is removed explicitly.
    await client.query(`DELETE FROM cue_event WHERE cue_id = $1`, [id]);
    const { rowCount } = await client.query(
      `DELETE FROM cue WHERE studio_id = $1 AND id = $2 AND status = 'draft'`,
      [studioId, id],
    );
    return rowCount === 1;
  });
}

/* ── Parties ── */

/* The `EXISTS` is both the authorisation and the freeze check, in the same
   statement as the write — the rule this file states at `getCue` and that
   `removeParty` below already follows.

   It was a read-then-write, and the gap was reachable from two tabs: read the
   status as `draft`, have the other tab send in between, and the INSERT still
   landed. `getCueByToken` serves parties LIVE rather than from the snapshot, so
   the new signer appeared on the signing page and could sign — producing a
   sealed record whose signature block names somebody the frozen document does
   not list as a party, with a `doc_hash` that still verifies. A signed legal
   record whose text and signatures disagree is the worst thing this product
   can produce. */
export async function addParty(
  studioId: number,
  cueId: number,
  input: { role: PartyRole; name: string; email?: string | null },
): Promise<Party | null> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `SELECT id FROM cue
        WHERE id = $1 AND studio_id = $2 AND status = 'draft'
        FOR UPDATE`,
      [cueId, studioId],
    );
    if (rowCount !== 1) return null;

    const { rows } = await client.query<PartyRow>(
      `INSERT INTO cue_party (cue_id, role, name, email, sort_order)
            VALUES ($1, $2, $3, $4,
                    COALESCE((SELECT max(sort_order) + 1 FROM cue_party WHERE cue_id = $1), 0))
         RETURNING ${PARTY_COLUMNS}`,
      [cueId, input.role, input.name, input.email || null],
    );
    return rows[0] ? toParty(rows[0]) : null;
  });
}

export async function removeParty(
  studioId: number,
  cueId: number,
  partyId: number,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rowCount: cueCount } = await client.query(
      `SELECT id FROM cue
        WHERE id = $1 AND studio_id = $2 AND status = 'draft'
        FOR UPDATE`,
      [cueId, studioId],
    );
    if (cueCount !== 1) return false;

    const { rowCount } = await client.query(
      `DELETE FROM cue_party
        WHERE cue_id = $1 AND id = $2
          -- The client is not removable; a Cue with nobody to sign it is not a Cue.
          AND role <> 'client'`,
      [cueId, partyId],
    );
    return rowCount === 1;
  });
}

/* ── Send ──
   Where the document stops being editable. Everything in one transaction: if
   the snapshot is written but the status is not, a client could open a link to
   a Cue the creator still believes is a draft. */

export type SendResult =
  | { ok: true; token: string }
  | { ok: false; error: "not_found" | "wrong_status" | "allowance" | "no_parties" | "has_blanks" };

export async function sendCue(studio: Studio, id: number): Promise<SendResult> {
  /* No allowance pre-check here on purpose. The transaction below reads plan
     and sent_count under `SELECT … FOR UPDATE`, which is the real check; a
     second one against `studio` as it looked when the request started can only
     ever be *wrong* — an operator upgrading a plan mid-request would make it
     tell a paying customer they had used their five free Cues. The only thing
     it saved was one `renderAgreement` call, and `hasBlanks` below already
     runs after that anyway. */

  return withTransaction(async (client) => {
    /* Lock the studio before touching the Cue. Two free-plan sends racing at
       sent_count = 4 would otherwise both read 4 and both increment, burning
       past FREE_SENT_ALLOWANCE. FOR UPDATE serialises them on the one row that
       holds the counter. */
    const { rows: studioRows } = await client.query<{ plan: Plan; sent_count: number }>(
      `SELECT plan, sent_count FROM studio WHERE id = $1 FOR UPDATE`,
      [studio.id],
    );
    const locked = studioRows[0];
    if (!locked) return { ok: false, error: "not_found" } as const;
    if (!canSend(locked.plan, locked.sent_count)) {
      return { ok: false, error: "allowance" } as const;
    }

    /* Every writer that can change the signer roster takes this same row lock.
       Read the Cue and parties only after it is held, so the snapshot and the
       live signature block are one atomic version of the agreement. */
    const { rows: cueRows } = await client.query<CueRow>(
      `SELECT ${CUE_COLUMNS} FROM cue
        WHERE studio_id = $1 AND id = $2
        FOR UPDATE`,
      [studio.id, id],
    );
    const cue = cueRows[0] ? toCue(cueRows[0]) : null;
    if (!cue) return { ok: false, error: "not_found" } as const;
    if (!canTransition(cue.status, "sent")) {
      return { ok: false, error: "wrong_status" } as const;
    }

    const template = templateBySlug(cue.templateSlug);
    if (!template) return { ok: false, error: "not_found" } as const;

    const { rows: partyRows } = await client.query<PartyRow>(
      `SELECT ${PARTY_COLUMNS} FROM cue_party
        WHERE cue_id = $1 ORDER BY sort_order, id`,
      [cue.id],
    );
    const parties = partyRows.map(toParty);
    if (!parties.length) return { ok: false, error: "no_parties" } as const;

    const identity: StudioIdentity = {
      name: studio.name,
      legalName: studio.legalName,
      email: studio.email,
      phone: studio.phone,
      address: studio.address,
    };
    const snapshot: Snapshot = {
      version: 1,
      document: renderAgreement(
        template,
        identity,
        {
          title: cue.title,
          clientName: cue.clientName,
          clientEmail: cue.clientEmail,
          shootDate: cue.shootDate,
          location: cue.location,
        },
        cue.vars,
        cue.omittedClauses,
      ),
      studio: identity,
      cue: {
        title: cue.title,
        clientName: cue.clientName,
        clientEmail: cue.clientEmail,
        shootDate: cue.shootDate,
        location: cue.location,
      },
      templateSlug: cue.templateSlug,
      parties: parties.map((p) => ({ name: p.name, email: p.email ?? "", role: p.role })),
    };
    if (hasBlanks(snapshot.document)) return { ok: false, error: "has_blanks" } as const;

    /* Each party receives a distinct bearer credential. The client token is
       mirrored to cue.share_token for compatibility with existing creator
       screens, but the public route always resolves the party token. */
    const partyTokens = new Map(
      parties.map((party) => [party.id, randomBytes(SHARE_TOKEN_BYTES).toString("base64url")]),
    );
    const clientParty = parties.find((party) => party.role === "client");
    const token = clientParty ? partyTokens.get(clientParty.id) : undefined;
    if (!token) return { ok: false, error: "no_parties" } as const;
    const docHash = createHash("sha256").update(canonicalise(snapshot)).digest("hex");

    // This is deliberately before the status transition: migration 012 makes
    // party credentials immutable once the Cue has been sent.
    for (const party of parties) {
      await client.query(
        `UPDATE cue_party SET share_token = $2 WHERE id = $1 AND cue_id = $3`,
        [party.id, partyTokens.get(party.id), cue.id],
      );
    }

    const { rowCount } = await client.query(
      `UPDATE cue
          SET status = 'sent', share_token = $3, snapshot = $4, doc_hash = $5, sent_at = now()
        WHERE studio_id = $1 AND id = $2 AND status = 'draft'`,
      [studio.id, id, token, JSON.stringify(snapshot), docHash],
    );
    if (rowCount !== 1) return { ok: false, error: "wrong_status" } as const;

    // Counted on send, never on create: a draft costs nothing, and a creator
    // exploring the builder must not burn their five free Cues doing it.
    await client.query(`UPDATE studio SET sent_count = sent_count + 1 WHERE id = $1`, [
      studio.id,
    ]);
    await logEvent(client, id, "sent", { docHash });

    return { ok: true, token } as const;
  });
}

export async function voidCue(studioId: number, id: number): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE cue SET status = 'voided', share_token = NULL
        WHERE studio_id = $1 AND id = $2
          AND status IN ('draft', 'sent', 'opened', 'partially_signed')`,
      [studioId, id],
    );
    if (rowCount !== 1) return false;
    /* A voided Cue must be unreachable by any link: the public route resolves
       cue_party.share_token, so revoke every party credential too. */
    await client.query(`UPDATE cue_party SET share_token = NULL WHERE cue_id = $1`, [id]);
    await logEvent(client, id, "voided", {});
    return true;
  });
}

/* ── The signing side ── */

/**
 * Records a visible browser view. The cue lock makes the first-open transition
 * exact, and repeat views are coalesced to one event per five-minute window.
 */
export async function markOpened(
  cueId: number,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ status: CueStatus }>(
      `SELECT status FROM cue WHERE id = $1 FOR UPDATE`,
      [cueId],
    );
    const status = rows[0]?.status;
    if (!status || !["sent", "opened", "partially_signed", "signed"].includes(status)) return;

    const { rowCount } = await client.query(
      `UPDATE cue SET status = 'opened', opened_at = now()
        WHERE id = $1 AND status = 'sent'`,
      [cueId],
    );
    if (rowCount === 1) {
      await logEvent(client, cueId, "opened", {}, meta);
      return;
    }

    await client.query(
      `INSERT INTO cue_event (cue_id, kind, ip_hash, user_agent, meta)
       SELECT $1, 'viewed', $2, $3, '{}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1
            FROM cue_event
           WHERE cue_id = $1
             AND kind = 'viewed'
             AND created_at >= now() - interval '5 minutes'
        )`,
      [cueId, meta.ipHash, meta.userAgent],
    );
  });
}

export type SignResult =
  | { ok: true; sealed: boolean }
  | { ok: false; error: "not_found" | "wrong_status" | "already_signed" };

/**
 * Records one party's signature, and seals the record when it is the last one.
 *
 * The whole thing is one transaction with the Cue row locked, because "is this
 * the last signature?" and "seal it" must not be separated: two parties signing
 * at the same moment would otherwise both read "one left" and neither would
 * seal.
 */
export async function signParty(
  cueId: number,
  partyId: number,
  input: {
    typedName: string;
    /** Optional: the typed name is the signature; a drawn mark is decoration. */
    signaturePng: string | null;
    ipHash: string | null;
    userAgent: string | null;
  },
): Promise<SignResult> {
  return withTransaction(async (client) => {
    const { rows: cueRows } = await client.query<{ status: CueStatus }>(
      `SELECT status FROM cue WHERE id = $1 FOR UPDATE`,
      [cueId],
    );
    const status = cueRows[0]?.status;
    if (!status) return { ok: false, error: "not_found" } as const;
    if (status !== "sent" && status !== "opened" && status !== "partially_signed") {
      return { ok: false, error: "wrong_status" } as const;
    }

    const { rowCount } = await client.query(
      `UPDATE cue_party
          SET typed_name = $3, signature_png = $4, consent_at = now(), signed_at = now(),
              ip_hash = $5, user_agent = $6
        WHERE id = $1 AND cue_id = $2 AND signed_at IS NULL`,
      [partyId, cueId, input.typedName, input.signaturePng, input.ipHash, input.userAgent],
    );
    if (rowCount !== 1) return { ok: false, error: "already_signed" } as const;

    const meta = { ipHash: input.ipHash, userAgent: input.userAgent };
    const method = signatureMethod(input.signaturePng);
    await logEvent(client, cueId, "consented", { name: input.typedName }, meta, partyId);
    await logEvent(client, cueId, "signed", { name: input.typedName, method }, meta, partyId);

    const { rows: pending } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM cue_party WHERE cue_id = $1 AND signed_at IS NULL`,
      [cueId],
    );
    const outstanding = Number(pending[0]?.n ?? 0);

    if (outstanding > 0) {
      await client.query(`UPDATE cue SET status = 'partially_signed' WHERE id = $1`, [cueId]);
      return { ok: true, sealed: false } as const;
    }

    await client.query(
      `UPDATE cue SET status = 'signed', sealed_at = now() WHERE id = $1`,
      [cueId],
    );
    await logEvent(client, cueId, "sealed", {});
    return { ok: true, sealed: true } as const;
  });
}

export async function declineCue(
  cueId: number,
  partyId: number,
  reason: string,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE cue SET status = 'declined'
        WHERE id = $1 AND status IN ('sent', 'opened', 'partially_signed')`,
      [cueId],
    );
    if (rowCount !== 1) return false;
    await logEvent(client, cueId, "declined", { reason }, meta, partyId);
    return true;
  });
}

/* ── Plumbing ── */

async function logEvent(
  client: PoolClient,
  cueId: number,
  kind: EventKind,
  meta: Record<string, unknown>,
  who: { ipHash: string | null; userAgent: string | null } = { ipHash: null, userAgent: null },
  partyId: number | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO cue_event (cue_id, party_id, kind, ip_hash, user_agent, meta)
          VALUES ($1, $2, $3, $4, $5, $6)`,
    [cueId, partyId, kind, who.ipHash, who.userAgent, JSON.stringify(meta)],
  );
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    // Rollback can itself fail if the connection died mid-transaction. Swallow
    // that one so the original error is what surfaces — it is the useful one.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

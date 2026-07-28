/* One statement, and the `.ts` is load-bearing: `isPlan` is a runtime import,
   and Node's test runner strips types but will not resolve an extensionless
   relative specifier. tsconfig turns allowImportingTsExtensions on for this. */
import {
  isPlan,
  type CueStatus,
  type EventKind,
  type PartyRole,
  type Plan,
} from "./cue.ts";
import type { Snapshot } from "./agreement";

/* The connection pool is imported on first query rather than at module load.
 *
 * admin.test.ts imports this file for its pure helpers — who counts as one
 * end-client, the ILIKE escaping, the keyset cursor — and Node's test runner
 * resolves the entire static import graph before it runs a line. A static
 * `import { pool } from "./db"` therefore drags in db.ts, waitlist.ts and
 * changelog.ts and builds a Postgres pool, all to check that a `%` typed into
 * a search box is escaped. Deferring it keeps the rules testable without a
 * database, which is the whole reason they live in src/lib.
 *
 * Cheap after the first call: an ES module is evaluated once and cached, so
 * this is a map lookup on every query but the first.
 *
 * It buys nothing at all for the browser, and must not be mistaken for a
 * boundary: the bundler follows a dynamic import() just as far as a static one,
 * so a client component importing anything from this module still drags pg in
 * and fails the build on `dns`/`fs`/`net`. That boundary is enforced by client
 * components importing from cue.ts instead — see the note on plans below. */
async function db() {
  return (await import("./db")).pool;
}

/* Data access for the operator's customer-management surface (/console/studios).
 *
 * Separate from db.ts (waitlist and changelog, the pre-launch ops surface) and
 * from cue-db.ts (the customer's own I/O, every statement scoped to one
 * studio_id). This file is the only place that reads *across* studios, which is
 * exactly why it is its own file: a query with no studio_id predicate belongs
 * somewhere you notice it.
 *
 * Two rules govern everything here.
 *
 * 1. Nothing in this file authorises anybody. Every caller gates on
 *    requireOperator() from studio.ts first. There is no "current studio" to
 *    derive, so there is no WHERE clause standing in for a permission check —
 *    the gate is the whole of the defence and it lives at the route.
 *
 * 2. There is no write path to a signed or sealed record, and there must never
 *    be one. Two functions write: `setStudioPlan` (one column, one table) and
 *    `recordAdminEvent` (append-only). Profile edits reuse `updateStudio` from
 *    studio.ts, whose literal column map is the allowlist. Nothing here can
 *    reach cue.snapshot, cue.doc_hash, cue_party signature evidence, or
 *    cue_event — not because a caller remembers not to, but because no
 *    statement in this file names those columns in an UPDATE.
 *
 * Everything read here is other people's data: studio names, their clients'
 * names and email addresses, shoot dates, locations. Nothing personal is ever
 * logged — error paths carry the message and an id, never a row.
 */

/* ── Plans ──
   `PLANS`, `PLAN_LABEL` and `isPlan` live in cue.ts, next to the `Plan` type
   and the free allowance, and this module deliberately does NOT re-export them.

   The re-export looked harmless and was not: cue.ts is pure, admin.ts reaches
   pg, and a client component reading the plan vocabulary "from admin" drags the
   Postgres driver into the browser bundle — which is exactly how `dns`, `fs` and
   `net` ended up unresolvable in a Turbopack build. Import the vocabulary from
   where it lives; import queries from here. */

/* ── Search ──
   `%` and `_` are wildcards to ILIKE and a bare `%` from the search box would
   quietly match every studio. Backslash is ILIKE's default escape character, so
   escaping it first keeps a literal backslash literal. Returns null for an
   empty query, which the SQL reads as "no filter". */
export function searchPattern(raw: string | undefined): string | null {
  const q = (raw ?? "").trim().slice(0, 120);
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/* ── Keyset cursor ──
   The list is ordered by last activity, so the cursor is the (timestamp, id)
   pair of the last row on the page — id alone would skip studios whose activity
   shares a timestamp, and a timestamp alone would repeat them.

   The timestamp travels as text at full microsecond precision rather than as
   epoch milliseconds: node-postgres parses timestamptz into a JS Date, which
   truncates to milliseconds, and a truncated cursor compares as *later* than
   the row it came from — which silently drops whatever sorted between them. */
export type StudioCursor = { at: string; id: number };

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/;

export function formatStudioCursor(at: string, id: number): string {
  return `${at}|${id}`;
}

/** Returns null for anything that is not a cursor this file produced. */
export function parseStudioCursor(raw: string | undefined | null): StudioCursor | null {
  if (!raw) return null;
  const split = raw.lastIndexOf("|");
  if (split <= 0) return null;
  const at = raw.slice(0, split);
  const id = Number(raw.slice(split + 1));
  if (!CURSOR_AT.test(at)) return null;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { at, id };
}

/* ── Who counts as one end-client ──

   A studio's client list is derived, not stored: there is no client table, only
   the name and email typed onto each Cue. So "how many distinct clients has
   this studio worked with" is entirely a question of what makes two Cues the
   same person, and the answer has to be identical in SQL and in TypeScript or
   the count above the table disagrees with the rows in it.

   Email wins when there is one — a person renaming themselves between a
   wedding enquiry and the wedding is one client. Otherwise the trimmed,
   lower-cased name. Both sides fold case, because `Ana@x.com` and `ana@x.com`
   are one inbox.

   The SQL below spells the same expression out as CLIENT_KEY_SQL. Change one
   and admin.test.ts fails. */
export function clientKey(name: string, email: string | null | undefined): string {
  const mail = (email ?? "").trim().toLowerCase();
  return mail || name.trim().toLowerCase();
}

const CLIENT_KEY_SQL = `COALESCE(NULLIF(lower(trim(client_email)), ''), lower(trim(client_name)))`;

/* ── Aggregates ── */

export type AdminOverview = {
  studios: number;
  /** Studios that have sent at least one Cue. The activation number. */
  activated: number;
  cuesCreated: number;
  cuesSent: number;
  sealed: number;
};

/* One round trip. Five scalar subqueries beat five awaited queries and beat a
   join that would have to be read twice to be believed. */
export async function adminOverview(): Promise<AdminOverview> {
  const pool = await db();
  const { rows } = await pool.query<{
    studios: string;
    activated: string;
    cues_created: string;
    cues_sent: string;
    sealed: string;
  }>(
    `SELECT (SELECT count(*) FROM studio)::text                                        AS studios,
            (SELECT count(DISTINCT studio_id) FROM cue WHERE sent_at IS NOT NULL)::text AS activated,
            (SELECT count(*) FROM cue)::text                                            AS cues_created,
            (SELECT count(*) FROM cue WHERE sent_at IS NOT NULL)::text                  AS cues_sent,
            (SELECT count(*) FROM cue WHERE status = 'signed')::text                     AS sealed`,
  );
  const r = rows[0];
  return {
    studios: Number(r?.studios ?? 0),
    activated: Number(r?.activated ?? 0),
    cuesCreated: Number(r?.cues_created ?? 0),
    cuesSent: Number(r?.cues_sent ?? 0),
    sealed: Number(r?.sealed ?? 0),
  };
}

/* ── The customer list ── */

export type StudioListItem = {
  id: number;
  name: string;
  ownerEmail: string;
  plan: Plan;
  cuesCreated: number;
  cuesSent: number;
  signed: number;
  clients: number;
  /** Last time anything happened on the account; falls back to signup. */
  lastActivity: string;
  createdAt: string;
  /** Opaque keyset cursor for the row after this one. */
  cursor: string;
};

export type StudioPage = {
  studios: StudioListItem[];
  /** Every studio matching the search, not merely this page. */
  total: number;
  /** Cursor for the next page, or null when this is the last one. */
  nextCursor: string | null;
  limit: number;
};

type StudioListRow = {
  id: string;
  name: string;
  owner_email: string;
  plan: Plan;
  cues_created: string;
  cues_sent: string;
  signed: string;
  clients: string;
  last_activity: Date;
  cursor_at: string;
  created_at: Date;
};

/* ponytail: the CTE computes the per-studio aggregates for every studio that
   matches the search, then the cursor filters. Paging is real — a bounded
   number of rows crosses the wire and the cursor is stable — but the *work* is
   proportional to the customer count, not to the page. Each aggregate is one
   lookup on cue_studio_idx, so this stays comfortable into the low tens of
   thousands of studios. Past that, denormalise `last_activity_at` onto studio
   (touched in the same transaction as the send, like sent_count already is) and
   the whole CTE collapses into an indexed scan. */
export async function studioList(
  opts: { query?: string; cursor?: StudioCursor | null; limit?: number } = {},
): Promise<StudioPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const pattern = searchPattern(opts.query);
  const cursor = opts.cursor ?? null;

  const listSql = `
    WITH matched AS (
      SELECT st.id,
             st.name,
             st.plan,
             st.created_at,
             u.email AS owner_email,
             (SELECT count(*) FROM cue c WHERE c.studio_id = st.id) AS cues_created,
             (SELECT count(*) FROM cue c WHERE c.studio_id = st.id AND c.sent_at IS NOT NULL) AS cues_sent,
             (SELECT count(*) FROM cue c WHERE c.studio_id = st.id AND c.status = 'signed') AS signed,
             (SELECT count(DISTINCT ${CLIENT_KEY_SQL})
                FROM cue c
               WHERE c.studio_id = st.id AND trim(c.client_name) <> '') AS clients,
             -- Never null, so the (timestamp, id) cursor never has to reason
             -- about NULLS LAST: a studio that has done nothing sorts by the
             -- day it signed up, which is the honest answer to "last activity".
             GREATEST(
               st.created_at,
               COALESCE((SELECT max(c.updated_at) FROM cue c WHERE c.studio_id = st.id), st.created_at)
             ) AS last_activity
        FROM studio st
        JOIN public."user" u ON u.id = st.owner_user_id
       WHERE $2::text IS NULL OR st.name ILIKE $2 OR u.email ILIKE $2
    )
    SELECT id, name, owner_email, plan, created_at, last_activity,
           cues_created::text AS cues_created,
           cues_sent::text    AS cues_sent,
           signed::text       AS signed,
           clients::text      AS clients,
           to_char(last_activity AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
      FROM matched
     WHERE $3::timestamptz IS NULL OR (last_activity, id) < ($3::timestamptz, $4::bigint)
     ORDER BY last_activity DESC, id DESC
     LIMIT $1`;

  const pool = await db();
  const [page, count] = await Promise.all([
    pool.query<StudioListRow>(listSql, [
      limit + 1,
      pattern,
      cursor?.at ?? null,
      cursor?.id ?? null,
    ]),
    pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
         FROM studio st
         JOIN public."user" u ON u.id = st.owner_user_id
        WHERE $1::text IS NULL OR st.name ILIKE $1 OR u.email ILIKE $1`,
      [pattern],
    ),
  ]);

  const truncated = page.rows.length > limit;
  const studios = page.rows.slice(0, limit).map((r) => ({
    id: Number(r.id),
    name: r.name,
    ownerEmail: r.owner_email,
    plan: r.plan,
    cuesCreated: Number(r.cues_created),
    cuesSent: Number(r.cues_sent),
    signed: Number(r.signed),
    clients: Number(r.clients),
    lastActivity: r.last_activity.toISOString(),
    createdAt: r.created_at.toISOString(),
    cursor: formatStudioCursor(r.cursor_at, Number(r.id)),
  }));

  return {
    studios,
    total: Number(count.rows[0]?.total ?? 0),
    nextCursor: truncated ? (studios.at(-1)?.cursor ?? null) : null,
    limit,
  };
}

/* ── One customer ── */

export type StudioDetail = {
  id: number;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
  plan: Plan;
  /** The denormalised send counter the free allowance is measured against. */
  sentCount: number;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  ownerEmailVerified: boolean;
  ownerSince: string;
  /* Read so the detail page can show what the invite gate would actually
     decide, via the same accessDecision() the gate calls. An operator holds no
     invite and never needs one, and without the role the page would report
     that as "no invite on file" — alarming, and wrong. */
  ownerRole: string;
};

export async function studioDetail(id: number): Promise<StudioDetail | null> {
  const pool = await db();
  const { rows } = await pool.query<{
    id: string;
    name: string;
    legal_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    brand_color: string | null;
    plan: Plan;
    sent_count: number;
    created_at: Date;
    updated_at: Date;
    owner_user_id: string;
    owner_email: string;
    owner_name: string;
    owner_verified: boolean;
    owner_since: Date;
    owner_role: string;
  }>(
    `SELECT st.id, st.name, st.legal_name, st.email, st.phone, st.address,
            st.brand_color, st.plan, st.sent_count, st.created_at, st.updated_at,
            st.owner_user_id,
            u.email AS owner_email,
            u.name  AS owner_name,
            u.role  AS owner_role,
            u."emailVerified" AS owner_verified,
            u."createdAt"     AS owner_since
       FROM studio st
       JOIN public."user" u ON u.id = st.owner_user_id
      WHERE st.id = $1`,
    [id],
  );

  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    legalName: r.legal_name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    brandColor: r.brand_color,
    plan: r.plan,
    sentCount: r.sent_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    ownerUserId: r.owner_user_id,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    ownerEmailVerified: r.owner_verified,
    ownerSince: r.owner_since.toISOString(),
    ownerRole: r.owner_role,
  };
}

export type StudioUsage = {
  byStatus: Record<string, number>;
  total: number;
  firstActivity: string | null;
  lastActivity: string | null;
};

export async function studioUsage(studioId: number): Promise<StudioUsage> {
  const pool = await db();
  const [counts, span] = await Promise.all([
    pool.query<{ status: CueStatus; n: string }>(
      `SELECT status, count(*)::text AS n FROM cue WHERE studio_id = $1 GROUP BY status`,
      [studioId],
    ),
    pool.query<{ first_at: Date | null; last_at: Date | null }>(
      `SELECT min(created_at) AS first_at, max(updated_at) AS last_at
         FROM cue WHERE studio_id = $1`,
      [studioId],
    ),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of counts.rows) {
    const n = Number(row.n);
    byStatus[row.status] = n;
    total += n;
  }

  return {
    byStatus,
    total,
    firstActivity: span.rows[0]?.first_at?.toISOString() ?? null,
    lastActivity: span.rows[0]?.last_at?.toISOString() ?? null,
  };
}

/* ── The studio's own clients ──
   The thing this surface exists for: who has this customer actually worked
   with. Derived from the Cues, since there is no client table — see clientKey
   above for what makes two Cues the same person.

   One pass with window functions rather than a GROUP BY plus a second query for
   the latest row per client: the "most recent status" column needs the newest
   Cue's status, which an aggregate cannot give without a DISTINCT ON or a
   self-join. */
export type StudioClient = {
  key: string;
  name: string;
  email: string | null;
  cues: number;
  signed: number;
  latestStatus: CueStatus;
  latestTitle: string;
  latestCueId: number;
  firstAt: string;
  lastAt: string;
};

export async function studioClients(
  studioId: number,
  limit = 200,
): Promise<StudioClient[]> {
  const pool = await db();
  const { rows } = await pool.query<{
    client_key: string;
    client_name: string;
    client_email: string | null;
    cues: string;
    signed: string;
    status: CueStatus;
    title: string;
    id: string;
    first_at: Date;
    last_at: Date;
  }>(
    `WITH base AS (
       SELECT id, client_name, client_email, status, title, created_at,
              ${CLIENT_KEY_SQL} AS client_key
         FROM cue
        WHERE studio_id = $1 AND trim(client_name) <> ''
     ), ranked AS (
       SELECT base.*,
              row_number() OVER newest                                AS rn,
              count(*)     OVER part                                  AS cues,
              count(*) FILTER (WHERE status = 'signed') OVER part      AS signed,
              min(created_at) OVER part                               AS first_at,
              max(created_at) OVER part                               AS last_at
         FROM base
       WINDOW newest AS (PARTITION BY client_key ORDER BY created_at DESC, id DESC),
              part   AS (PARTITION BY client_key)
     )
     SELECT client_key, client_name, client_email, status, title, id, first_at, last_at,
            cues::text AS cues, signed::text AS signed
       FROM ranked
      WHERE rn = 1
      ORDER BY last_at DESC, client_name ASC
      LIMIT $2`,
    [studioId, Math.min(Math.max(limit, 1), 500)],
  );

  return rows.map((r) => ({
    key: r.client_key,
    name: r.client_name,
    email: r.client_email,
    cues: Number(r.cues),
    signed: Number(r.signed),
    latestStatus: r.status,
    latestTitle: r.title,
    latestCueId: Number(r.id),
    firstAt: r.first_at.toISOString(),
    lastAt: r.last_at.toISOString(),
  }));
}

/* ── The studio's Cues ── */

export type AdminCueSummary = {
  id: number;
  title: string;
  clientName: string;
  clientEmail: string | null;
  status: CueStatus;
  templateSlug: string;
  shootDate: string | null;
  createdAt: string;
  sentAt: string | null;
  sealedAt: string | null;
  parties: number;
  signedParties: number;
};

/* `shoot_date` through to_char, never ::text and never a JS Date — the same
   invariant as CUE_COLUMNS in cue-db.ts. node-postgres parses a `date` at local
   midnight, so .toISOString() prints the previous day everywhere west of UTC,
   which is every photographer this product is for. */
export async function studioCues(
  studioId: number,
  limit = 100,
): Promise<AdminCueSummary[]> {
  const pool = await db();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    client_name: string;
    client_email: string | null;
    status: CueStatus;
    template_slug: string;
    shoot_date: string | null;
    created_at: Date;
    sent_at: Date | null;
    sealed_at: Date | null;
    parties: string;
    signed_parties: string;
  }>(
    `SELECT c.id, c.title, c.client_name, c.client_email, c.status, c.template_slug,
            to_char(c.shoot_date, 'YYYY-MM-DD') AS shoot_date,
            c.created_at, c.sent_at, c.sealed_at,
            (SELECT count(*) FROM cue_party p WHERE p.cue_id = c.id)::text AS parties,
            (SELECT count(*) FROM cue_party p
              WHERE p.cue_id = c.id AND p.signed_at IS NOT NULL)::text      AS signed_parties
       FROM cue c
      WHERE c.studio_id = $1
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $2`,
    [studioId, Math.min(Math.max(limit, 1), 500)],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    clientName: r.client_name,
    clientEmail: r.client_email,
    status: r.status,
    templateSlug: r.template_slug,
    shootDate: r.shoot_date,
    createdAt: r.created_at.toISOString(),
    sentAt: r.sent_at?.toISOString() ?? null,
    sealedAt: r.sealed_at?.toISOString() ?? null,
    parties: Number(r.parties),
    signedParties: Number(r.signed_parties),
  }));
}

/* ── One Cue, read-only ──

   Note what is *not* selected. `signature_png` never leaves the database on
   this surface: the operator needs to know a party signed, not to hold a copy
   of their signature image, and a support screen is not a place to keep one.
   `ip_hash` and `user_agent` are likewise omitted — they are evidence attached
   to a client's signature, not troubleshooting data.

   `share_token` is omitted too. It is a bearer credential: rendering it on this
   page would let an operator open a live signing link and be handed the ability
   to sign as the client. */
export type AdminParty = {
  id: number;
  role: PartyRole;
  name: string;
  email: string | null;
  typedName: string | null;
  hasSignature: boolean;
  consentAt: string | null;
  signedAt: string | null;
};

export type AdminEventRow = {
  id: number;
  kind: EventKind;
  partyId: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminCueDetail = {
  cue: AdminCueSummary & {
    location: string | null;
    notes: string | null;
    docHash: string | null;
    openedAt: string | null;
    updatedAt: string;
    hasSnapshot: boolean;
    snapshot: Snapshot | null;
  };
  parties: AdminParty[];
  events: AdminEventRow[];
};

/* Scoped by studio_id as well as id. The route already knows both, and a Cue
   reached through the wrong customer's page would be a quietly wrong screen. */
export async function adminCueDetail(
  studioId: number,
  cueId: number,
): Promise<AdminCueDetail | null> {
  const pool = await db();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    client_name: string;
    client_email: string | null;
    status: CueStatus;
    template_slug: string;
    shoot_date: string | null;
    location: string | null;
    notes: string | null;
    doc_hash: string | null;
    snapshot: Snapshot | null;
    created_at: Date;
    updated_at: Date;
    sent_at: Date | null;
    opened_at: Date | null;
    sealed_at: Date | null;
  }>(
    `SELECT id, title, client_name, client_email, status, template_slug,
            to_char(shoot_date, 'YYYY-MM-DD') AS shoot_date,
            location, notes, doc_hash, snapshot,
            created_at, updated_at, sent_at, opened_at, sealed_at
       FROM cue
      WHERE studio_id = $1 AND id = $2`,
    [studioId, cueId],
  );

  const c = rows[0];
  if (!c) return null;

  const [parties, events] = await Promise.all([
    pool.query<{
      id: string;
      role: PartyRole;
      name: string;
      email: string | null;
      typed_name: string | null;
      has_signature: boolean;
      consent_at: Date | null;
      signed_at: Date | null;
    }>(
      `SELECT id, role, name, email, typed_name,
              (signature_png IS NOT NULL) AS has_signature,
              consent_at, signed_at
         FROM cue_party
        WHERE cue_id = $1
        ORDER BY sort_order, id`,
      [cueId],
    ),
    pool.query<{
      id: string;
      kind: EventKind;
      party_id: string | null;
      meta: Record<string, unknown> | null;
      created_at: Date;
    }>(
      `SELECT id, kind, party_id, meta, created_at
         FROM cue_event
        WHERE cue_id = $1
        ORDER BY created_at, id`,
      [cueId],
    ),
  ]);

  return {
    cue: {
      id: Number(c.id),
      title: c.title,
      clientName: c.client_name,
      clientEmail: c.client_email,
      status: c.status,
      templateSlug: c.template_slug,
      shootDate: c.shoot_date,
      location: c.location,
      notes: c.notes,
      docHash: c.doc_hash,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
      sentAt: c.sent_at?.toISOString() ?? null,
      openedAt: c.opened_at?.toISOString() ?? null,
      sealedAt: c.sealed_at?.toISOString() ?? null,
      hasSnapshot: c.snapshot !== null,
      snapshot: c.snapshot,
      parties: parties.rowCount ?? 0,
      signedParties: parties.rows.filter((p) => p.signed_at !== null).length,
    },
    parties: parties.rows.map((p) => ({
      id: Number(p.id),
      role: p.role,
      name: p.name,
      email: p.email,
      typedName: p.typed_name,
      hasSignature: p.has_signature,
      consentAt: p.consent_at?.toISOString() ?? null,
      signedAt: p.signed_at?.toISOString() ?? null,
    })),
    events: events.rows.map((e) => ({
      id: Number(e.id),
      kind: e.kind,
      partyId: e.party_id === null ? null : Number(e.party_id),
      meta: e.meta,
      createdAt: e.created_at.toISOString(),
    })),
  };
}

/* ── Writes ──

   The complete list of what an operator can change, and it is two things.

   `setStudioPlan` writes one column of one table. Profile edits do not live
   here at all: they go through `updateStudio` in studio.ts, whose SET clause is
   built from a literal column map (name, legal_name, email, phone, address,
   brand_color) and therefore cannot be talked into writing `plan`, `sent_count`
   or anything on another table.

   Nothing in this file, and nothing reachable from /console/studios, can write
   to cue, cue_party or cue_event. That is the product's promise: a sealed
   record is immutable by the client, by the studio, and by us. Support access
   is not tamper access. */

/* The invite actions carry no target_studio_id — an invite exists before any
   studio does — so they are audited by invite *id* in `meta`, never by email.
   An invitee's address is personal data belonging to somebody who has not even
   signed up yet; the invite table holds it and can delete it, while admin_event
   refuses UPDATE and DELETE and would keep it forever. Same rule as the note on
   recordAdminEvent below. */
export const ADMIN_ACTIONS = [
  "studio.profile",
  "studio.plan",
  "invite.create",
  "invite.access",
  "invite.delete",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Returns the new plan, or null when no studio has that id. */
export async function setStudioPlan(studioId: number, plan: Plan): Promise<Plan | null> {
  // isPlan() has already run at the action boundary; this is the second gate,
  // so a future caller that forgets cannot widen the column's vocabulary.
  if (!isPlan(plan)) return null;
  const pool = await db();
  const { rows } = await pool.query<{ plan: Plan }>(
    `UPDATE studio SET plan = $2 WHERE id = $1 RETURNING plan`,
    [studioId, plan],
  );
  return rows[0]?.plan ?? null;
}

/**
 * Records an operator mutation. Append-only in the database (see 008).
 *
 * `meta` is for *what changed*, not for a copy of the data. A plan change
 * records from/to, because those two values are the change. A profile edit
 * records only the names of the fields written — putting a studio's phone
 * number or address into an audit row would spread the personal data this
 * surface already exposes into a second, permanently un-deletable table for no
 * operational gain. Nothing belonging to a studio's own *clients* is ever
 * written here at all.
 *
 * Never throws. A failed audit write must not roll back the support fix the
 * operator was making — but it must be loud, because an audit trail with a
 * silent hole is worse than none.
 */
export async function recordAdminEvent(entry: {
  operator: { id: string; email: string };
  action: AdminAction;
  studioId?: number | null;
  cueId?: number | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const pool = await db();
    await pool.query(
      `INSERT INTO admin_event
         (operator_user_id, operator_email, action, target_studio_id, target_cue_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.operator.id,
        entry.operator.email,
        entry.action,
        entry.studioId ?? null,
        entry.cueId ?? null,
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch (err) {
    console.error(
      `[admin] audit write failed for ${entry.action} on studio ${entry.studioId ?? "-"}`,
      (err as Error).message,
    );
  }
}

export type AdminTrailEntry = {
  id: number;
  operatorEmail: string;
  action: AdminAction;
  cueId: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export async function adminTrail(
  studioId: number,
  limit = 50,
): Promise<AdminTrailEntry[]> {
  const pool = await db();
  const { rows } = await pool.query<{
    id: string;
    operator_email: string;
    action: AdminAction;
    target_cue_id: string | null;
    meta: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, operator_email, action, target_cue_id, meta, created_at
       FROM admin_event
      WHERE target_studio_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [studioId, Math.min(Math.max(limit, 1), 200)],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    operatorEmail: r.operator_email,
    action: r.action,
    cueId: r.target_cue_id === null ? null : Number(r.target_cue_id),
    meta: r.meta,
    createdAt: r.created_at.toISOString(),
  }));
}

import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { type Plan } from "./cue";
import {
  type GuestStatus,
  nameFromEmail,
  WAITLIST_HOURLY_SIGNUP_CEILING,
} from "./waitlist";
import {
  CHANGE_FIELDS,
  type ChangeEntry,
  type ChangeFields,
  type ChangeKind,
} from "./changelog";

/* One pool per process. Next dev re-evaluates modules on every hot reload, so
   the pool is stashed on globalThis to avoid leaking connections. */

declare global {
  var cuePool: Pool | undefined;
}

function createPool() {
  // Must not throw when DATABASE_URL is absent: `next build` evaluates this
  // module while collecting page data, long before any database exists. pg
  // opens no socket until the first query, so a missing URL simply surfaces as
  // a connection error at request time, where the health probe reports it.
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL is not set — queries will fail");
  }
  const created = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Invariant: statement_timeout < connectionTimeoutMillis. A query must not
    // be allowed to hold a connection for longer than another request is
    // willing to wait to acquire one — inverted, the first symptom of database
    // slowness is pool-acquire failures from perfectly healthy requests rather
    // than the timeout of the query actually causing it, which sends you
    // debugging the wrong thing.
    // Also the Neon cold-start budget now: a scaled-to-zero compute has to wake
    // before it can answer, and that wait lands here.
    connectionTimeoutMillis: 10_000,
    /* `statement_timeout` is deliberately NOT set here.
     *
     * node-postgres sends it as a startup parameter, and Neon's pooled endpoint
     * rejects unknown startup parameters outright — every connection through
     * the pooler fails with "unsupported startup parameter in options:
     * statement_timeout". Not a degradation: a total outage.
     *
     * The cap still exists and still matters for the reason it always did —
     * with max:10 and no cap, one stuck query holds a connection forever and
     * ten of them starve every request in the process, including Better Auth's
     * session lookup. It is now enforced one layer down, on the role:
     *
     *   ALTER ROLE neondb_owner SET statement_timeout = '8s';
     *
     * which the pooler applies per session without a startup parameter. The
     * invariant the comment above describes — statement_timeout <
     * connectionTimeoutMillis — is unchanged at 8s < 10s. If the database is
     * ever moved, that ALTER ROLE moves with it. */
  });

  // pg-pool emits 'error' when an *idle* client dies — which happens on every
  // deploy, since Postgres restarts. EventEmitter throws an unhandled 'error'
  // if nothing is listening, so this listener is what keeps a deploy from
  // taking the web process with it.
  created.on("error", (err) => {
    console.error("[db] idle client error", err.message);
  });

  /* Fluid Compute suspends an instance between requests. Without this the pool
     keeps idle clients checked out across the suspension and the database runs
     out of connections long before the app runs out of traffic. Called here
     rather than at module scope so the `globalThis` guard below means it
     attaches exactly once per pool; the helper no-ops off-platform, so there is
     nothing to branch on. */
  attachDatabasePool(created);

  return created;
}

/* Stashed unconditionally, not only in dev: Next can evaluate a module more
   than once in production too, and a second pool is ten more connections. */
export const pool = (globalThis.cuePool ??= createPool());

/** One transaction helper for mutations that span modules or audit tables. */
export async function withDatabaseTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* Better Auth inserts session rows and deletes them on sign-out, but nothing
   ever removes the ones that simply expired — a browser closed without signing
   out leaves a row that outlives its own `expiresAt` forever.

   Called from the session-create hook in auth.ts, which is the *only* moment a
   row appears (signup is disabled, so a login is the sole writer). That bounds
   the table at "sessions created since the last login" without a cron entry, a
   timer in a process Next may recycle, or a second datastore.

   Never throws: a failed prune must not fail the login that triggered it. */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM session WHERE "expiresAt" < now()`,
    );
    if (rowCount) console.log(`[db] pruned ${rowCount} expired session(s)`);
  } catch (err) {
    console.error("[db] session prune", (err as Error).message);
  }
}

export type WaitlistStats = {
  total: number;
  week: number;
};

export type Guest = {
  id: number;
  name: string;
  email: string;
  status: GuestStatus;
  createdAt: string;
  plan: Plan | null;
};

/* Only what the overview actually renders. A "signups today" count (in
   America/Chicago, since the one operator is US Central) and a masked
   latest-eight feed used to be computed here and thrown away unread on every
   5-second poll — two extra round trips per poll for nothing. Both are a few
   lines to restore alongside the markup that would show them. */
export async function waitlistStats(): Promise<WaitlistStats> {
  const { rows } = await pool.query<{ total: string; week: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week
       FROM waitlist`,
  );

  return {
    total: Number(rows[0]?.total ?? 0),
    week: Number(rows[0]?.week ?? 0),
  };
}

export type GuestPage = {
  guests: Guest[];
  /** Exact number of people on the waitlist, not merely the current page. */
  total: number;
  /** True when another page of older guests can be requested. */
  truncated: boolean;
  /** The last id in this page when another page exists. */
  nextBefore: number | null;
  /** Number of rows in each request. */
  limit: number;
};

/* Keyset pagination keeps the guest list responsive as launch traffic grows.
   `id` is the cursor rather than `created_at`: a bulk arrival can give many
   rows one transaction timestamp, which would make a timestamp-only cursor
   skip people. The primary-key index already supports this order. */
export async function guestList(limit = 200, beforeId?: number): Promise<GuestPage> {
  const where = beforeId === undefined ? "" : "WHERE id < $2";
  const [page, count] = await Promise.all([
    pool.query<{
      id: string;
      email: string;
      name: string | null;
      status: GuestStatus;
      created_at: Date;
      // Narrow, not string: the CHECK constraint (013) pins the column to PLANS.
      plan_interest: Plan | null;
    }>(
      `SELECT id, email, name, status, created_at, plan_interest
         FROM waitlist
         ${where}
        ORDER BY id DESC
        LIMIT $1`,
      beforeId === undefined ? [limit + 1] : [limit + 1, beforeId],
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM waitlist`),
  ]);

  const rows = page.rows;
  const truncated = rows.length > limit;
  const guests = rows.slice(0, limit).map((r) => ({
    id: Number(r.id),
    name: r.name?.trim() || nameFromEmail(r.email),
    email: r.email,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    plan: r.plan_interest,
  }));

  return {
    guests,
    total: Number(count.rows[0]?.total ?? 0),
    truncated,
    nextBefore: truncated ? guests.at(-1)!.id : null,
    limit,
  };
}

/** Returns the updated row, or null when no guest has that id. */
export async function setGuestStatus(
  id: number,
  status: GuestStatus,
): Promise<Guest | null> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    name: string | null;
    status: GuestStatus;
    created_at: Date;
    plan_interest: Plan | null;
  }>(
    `UPDATE waitlist SET status = $2 WHERE id = $1
       RETURNING id, email, name, status, created_at, plan_interest`,
    [id, status],
  );

  const r = rows[0];
  if (!r) return null;

  return {
    id: Number(r.id),
    name: r.name?.trim() || nameFromEmail(r.email),
    email: r.email,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    plan: r.plan_interest,
  };
}

/* ── Changelog ── */

type ChangeRow = {
  id: string;
  code: string;
  version: string;
  kind: ChangeKind;
  title: string;
  ref: string | null;
  created_at: Date;
};

const CHANGE_COLUMNS = "id, code, version, kind, title, ref, created_at";

function toEntry(row: ChangeRow): ChangeEntry {
  return {
    id: Number(row.id),
    code: row.code,
    version: row.version,
    kind: row.kind,
    title: row.title,
    ref: row.ref,
    createdAt: row.created_at.toISOString(),
  };
}

/* ponytail: no pagination and no truncation flag, unlike guestList. The
   changelog is written by one operator by hand — it grows at the speed of
   releases, not signups, and 500 lines is years of them. Add a cursor the day
   that stops being true. */
export async function changelogList(limit = 500): Promise<ChangeEntry[]> {
  const { rows } = await pool.query<ChangeRow>(
    `SELECT ${CHANGE_COLUMNS} FROM changelog ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toEntry);
}

/* created_at is left to the column default so the stamp is Postgres's clock,
   not the operator's laptop. It is rendered in Central time on the way out. */
export async function addChangelogEntry(fields: ChangeFields): Promise<ChangeEntry> {
  const { rows } = await pool.query<ChangeRow>(
    `INSERT INTO changelog (code, version, kind, title, ref)
          VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CHANGE_COLUMNS}`,
    [fields.code, fields.version, fields.kind, fields.title, fields.ref],
  );
  return toEntry(rows[0]!);
}

/** Returns the updated row, or null when no entry has that id. */
export async function updateChangelogEntry(
  id: number,
  fields: Partial<ChangeFields>,
): Promise<ChangeEntry | null> {
  /* The SET clause is built from CHANGE_FIELDS, a literal tuple in
     changelog.ts — never from the keys of the parsed body. Values stay
     parameterised; only names the source already spells out reach the SQL. */
  const assignments: string[] = [];
  const values: unknown[] = [id];

  for (const field of CHANGE_FIELDS) {
    const value = fields[field];
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${field} = $${values.length}`);
  }

  // parseChangelogPatch rejects an empty patch as a 400, so this is a caller
  // bug rather than a request the operator can make.
  if (!assignments.length) return null;

  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changelog SET ${assignments.join(", ")} WHERE id = $1
       RETURNING ${CHANGE_COLUMNS}`,
    values,
  );

  return rows[0] ? toEntry(rows[0]) : null;
}

/** True when a row was actually removed. */
export async function deleteChangelogEntry(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM changelog WHERE id = $1`, [id]);
  return rowCount === 1;
}

/* ponytail: a single COUNT over the existing created_at index, not a token
   bucket. Two concurrent inserts can both read a count just under the ceiling
   and both land, so the real bound is CEILING + in-flight requests — fine for a
   backstop whose job is to turn "unbounded" into "bounded". Swap for a counter
   table with SELECT FOR UPDATE if the exact number ever matters. */
/**
 * Global hourly cap on waitlist inserts, enforced in Postgres.
 *
 * The per-IP limiter in redis.ts fails open on purpose — Redis being down must
 * not stop people joining. That is the right call for a rate limit and the
 * wrong one for an abuse ceiling: it leaves the only unauthenticated write in
 * the product with no bound at all during exactly the outage an attacker would
 * notice. This backstop lives in the database the write already goes to, so it
 * holds whether or not Redis is up.
 */
export async function signupCeilingReached(): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM waitlist
        WHERE created_at >= now() - interval '1 hour'`,
    );
    return Number(rows[0]?.n ?? 0) >= WAITLIST_HOURLY_SIGNUP_CEILING;
  } catch (err) {
    // Fail OPEN on a database error: the insert immediately after would fail
    // anyway, and returning "ceiling reached" here would turn a transient blip
    // into a misleading "too many attempts" for a legitimate signup.
    console.error("[db] signup ceiling check", (err as Error).message);
    return false;
  }
}

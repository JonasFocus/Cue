import { Pool } from "pg";
import { type GuestStatus, maskEmail, nameFromEmail } from "./waitlist";

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
    connectionTimeoutMillis: 5_000,
    // With max:10 and no cap, one stuck query holds a connection forever and
    // ten of them starve every request in the process, including Better Auth's
    // session lookup. Better to fail the one query loudly.
    statement_timeout: 10_000,
  });

  // pg-pool emits 'error' when an *idle* client dies — which happens on every
  // deploy, since Postgres restarts. EventEmitter throws an unhandled 'error'
  // if nothing is listening, so this listener is what keeps a deploy from
  // taking the web process with it.
  created.on("error", (err) => {
    console.error("[db] idle client error", err.message);
  });

  return created;
}

/* Stashed unconditionally, not only in dev: Next can evaluate a module more
   than once in production too, and a second pool is ten more connections. */
export const pool = (globalThis.cuePool ??= createPool());

export type WaitlistStats = {
  total: number;
  today: number;
  week: number;
  latest: { email: string; createdAt: string }[];
};

/* "Signups today" is read by one operator in US Central. `current_date` is the
   Postgres session timezone (UTC in the container), so the counter rolled over
   at 7pm local and disagreed with the rolling 7-day figure next to it. */
const OPERATOR_TZ = "America/Chicago";

export type Guest = {
  id: number;
  name: string;
  email: string;
  status: GuestStatus;
  createdAt: string;
};

export async function waitlistStats(): Promise<WaitlistStats> {
  const [totals, latest] = await Promise.all([
    pool.query<{ total: string; today: string; week: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (
                WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
              )::text AS today,
              count(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week
         FROM waitlist`,
      [OPERATOR_TZ],
    ),
    pool.query<{ email: string; created_at: Date }>(
      `SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 8`,
    ),
  ]);

  return {
    total: Number(totals.rows[0]?.total ?? 0),
    today: Number(totals.rows[0]?.today ?? 0),
    week: Number(totals.rows[0]?.week ?? 0),
    latest: latest.rows.map((r) => ({
      // The overview feed is glanceable, not a contact list — mask it there.
      // The guest list tab shows the real address, which is its whole job.
      email: maskEmail(r.email),
      createdAt: r.created_at.toISOString(),
    })),
  };
}

export type GuestPage = {
  guests: Guest[];
  /** True when rows were dropped: the console must not claim the count is the
      whole list, and its client-side search only covers what it was given. */
  truncated: boolean;
  /** How many rows were actually returned to cap it at. */
  limit: number;
};

/* ponytail: fetch limit+1 to detect the overflow instead of paginating. The
   console is a single-operator screen and the list is in the hundreds; add
   keyset pagination (WHERE created_at < $cursor) when it stops fitting. */
export async function guestList(limit = 200): Promise<GuestPage> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    name: string | null;
    status: GuestStatus;
    created_at: Date;
  }>(
    `SELECT id, email, name, status, created_at
       FROM waitlist
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit + 1],
  );

  const truncated = rows.length > limit;

  return {
    guests: rows.slice(0, limit).map((r) => ({
      id: Number(r.id),
      name: r.name?.trim() || nameFromEmail(r.email),
      email: r.email,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    })),
    truncated,
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
  }>(
    `UPDATE waitlist SET status = $2 WHERE id = $1
       RETURNING id, email, name, status, created_at`,
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
  };
}

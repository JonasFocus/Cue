import { Pool } from "pg";
import { type GuestStatus, nameFromEmail } from "./waitlist";

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
  /** True when rows were dropped: the console must not claim the count is the
      whole list, and its client-side search only covers what it was given. */
  truncated: boolean;
  /** How many rows were actually returned to cap it at. */
  limit: number;
};

/* ponytail: fetch limit+1 to detect the overflow instead of paginating, so
   guest #201 is currently unreachable. Deliberate — the table holds 1 row and
   the console is one operator's screen; pagination would be code written for
   a page nobody can reach.
   TRIGGER: the first time `truncated` comes back true (the 201st signup), or
   sooner if the operator needs to act on the oldest rows rather than the
   newest. Then add keyset pagination — take a `before` ISO cursor here, use
   `WHERE created_at < $2` with the existing waitlist_created_at_idx, and pass
   the last row's createdAt as ?before= from the console. */
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

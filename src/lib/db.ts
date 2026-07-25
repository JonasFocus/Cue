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
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool = globalThis.cuePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.cuePool = pool;
}

export type WaitlistStats = {
  total: number;
  today: number;
  week: number;
  latest: { email: string; createdAt: string }[];
};

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
              count(*) FILTER (WHERE created_at >= current_date)::text AS today,
              count(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week
         FROM waitlist`,
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

export async function guestList(limit = 200): Promise<Guest[]> {
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
    [limit],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name?.trim() || nameFromEmail(r.email),
    email: r.email,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  }));
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

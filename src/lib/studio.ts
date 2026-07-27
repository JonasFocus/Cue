import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { pool } from "./db";
import type { Plan } from "./cue";
import { isResolvedSession } from "./console";

export type Studio = {
  id: number;
  ownerUserId: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
  plan: Plan;
  sentCount: number;
};

const STUDIO_COLUMNS = `id, owner_user_id, name, legal_name, email, phone,
                        address, brand_color, plan, sent_count`;

type StudioRow = {
  id: string;
  owner_user_id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brand_color: string | null;
  plan: Plan;
  sent_count: number;
};

function toStudio(row: StudioRow): Studio {
  return {
    id: Number(row.id),
    ownerUserId: row.owner_user_id,
    name: row.name,
    legalName: row.legal_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    brandColor: row.brand_color,
    plan: row.plan,
    sentCount: row.sent_count,
  };
}

/* Never throws. Better Auth reads sessions out of Postgres, so a database blip
   would otherwise turn every authenticated page into a raw 500 instead of a
   sign-in prompt — the same reasoning as console/page.tsx. */
export async function currentUser(): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  } catch (err) {
    console.error("[auth] session lookup failed", (err as Error).message);
    return null;
  }
}

/* The console guard. `role` is read straight from the table rather than carried
   on the session: Better Auth's additionalFields typing moves between versions,
   and this is one indexed primary-key lookup on a page one person opens by
   bookmark. Fails CLOSED — an unreadable role is not an operator. */
export async function isOperator(userId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM public."user" WHERE id = $1`,
      [userId],
    );
    return rows[0]?.role === "operator";
  } catch (err) {
    console.error("[auth] role lookup failed", (err as Error).message);
    return false;
  }
}

/* The operator gate. One function, used by /console and by every operator-only
   API route, so a surface cannot accidentally gate on something weaker.

   Three checks, and all three are load-bearing:
     1. the session lookup is wrapped, and a thrown lookup fails CLOSED;
     2. `isResolvedSession` rejects a Promise, so a dropped `await` anywhere in
        a caller cannot hand the gate a truthy thenable;
     3. the `role` column is actually read.

   Before customer signup existed, (2) alone was a real gate — nobody but the
   seeded operator could hold a session at all. That stopped being true the
   moment `/app/signup` opened, and three routes were still relying on it. */
export async function requireOperator(): Promise<{ id: string; email: string } | null> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("[auth] operator session lookup failed", (err as Error).message);
    return null;
  }

  if (!session || !isResolvedSession(session)) return null;
  if (!(await isOperator(session.user.id))) return null;

  return { id: session.user.id, email: session.user.email };
}

/* Created on first authenticated request rather than during signup: Better Auth
   owns the signup transaction, and a studio insert failing inside it would
   leave an account that exists but can never load the app. This way the worst
   case is one retried page load. */
export async function ensureStudio(user: {
  id: string;
  email: string;
  name: string;
}): Promise<Studio> {
  const { rows } = await pool.query<StudioRow>(
    `INSERT INTO studio (owner_user_id, name, email)
          VALUES ($1, $2, $3)
     ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
       RETURNING ${STUDIO_COLUMNS}`,
    [user.id, user.name?.trim() || user.email.split("@")[0] || "My studio", user.email],
  );
  return toStudio(rows[0]!);
}

export type Session = { user: { id: string; email: string; name: string }; studio: Studio };

/** Every /app page starts here. Redirects to sign-in when there is no session. */
export async function requireStudio(): Promise<Session> {
  const user = await currentUser();
  if (!user) redirect("/app/login");
  return { user, studio: await ensureStudio(user) };
}

export async function updateStudio(
  id: number,
  patch: Partial<Pick<Studio, "name" | "legalName" | "email" | "phone" | "address" | "brandColor">>,
): Promise<Studio | null> {
  /* Column names come from this literal map, never from the keys of the
     submitted form — the same rule as updateChangelogEntry in db.ts. */
  const COLUMNS = {
    name: "name",
    legalName: "legal_name",
    email: "email",
    phone: "phone",
    address: "address",
    brandColor: "brand_color",
  } as const;

  const assignments: string[] = [];
  const values: unknown[] = [id];

  for (const [key, column] of Object.entries(COLUMNS)) {
    const value = patch[key as keyof typeof COLUMNS];
    if (value === undefined) continue;
    values.push(value === "" ? null : value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (!assignments.length) return null;

  const { rows } = await pool.query<StudioRow>(
    `UPDATE studio SET ${assignments.join(", ")} WHERE id = $1 RETURNING ${STUDIO_COLUMNS}`,
    values,
  );
  return rows[0] ? toStudio(rows[0]) : null;
}

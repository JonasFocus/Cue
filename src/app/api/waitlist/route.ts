import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { guestList, setGuestStatus } from "@/lib/db";
import { isGuestStatus } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

async function requireOperator() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ?? null;
}

/* Returns real email addresses, so it is gated exactly like the console. */
export async function GET() {
  if (!(await requireOperator())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      { guests: await guestList() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[waitlist] list", (err as Error).message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}

/** Moves one guest between statuses. Operator-only. */
export async function PATCH(request: Request) {
  if (!(await requireOperator())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { id, status } = (body ?? {}) as { id?: unknown; status?: unknown };

  // Validate server-side rather than trusting the client: the column has a
  // CHECK constraint, but a rejected write should read as 400, not a 500.
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isGuestStatus(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const guest = await setGuestStatus(id, status);
    if (!guest) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(
      { guest },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[waitlist] patch", (err as Error).message);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

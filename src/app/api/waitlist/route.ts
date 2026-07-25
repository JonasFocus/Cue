import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { guestList, setGuestStatus } from "@/lib/db";
import { parseStatusPatch } from "@/lib/waitlist";
import { isOperator } from "@/lib/console";

export const dynamic = "force-dynamic";

async function requireOperator() {
  // The predicate is in @/lib/console so it is testable: a dropped `await`
  // here would otherwise leave a truthy Promise gating the guest list.
  return isOperator(await auth.api.getSession({ headers: await headers() }));
}

/* Returns real email addresses, so it is gated exactly like the console. */
export async function GET() {
  if (!(await requireOperator())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Spread rather than nest, so the existing `{ guests }` shape is unchanged
    // and `truncated`/`limit` are additive for the console to pick up.
    return NextResponse.json(
      { ...(await guestList()) },
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

  const patch = parseStatusPatch(body);
  if (!patch.ok) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  try {
    const guest = await setGuestStatus(patch.id, patch.status);
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

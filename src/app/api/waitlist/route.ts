import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { guestList } from "@/lib/db";

export const dynamic = "force-dynamic";

/* Returns real email addresses, so it is gated exactly like the console. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      { guests: await guestList() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[waitlist]", (err as Error).message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}

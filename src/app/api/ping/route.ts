import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* Container liveness only — deliberately touches no database, so a Postgres
   blip does not make Docker restart a web server that is working fine. */
export function GET() {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

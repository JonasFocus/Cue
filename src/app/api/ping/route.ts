import { NextResponse } from "next/server";

/** Public process liveness only. Database and Redis probes stay operator-only. */
export function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}

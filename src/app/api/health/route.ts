import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool, waitlistStats, type WaitlistStats } from "@/lib/db";
import { redis } from "@/lib/redis";
import { services } from "@/lib/docker";

export const dynamic = "force-dynamic";

export type Probe = {
  ok: boolean;
  latencyMs: number;
  detail: string;
};

const NO_STATS: WaitlistStats = { total: 0, today: 0, week: 0, latest: [] };

export async function GET() {
  // Infrastructure topology is not public. Same gate as the console page.
  // Better Auth reads the session out of Postgres, so this throws during the
  // exact outage the dashboard exists to report. Degrade instead of 500ing.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  let sessionUnavailable = false;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    sessionUnavailable = true;
    console.error("[health] session lookup failed", (err as Error).message);
  }

  if (!session) {
    if (!sessionUnavailable) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // We cannot tell an operator from a stranger without the session store, so
    // this branch must assume stranger: probe results only, no container list,
    // no waitlist data, and no Postgres error text (it carries the DSN).
    const postgres = await probePostgres();
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        degraded: true,
        detail: "session store unreachable",
        probes: {
          postgres: { ok: postgres.ok, latencyMs: postgres.latencyMs, detail: "" },
        },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const [containers, postgres, cache, waitlist] = await Promise.all([
    services(),
    probePostgres(),
    probeRedis(),
    // Annotated so dropping a field from WaitlistStats is a compile error —
    // .catch() widens the union and hid a missing `week` here.
    waitlistStats().catch((): WaitlistStats => NO_STATS),
  ]);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      containers,
      probes: { postgres, redis: cache },
      waitlist,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function probePostgres(): Promise<Probe> {
  const started = performance.now();
  try {
    const r = await pool.query<{ v: string }>("SELECT version() AS v");
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      detail: r.rows[0]?.v.split(",")[0] ?? "connected",
    };
  } catch (err) {
    return { ok: false, latencyMs: -1, detail: (err as Error).message };
  }
}

async function probeRedis(): Promise<Probe> {
  const started = performance.now();
  try {
    if (!redis.isOpen) throw new Error("connection closed");
    const pong = await redis.ping();
    return {
      ok: pong === "PONG",
      latencyMs: Math.round(performance.now() - started),
      detail: `PING → ${pong}`,
    };
  } catch (err) {
    return { ok: false, latencyMs: -1, detail: (err as Error).message };
  }
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool, waitlistStats } from "@/lib/db";
import { redis } from "@/lib/redis";
import { services } from "@/lib/docker";

export const dynamic = "force-dynamic";

export type Probe = {
  ok: boolean;
  latencyMs: number;
  detail: string;
};

export async function GET() {
  // Infrastructure topology is not public. Same gate as the console page.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [containers, postgres, cache, waitlist] = await Promise.all([
    services(),
    probePostgres(),
    probeRedis(),
    waitlistStats().catch(() => ({ total: 0, today: 0, latest: [] })),
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

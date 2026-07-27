import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/studio";
import { pool, waitlistStats, type WaitlistStats } from "@/lib/db";
import { redis } from "@/lib/redis";
import { services } from "@/lib/docker";

export const dynamic = "force-dynamic";

export type Probe = {
  ok: boolean;
  latencyMs: number;
  detail: string;
};

const NO_STATS: WaitlistStats = { total: 0, week: 0 };

export async function GET() {
  // Infrastructure topology is not public. Same gate as the console page.
  //
  // Better Auth reads the session out of Postgres, so this throws during the
  // exact outage the dashboard exists to report — but without the session store
  // an operator is indistinguishable from a stranger, and this route must then
  // assume stranger. It answers 401 either way: a caller who cannot be
  // authenticated learns nothing about what is running, which is the whole
  // justification for gating the route. The 500 the try/catch prevents is the
  // real bug; the previous 503 branch published live Postgres up/down and
  // latency to anonymous callers, and its only consumer never rendered it.
  // Returns the container inventory, the Postgres version string and live
  // waitlist totals, so it needs the operator role — not merely a session.
  // Customer signup is open; "is anyone logged in?" is not a gate.
  if (!(await requireOperator())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

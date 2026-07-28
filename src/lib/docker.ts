/* Talks to the Docker Engine API through docker-socket-proxy, which is pinned
   to GET /containers only and is not published outside the compose network.
   The app itself never sees /var/run/docker.sock — a container with the raw
   socket mounted is root on the host, and this one is internet-facing. */

const DOCKER = process.env.DOCKER_API ?? "http://dockerproxy:2375";

export type ServiceHealth = {
  key: string;
  name: string;
  role: string;
  state: string;
  status: string;
  health: "healthy" | "unhealthy" | "starting" | "none";
  uptimeSeconds: number;
  memoryUsedMb: number;
  image: string;
};

/* Compose service name → how it is labelled in the console. Anything running
   that is not in this map still shows up, just without a friendly role. */
const ROLES: Record<string, string> = {
  caddy: "Edge proxy · TLS",
  app: "Next.js web",
  postgres: "PostgreSQL 17",
  redis: "Redis cache",
  dockerproxy: "Metrics bridge",
};

type ContainerSummary = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Labels: Record<string, string>;
};

type StatsSample = {
  memory_stats?: { usage?: number };
};

async function dockerGet<T>(path: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const res = await fetch(`${DOCKER}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ── The stats sample cache ──

   The console polls this every 5 seconds, and `services()` used to spend one
   /stats request per container on every poll — six round trips through the
   proxy, each carrying a 6s timeout inside the same Promise.all, to read a
   single number. One tab left open was ~100k requests a day, and a wedged proxy
   held the dashboard's p95 at the timeout rather than at the list call.

   Only the *sample* is cached. The container list is fetched live every time:
   a container appearing, dying, or turning unhealthy is the thing the screen
   exists to show, and stale would be a lie there. Memory is not — it moves on
   the scale of a leak, which is minutes, not seconds.

   ponytail: a Map keyed by container id, pruned against the live list on every
   call, so it is bounded by the containers in one compose project — five. Not
   an LRU, and it does not need to be until something else starts sharing it. */
export const STATS_TTL_MS = 30_000;

const samples = new Map<string, { memoryUsedMb: number; at: number }>();

/**
 * @param now Injectable clock. Only tests pass it; a 30-second TTL is not
 *            something a test can wait out, and sleeping for it would put 30
 *            seconds into every run.
 */
export async function services(now: () => number = Date.now): Promise<ServiceHealth[]> {
  const list = await dockerGet<ContainerSummary[]>("/containers/json?all=true");
  if (!list) return [];

  const mine = list.filter(
    (c) => c.Labels?.["com.docker.compose.project"] === "cue",
  );

  const at = now();

  const withStats = await Promise.all(
    mine.map(async (c) => {
      const service = c.Labels["com.docker.compose.service"] ?? c.Names[0] ?? "?";

      // Stats only exist for running containers; asking for a dead one hangs.
      // one-shot=true is what keeps the miss cheap: without it Docker sleeps
      // ~1s per container to produce a CPU delta we never read.
      let memoryUsedMb = 0;
      if (c.State === "running") {
        const cached = samples.get(c.Id);
        if (cached && at - cached.at < STATS_TTL_MS) {
          memoryUsedMb = cached.memoryUsedMb;
        } else {
          const stats = await dockerGet<StatsSample>(
            `/containers/${c.Id}/stats?stream=false&one-shot=true`,
          );
          // A failed request is deliberately not cached. Storing the 0 would
          // pin the container at "uses no memory" for the whole TTL, which
          // reads as a fact rather than as "we could not ask".
          if (stats) {
            memoryUsedMb = Math.round((stats.memory_stats?.usage ?? 0) / 1048576);
            samples.set(c.Id, { memoryUsedMb, at });
          }
        }
      } else {
        // A stopped container holds no memory, and a sample from before it
        // stopped would say otherwise.
        samples.delete(c.Id);
      }

      return {
        key: c.Id.slice(0, 12),
        name: service,
        role: ROLES[service] ?? "Service",
        state: c.State,
        status: c.Status,
        health: readHealth(c.Status),
        uptimeSeconds: c.State === "running" ? uptimeFrom(c.Status) : 0,
        memoryUsedMb,
        image: c.Image,
      };
    }),
  );

  // Forget containers that no longer exist, so a long-lived process does not
  // accumulate one entry per container it has ever seen across deploys.
  const live = new Set(mine.map((c) => c.Id));
  for (const id of samples.keys()) if (!live.has(id)) samples.delete(id);

  const order = Object.keys(ROLES);
  return withStats.sort(
    (a, b) =>
      (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99),
  );
}

export function readHealth(status: string): ServiceHealth["health"] {
  if (status.includes("(healthy)")) return "healthy";
  if (status.includes("(unhealthy)")) return "unhealthy";
  if (status.includes("health: starting")) return "starting";
  return "none";
}

const UPTIME_UNITS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000,
};

/* Docker only gives us "Up 4 minutes" as prose. Parse it rather than adding a
   second API call per container just to read StartedAt.
   Real shapes: "Up 4 minutes", "Up About a minute", "Up About an hour",
   "Up Less than a second", "Up 2 years", "Exited (0) 3 minutes ago". */
export function uptimeFrom(status: string): number {
  // Anchored at the start so "Exited (0) 3 minutes ago" — a *downtime* — can
  // never be read as uptime by the unanchored duration part of the pattern.
  const m = /^Up (?:About |Less than )?(?:(\d+|an?) )?(second|minute|hour|day|week|month|year)/.exec(
    status,
  );
  if (!m) return 0;
  const count = m[1];
  // "a"/"an" and a bare unit ("Up 2 years" vs "Up About a minute") both mean 1.
  const n = count && /^\d+$/.test(count) ? Number(count) : 1;
  return n * (UPTIME_UNITS[m[2]!] ?? 0);
}

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
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
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
  cpu_stats?: CpuStats;
  precpu_stats?: CpuStats;
  memory_stats?: { usage?: number; limit?: number };
};

type CpuStats = {
  cpu_usage?: { total_usage?: number };
  system_cpu_usage?: number;
  online_cpus?: number;
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

export async function services(): Promise<ServiceHealth[]> {
  const list = await dockerGet<ContainerSummary[]>("/containers/json?all=true");
  if (!list) return [];

  const mine = list.filter(
    (c) => c.Labels?.["com.docker.compose.project"] === "cue",
  );

  const withStats = await Promise.all(
    mine.map(async (c) => {
      const service = c.Labels["com.docker.compose.service"] ?? c.Names[0] ?? "?";
      // Stats only exist for running containers; asking for a dead one hangs.
      const stats =
        c.State === "running"
          ? await dockerGet<StatsSample>(`/containers/${c.Id}/stats?stream=false`)
          : null;

      return {
        key: c.Id.slice(0, 12),
        name: service,
        role: ROLES[service] ?? "Service",
        state: c.State,
        status: c.Status,
        health: readHealth(c.Status),
        uptimeSeconds: c.State === "running" ? uptimeFrom(c.Status) : 0,
        cpuPercent: cpuPercent(stats),
        memoryUsedMb: Math.round((stats?.memory_stats?.usage ?? 0) / 1048576),
        memoryLimitMb: Math.round((stats?.memory_stats?.limit ?? 0) / 1048576),
        image: c.Image,
      };
    }),
  );

  const order = Object.keys(ROLES);
  return withStats.sort(
    (a, b) =>
      (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99),
  );
}

function readHealth(status: string): ServiceHealth["health"] {
  if (status.includes("(healthy)")) return "healthy";
  if (status.includes("(unhealthy)")) return "unhealthy";
  if (status.includes("health: starting")) return "starting";
  return "none";
}

/* Docker only gives us "Up 4 minutes" as prose. Parse it rather than adding a
   second API call per container just to read StartedAt. */
function uptimeFrom(status: string): number {
  const m = status.match(/Up (?:About )?(?:(\d+) )?(second|minute|hour|day|week|month)/);
  if (!m) return 0;
  const n = Number(m[1] ?? 1);
  const unit = m[2]!;
  const secs: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
  };
  return n * (secs[unit] ?? 0);
}

function cpuPercent(s: StatsSample | null): number {
  if (!s?.cpu_stats || !s.precpu_stats) return 0;
  const cpuDelta =
    (s.cpu_stats.cpu_usage?.total_usage ?? 0) -
    (s.precpu_stats.cpu_usage?.total_usage ?? 0);
  const sysDelta =
    (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  if (cpuDelta <= 0 || sysDelta <= 0) return 0;
  const cores = s.cpu_stats.online_cpus || 1;
  return Math.round(((cpuDelta / sysDelta) * cores * 100 + Number.EPSILON) * 10) / 10;
}

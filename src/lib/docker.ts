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
      // one-shot=true is what keeps this cheap: without it Docker sleeps ~1s
      // per container to produce a CPU delta, so a 5s poll spent ~5s of wall
      // time here. We only read memory, so the delta is dead weight.
      const stats =
        c.State === "running"
          ? await dockerGet<StatsSample>(
              `/containers/${c.Id}/stats?stream=false&one-shot=true`,
            )
          : null;

      return {
        key: c.Id.slice(0, 12),
        name: service,
        role: ROLES[service] ?? "Service",
        state: c.State,
        status: c.Status,
        health: readHealth(c.Status),
        uptimeSeconds: c.State === "running" ? uptimeFrom(c.Status) : 0,
        memoryUsedMb: Math.round((stats?.memory_stats?.usage ?? 0) / 1048576),
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

/* ── The host watchdog's own report ──

   `scripts/cue-health.sh` runs every 2 minutes off `cue-health.timer`, restarts
   what it finds broken, and publishes the result to /var/lib/cue/status.json.
   compose mounts that directory read-only into this container. Until now
   nothing read it, which left two facts reachable only by SSH:

   - `gaveUp`: services the watchdog has stopped restarting. It gives up after
     five attempts on purpose, because a sixth restart hides a real fault rather
     than fixing it — so this list means "a human is needed", and on 2026-07-25
     redis was on it.
   - `checkedAt`: when the watchdog last ran. If the timer dies, *nothing* else
     notices — the watchdog is what notices everything else, and it is itself
     unwatched. A timestamp older than the stale window is that alarm, and it
     costs one subtraction.

   Everything here is defensive because the writer is a shell script building
   JSON with string concatenation: an unset awk result emits a key with no
   value, and `problems` entries are unescaped `docker compose ps` output. A
   file that is present, non-empty and not JSON is a real state, and it must be
   distinguishable from a box where the timer was simply never installed. */

/** Where cue-health.sh publishes, per docker-compose.yml's read-only mount. */
export const WATCHDOG_STATUS_PATH = "/var/lib/cue/status.json";

/* Two and a half missed runs of a 2-minute timer. Long enough to absorb systemd
   jitter and a deploy that pauses the watchdog, short enough that a dead timer
   is visible within one coffee. */
export const WATCHDOG_STALE_MS = 5 * 60_000;

export type WatchdogState =
  /** Current and parseable. Says nothing about what it reports. */
  | "ok"
  /** Parseable but older than the stale window — the watchdog is not running. */
  | "stale"
  /** Present and not parseable. */
  | "unreadable"
  /** No file at all: the timer was never installed on this box. */
  | "missing";

export type Watchdog = {
  state: WatchdogState;
  /** The watchdog's own verdict on its last run. False when it saw anything wrong. */
  ok: boolean;
  checkedAt: string | null;
  problems: string[];
  /** Services it has stopped restarting. Non-empty means a human is needed. */
  gaveUp: string[];
  /** Whether to raise a banner. Derived once here so no two surfaces disagree. */
  needsAttention: boolean;
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Reads the watchdog's published status.
 *
 * @param raw  File contents, or null when the file does not exist. Never throws
 *             — this is rendered by a Server Component, where an exception is a
 *             500 on the one screen an operator opens to find out what is wrong.
 * @param now  Epoch ms, injected so staleness is testable without waiting.
 */
export function readWatchdogStatus(raw: string | null, now: number): Watchdog {
  const blank = (state: WatchdogState): Watchdog => ({
    state,
    ok: false,
    checkedAt: null,
    problems: [],
    gaveUp: [],
    needsAttention: true,
  });

  if (raw === null) return blank("missing");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return blank("unreadable");
  }
  // `null`, a bare string and a number all survive JSON.parse and carry no
  // fields. An array does reach the reads below, and gets the same answer for
  // the same reason a `{}` does: no checkedAt, so no way to judge freshness.
  if (!parsed || typeof parsed !== "object") return blank("unreadable");

  const body = parsed as Record<string, unknown>;
  const checkedAt = typeof body.checkedAt === "string" ? body.checkedAt : null;
  const at = checkedAt === null ? NaN : Date.parse(checkedAt);
  // No usable timestamp means there is no way to tell a live watchdog from one
  // that stopped an hour ago. Treating that as fresh would hide the exact
  // failure this function exists to catch, so it is unreadable instead.
  if (Number.isNaN(at)) return blank("unreadable");

  // `now - at` goes negative when the container clock trails the host clock.
  // That is a skew, not a stale report, and must not underflow into an alarm.
  const state: WatchdogState = now - at > WATCHDOG_STALE_MS ? "stale" : "ok";
  const ok = body.ok === true;

  return {
    state,
    ok,
    checkedAt,
    problems: stringList(body.problems),
    gaveUp: stringList(body.gaveUp),
    needsAttention: state !== "ok" || !ok,
  };
}

/* What the console says about all of that.
 *
 * Here rather than in the component because it is the decision, not the markup:
 * `critical` is reserved for the watchdog having exhausted its five restarts
 * and stopped — the one state that is somebody's night rather than tomorrow's
 * task — and getting that boundary wrong in either direction is how a banner
 * stops being read. A component cannot be unit-tested in this repo (node:test,
 * no DOM), so the part worth pinning lives where a test can reach it. */
export type WatchdogAlert = { tone: "critical" | "warn"; message: string };

/** What /api/health sends: the reading plus the verdict already decided. */
export type WatchdogReport = Watchdog & { alert: WatchdogAlert | null };

export function watchdogAlert(watchdog: Watchdog): WatchdogAlert | null {
  if (!watchdog.needsAttention) return null;

  if (watchdog.gaveUp.length > 0) {
    return {
      tone: "critical",
      message: `The host watchdog has given up restarting ${watchdog.gaveUp.join(
        ", ",
      )} after five attempts and will not try again. This needs a human.`,
    };
  }

  if (watchdog.state === "missing") {
    return {
      tone: "warn",
      message:
        "The host watchdog has never written a status file. On the live box that means cue-health.timer is not installed — see the deployment runbook — and nothing is restarting failed containers.",
    };
  }

  if (watchdog.state === "unreadable") {
    return {
      tone: "warn",
      message:
        "The host watchdog wrote a status file this console cannot read. Check /var/log/cue-health.log on the box.",
    };
  }

  if (watchdog.state === "stale") {
    return {
      tone: "warn",
      message: `The host watchdog last ran at ${watchdog.checkedAt}, more than five minutes ago. It runs every two minutes, so cue-health.timer has probably stopped and nothing is restarting failed containers.`,
    };
  }

  // Current, readable, and reporting trouble it is still working through.
  return {
    tone: "warn",
    message: `The host watchdog reports a problem: ${
      watchdog.problems.join(", ") || "cause not given"
    }. It is still retrying.`,
  };
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

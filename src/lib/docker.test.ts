import { test } from "node:test";
import assert from "node:assert/strict";
import { readHealth, services, STATS_TTL_MS, uptimeFrom } from "./docker.ts";

/* Docker's status column is prose produced by go-units.HumanDuration, so these
   are the real strings the console has to parse. Every expected number below is
   the unit table done by hand: second 1, minute 60, hour 3600, day 86400,
   week 604800, month 2592000 (30 days), year 31536000 (365 days). */

test("parses plain durations", () => {
  const cases: [string, number][] = [
    ["Up 4 minutes", 240], // 4 × 60
    ["Up 2 hours", 7200], // 2 × 3600
    ["Up 3 days", 259200], // 3 × 86400
    ["Up 5 weeks", 3024000], // 5 × 604800
    ["Up 2 years", 63072000], // 2 × 31536000
    ["Up 45 seconds", 45],
  ];
  for (const [status, seconds] of cases) {
    assert.equal(uptimeFrom(status), seconds, status);
  }
});

test("treats the word forms of one as one", () => {
  // HumanDuration writes "About a minute"/"About an hour" rather than "1
  // minute", and drops "About" for the bare article in some ranges.
  assert.equal(uptimeFrom("Up About a minute"), 60);
  assert.equal(uptimeFrom("Up About an hour"), 3600);
  assert.equal(uptimeFrom("Up a minute"), 60);
  assert.equal(uptimeFrom("Up an hour"), 3600);
});

test("sub-second uptime is reported as one second", () => {
  // "Up Less than a second" has no numeric part at all. Pinned at 1 rather
  // than 0 because the container *is* up — a 0 here would render as "down"
  // for the first second of every deploy. Change the parser, not this number,
  // if that ever needs to be 0.
  assert.equal(uptimeFrom("Up Less than a second"), 1);
});

test("months use Docker's 30-day approximation", () => {
  // go-units treats a month as 30 days flat, so this is deliberately not
  // calendar-accurate. Pinned so a future "fix" to real months is a conscious
  // decision that also has to update the console's copy.
  assert.equal(uptimeFrom("Up 2 months"), 5184000); // 2 × 30 × 86400
  assert.equal(uptimeFrom("Up 1 month"), 2592000);
});

test("health suffixes do not disturb the duration", () => {
  assert.equal(uptimeFrom("Up 4 minutes (healthy)"), 240);
  assert.equal(uptimeFrom("Up 20 seconds (health: starting)"), 20);
  assert.equal(uptimeFrom("Up 6 hours (unhealthy)"), 21600);
});

test("a downtime is never read as uptime", () => {
  // Regression: an unanchored pattern matched the "3 minutes" inside
  // "Exited (0) 3 minutes ago" and the console showed a dead container as
  // having been up for three minutes. The parse must be anchored at "Up ".
  for (const status of [
    "Exited (0) 3 minutes ago",
    "Exited (137) 2 hours ago",
    "Restarting (1) 5 seconds ago",
    "Dead",
    "Created",
    "Paused",
    "",
    "up 4 minutes", // case matters; Docker always capitalises
  ]) {
    assert.equal(uptimeFrom(status), 0, JSON.stringify(status));
  }
});

test("unknown units contribute nothing", () => {
  assert.equal(uptimeFrom("Up 3 fortnights"), 0);
});

test("reads the health suffix", () => {
  assert.equal(readHealth("Up 4 minutes (healthy)"), "healthy");
  assert.equal(readHealth("Up 4 minutes (unhealthy)"), "unhealthy");
  assert.equal(readHealth("Up 20 seconds (health: starting)"), "starting");
  // No healthcheck declared on the service — absence, not failure.
  assert.equal(readHealth("Up 4 minutes"), "none");
  assert.equal(readHealth("Exited (0) 3 minutes ago"), "none");
  assert.equal(readHealth(""), "none");
});

/* ── The stats sample cache ──

   `services()` reads exactly one number out of /containers/<id>/stats — memory
   — and the console polls it every 5 seconds. These tests pin that a poll does
   not re-sample a container it already sampled recently, because that fan-out
   (one request per container, each with a 6s timeout, all inside one
   Promise.all) was the entire cost of the dashboard.

   The container *list* is deliberately not cached and is not tested for it: a
   container appearing, dying or going unhealthy has to show up on the next
   poll, which is the whole point of the screen.

   Each test uses its own container ids. The cache is module-global by design —
   one process, one Docker daemon — so unique ids are what keeps these
   independent, rather than a reset hook that only tests would ever call. */

type FakeCall = { url: string };

/** Stands in for the docker-socket-proxy. Returns one running container per id. */
function fakeDocker(ids: string[], opts: { statsStatus?: number } = {}) {
  const calls: FakeCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push({ url });

    if (url.includes("/containers/json")) {
      return Response.json(
        ids.map((id) => ({
          Id: id,
          Names: [`/${id}`],
          Image: "test:latest",
          State: "running",
          Status: "Up 4 minutes (healthy)",
          Created: 0,
          Labels: {
            "com.docker.compose.project": "cue",
            "com.docker.compose.service": id,
          },
        })),
      );
    }

    const status = opts.statsStatus ?? 200;
    if (status !== 200) return new Response("nope", { status });
    return Response.json({ memory_stats: { usage: 64 * 1048576 } });
  }) as typeof fetch;

  return {
    calls,
    statsCalls: () => calls.filter((c) => c.url.includes("/stats")).length,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("a container sampled once is not re-sampled inside the TTL", async () => {
  const docker = fakeDocker(["ttl-a", "ttl-b"]);
  let clock = 1_000_000;
  try {
    const first = await services(() => clock);
    assert.equal(first.length, 2);
    assert.equal(docker.statsCalls(), 2, "first poll samples every container");

    // Second poll, one second later — what the console actually does.
    clock += 1_000;
    const second = await services(() => clock);
    assert.equal(
      docker.statsCalls(),
      2,
      "second poll inside the TTL must not touch /stats again",
    );
    // The cached number is still reported, not dropped to zero.
    assert.deepEqual(
      second.map((s) => s.memoryUsedMb),
      [64, 64],
    );
  } finally {
    docker.restore();
  }
});

test("the sample is refreshed once the TTL lapses", async () => {
  const docker = fakeDocker(["lapse-a"]);
  let clock = 1_000_000;
  try {
    await services(() => clock);
    assert.equal(docker.statsCalls(), 1);

    clock += STATS_TTL_MS + 1;
    await services(() => clock);
    assert.equal(docker.statsCalls(), 2, "a lapsed sample must be re-fetched");
  } finally {
    docker.restore();
  }
});

test("a failed stats request is not cached as a zero", async () => {
  // Caching a failure would pin a container at 0 MB for the whole TTL, which
  // reads on the dashboard as "this container uses no memory" rather than as
  // "we could not ask". The next poll has to retry.
  const docker = fakeDocker(["fail-a"], { statsStatus: 500 });
  let clock = 1_000_000;
  try {
    const first = await services(() => clock);
    assert.equal(first[0]!.memoryUsedMb, 0);
    assert.equal(docker.statsCalls(), 1);

    clock += 1_000;
    await services(() => clock);
    assert.equal(docker.statsCalls(), 2, "a failed sample must be retried");
  } finally {
    docker.restore();
  }
});

test("a stopped container is never sampled and reports no memory", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/containers/json")) {
      return Response.json([
        {
          Id: "stopped-a",
          Names: ["/stopped-a"],
          Image: "test:latest",
          State: "exited",
          Status: "Exited (0) 3 minutes ago",
          Created: 0,
          Labels: {
            "com.docker.compose.project": "cue",
            "com.docker.compose.service": "stopped-a",
          },
        },
      ]);
    }
    return Response.json({ memory_stats: { usage: 999 * 1048576 } });
  }) as typeof fetch;

  try {
    const result = await services(() => 1_000_000);
    assert.equal(result[0]!.memoryUsedMb, 0);
    assert.equal(result[0]!.uptimeSeconds, 0);
    assert.equal(
      calls.filter((u) => u.includes("/stats")).length,
      0,
      "asking a dead container for stats hangs; it must not be asked",
    );
  } finally {
    globalThis.fetch = original;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, rateLimit, type RateLimitClient } from "./redis.ts";

/* Importing this module constructs the singleton client, but `createRedis`
   only dials when REDIS_URL is set — which it is not under `npm test`. Every
   test below injects its own fake, so nothing here touches a socket. */

function fake(
  hits: number,
  isOpen = true,
): RateLimitClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    isOpen,
    async incr(key) {
      calls.push(["incr", key]);
      return hits;
    },
    async expire(key, seconds, mode) {
      calls.push(["expire", key, seconds, mode]);
      return true;
    },
  };
}

test("counts a hit and sets the window TTL", () => {
  const client = fake(1);
  return rateLimit("rl:abc", 5, 60, client).then((res) => {
    assert.deepEqual(res, { ok: true, remaining: 4 });
    // NX unconditionally, not only on the first hit: an EXPIRE lost after an
    // INCR would otherwise leave the key TTL-less and lock that caller out
    // forever, because `hits === 1` never comes round again.
    assert.deepEqual(client.calls, [
      ["incr", "rl:abc"],
      ["expire", "rl:abc", 60, "NX"],
    ]);
  });
});

test("the limit is inclusive and remaining never goes negative", async () => {
  assert.deepEqual(await rateLimit("k", 5, 60, fake(5)), {
    ok: true,
    remaining: 0,
  });
  assert.deepEqual(await rateLimit("k", 5, 60, fake(6)), {
    ok: false,
    remaining: 0,
  });
  assert.deepEqual(await rateLimit("k", 5, 60, fake(99)), {
    ok: false,
    remaining: 0,
  });
});

test("a closed client fails open", async () => {
  const client = fake(1, false);
  assert.deepEqual(await rateLimit("k", 5, 60, client), {
    ok: true,
    remaining: 5,
  });
  // It must not even try to talk to a client it knows is closed.
  assert.deepEqual(client.calls, []);
});

test("a throwing client fails open rather than blocking signups", async () => {
  const client: RateLimitClient = {
    isOpen: true,
    async incr() {
      throw new Error("boom");
    },
    async expire() {
      return true;
    },
  };
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    assert.deepEqual(await rateLimit("k", 5, 60, client), {
      ok: true,
      remaining: 5,
    });
  } finally {
    console.error = original;
  }
  // Failing open silently would hide a dead Redis indefinitely.
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0], ["[redis] rateLimit", "Error: boom"]);
});

test("describeError names errors that carry no message", () => {
  // node-redis TimeoutError/ClientClosedError have an empty `.message`, which
  // logged as a bare "[redis]" and told us nothing about what failed.
  const timeout = new Error("");
  timeout.name = "TimeoutError";
  assert.equal(describeError(timeout), "TimeoutError");

  assert.equal(describeError(new TypeError("bad url")), "TypeError: bad url");
  assert.equal(describeError("plain string"), "plain string");
  assert.equal(describeError(undefined), "undefined");
});

import { Redis } from "@upstash/redis";

/* Rate limiting only. Nothing else in the product depends on this datastore,
   which is what lets it fail open.
 *
 * Upstash over a REST call rather than node-redis over a socket. The old client
 * opened a persistent TCP connection at module scope and `rateLimit` guarded on
 * `client.isOpen` — on a serverless instance that connection is frequently not
 * yet established when the first request arrives, so the guard would return
 * "allowed" and rate limiting would silently do nothing on exactly the cold
 * starts an attacker's first requests land on. A stateless HTTP call has no
 * such window. */

/** node-redis threw errors with an empty `.message` (TimeoutError,
    ClientClosedError), which logged as a blank line and told us nothing.
    Upstash is better behaved, but the log line costs nothing and a thrown
    non-Error still needs naming. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.message ? `${err.name}: ${err.message}` : err.name;
}

/* The structural slice `rateLimit` actually uses, so a test can pass a fake
   without standing up Redis. `isOpen` is gone from it: connection state is not
   a thing a REST client has. */
export type RateLimitClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number, mode: "NX"): Promise<unknown>;
};

/* Null rather than a client when unconfigured — `next build` imports this
   module and must not require credentials, and local dev without Upstash
   should run rather than crash. `rateLimit` treats null exactly as it treated a
   closed socket: allowed. */
export const redis: RateLimitClient | null =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? (Redis.fromEnv() as unknown as RateLimitClient)
    : null;

/**
 * Fixed-window limiter. Returns whether the caller is allowed to proceed.
 *
 * ponytail: fixed window, not a sliding log — a burst can straddle the boundary
 * and get 2x the quota. That is fine for waitlist spam. Swap for a sliding
 * window if this ever guards something that costs money per call.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  client: RateLimitClient | null = redis,
): Promise<{ ok: boolean; remaining: number }> {
  try {
    if (!client) return { ok: true, remaining: limit };
    const hits = await client.incr(key);
    // NX (set only when there is no TTL) unconditionally rather than on the
    // first hit: if the EXPIRE after an INCR is ever lost, `hits === 1` never
    // recurs and the key would sit without a TTL forever, locking that caller
    // out permanently. This costs the same round trip and self-heals.
    await client.expire(key, windowSeconds, "NX");
    return { ok: hits <= limit, remaining: Math.max(0, limit - hits) };
  } catch (err) {
    // Fail open: the limiter being unreachable must not stop people joining the
    // waitlist or signing an agreement. The abuse ceiling that must NOT fail
    // open lives in Postgres instead — see signupCeilingReached in db.ts.
    console.error("[redis] rateLimit", describeError(err));
    return { ok: true, remaining: limit };
  }
}

/** Used by the console's health probe, which wants a real round trip. */
export async function ping(): Promise<string> {
  if (!redis) throw new Error("not configured");
  return (redis as unknown as Redis).ping();
}

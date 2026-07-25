import { createClient, type RedisClientType } from "redis";

declare global {
  var cueRedis: RedisClientType | undefined;
}

/* node-redis throws errors whose `.message` is empty (TimeoutError,
   ClientClosedError), which logged as a blank line and told us nothing. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.message ? `${err.name}: ${err.message}` : err.name;
}

function createRedis() {
  const client: RedisClientType = createClient({ url: process.env.REDIS_URL });
  // A dropped Redis connection must never take the process down. Rate limiting
  // degrades (see `rateLimit` below); nothing else depends on it.
  client.on("error", (err) => console.error("[redis]", describeError(err)));
  // Only dial when actually configured — `next build` imports this module and
  // should not spend the build retrying a host that exists only in compose.
  if (process.env.REDIS_URL) {
    client.connect().catch((err) => console.error("[redis] connect", describeError(err)));
  }
  return client;
}

/* Stashed unconditionally, not just in dev: Next can evaluate a module more
   than once in production too, and a second client is a second connection. */
export const redis = (globalThis.cueRedis ??= createRedis());

/**
 * Fixed-window limiter. Returns whether the caller is allowed to proceed.
 *
 * ponytail: fixed window, not a sliding log — a burst can straddle the boundary
 * and get 2x the quota. That is fine for waitlist spam. Swap for a sliding
 * window if this ever guards something that costs money per call.
 */
/* The structural slice of the client `rateLimit` actually uses, so a test can
   pass a fake without standing up Redis. */
export type RateLimitClient = {
  readonly isOpen: boolean;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number, mode: "NX"): Promise<unknown>;
};

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  client: RateLimitClient = redis,
): Promise<{ ok: boolean; remaining: number }> {
  try {
    if (!client.isOpen) return { ok: true, remaining: limit };
    const hits = await client.incr(key);
    // NX (set only when there is no TTL) unconditionally rather than on the
    // first hit: if the EXPIRE after an INCR is ever lost, `hits === 1` never
    // recurs and the key would sit without a TTL forever, locking that caller
    // out permanently. This costs the same round trip and self-heals.
    await client.expire(key, windowSeconds, "NX");
    return { ok: hits <= limit, remaining: Math.max(0, limit - hits) };
  } catch (err) {
    // Fail open: Redis being down must not stop people joining the waitlist.
    // node-redis TimeoutError carries an empty message, so name it too.
    console.error("[redis] rateLimit", describeError(err));
    return { ok: true, remaining: limit };
  }
}

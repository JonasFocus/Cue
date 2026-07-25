import { createClient, type RedisClientType } from "redis";

declare global {
  var cueRedis: RedisClientType | undefined;
}

function createRedis() {
  const client: RedisClientType = createClient({ url: process.env.REDIS_URL });
  // A dropped Redis connection must never take the process down. Rate limiting
  // degrades (see `rateLimit` below); nothing else depends on it.
  client.on("error", (err) => console.error("[redis]", err.message));
  // Only dial when actually configured — `next build` imports this module and
  // should not spend the build retrying a host that exists only in compose.
  if (process.env.REDIS_URL) {
    client.connect().catch((err) => console.error("[redis] connect", err.message));
  }
  return client;
}

export const redis = globalThis.cueRedis ?? createRedis();

if (process.env.NODE_ENV !== "production") {
  globalThis.cueRedis = redis;
}

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
): Promise<{ ok: boolean; remaining: number }> {
  try {
    if (!redis.isOpen) return { ok: true, remaining: limit };
    const hits = await redis.incr(key);
    if (hits === 1) await redis.expire(key, windowSeconds);
    return { ok: hits <= limit, remaining: Math.max(0, limit - hits) };
  } catch (err) {
    // Fail open: Redis being down must not stop people joining the waitlist.
    console.error("[redis] rateLimit", (err as Error).message);
    return { ok: true, remaining: limit };
  }
}

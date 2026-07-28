/* Where the client's address comes from, and why only one header is trusted.
 *
 * This used to be four byte-identical copies across actions.ts, the signing
 * action, the signing page and the sealed page — each reading `x-real-ip` first
 * and falling back to `x-forwarded-for`. That order was correct behind Caddy,
 * which set X-Real-IP from {remote_host}, the TCP peer, which a client cannot
 * influence. The old comment predicted its own expiry: "that is a property of
 * the deployment, not of the code, and it changes the day a CDN or a second
 * proxy goes in front."
 *
 * That day is today. On Vercel the guarantee moves to a different header:
 * Vercel overwrites `x-forwarded-for` on every request and does not forward an
 * externally-supplied value, specifically to prevent spoofing
 * (vercel.com/docs/headers/request-headers).
 *
 * `x-real-ip` carries no such documented guarantee here — nothing states that
 * an inbound one is stripped. So it is not read at all, rather than demoted:
 * this value is salted and stored on `cue_party.ip_hash` as evidence attached
 * to a signature, and "probably stripped" is not a standard to hold between an
 * attacker and the audit record. It also keys the rate limiter on the only
 * unauthenticated write in the product.
 *
 * Kept pure and separate from the "use server" modules that need it, because
 * such a module may only export async actions — exporting a helper from there
 * would publish it as a callable endpoint. That constraint is what produced the
 * four copies; one importable module is the fix.
 */
export function clientIpFrom(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (!forwarded) return "unknown";

  // Left-most entry is the originating client. Vercel sets this itself, so
  // there is no untrusted hop in front of it to skip.
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

/* `next/headers` is imported here rather than at module scope, for the same
   reason admin.ts defers its pool import: Node's test runner resolves the whole
   static import graph before running a line, and it cannot resolve
   "next/headers" — so a top-level import would make the pure function above
   untestable, which is the entire point of splitting it out. An ES module is
   evaluated once and cached, so this is a map lookup after the first call. */

/** The request-scoped wrapper. Callers in RSCs and server actions want this. */
export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  return clientIpFrom(await headers());
}

/** As above, request-scoped. */
export async function userAgent(): Promise<string | null> {
  const { headers } = await import("next/headers");
  return userAgentFrom(await headers());
}

/** Truncated to fit the column, and to bound what an attacker can store. */
export function userAgentFrom(h: Headers): string | null {
  return h.get("user-agent")?.slice(0, 255) ?? null;
}

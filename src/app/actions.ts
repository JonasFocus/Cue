"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { pool } from "@/lib/db";
import { rateLimit } from "@/lib/redis";
import { isValidEmail, normaliseEmail } from "@/lib/waitlist";

export type WaitlistState = {
  status: "idle" | "ok" | "error";
  message: string;
};

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = normaliseEmail(formData.get("email"));
  // Optional: asking for it is worth a little friction, requiring it is not.
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 120);

  // Honeypot. Named so no autofill heuristic recognises it: the old name
  // `company` maps to the `organization` autocomplete token, which password
  // managers happily filled — silently discarding real signups with a success
  // message and no trace. Still answers "ok" so a bot learns nothing, but the
  // trap is now observable in the logs.
  if (String(formData.get("cue_ref") ?? "")) {
    console.warn("[waitlist] honeypot tripped", { email: email || "(none)" });
    return { status: "ok", message: "You're on the list." };
  }

  if (!email) {
    return { status: "error", message: "Enter your email address." };
  }
  if (!isValidEmail(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }

  // An unsalted — or publicly-salted — SHA-256 of an IPv4 address is reversible
  // by brute force in seconds, so a default salt would make `ip_hash` personal
  // data wearing a hash costume, and the privacy page promises otherwise.
  // Refused here rather than thrown at module scope: `next build` imports this
  // file to collect page data, and a throw would break the build instead of the
  // one request that actually needs the secret.
  const salt = process.env.IP_SALT;
  if (!salt) {
    console.error("[waitlist] IP_SALT is not set — refusing to store a signup");
    return {
      status: "error",
      message: "Something broke on our end. Try again in a moment.",
    };
  }

  const ip = await clientIp();
  const ipHash = createHash("sha256")
    .update(`${ip}:${salt}`)
    .digest("hex")
    .slice(0, 32);

  const limit = await rateLimit(`wl:${ipHash}`, 5, 3600);
  if (!limit.ok) {
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  try {
    await pool.query(
      `INSERT INTO waitlist (email, name, ip_hash, user_agent)
            VALUES ($1, NULLIF($2, ''), $3, $4)
       -- Infers waitlist_email_key (001), not waitlist_email_lower_key (004).
       -- Both are kept: the check constraint pins email = lower(email), so they
       -- are equivalent, and the duplicate index costs nothing at this size.
       -- Whoever drops waitlist_email_key must change this to
       -- ON CONFLICT (lower(email)) in the SAME deploy, or every signup 42P10s.
       ON CONFLICT (email) DO UPDATE
              SET name = COALESCE(waitlist.name, EXCLUDED.name)`,
      [
        email,
        name,
        ipHash,
        (await headers()).get("user-agent")?.slice(0, 255) ?? null,
      ],
    );
  } catch (err) {
    console.error("[waitlist]", (err as Error).message);
    return {
      status: "error",
      message: "Something broke on our end. Try again in a moment.",
    };
  }

  // A duplicate returns the same success state as a new signup: telling a
  // stranger whether an address is already registered leaks the list.
  return { status: "ok", message: "You're on the list." };
}

/* The header order here is the whole rate limit. Do not "simplify" it to the
   conventional X-Forwarded-For-first.

   Caddy sets `X-Real-IP` from {remote_host} — the TCP peer — which a client
   cannot influence. It *appends* to X-Forwarded-For instead, and has no
   trusted_proxies configured, so a request carrying `X-Forwarded-For: 1.2.3.4`
   arrives as "1.2.3.4, <real ip>" and the left-most entry is whatever the
   attacker typed. Trusting it lets anyone rotate the header to get unlimited
   waitlist writes, and poisons the ip_hash the privacy page calls an audit
   value. XFF is only consulted when X-Real-IP is absent (no proxy in front,
   e.g. local dev), where it is no worse than what we had. */
async function clientIp() {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

"use server";

import { createHash } from "node:crypto";
import { pool, signupCeilingReached } from "@/lib/db";
import { rateLimit } from "@/lib/redis";
import { clientIp, userAgent } from "@/lib/client-ip";
import {
  isValidEmail,
  normaliseEmail,
  WAITLIST_IP_ATTEMPT_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
} from "@/lib/waitlist";

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

  // Which pricing CTA they came through, if any. Allowlisted, not passed
  // through — the field is client-writable like everything else in the form.
  const rawPlan = String(formData.get("plan") ?? "");
  const plan = ["free", "pro", "studio"].includes(rawPlan) ? rawPlan : null;

  // Honeypot. Named so no autofill heuristic recognises it: the old name
  // `company` maps to the `organization` autocomplete token, which password
  // managers happily filled — silently discarding real signups with a success
  // message and no trace. Still answers "ok" so a bot learns nothing, but the
  // trap is now observable in the logs.
  if (String(formData.get("cue_ref") ?? "")) {
    console.warn("[waitlist] honeypot tripped", { email: email || "(none)" });
    return { status: "ok", message: "Request received." };
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

  // Two bounds, deliberately different in their failure direction. The per-IP
  // limiter below fails OPEN when Redis is down, because a cache outage must
  // not stop legitimate signups. This global ceiling is enforced in Postgres,
  // so a Redis outage cannot leave the only public write path unbounded.
  if (await signupCeilingReached()) {
    console.warn("[waitlist] hourly signup ceiling reached", { ipHash });
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  const limit = await rateLimit(
    `wl:${ipHash}`,
    WAITLIST_IP_ATTEMPT_LIMIT,
    WAITLIST_RATE_WINDOW_SECONDS,
  );
  if (!limit.ok) {
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  try {
    await pool.query(
      `INSERT INTO waitlist (email, name, ip_hash, user_agent, plan_interest)
            VALUES ($1, NULLIF($2, ''), $3, $4, $5)
       -- Infers waitlist_email_key (001), not waitlist_email_lower_key (004).
       -- Both are kept: the check constraint pins email = lower(email), so they
       -- are equivalent, and the duplicate index costs nothing at this size.
       -- Whoever drops waitlist_email_key must change this to
       -- ON CONFLICT (lower(email)) in the SAME deploy, or every signup 42P10s.
       ON CONFLICT (email) DO UPDATE
              SET name = COALESCE(waitlist.name, EXCLUDED.name),
                  -- Latest expressed intent wins; absence never erases it.
                  plan_interest = COALESCE(EXCLUDED.plan_interest,
                                           waitlist.plan_interest)`,
      [
        email,
        name,
        ipHash,
        await userAgent(),
        plan,
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
  return { status: "ok", message: "Request received." };
}


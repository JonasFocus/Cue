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

  // Honeypot: a real person never fills a hidden field.
  if (String(formData.get("company") ?? "")) {
    return { status: "ok", message: "You're on the list." };
  }

  if (!email) {
    return { status: "error", message: "Enter your email address." };
  }
  if (!isValidEmail(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }

  const ip = await clientIp();
  const ipHash = createHash("sha256")
    .update(`${ip}:${process.env.IP_SALT ?? "cue"}`)
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

async function clientIp() {
  const h = await headers();
  // Caddy sets X-Forwarded-For; the left-most entry is the original client.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

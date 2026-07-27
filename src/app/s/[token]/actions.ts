"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { declineCue, getCueByToken, signParty } from "@/lib/cue-db";
import { rateLimit } from "@/lib/redis";
import {
  isPubliclySignable,
  isShareToken,
  isSignable,
  isOptionalSignature,
  isValidSignerName,
  SIGN_ATTEMPT_LIMIT,
  SIGN_RATE_WINDOW_SECONDS,
} from "@/lib/cue";

/* The only unauthenticated *write* in the product.
 *
 * The share token is the entire credential, so every fact about this request is
 * re-derived from it server-side: the Cue, its status, and the set of people who
 * may sign it. Nothing that arrives in the form is trusted except the token and
 * a party id, and the party id is only ever used to *select* from the parties
 * that the token's Cue actually has. A forged `party` value therefore selects
 * nothing, and a forged cue id has nowhere to land because the form never
 * carries one. */

export type SignState = { status: "idle" | "error"; message: string };

function fail(message: string): SignState {
  return { status: "error", message };
}

/* Deliberately identical wording for "no such token", "voided", and "declined
   before you got here": a stranger poking at /s/ must not be able to tell a
   token that never existed from one that was withdrawn. The honest, specific
   copy lives on the page, which is only reachable with a real token. */
const GONE = "This agreement is no longer open for signing. Reload the page to see where it stands.";

export async function signAgreement(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  if (!isShareToken(token)) return fail(GONE);

  // An unsalted SHA-256 of an IPv4 address is brute-forced in seconds, so an
  // audit record built on one is reversible and the privacy page promises
  // otherwise. A signature is the single most consequential row this product
  // writes; it does not get written with a decorative hash. Refused here rather
  // than thrown at module scope so a missing secret breaks this request instead
  // of `next build`, which imports this file to collect page data.
  const salt = process.env.IP_SALT;
  if (!salt) {
    console.error("[sign] IP_SALT is not set — refusing to record a signature");
    return fail("Something broke on our end. Nothing was signed. Try again in a moment.");
  }

  const ipHash = createHash("sha256")
    .update(`${await clientIp()}:${salt}`)
    .digest("hex")
    .slice(0, 32);

  const limit = await rateLimit(`sg:${ipHash}`, SIGN_ATTEMPT_LIMIT, SIGN_RATE_WINDOW_SECONDS);
  if (!limit.ok) {
    return fail("Too many attempts from this connection. Wait a few minutes and try again.");
  }

  // Consent is the thing being recorded, not a UI nicety — `consent_at` is a
  // column in the audit record. It is re-checked here because a disabled
  // checkbox is a courtesy to the client, never the enforcement.
  if (formData.get("consent") !== "agreed") {
    return fail("Tick the box confirming you have read the agreement before signing.");
  }

  const typedName = String(formData.get("name") ?? "").trim();
  if (!isValidSignerName(typedName)) {
    return fail("Type your full legal name as you would write it.");
  }

  /* The drawn mark is OPTIONAL — the typed legal name above is the signature.
     Requiring a glyph would mean only someone able to drag a pointer could
     sign, which excludes blind, keyboard-only, switch, voice-control and
     tremor-affected clients from a legally meaningful document. When a mark is
     present it still has to be a real PNG data URL, because it ends up in an
     <img src> on the sealed record. */
  const rawSignature = formData.get("signature");
  if (!isOptionalSignature(rawSignature)) {
    return fail("That signature didn't come through. Clear the box and draw it again.");
  }
  const signaturePng = typeof rawSignature === "string" && rawSignature ? rawSignature : null;

  const found = await getCueByToken(token);
  if (!found) return fail(GONE);
  if (!isSignable(found.cue.status)) return fail(GONE);

  const partyId = Number(formData.get("party"));
  const party = Number.isInteger(partyId)
    ? found.parties.find((p) => p.id === partyId)
    : undefined;
  if (!party) return fail("Choose who is signing, then try again.");
  /* Defence in depth behind `addPartyAction`: even if a `creator` party exists
     (added before this rule, or by a future code path), the share link must
     never be able to sign it. Signing the photographer's line from the client's
     link is forging the counterparty's signature. */
  if (!isPubliclySignable(party.role)) return fail(GONE);

  // A double-tap on a slow connection is the single most likely way to reach
  // this, and it is not a failure — the first tap worked. Land on the same
  // confirmation the first tap did.
  if (party.signedAt) redirect(`/s/${token}/sealed`);

  const userAgent = await userAgentHeader();

  const result = await signParty(found.cue.id, party.id, {
    typedName,
    signaturePng,
    ipHash,
    userAgent,
  });

  if (!result.ok) {
    // Same race, seen from inside the transaction: two tabs, or a retried
    // request, and the row was already written between our read and the lock.
    if (result.error === "already_signed") redirect(`/s/${token}/sealed`);
    return fail(GONE);
  }

  redirect(`/s/${token}/sealed`);
}

export async function declineAgreement(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  if (!isShareToken(token)) return fail(GONE);

  // Declining writes an audit event carrying an ip_hash too, so it holds to the
  // same rule as signing: no salt, no record.
  const salt = process.env.IP_SALT;
  if (!salt) {
    console.error("[sign] IP_SALT is not set — refusing to record a decline");
    return fail("Something broke on our end. Nothing was changed. Try again in a moment.");
  }

  const ipHash = createHash("sha256")
    .update(`${await clientIp()}:${salt}`)
    .digest("hex")
    .slice(0, 32);

  const limit = await rateLimit(`sg:${ipHash}`, SIGN_ATTEMPT_LIMIT, SIGN_RATE_WINDOW_SECONDS);
  if (!limit.ok) {
    return fail("Too many attempts from this connection. Wait a few minutes and try again.");
  }

  const found = await getCueByToken(token);
  if (!found) return fail(GONE);
  if (!isSignable(found.cue.status)) return fail(GONE);

  const partyId = Number(formData.get("party"));
  const party = Number.isInteger(partyId)
    ? found.parties.find((p) => p.id === partyId)
    : undefined;
  if (!party) return fail("Choose who is declining, then try again.");
  if (!isPubliclySignable(party.role)) return fail(GONE);

  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);

  const ok = await declineCue(found.cue.id, party.id, reason, {
    ipHash,
    userAgent: await userAgentHeader(),
  });
  if (!ok) return fail(GONE);

  // Back to the signing page, which now renders the declined state.
  redirect(`/s/${token}`);
}

/* The header order here is the whole rate limit, and it is copied deliberately
   from src/app/actions.ts rather than shared — read the long comment there for
   the reasoning, which applies with more force on this endpoint than on the
   waitlist.

   In short: Caddy sets X-Real-IP from the TCP peer, which a client cannot
   influence. X-Forwarded-For carries no such guarantee — whether a proxy
   replaces or appends to it is that proxy's choice — so trusting it first would
   let anyone rotate the header for unlimited signing attempts and would poison
   the ip_hash stored on the signature itself. XFF is consulted only when
   X-Real-IP is absent, i.e. when there is no proxy at all. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

async function userAgentHeader(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 255) ?? null;
}

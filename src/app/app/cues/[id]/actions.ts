"use server";

/* Server actions for the builder, the share screen, and the sealed record.
 *
 * Every one of these re-derives the studio from the session and passes
 * `studio.id` down. An id arriving from a form is a claim, not a fact: the db
 * layer scopes every statement by `studio_id`, but the session is what decides
 * which studio_id that is. Nothing here reads a studio or owner id from input.
 *
 * Field-level permission is not re-implemented here either — `updateCue` runs
 * every patch through `permittedPatch` and re-asserts `status = 'draft'` inside
 * the UPDATE, so a stale tab cannot rewrite a sent agreement. This layer's job
 * is shape validation: keys, types, and lengths.
 */

import { revalidatePath } from "next/cache";
import type { Vars } from "@/lib/agreement";
import { isPubliclySignable, isPartyRole } from "@/lib/cue";
import {
  addParty,
  removeParty,
  sendCue,
  updateCue,
  voidCue,
  type CuePatch,
  type SendResult,
} from "@/lib/cue-db";
import { requireStudio } from "@/lib/studio";

const MAX_SHORT = 200;
const MAX_LONG = 8000;
const MAX_VARS = 300;
const MAX_OMITTED = 200;
/* Question keys and clause ids are authored in templates.ts, so they are always
   lower snake_case. Anything else did not come from a question this product
   asked, and there is no reason to persist it. */
const KEY = /^[a-z0-9_]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cueId(value: number): number | null {
  const id = Math.trunc(Number(value));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/** Empty means "no value" for a nullable column — never the empty string. A
    `date` column rejects `''` outright, and `location = ''` would render as a
    location rather than as a blank the creator can still see is missing. */
function nullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function sanitiseVars(input: unknown): Vars | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const out: Vars = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_VARS) break;
    if (!KEY.test(key)) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, MAX_LONG);
  }
  return out;
}

function sanitiseIds(input: unknown): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  const ids = input.filter((v): v is string => typeof v === "string" && KEY.test(v));
  return [...new Set(ids)].slice(0, MAX_OMITTED);
}

/* ── The builder's autosave ──
   Deliberately does not revalidate: it fires every 800ms while a creator types,
   and refreshing the server tree on each one would fight the local state it was
   about to overwrite. The paths that change what the *server* owns — status,
   parties, notes — revalidate below. */
export async function saveCue(
  id: number,
  input: {
    title?: string;
    clientName?: string;
    clientEmail?: string;
    shootDate?: string;
    location?: string;
    vars?: Vars;
    omittedClauses?: string[];
  },
): Promise<{ ok: boolean }> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  if (!target) return { ok: false };

  const patch: CuePatch = {};

  const title = text(input.title, MAX_SHORT)?.trim();
  if (title !== undefined) patch.title = title || "Untitled Cue";

  const clientName = text(input.clientName, MAX_SHORT);
  if (clientName !== undefined) patch.client_name = clientName.trim();

  const clientEmail = nullable(text(input.clientEmail, MAX_SHORT));
  if (clientEmail !== undefined) patch.client_email = clientEmail;

  const shootDate = nullable(text(input.shootDate, 10));
  if (shootDate !== undefined) {
    patch.shoot_date = shootDate && ISO_DATE.test(shootDate) ? shootDate : null;
  }

  const location = nullable(text(input.location, MAX_SHORT));
  if (location !== undefined) patch.location = location;

  const vars = sanitiseVars(input.vars);
  if (vars !== undefined) patch.vars = vars;

  const omitted = sanitiseIds(input.omittedClauses);
  if (omitted !== undefined) patch.omitted_clauses = omitted;

  const updated = await updateCue(studio.id, target, patch);
  return { ok: Boolean(updated) };
}

/** Internal notes. Editable forever, including on a sealed record. */
export async function saveNotes(id: number, notes: string): Promise<{ ok: boolean }> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  if (!target) return { ok: false };

  const updated = await updateCue(studio.id, target, {
    notes: notes.slice(0, MAX_LONG).trim() || null,
  });
  return { ok: Boolean(updated) };
}

export async function sendCueAction(id: number): Promise<SendResult> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  if (!target) return { ok: false, error: "not_found" };

  const result = await sendCue(studio, target);
  if (result.ok) {
    revalidatePath(`/app/cues/${target}`);
    revalidatePath("/app/cues");
    revalidatePath("/app");
  }
  return result;
}

export async function voidCueAction(id: number): Promise<{ ok: boolean }> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  if (!target) return { ok: false };

  const ok = await voidCue(studio.id, target);
  if (ok) {
    revalidatePath(`/app/cues/${target}`);
    revalidatePath("/app/cues");
    revalidatePath("/app");
  }
  return { ok };
}

export type PartyError = "invalid_role" | "invalid_name" | "invalid_email" | "rejected";

export async function addPartyAction(
  id: number,
  input: { role: string; name: string; email: string },
): Promise<{ ok: boolean; error?: PartyError }> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  if (!target) return { ok: false, error: "rejected" };

  /* The client party is created with the Cue and there is exactly one of them,
     so everyone added here is a co-signer. `creator` is refused as well: the
     share link authorises signing any party on the Cue, so a creator party
     would let whoever holds the link forge the photographer's own signature.
     See `isPubliclySignable` in src/lib/cue.ts. The dropdown no longer offers
     it; this is the gate. */
  if (!isPartyRole(input.role) || input.role === "client" || !isPubliclySignable(input.role)) {
    return { ok: false, error: "invalid_role" };
  }

  const name = text(input.name, MAX_SHORT)?.trim() ?? "";
  if (name.length < 2) return { ok: false, error: "invalid_name" };

  const email = nullable(text(input.email, MAX_SHORT)) ?? null;
  if (email && !EMAILISH.test(email)) return { ok: false, error: "invalid_email" };

  const party = await addParty(studio.id, target, { role: input.role, name, email });
  if (!party) return { ok: false, error: "rejected" };

  revalidatePath(`/app/cues/${target}`);
  return { ok: true };
}

export async function removePartyAction(
  id: number,
  partyId: number,
): Promise<{ ok: boolean }> {
  const { studio } = await requireStudio();
  const target = cueId(id);
  const party = cueId(partyId);
  if (!target || !party) return { ok: false };

  const ok = await removeParty(studio.id, target, party);
  if (ok) revalidatePath(`/app/cues/${target}`);
  return { ok };
}

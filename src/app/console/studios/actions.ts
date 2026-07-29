"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, updateStudio } from "@/lib/studio";
import { recordAdminEvent, setStudioPlan, studioDetail } from "@/lib/admin";
import { isPlan } from "@/lib/cue";
import { isValidEmail, normaliseEmail } from "@/lib/waitlist";
import { withDatabaseTransaction } from "@/lib/db";

/* Operator writes against a customer's account.
 *
 * Two of them, and that is the whole list. Both start with requireOperator() —
 * not "is there a session", which is the exact bug that was found on three API
 * routes on 2026-07-26. requireOperator() fails closed and reads the `role`
 * column; a creator session gets nothing here.
 *
 * What an operator may change:
 *   • the studio's own profile — name, legal name, email, phone, address,
 *     brand colour. Enforced by updateStudio() in studio.ts, whose SET clause
 *     is built from a literal column map, so a crafted form field cannot add a
 *     column to it.
 *   • the studio's plan. Manual because Stripe is deliberately not wired for
 *     version one (see docs/solution.md), so somebody has to move it by hand.
 *
 * What an operator may not change, ever: anything on cue, cue_party or
 * cue_event. No action here writes to them, admin.ts contains no statement that
 * could, and cue_event has a BEFORE UPDATE trigger behind both. A sealed record
 * is immutable by the client, by the studio, and by us — support access is not
 * tamper access.
 *
 * Every mutation writes an admin_event. Nothing personal is logged. */

export type AdminActionState = { status: "idle" | "ok" | "error"; message: string };

function fail(message: string): AdminActionState {
  return { status: "error", message };
}

const BROKE = "Something broke on our end. Try again in a moment.";
const EXPIRED = "Your operator session has expired. Sign in again.";

function text(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function studioIdFrom(formData: FormData): number | null {
  const id = Number(text(formData.get("studioId"), 20));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Matches the studio.brand_color CHECK constraint exactly. */
const BRAND_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateStudioProfileAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireOperator();
  if (!operator) return fail(EXPIRED);

  const studioId = studioIdFrom(formData);
  if (studioId === null) return fail("That customer id doesn't look right.");

  const name = text(formData.get("name"), 120);
  if (!name) return fail("A studio needs a name.");

  const email = normaliseEmail(formData.get("email"));
  if (email && !isValidEmail(email)) return fail("That email address doesn't look right.");

  const brandColor = text(formData.get("brandColor"), 7).toLowerCase();
  if (brandColor && !BRAND_COLOR.test(brandColor)) {
    return fail("Brand colour needs to be a six-digit hex, like #0086ff.");
  }

  const patch = {
    name,
    legalName: text(formData.get("legalName"), 160),
    email,
    phone: text(formData.get("phone"), 40),
    address: text(formData.get("address"), 400),
    brandColor,
  };

  try {
    const before = await studioDetail(studioId);
    if (!before) return fail("No customer with that id.");

    /* The audit row records which fields were written, never what was written
       into them — see recordAdminEvent in admin.ts. Diffing first also means a
       save with nothing changed does not manufacture an audit entry, which
       would make the trail noisier and less trustworthy, not more. */
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter(
      (key) => (patch[key] || null) !== (before[key] || null),
    );
    if (!changed.length) return { status: "ok", message: "Nothing to change." };

    const updated = await withDatabaseTransaction(async (client) => {
      const result = await updateStudio(studioId, patch, client);
      if (!result) return null;
      await recordAdminEvent({
        operator,
        action: "studio.profile",
        studioId,
        meta: { fields: changed },
      }, client);
      return result;
    });
    if (!updated) return fail("No customer with that id.");
  } catch (err) {
    console.error(`[console] studio ${studioId} profile update failed`, (err as Error).message);
    return fail(BROKE);
  }

  revalidatePath(`/console/studios/${studioId}`);
  revalidatePath("/console/studios");
  return { status: "ok", message: "Saved." };
}

export async function setStudioPlanAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireOperator();
  if (!operator) return fail(EXPIRED);

  const studioId = studioIdFrom(formData);
  if (studioId === null) return fail("That customer id doesn't look right.");

  const plan = text(formData.get("plan"), 20);
  if (!isPlan(plan)) return fail("That is not a plan.");

  try {
    const before = await studioDetail(studioId);
    if (!before) return fail("No customer with that id.");
    if (before.plan === plan) return { status: "ok", message: "Already on that plan." };

    const applied = await withDatabaseTransaction(async (client) => {
      const result = await setStudioPlan(studioId, plan, client);
      if (!result) return null;
      await recordAdminEvent({
        operator,
        action: "studio.plan",
        studioId,
        meta: { from: before.plan, to: result },
      }, client);
      return result;
    });
    if (!applied) return fail("No customer with that id.");
  } catch (err) {
    console.error(`[console] studio ${studioId} plan change failed`, (err as Error).message);
    return fail(BROKE);
  }

  revalidatePath(`/console/studios/${studioId}`);
  revalidatePath("/console/studios");
  return { status: "ok", message: "Plan updated." };
}

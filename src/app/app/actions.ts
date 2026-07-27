"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCue, deleteCue } from "@/lib/cue-db";
import { requireStudio, updateStudio } from "@/lib/studio";
import { templateBySlug } from "@/lib/templates";
import { isValidEmail, normaliseEmail } from "@/lib/waitlist";

/* Server actions for the workspace, the template picker, and settings.

   Every one of these re-derives the studio from the session with
   requireStudio(). A studio id in a form field is a request from the client,
   not a fact, and this is the authorisation boundary for the whole surface —
   cue-db.ts then scopes every statement by that id in its WHERE clause. */

export type ActionState = { status: "idle" | "ok" | "error"; message: string };

function fail(message: string): ActionState {
  return { status: "error", message };
}

function text(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** Matches the studio.brand_color CHECK constraint exactly. */
const BRAND_COLOR = /^#[0-9a-fA-F]{6}$/;

const BROKE = "Something broke on our end. Try again in a moment.";

export async function createCueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { studio } = await requireStudio();

  // The slug is validated against the template registry rather than trusted:
  // createCue would throw on an unknown one, and a thrown server action is a
  // 500 in the UI instead of a sentence the creator can act on.
  const template = templateBySlug(text(formData.get("template"), 40));
  if (!template) return fail("Pick a template to start from.");

  const clientName = text(formData.get("clientName"), 120);
  if (!clientName) return fail("Enter your client's name.");

  const clientEmail = normaliseEmail(formData.get("clientEmail"));
  if (clientEmail && !isValidEmail(clientEmail)) {
    return fail("That email address doesn't look right.");
  }

  // An untitled Cue is unfindable in the list, so a blank title falls back to
  // the client's name — which is what a photographer would have typed anyway.
  const title = text(formData.get("title"), 140) || clientName;

  let id: number;
  try {
    const cue = await createCue(studio.id, {
      templateSlug: template.slug,
      title,
      clientName,
      clientEmail: clientEmail || null,
    });
    id = cue.id;
  } catch (err) {
    console.error("[app] createCue failed", (err as Error).message);
    return fail(BROKE);
  }

  revalidatePath("/app");
  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a successful create into an error message.
  redirect(`/app/cues/${id}`);
}

export async function updateStudioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { studio } = await requireStudio();

  const name = text(formData.get("name"), 120);
  if (!name) return fail("Your studio needs a name.");

  const email = normaliseEmail(formData.get("email"));
  if (email && !isValidEmail(email)) return fail("That email address doesn't look right.");

  // Lower-cased so the stored value matches what the colour input round-trips;
  // the DB accepts either case but a hex that changes shape on every save reads
  // as the form losing the value.
  const brandColor = text(formData.get("brandColor"), 7).toLowerCase();
  if (brandColor && !BRAND_COLOR.test(brandColor)) {
    return fail("Brand colour needs to be a six-digit hex, like #0086ff.");
  }

  try {
    await updateStudio(studio.id, {
      name,
      legalName: text(formData.get("legalName"), 160),
      email,
      phone: text(formData.get("phone"), 40),
      address: text(formData.get("address"), 400),
      brandColor,
    });
  } catch (err) {
    console.error("[app] updateStudio failed", (err as Error).message);
    return fail(BROKE);
  }

  revalidatePath("/app/settings");
  // The studio name and brand colour show up on the client-facing document, so
  // the workspace has to forget what it rendered too.
  revalidatePath("/app");
  return { status: "ok", message: "Saved." };
}

/* Drafts only — deleteCue enforces that in SQL, because a sent Cue is a record
   somebody may have read and voiding is the remedy. Takes a bare FormData so a
   plain <form action={deleteCueAction}> can call it with no client JavaScript. */
export async function deleteCueAction(formData: FormData): Promise<void> {
  const { studio } = await requireStudio();

  const id = Number(text(formData.get("id"), 20));
  if (!Number.isInteger(id) || id <= 0) return;

  await deleteCue(studio.id, id);
  revalidatePath("/app");
}

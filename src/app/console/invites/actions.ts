"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/studio";
import { recordAdminEvent } from "@/lib/admin";
import {
  createInvite,
  deleteUnacceptedInvite,
  parseAccessDate,
  updateInviteAccess,
} from "@/lib/invite";
import { isValidEmail, normaliseEmail, MAX_EMAIL_LENGTH } from "@/lib/waitlist";
import { isPlan } from "@/lib/cue";

/* Operator writes against the invite list.
 *
 * Every one starts with requireOperator() — not "is there a session", which is
 * the exact bug found on three API routes on 2026-07-26. These actions decide
 * who can create an account and how long they keep it, so a creator session
 * reaching them would be the whole gate falling over.
 *
 * What an operator may do here, and it is the complete list:
 *   • invite somebody — name, address, the plan they start on, and the window
 *     they get;
 *   • move the end of that window or change that plan, withdraw and restore
 *     access;
 *   • delete an invite nobody has taken up.
 *
 * What no action here can do: change the address an invite is for, change its
 * token, change the plan of an invite somebody has already accepted, or delete
 * an invite an account is already standing on. The first two
 * are enforced by the column allowlist in updateInviteAccess(), the third by the
 * WHERE clause in deleteUnacceptedInvite(). Re-pointing a live invite at a new
 * address would be a silent account takeover, and deleting an accepted one
 * would lock somebody out through a path with no audit story — revoking says
 * what happened and can be undone.
 *
 * Every mutation writes an admin_event, and none of them log an invitee's
 * email: the id is enough to find the row, and admin_event refuses DELETE.
 */

export type InviteActionState = { status: "idle" | "ok" | "error"; message: string };

const BROKE = "Something broke on our end. Try again in a moment.";
const EXPIRED = "Your operator session has expired. Sign in again.";

function fail(message: string): InviteActionState {
  return { status: "error", message };
}

function text(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function inviteIdFrom(formData: FormData): number | null {
  const id = Number(text(formData.get("inviteId"), 20));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function createInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const operator = await requireOperator();
  if (!operator) return fail(EXPIRED);

  const name = text(formData.get("name"), 120);
  if (!name) return fail("Give them a name so the list is readable.");

  const email = normaliseEmail(formData.get("email"));
  if (!email) return fail("An invite needs an email address.");
  if (email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
    return fail("That email address doesn't look right.");
  }

  /* Checked here and again by the CHECK constraint migration 010 puts on
     invite.plan — a plan this form could write but the studio table refuses
     would be a 500 at the moment somebody accepts their invite, which is the
     worst possible moment. */
  const plan = text(formData.get("plan"), 20);
  if (!isPlan(plan)) return fail("That is not a plan.");

  /* Blank start means "now" — the common case is inviting somebody you are
     about to message. Blank end means no expiry, which is a real choice and not
     a mistake, so it is not defaulted to some arbitrary number of days. */
  const startsAt = parseAccessDate(text(formData.get("startsAt"), 10), "start") ?? new Date();
  const expiresAt = parseAccessDate(text(formData.get("expiresAt"), 10), "end");
  if (expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    return fail("The end of the access period has to come after the start.");
  }

  try {
    const invite = await createInvite({
      name,
      email,
      plan,
      startsAt,
      expiresAt,
      invitedBy: operator.email,
      note: text(formData.get("note"), 200) || null,
    });

    if (invite === "duplicate") {
      return fail(`${email} already has an invite. Edit that one instead.`);
    }

    await recordAdminEvent({
      operator,
      action: "invite.create",
      // The id, never the address — see the note above ADMIN_ACTIONS.
      meta: {
        inviteId: invite.id,
        plan,
        expires: expiresAt ? "dated" : "open-ended",
      },
    });
  } catch (err) {
    console.error("[console] invite create failed", (err as Error).message);
    return fail(BROKE);
  }

  revalidatePath("/console/invites");
  return { status: "ok", message: `Invited. Copy the link and send it to them.` };
}

/* The four things that can happen to an invite after it exists.
   A closed vocabulary, checked below, so the `intent` field of a hand-crafted
   POST cannot mean anything this file did not decide it means. */
const INTENTS = ["revoke", "restore", "settings", "delete"] as const;
type Intent = (typeof INTENTS)[number];

function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

/**
 * Withdraw, restore, move the end of, or remove somebody's invite.
 *
 * One action rather than four, because on screen they are one decision — "how
 * long does this person have" — and a submit button carries its own name and
 * value into the FormData. So the row is a single form with four buttons and a
 * single piece of pending state, instead of four nested forms, which HTML does
 * not allow anyway.
 */
export async function manageInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const operator = await requireOperator();
  if (!operator) return fail(EXPIRED);

  const inviteId = inviteIdFrom(formData);
  if (inviteId === null) return fail("That invite id doesn't look right.");

  const intent = text(formData.get("intent"), 20);
  if (!isIntent(intent)) return fail("That is not something this form can do.");

  try {
    if (intent === "delete") {
      const removed = await deleteUnacceptedInvite(inviteId);
      if (!removed) {
        return fail("They've already signed up — revoke their access instead of deleting it.");
      }
      await recordAdminEvent({ operator, action: "invite.delete", meta: { inviteId } });
      revalidatePath("/console/invites");
      return { status: "ok", message: "Invite removed." };
    }

    const patch: Parameters<typeof updateInviteAccess>[1] =
      intent === "settings"
        ? { expiresAt: parseAccessDate(text(formData.get("expiresAt"), 10), "end") }
        : { revoked: intent === "revoke" };

    if (intent === "settings") {
      /* An absent plan is not an invalid one. The console hides the plan
         control once an invite is accepted — at that point studio.plan is the
         truth — so a save from such a row carries no plan and must still be
         allowed to move the date. Assigned inside the `if` so isPlan() narrows
         the string rather than being cast past the type. */
      const raw = text(formData.get("plan"), 20);
      if (raw) {
        if (!isPlan(raw)) return fail("That is not a plan.");
        patch.plan = raw;
      }
    }

    const updated = await updateInviteAccess(inviteId, patch);
    if (!updated) return fail("No invite with that id.");

    await recordAdminEvent({
      operator,
      action: "invite.access",
      meta: { inviteId, intent },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[console] invite ${inviteId} ${intent} failed`, message);
    // The one constraint an operator can trip from this form is an end date
    // that lands before the invite starts. Worth naming rather than hiding
    // behind BROKE, which would read as "the console is down".
    return fail(
      message.includes("invite_period_check")
        ? "That end date is before the invite starts."
        : BROKE,
    );
  }

  revalidatePath("/console/invites");
  return {
    status: "ok",
    message:
      intent === "revoke"
        ? "Access withdrawn — it stops at their next request."
        : intent === "restore"
          ? "Access restored."
          : "Saved.",
  };
}

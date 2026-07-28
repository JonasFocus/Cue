"use client";

import { useActionState } from "react";
import { CircleAlert, Check, Loader2 } from "lucide-react";
import { PLAN_LABEL, PLANS, type Plan } from "@/lib/cue";
import {
  setStudioPlanAction,
  updateStudioProfileAction,
  type AdminActionState,
} from "./actions";

/* The only two interactive things on this surface, so the only "use client" in
   it. Everything else — the customer list, the usage figures, the client list,
   the Cues and their audit trails — is server-rendered, which is also why none
   of it can grow an edit control by accident.

   Both forms post to a server action that re-checks requireOperator(). The
   markup below is a courtesy; the action is the enforcement.

   Nothing here imports a runtime value from @/lib/admin, and it must stay that
   way: admin.ts reaches pg, and the bundler follows a client component's import
   graph all the way down — including through a dynamic import() — so one value
   pulled across this boundary sends it looking for `dns`, `fs` and `net` in the
   browser and fails the build. The plan vocabulary comes from cue.ts, which is
   pure and which nav.tsx and sign.tsx already import the same way. */

const INITIAL: AdminActionState = { status: "idle", message: "" };

/* Exported for the invites surface, which posts to its own actions but returns
   the same {status, message} shape and should not grow a second look for it. */
export function Feedback({ state, pending }: { state: AdminActionState; pending: boolean }) {
  if (pending) {
    return (
      <span className="cs-feedback" role="status">
        <Loader2 size={13} strokeWidth={2} className="cs-spin" />
        Saving…
      </span>
    );
  }
  if (state.status === "idle") return null;
  return (
    <span
      className={`cs-feedback ${state.status === "ok" ? "cx-ok" : "cx-bad"}`}
      role="status"
    >
      {state.status === "ok" ? (
        <Check size={13} strokeWidth={2.25} />
      ) : (
        <CircleAlert size={13} strokeWidth={2.25} />
      )}
      {state.message}
    </span>
  );
}

export type ProfileFields = {
  id: number;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
};

export function ProfileForm({ studio }: { studio: ProfileFields }) {
  const [state, action, pending] = useActionState(updateStudioProfileAction, INITIAL);

  return (
    <form className="cs-form" action={action}>
      <input type="hidden" name="studioId" value={studio.id} />

      <div className="cs-form-grid">
        <label className="cs-field">
          <span>Studio name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            defaultValue={studio.name}
            autoComplete="off"
          />
        </label>

        <label className="cs-field">
          <span>Legal name</span>
          <input
            name="legalName"
            type="text"
            maxLength={160}
            defaultValue={studio.legalName ?? ""}
            autoComplete="off"
          />
        </label>

        <label className="cs-field">
          <span>Contact email</span>
          <input
            name="email"
            type="email"
            maxLength={254}
            defaultValue={studio.email ?? ""}
            autoComplete="off"
          />
        </label>

        <label className="cs-field">
          <span>Phone</span>
          <input
            name="phone"
            type="text"
            maxLength={40}
            defaultValue={studio.phone ?? ""}
            autoComplete="off"
          />
        </label>

        <label className="cs-field cs-field-wide">
          <span>Address</span>
          <input
            name="address"
            type="text"
            maxLength={400}
            defaultValue={studio.address ?? ""}
            autoComplete="off"
          />
        </label>

        <label className="cs-field">
          <span>Brand colour</span>
          <input
            name="brandColor"
            type="text"
            maxLength={7}
            pattern="#[0-9a-fA-F]{6}"
            placeholder="#0086ff"
            defaultValue={studio.brandColor ?? ""}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="cs-form-foot">
        <button className="cs-button" type="submit" disabled={pending}>
          Save profile
        </button>
        <Feedback state={state} pending={pending} />
      </div>
    </form>
  );
}

export function PlanControl({ studioId, plan }: { studioId: number; plan: Plan }) {
  const [state, action, pending] = useActionState(setStudioPlanAction, INITIAL);

  return (
    <form className="cs-plan" action={action}>
      <input type="hidden" name="studioId" value={studioId} />
      <label className="cs-field">
        <span>Plan</span>
        <select name="plan" defaultValue={plan}>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <button className="cs-button" type="submit" disabled={pending}>
        Change plan
      </button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

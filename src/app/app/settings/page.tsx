import { CreditCard } from "lucide-react";
import { FREE_SENT_ALLOWANCE, PLAN_LABEL } from "@/lib/cue";
import { requireStudio } from "@/lib/studio";
import { SettingsForm } from "./form";
import "../workspace.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Studio settings" };

/* The labels come from cue.ts, which is where the `Plan` type lives. A local
   copy of this map is exactly what went stale when Creator was renamed to Pro:
   it type-checks against the old vocabulary right up until the union changes,
   and then says the wrong word rather than failing to compile. */

export default async function SettingsPage() {
  const { user, studio } = await requireStudio();

  const free = studio.plan === "free";
  const sent = studio.sentCount;
  // Cap the bar, not the count: a plan change that leaves sent_count above the
  // free allowance must not draw a meter wider than its track.
  const used = free ? Math.min(sent / FREE_SENT_ALLOWANCE, 1) : 0;

  return (
    <div className="ca-pane ca-pane-narrow">
      <header className="cw-head ca-rise">
        <div>
          <h1 className="ca-h1">Studio settings</h1>
          <p className="ca-sub">
            This is the studio your clients see on every agreement. Signed in as{" "}
            {user.email}.
          </p>
        </div>
      </header>

      <SettingsForm
        studio={{
          name: studio.name,
          legalName: studio.legalName,
          email: studio.email,
          phone: studio.phone,
          address: studio.address,
          brandColor: studio.brandColor,
        }}
      />

      <section className="ca-card ca-card-pad cw-plan ca-rise">
        <div className="ca-section-head">
          <h2 className="ca-h2">Plan</h2>
          <span className="ca-pill" data-tone={free ? "neutral" : "ok"}>
            {PLAN_LABEL[studio.plan]}
          </span>
        </div>

        {free ? (
          <>
            <p className="cw-plan-count ca-nums">
              {Math.min(sent, FREE_SENT_ALLOWANCE)} of {FREE_SENT_ALLOWANCE} free Cues
              sent
            </p>
            <div
              className="cw-meter"
              style={{ "--cw-used": used } as React.CSSProperties}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={FREE_SENT_ALLOWANCE}
              aria-valuenow={Math.min(sent, FREE_SENT_ALLOWANCE)}
              aria-label="Free Cues sent"
            >
              <i />
            </div>
            <p className="ca-help">
              The allowance counts Cues you send, not drafts you build — drafts are
              always free. It is a total, not a monthly reset.
            </p>
          </>
        ) : (
          <p className="ca-help">
            {PLAN_LABEL[studio.plan]} includes unlimited Cues. {sent} sent so far.
          </p>
        )}

        {/* No Stripe: plans are defined, billing is deliberately not wired for
            version one, so upgrade interest goes to a human. */}
        <a
          className="ca-btn ca-btn-ghost cw-plan-btn"
          href="mailto:hello@krevo.io?subject=Cue%20plan"
        >
          <CreditCard size={15} strokeWidth={2} aria-hidden />
          {free ? "Ask about a plan" : "Talk to us about billing"}
        </a>
      </section>
    </div>
  );
}

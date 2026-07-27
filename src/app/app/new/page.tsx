import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { canSend, FREE_SENT_ALLOWANCE } from "@/lib/cue";
import { requireStudio } from "@/lib/studio";
import { TEMPLATES } from "@/lib/templates";
import { Picker } from "./picker";
import "../workspace.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "New Cue" };

export default async function NewCuePage() {
  const { studio } = await requireStudio();

  // The allowance is spent on send, never on create, so this only warns — a
  // creator who has used their five must still be able to build drafts.
  const sendingPaused = !canSend(studio.plan, studio.sentCount);

  const options = TEMPLATES.map((t) => ({
    slug: t.slug,
    name: t.name,
    blurb: t.blurb,
    tone: t.tone,
    meta: t.meta,
    questions: t.questions.length,
  }));

  return (
    <div className="ca-pane cw-new">
      <header className="cw-head ca-rise">
        <div>
          <Link className="cw-back" href="/app">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Your Cues
          </Link>
          <h1 className="ca-h1">Start a new Cue</h1>
          <p className="ca-sub">
            Pick the template closest to the job. You can change every clause before
            anything is sent.
          </p>
        </div>
      </header>

      {sendingPaused && (
        <div className="ca-banner cw-quota" data-tone="warn">
          <Info size={15} strokeWidth={2} aria-hidden />
          <span>
            You&apos;ve sent all {FREE_SENT_ALLOWANCE} Cues included on the free plan.
            Building and editing drafts still works — only sending is paused.{" "}
            <a href="mailto:hello@krevo.io?subject=Cue%20plan">Ask us about a plan</a>.
          </span>
        </div>
      )}

      <Picker templates={options} />
    </div>
  );
}

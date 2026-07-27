"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  FileText,
  Heart,
  Loader2,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { createCueAction, type ActionState } from "../actions";

export type TemplateOption = {
  slug: string;
  name: string;
  blurb: string;
  tone: string;
  meta: string;
  questions: number;
};

const INITIAL: ActionState = { status: "idle", message: "" };

/* Icon per template, chosen here rather than in templates.ts: the template data
   is shared with the PDF and the signing page, neither of which has a React
   icon set. Unknown slugs fall back to a document. */
const ICONS: Record<string, typeof FileText> = {
  wedding: Heart,
  elopement: Sparkles,
  portrait: Users,
  commercial: Briefcase,
  video: Video,
  blank: FileText,
};

export function Picker({ templates }: { templates: readonly TemplateOption[] }) {
  const [state, action, pending] = useActionState(createCueAction, INITIAL);
  const [slug, setSlug] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Picking a template is the first half of one action, so the caret lands on
  // the field that finishes it instead of leaving the creator to hunt for it.
  useEffect(() => {
    if (slug) nameRef.current?.focus();
  }, [slug]);

  const chosen = templates.find((t) => t.slug === slug) ?? null;
  const trimmed = clientName.trim();

  return (
    <form action={action}>
      <fieldset className="cw-tpl-set">
        <legend className="ca-sr-only">Choose a template</legend>
        <div className="cw-tpl-grid ca-stagger">
          {templates.map((t, i) => {
            const Icon = ICONS[t.slug] ?? FileText;
            return (
              <label
                key={t.slug}
                className="cw-tpl"
                data-tone={t.tone}
                style={{ "--i": i } as React.CSSProperties}
              >
                <input
                  className="ca-sr-only"
                  type="radio"
                  name="template"
                  value={t.slug}
                  checked={slug === t.slug}
                  onChange={() => setSlug(t.slug)}
                />
                <span className="cw-tpl-tile" aria-hidden>
                  <Icon size={17} strokeWidth={2} />
                </span>
                <span className="cw-tpl-name">
                  {t.name}
                  <Check className="cw-tpl-tick" size={15} strokeWidth={3} aria-hidden />
                </span>
                <span className="cw-tpl-blurb">{t.blurb}</span>
                <span className="cw-tpl-meta">
                  <span>{t.meta}</span>
                  <span>{t.questions} questions</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {chosen && (
        <div className="ca-card ca-card-pad cw-start ca-rise">
          <div className="ca-section-head">
            <h2 className="ca-h2">Who is it for?</h2>
            <span className="ca-help">{chosen.name}</span>
          </div>

          <div className="ca-field">
            <label className="ca-label" htmlFor="cw-client">
              Client name
            </label>
            <input
              id="cw-client"
              ref={nameRef}
              className="ca-input"
              type="text"
              name="clientName"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="Ava Harper"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              aria-invalid={state.status === "error" || undefined}
            />
          </div>

          <div className="ca-field">
            <label className="ca-label" htmlFor="cw-client-email">
              Client email <span className="cw-opt">optional</span>
            </label>
            <input
              id="cw-client-email"
              className="ca-input"
              type="email"
              name="clientEmail"
              maxLength={254}
              autoComplete="off"
              placeholder="ava@example.com"
              aria-describedby="cw-client-email-help"
            />
            <p className="ca-help" id="cw-client-email-help">
              You can add this later, before you send. Cue never emails your client
              without you.
            </p>
          </div>

          <div className="ca-field">
            <label className="ca-label" htmlFor="cw-title">
              Title <span className="cw-opt">optional</span>
            </label>
            {/* Placeholder rather than a controlled default: a value that keeps
                rewriting itself as the name is typed fights whoever is editing
                it. Blank falls back to the client's name server-side. */}
            <input
              id="cw-title"
              className="ca-input"
              type="text"
              name="title"
              maxLength={140}
              autoComplete="off"
              placeholder={trimmed || chosen.name}
            />
          </div>

          {state.status === "error" && (
            <p className="ca-banner cw-err" data-tone="danger" role="alert">
              <AlertCircle size={15} strokeWidth={2} aria-hidden />
              {state.message}
            </p>
          )}

          <div className="cw-start-foot">
            <button
              type="submit"
              className="ca-btn ca-btn-primary ca-btn-block"
              disabled={pending}
            >
              {pending ? (
                <Loader2 size={16} strokeWidth={2.25} className="ca-spin" />
              ) : (
                <>
                  Create Cue
                  <ArrowRight size={16} strokeWidth={2.25} />
                </>
              )}
            </button>
            <p className="ca-help">
              This creates a draft. Nothing reaches your client until you send it.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}

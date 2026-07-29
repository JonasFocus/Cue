"use client";

/* The builder.
 *
 * Two panes on a desktop — questions on the left, the live document on the
 * right. One pane and a segmented control on a phone, because a contract at
 * 375px wide is either readable or fillable and never both.
 *
 * The form is generated from `template.questions`. There is no per-template
 * form in this file and there must never be one: `visibleQuestions` decides
 * what is on screen, `questionGroups` decides the sections, and `<QuestionField>`
 * decides the control. A sixth shoot type ships as data in templates.ts.
 *
 * Two different debounces, doing two different jobs:
 *   • ~120ms on the preview, so `renderAgreement` does not run on every
 *     keystroke on a mid-range phone.
 *   • ~800ms on the autosave, because a photographer closes the tab.
 * The inputs themselves are never debounced — a text field that lags its own
 * keystrokes feels broken in a way no amount of preview smoothness excuses.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Lock,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import {
  BLANK,
  defaultVars,
  hasBlanks,
  matches,
  renderAgreement,
  visibleQuestions,
  type Question,
  type StudioIdentity,
  type Template,
  type VarValue,
  type Vars,
} from "@/lib/agreement";
import {
  ADDABLE_ROLES,
  isFrozen,
  isPartyRole,
  isSealed,
  ROLE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type PartyRole,
} from "@/lib/cue";
import type { Cue, Party } from "@/lib/cue-db";
import { AgreementView } from "@/components/agreement-view";
import {
  addPartyAction,
  removePartyAction,
  saveCue,
  sendCueAction,
  voidCueAction,
} from "./actions";
import { NotesCard, QuestionField, SaveState } from "./fields";

type Draft = {
  title: string;
  clientName: string;
  clientEmail: string;
  shootDate: string;
  location: string;
  vars: Vars;
  omittedClauses: string[];
};

type Payload = {
  title: string;
  clientName: string;
  clientEmail: string;
  shootDate: string;
  location: string;
  vars: Vars;
  omittedClauses: string[];
};

const SEND_ERROR: Record<string, string> = {
  wrong_status:
    "This Cue is no longer a draft — it has already been sent or voided in another tab. Reload to see where it stands.",
  no_parties: "Add at least one signer before sending. A Cue with nobody to sign it is not a Cue.",
  not_found: "This Cue no longer exists.",
  /* The server's own blanks check, which is the authority. Reachable when a
     field is cleared inside the 120ms preview debounce and send is hit before
     the button catches up. Better a refused send than a permanently frozen
     document with ———— in it. */
  has_blanks:
    "Something is still blank in the agreement. Nothing was sent — check the highlighted fields and try again.",
};

/* Autosave compares serialised payloads, so the serialisation has to be stable:
   `vars` comes back from jsonb in Postgres' own key order, not the order the
   builder wrote it in, and an unstable compare would fire a pointless save on
   every page load and flash "Saved" at a creator who changed nothing. */
function wire(payload: Payload): string {
  return JSON.stringify({
    ...payload,
    vars: Object.fromEntries(
      Object.entries(payload.vars).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    omittedClauses: [...payload.omittedClauses].sort(),
  });
}

/** A boolean `false` is an answer. An empty string is not, and `$0` is not the
    fee anybody meant to agree to. */
function isAnswered(q: Question, value: VarValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return q.type === "money" ? value > 0 : true;
  return true;
}

const BASIC_TOKENS = [
  { token: "{{client.name}}", label: "Client name" },
  { token: "{{shoot.date}}", label: "Shoot date" },
  { token: "{{shoot.location}}", label: "Location" },
  { token: "{{client.email}}", label: "Client email" },
] as const;

export function Builder({
  cue,
  parties,
  template,
  groups,
  studio,
  brandColor,
}: {
  cue: Cue;
  parties: Party[];
  template: Template;
  groups: string[];
  studio: StudioIdentity;
  brandColor: string | null;
}) {
  const router = useRouter();
  const frozen = isFrozen(cue.status);
  const sealed = isSealed(cue.status);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<Draft>(() => ({
    title: cue.title,
    clientName: cue.clientName,
    clientEmail: cue.clientEmail ?? "",
    shootDate: cue.shootDate ?? "",
    location: cue.location ?? "",
    // Defaults under the stored answers: a template that gained a question
    // since this draft was created should show that question's default rather
    // than an empty control.
    vars: { ...defaultVars(template), ...cue.vars },
    omittedClauses: [...cue.omittedClauses],
  }));

  const setVar = useCallback((key: string, value: VarValue) => {
    setDraft((d) => ({ ...d, vars: { ...d.vars, [key]: value } }));
  }, []);

  /* ── The preview ── */

  const [shown, setShown] = useState<Draft>(draft);
  useEffect(() => {
    const timer = setTimeout(() => setShown(draft), 120);
    return () => clearTimeout(timer);
  }, [draft]);

  const doc = useMemo(
    () =>
      renderAgreement(
        template,
        studio,
        {
          title: shown.title || "Untitled Cue",
          clientName: shown.clientName,
          clientEmail: shown.clientEmail || null,
          shootDate: shown.shootDate || null,
          location: shown.location || null,
        },
        shown.vars,
        shown.omittedClauses,
      ),
    [template, studio, shown],
  );

  const blanks = hasBlanks(doc);

  /* Announced instead of the progress block itself. Derived from `shown` (the
     120ms-debounced draft), so it settles once after a burst of typing rather
     than firing per character. Deliberately omits the missing-field list: a
     screen reader reading six field names after every letter is how a form
     becomes unusable. The list stays on screen for everyone to read. */
  const shownQuestions = useMemo(() => visibleQuestions(template, shown.vars), [template, shown]);
  const shownAnswered = shownQuestions.filter((q) => isAnswered(q, shown.vars[q.key])).length;
  const liveSummary = `${shownAnswered} of ${shownQuestions.length} answered.${
    blanks ? " Some details are still blank." : " Nothing left blank."
  }`;

  /* ── Autosave ── */

  const payload = useMemo<Payload>(
    () => ({
      title: draft.title,
      clientName: draft.clientName,
      clientEmail: draft.clientEmail,
      shootDate: draft.shootDate,
      location: draft.location,
      vars: draft.vars,
      omittedClauses: draft.omittedClauses,
    }),
    [draft],
  );

  const serial = wire(payload);
  // Seeded from the row as it came off the server, not from `draft`: the
  // defaults merged above are a real difference worth persisting once.
  const savedRef = useRef(
    wire({
      title: cue.title,
      clientName: cue.clientName,
      clientEmail: cue.clientEmail ?? "",
      shootDate: cue.shootDate ?? "",
      location: cue.location ?? "",
      vars: cue.vars,
      omittedClauses: cue.omittedClauses,
    } satisfies Payload),
  );
  const payloadRef = useRef(payload);
  // Written in an effect, not during render. Every reader is either a later
  // effect or a timer, so it is always current by the time it is read.
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "saved" | "error">(
    "clean",
  );
  /* Server Actions are sequential within one React dispatcher, but pagehide,
     unmount and button handlers can still originate separate requests. Keep one
     explicit queue so an older draft can never finish after a newer one. */
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));

  const flush = useCallback(
    (body: Payload): Promise<boolean> => {
      const sent = wire(body);
      setSaveState("saving");
      const run = async () => {
        try {
          const result = await saveCue(cue.id, body);
          if (!result.ok) {
            setSaveState("error");
            return false;
          }
          savedRef.current = sent;
          setSaveState("saved");
          return true;
        } catch {
          setSaveState("error");
          return false;
        }
      };
      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued;
      return queued;
    },
    [cue.id],
  );

  useEffect(() => {
    if (frozen) return;
    if (serial === savedRef.current) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void flush(payloadRef.current), 800);
    return () => clearTimeout(timer);
  }, [serial, frozen, flush]);

  /* Best effort on the way out. ponytail: a server action, not
     `navigator.sendBeacon` — a beacon needs a route handler to POST to and this
     product has no write endpoint for the builder. Browsers keep an in-flight
     fetch alive briefly after pagehide, which covers the tab-close case most of
     the time; the 800ms debounce is what makes it rarely matter. */
  useEffect(() => {
    if (frozen) return;
    const onHide = () => {
      if (wire(payloadRef.current) !== savedRef.current) void flush(payloadRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [frozen, flush]);

  /* The gap the two listeners above do not cover: a client-side navigation.
     Clicking a sidebar link, "View the record", or the mobile tab bar unmounts
     this component WITHOUT firing `pagehide` or `visibilitychange`, and the
     debounce effect's cleanup then clears the pending save — so an edit made
     within 800ms of the click is silently discarded.

     This has to be its own unmount-only effect. The debounce cleanup cannot do
     it: that cleanup also runs on every dependency change, so flushing there
     would fire a save on every keystroke, which is the thing the debounce
     exists to prevent. Everything is read through refs so the dep array can
     stay empty and the cleanup genuinely means "unmounting".

     A server action started in a cleanup still completes — the request outlives
     the component that made it. */
  const flushRef = useRef(flush);
  const frozenRef = useRef(frozen);
  useEffect(() => {
    flushRef.current = flush;
    frozenRef.current = frozen;
  }, [flush, frozen]);

  useEffect(
    () => () => {
      if (frozenRef.current) return;
      if (wire(payloadRef.current) !== savedRef.current) {
        void flushRef.current(payloadRef.current);
      }
    },
    [],
  );

  /* ── Progress and what is still missing ── */

  const questions = useMemo(() => visibleQuestions(template, draft.vars), [template, draft.vars]);
  const answered = questions.filter((q) => isAnswered(q, draft.vars[q.key])).length;

  /* The clause text actually in play right now. Used to decide whether an empty
     answer is blocking: a blank `start_time` matters because the engagement
     clause names it, an empty `extra_terms` does not because its clause drops
     out entirely. ponytail: substring match on `{{key}}` rather than a parse —
     every token in templates.ts is written without inner spaces, and the render
     path already owns the real regex. */
  const activeBody = useMemo(() => {
    const dropped = new Set(draft.omittedClauses);
    return template.clauses
      .filter((c) => (c.locked || !dropped.has(c.id)) && matches(c.showIf, draft.vars))
      .map((c) => `${c.heading}\n${c.body}`)
      .join("\n");
  }, [template, draft.omittedClauses, draft.vars]);

  const missing = useMemo(() => {
    const out: string[] = [];
    const basics: Record<string, string> = {
      "{{client.name}}": draft.clientName,
      "{{shoot.date}}": draft.shootDate,
      "{{shoot.location}}": draft.location,
      "{{client.email}}": draft.clientEmail,
    };
    for (const { token, label } of BASIC_TOKENS) {
      if (activeBody.includes(token) && !basics[token]?.trim()) out.push(label);
    }
    for (const q of questions) {
      if (isAnswered(q, draft.vars[q.key])) continue;
      if (activeBody.includes(`{{${q.key}}}`)) out.push(q.label);
    }
    return out;
  }, [activeBody, questions, draft]);

  const zeroFees = useMemo(
    () =>
      questions.filter(
        (q) => q.type === "money" && draft.vars[q.key] === 0 && activeBody.includes(`{{${q.key}}}`),
      ),
    [questions, draft.vars, activeBody],
  );

  /* ── Sections ── */

  const sections = useMemo(
    () =>
      groups
        .map((name) => ({ name, items: questions.filter((q) => q.group === name) }))
        .filter((s) => s.items.length > 0),
    [groups, questions],
  );

  /* Open the sections that still need something, closed for the rest. Computed
     once at mount: a group snapping shut because the creator just answered its
     last question would be the form moving under their hands. */
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = { __basics: true };
    for (const name of groups) {
      state[name] = template.questions.some(
        (q) => q.group === name && !isAnswered(q, cue.vars[q.key]),
      );
    }
    return state;
  });

  const toggle = (name: string, next: boolean) =>
    setOpen((prev) => (prev[name] === next ? prev : { ...prev, [name]: next }));

  /* ── Send, void ── */

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState(false);

  async function onSend() {
    setSending(true);
    setSendError(null);
    setAllowance(false);
    try {
      // Drain every earlier request, then persist the newest screen state. A
      // failed save is a hard stop: sending a different agreement is worse than
      // asking the creator to retry.
      await saveQueueRef.current;
      const current = payloadRef.current;
      if (wire(current) !== savedRef.current && !(await flush(current))) {
        setSendError("Your latest edits are not saved yet. Check your connection and try again.");
        return;
      }
      const result = await sendCueAction(cue.id);
      if (result.ok) {
        router.push(`/app/cues/${cue.id}/share`);
        return;
      }
      if (result.error === "allowance") setAllowance(true);
      else setSendError(SEND_ERROR[result.error] ?? "That did not go through. Try again.");
    } catch {
      setSendError("That did not go through. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);

  async function onVoid() {
    setVoiding(true);
    const result = await voidCueAction(cue.id);
    setVoiding(false);
    setConfirmVoid(false);
    if (result.ok) router.refresh();
  }

  const canVoid = !sealed && cue.status !== "voided" && cue.status !== "declined";

  const signatures = parties.map((p) => ({
    id: p.id,
    role: p.role,
    name: p.name,
    typedName: p.typedName,
    signaturePng: p.signaturePng,
    signedAt: p.signedAt,
  }));

  return (
    <div className="bf" data-mode={mode}>
      <header className="bf-head">
        <div className="bf-head-main">
          {frozen ? (
            <h1 className="bf-head-title ca-h1">{draft.title}</h1>
          ) : (
            <label className="bf-title-wrap">
              <span className="ca-sr-only">Cue title</span>
              <input
                className="bf-title"
                value={draft.title}
                placeholder="Untitled Cue"
                maxLength={200}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
              <Pencil size={15} strokeWidth={2} aria-hidden />
            </label>
          )}
          <div className="bf-head-meta">
            <span className="ca-pill" data-tone={STATUS_TONE[cue.status]}>
              {STATUS_LABEL[cue.status]}
            </span>
            <span className="bf-head-template">{template.name}</span>
            <SaveState state={saveState} />
          </div>
        </div>

        <div className="bf-head-actions">
          {frozen ? (
            <Link className="ca-btn ca-btn-ghost" href={`/app/cues/${cue.id}/record`}>
              <ScrollText size={16} strokeWidth={2} aria-hidden />
              View the record
            </Link>
          ) : (
            <button
              type="button"
              className="ca-btn ca-btn-primary bf-send-desktop"
              disabled={blanks || missing.length > 0 || sending}
              onClick={onSend}
            >
              <Send size={16} strokeWidth={2} aria-hidden />
              {sending ? "Sending…" : "Build & send"}
            </button>
          )}
          {cue.status === "sent" || cue.status === "opened" || cue.status === "partially_signed" ? (
            <Link className="ca-btn ca-btn-ghost" href={`/app/cues/${cue.id}/share`}>
              Share link
            </Link>
          ) : null}
        </div>
      </header>

      {/* Mobile only. Both panes at once on a phone is how you get a form you
          cannot type in beside a document you cannot read.

          Two pressed-state buttons rather than role="tablist": a real tab
          pattern owes the assistive layer aria-controls and a role="tabpanel",
          and on the desktop — where both panes are on screen at once — there is
          no tab list to describe. */}
      <div className="bf-modes" role="group" aria-label="Builder view">
        <button
          type="button"
          aria-pressed={mode === "edit"}
          className="bf-mode"
          onClick={() => setMode("edit")}
        >
          <Pencil size={15} strokeWidth={2} aria-hidden />
          Edit
        </button>
        <button
          type="button"
          aria-pressed={mode === "preview"}
          className="bf-mode"
          onClick={() => setMode("preview")}
        >
          <FileText size={15} strokeWidth={2} aria-hidden />
          Preview
        </button>
        <span className="bf-mode-ink" aria-hidden />
      </div>

      <div className="bf-panes">
        <section className="bf-form" aria-label="Agreement questions">
          {/* Product requirement, not decoration. Not dismissible, on every
              builder, whatever the status. */}
          <p className="ca-banner bf-legal">
            <ShieldAlert size={16} strokeWidth={2} aria-hidden />
            <span>
              This is a <strong>template, not a contract</strong> until both parties sign it, and
              Cue is not a law firm and gives no legal advice. Nothing here has been reviewed for
              your jurisdiction — have it read by a qualified lawyer before you rely on it.
            </span>
          </p>

          {frozen && <FrozenNotice cue={cue} sealed={sealed} />}

          {!frozen && (
            <p className="ca-sr-only" role="status">
              {liveSummary}
            </p>
          )}

          {!frozen && (
            <div className="bf-progress">
              <div className="bf-progress-top">
                <strong className="ca-nums">
                  {answered} of {questions.length}
                </strong>
                <span>answered</span>
                <span className="bf-progress-flag" data-ok={!blanks}>
                  {blanks ? (
                    <>
                      <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
                      {missing.length > 0
                        ? `${missing.length} needed to send`
                        : "Blanks left in the document"}
                    </>
                  ) : (
                    <>
                      <Check size={13} strokeWidth={2.6} aria-hidden />
                      No blanks left
                    </>
                  )}
                </span>
              </div>
              <div className="bf-bar">
                <span
                  className="bf-bar-fill"
                  style={{
                    width: `${questions.length ? (answered / questions.length) * 100 : 0}%`,
                  }}
                />
              </div>
              {missing.length > 0 && (
                <p className="bf-missing">
                  Needed before you can send: <strong>{missing.slice(0, 6).join(", ")}</strong>
                  {missing.length > 6 && ` and ${missing.length - 6} more`}.
                </p>
              )}
            </div>
          )}

          <Group
            name="__basics"
            heading="The basics"
            summary="Who, when, where"
            open={open.__basics ?? true}
            onToggle={(next) => toggle("__basics", next)}
          >
            <div className="bf-field">
              <label className="bf-label" htmlFor="bf-client-name">
                Client name
              </label>
              <input
                id="bf-client-name"
                className="ca-input"
                value={draft.clientName}
                disabled={frozen}
                maxLength={200}
                autoComplete="off"
                placeholder="Ana & Tom Whitfield"
                onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
              />
              <p className="bf-help">
                Exactly as it should read in the agreement. It fills every{" "}
                <code>{"{{client.name}}"}</code> in the document.
              </p>
            </div>

            <div className="bf-field">
              <label className="bf-label" htmlFor="bf-client-email">
                Client email
              </label>
              <input
                id="bf-client-email"
                className="ca-input"
                type="email"
                inputMode="email"
                value={draft.clientEmail}
                disabled={frozen}
                maxLength={200}
                autoComplete="off"
                placeholder="ana@example.com"
                onChange={(e) => setDraft((d) => ({ ...d, clientEmail: e.target.value }))}
              />
            </div>

            <div className="bf-two">
              <div className="bf-field">
                <label className="bf-label" htmlFor="bf-shoot-date">
                  Shoot date
                </label>
                <input
                  id="bf-shoot-date"
                  className="ca-input bf-date"
                  type="date"
                  value={draft.shootDate}
                  disabled={frozen}
                  onChange={(e) => setDraft((d) => ({ ...d, shootDate: e.target.value }))}
                />
              </div>
              <div className="bf-field">
                <label className="bf-label" htmlFor="bf-location">
                  Location
                </label>
                <input
                  id="bf-location"
                  className="ca-input"
                  value={draft.location}
                  disabled={frozen}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Hawkstone Barn, Devon"
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                />
              </div>
            </div>
          </Group>

          {sections.map((section) => {
            const done = section.items.filter((q) => isAnswered(q, draft.vars[q.key])).length;
            return (
              <Group
                key={section.name}
                name={section.name}
                heading={section.name}
                summary={`${done}/${section.items.length}`}
                complete={done === section.items.length}
                open={open[section.name] ?? false}
                onToggle={(next) => toggle(section.name, next)}
              >
                {section.items.map((q) => (
                  <QuestionField
                    key={q.key}
                    q={q}
                    value={draft.vars[q.key]}
                    disabled={frozen}
                    onChange={(value) => setVar(q.key, value)}
                  />
                ))}
              </Group>
            );
          })}

          <Clauses
            template={template}
            vars={draft.vars}
            omitted={draft.omittedClauses}
            disabled={frozen}
            onChange={(omittedClauses) => setDraft((d) => ({ ...d, omittedClauses }))}
          />

          <Signers
            cueId={cue.id}
            parties={parties}
            clientName={draft.clientName}
            clientEmail={draft.clientEmail}
            disabled={frozen}
          />

          <NotesCard cueId={cue.id} initial={cue.notes ?? ""} />

          {!frozen && (
            <section className="ca-card ca-card-pad bf-sendcard">
              <h2 className="ca-h2">Send it</h2>
              <p className="bf-help">
                Sending freezes the wording and issues a signing link. After that the document
                cannot be edited — voiding it and building a new one is the only way back.
              </p>

              {zeroFees.length > 0 && (
                <p className="ca-banner" data-tone="warn">
                  <CircleDollarSign size={16} strokeWidth={2} aria-hidden />
                  <span>
                    {zeroFees.map((q) => q.label).join(", ")}{" "}
                    {zeroFees.length === 1 ? "is" : "are"} still $0. The document will say so.
                  </span>
                </p>
              )}

              {allowance && (
                <p className="ca-banner" data-tone="warn">
                  <TriangleAlert size={16} strokeWidth={2} aria-hidden />
                  <span>
                    You have used all five Cues on the free plan. They are a lifetime allowance,
                    not monthly. Email{" "}
                    <a href="mailto:hello@krevo.io?subject=Cue%20allowance">hello@krevo.io</a> and
                    we will lift it — there is no checkout to click yet.
                  </span>
                </p>
              )}

              {sendError && (
                <p className="ca-banner" data-tone="danger">
                  <TriangleAlert size={16} strokeWidth={2} aria-hidden />
                  <span>{sendError}</span>
                </p>
              )}

              <button
                type="button"
                className="ca-btn ca-btn-primary ca-btn-block"
                disabled={blanks || missing.length > 0 || sending}
                onClick={onSend}
              >
                <Send size={16} strokeWidth={2} aria-hidden />
                {sending ? "Sending…" : "Build & send"}
              </button>
              {blanks && (
                <p className="bf-help bf-center">
                  The document still has blanks — fill them and this unlocks.
                </p>
              )}
            </section>
          )}

          {canVoid && (
            <div className="bf-void">
              {confirmVoid ? (
                <>
                  <p className="bf-help">
                    Voiding is permanent. The signing link stops working, the audit trail keeps
                    every event, and the remedy is a new Cue.
                  </p>
                  <div className="ca-row">
                    <button
                      type="button"
                      className="ca-btn ca-btn-danger"
                      disabled={voiding}
                      onClick={onVoid}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      {voiding ? "Voiding…" : "Yes, void it"}
                    </button>
                    <button
                      type="button"
                      className="ca-btn ca-btn-quiet"
                      onClick={() => setConfirmVoid(false)}
                    >
                      Keep it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="ca-btn ca-btn-quiet"
                  onClick={() => setConfirmVoid(true)}
                >
                  Void this Cue
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="bf-preview" aria-label="Document preview">
          <div className="bf-preview-inner">
            <div className="bf-preview-bar">
              <FileText size={14} strokeWidth={2} aria-hidden />
              Live preview
              <span className="bf-preview-count ca-nums">
                {doc.clauses.length} {doc.clauses.length === 1 ? "clause" : "clauses"}
              </span>
            </div>
            <div className="bf-paper">
              <AgreementView
                document={doc}
                studio={studio}
                facts={{
                  clientName: shown.clientName || BLANK,
                  shootDate: shown.shootDate,
                  location: shown.location,
                  reference: `Cue #${cue.id}`,
                }}
                signatures={signatures}
                docHash={cue.docHash}
                sealedAt={cue.sealedAt}
                brandColor={brandColor}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Thumb reach. Sits above the app's own tab bar rather than over it. */}
      {!frozen && (
        <div className="bf-sendbar">
          <div className="bf-sendbar-state">
            {blanks ? (
              <>
                <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
                {missing.length > 0 ? `${missing.length} needed to send` : "Blanks left"}
              </>
            ) : (
              <>
                <Check size={14} strokeWidth={2.6} aria-hidden />
                Ready
              </>
            )}
          </div>
          <button
            type="button"
            className="ca-btn ca-btn-primary"
            disabled={blanks || missing.length > 0 || sending}
            onClick={onSend}
          >
            {sending ? "Sending…" : "Build & send"}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Frozen ──
   Explained rather than hidden. A creator who cannot find the form needs to
   know why it is gone and what they can do instead. */

function FrozenNotice({ cue, sealed }: { cue: Cue; sealed: boolean }) {
  return (
    <div className="ca-banner bf-frozen" data-tone={sealed ? "info" : "warn"}>
      <Lock size={16} strokeWidth={2} aria-hidden />
      <div>
        <strong>
          {sealed
            ? "This agreement is signed and sealed."
            : cue.status === "voided"
              ? "This Cue was voided."
              : cue.status === "declined"
                ? "The client declined this Cue."
                : "The wording is locked."}
        </strong>{" "}
        {sealed
          ? "Its wording, signatures and audit trail can no longer be changed by anyone — that is the point of the record."
          : cue.status === "voided" || cue.status === "declined"
            ? "The signing link no longer resolves. The audit trail is kept in full."
            : "A signing link is out and the client may already have read it, so the document is frozen. Your private notes are still yours to edit."}
        <div className="bf-frozen-actions">
          <Link className="ca-btn ca-btn-ghost" href={`/app/cues/${cue.id}/record`}>
            <ScrollText size={16} strokeWidth={2} aria-hidden />
            View the record
          </Link>
          <Link className="ca-btn ca-btn-quiet" href="/app/new">
            <Plus size={16} strokeWidth={2} aria-hidden />
            Start a new Cue
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Section ──
   Native <details>. Same instinct as the FAQ: the platform has an accordion and
   it is keyboard-accessible, findable by in-page search, and free. `open` is
   controlled because this tree re-renders on every keystroke and an uncontrolled
   one can be snapped shut by a reconciliation the creator did not ask for. */

function Group({
  name,
  heading,
  summary,
  complete,
  open,
  onToggle,
  children,
}: {
  name: string;
  heading: string;
  summary?: string;
  complete?: boolean;
  open: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details
      className="bf-group"
      data-group={name}
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="bf-group-head">
        <ChevronDown className="bf-group-chevron" size={17} strokeWidth={2.2} aria-hidden />
        <span className="bf-group-heading">{heading}</span>
        {summary && (
          <span className="bf-group-count ca-nums" data-complete={complete || undefined}>
            {complete && <Check size={12} strokeWidth={3} aria-hidden />}
            {summary}
          </span>
        )}
      </summary>
      <div className="bf-group-body">{children}</div>
    </details>
  );
}

/* ── Clauses ──
   Locked clauses get no control at all. The engine ignores `omitted` for them,
   so a remove button would be a button that lies. */

function Clauses({
  template,
  vars,
  omitted,
  disabled,
  onChange,
}: {
  template: Template;
  vars: Vars;
  omitted: string[];
  disabled: boolean;
  onChange: (omitted: string[]) => void;
}) {
  const active = useMemo(
    () => template.clauses.filter((c) => matches(c.showIf, vars)),
    [template, vars],
  );
  const dropped = new Set(omitted);
  const removed = active.filter((c) => !c.locked && dropped.has(c.id)).length;

  return (
    <section className="ca-card ca-card-pad bf-clauses">
      <div className="ca-spread">
        <h2 className="ca-h2">Clauses</h2>
        <span className="bf-clauses-count ca-nums">
          {active.length - removed} in · {removed} out
        </span>
      </div>
      <p className="bf-help">
        Which clauses this document carries follows from your answers above. Remove any you do not
        want — the two Cue always keeps are marked.
      </p>

      <ul className="bf-clause-list">
        {active.map((clause) => {
          const out = !clause.locked && dropped.has(clause.id);
          return (
            <li className="bf-clause" key={clause.id} data-out={out || undefined}>
              <span className="bf-clause-name">{clause.heading}</span>
              {clause.locked ? (
                <span className="bf-clause-locked">
                  <Lock size={12} strokeWidth={2.4} aria-hidden />
                  Always included
                </span>
              ) : (
                <button
                  type="button"
                  className="ca-btn ca-btn-quiet bf-clause-btn"
                  disabled={disabled}
                  onClick={() =>
                    onChange(out ? omitted.filter((id) => id !== clause.id) : [...omitted, clause.id])
                  }
                >
                  {out ? (
                    <>
                      <RotateCcw size={14} strokeWidth={2} aria-hidden />
                      Restore
                    </>
                  ) : (
                    <>
                      <X size={14} strokeWidth={2.2} aria-hidden />
                      Remove
                    </>
                  )}
                  <span className="ca-sr-only"> {clause.heading}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Signers ── */


function Signers({
  cueId,
  parties,
  clientName,
  clientEmail,
  disabled,
}: {
  cueId: number;
  parties: Party[];
  /** Live draft values — the client party row lags until autosave lands. */
  clientName: string;
  clientEmail: string;
  disabled: boolean;
}) {
  const formId = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PartyRole>("additional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await addPartyAction(cueId, { role, name, email });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "invalid_name"
          ? "A signer needs a name of at least two characters."
          : result.error === "invalid_email"
            ? "That email address does not look right."
            : "That signer could not be added.",
      );
      return;
    }
    setName("");
    setEmail("");
    setAdding(false);
  }

  async function remove(partyId: number) {
    setBusy(true);
    await removePartyAction(cueId, partyId);
    setBusy(false);
  }

  return (
    <section className="ca-card ca-card-pad bf-signers">
      <div className="ca-spread">
        <h2 className="ca-h2">Who signs</h2>
        <span className="bf-clauses-count ca-nums">{parties.length}</span>
      </div>

      <ul className="bf-party-list">
        {parties.map((party) => {
          // The client party is edited through the Client fields above, not
          // this list — show the live draft so a rename does not leave the
          // signer row reading the name from page load.
          const displayName =
            party.role === "client" ? clientName || party.name : party.name;
          const displayEmail =
            party.role === "client" ? clientEmail || null : party.email;

          return (
          <li className="bf-party" key={party.id}>
            <div className="bf-party-text">
              <span className="bf-party-name ca-truncate">{displayName || "Unnamed signer"}</span>
              <span className="bf-party-meta ca-truncate">
                {ROLE_LABEL[party.role]}
                {displayEmail ? ` · ${displayEmail}` : ""}
              </span>
            </div>
            {party.signedAt ? (
              <span className="ca-pill" data-tone="ok">
                <Check size={12} strokeWidth={3} aria-hidden />
                Signed
              </span>
            ) : party.role === "client" ? (
              <span className="bf-clause-locked">
                <Lock size={12} strokeWidth={2.4} aria-hidden />
                Always signs
              </span>
            ) : (
              <button
                type="button"
                className="ca-icon-btn"
                disabled={disabled || busy}
                onClick={() => void remove(party.id)}
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden />
                <span className="ca-sr-only">Remove {party.name}</span>
              </button>
            )}
          </li>
          );
        })}
      </ul>

      {disabled ? (
        <p className="bf-help">Signers are fixed once a Cue has been sent.</p>
      ) : adding ? (
        <div className="bf-addparty">
          <div className="bf-field">
            <label className="bf-label" htmlFor={`${formId}-name`}>
              Full name
            </label>
            <input
              id={`${formId}-name`}
              className="ca-input"
              value={name}
              maxLength={200}
              autoComplete="off"
              placeholder="Tom Whitfield"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="bf-field">
            <label className="bf-label" htmlFor={`${formId}-email`}>
              Email <span className="bf-optional">optional</span>
            </label>
            <input
              id={`${formId}-email`}
              className="ca-input"
              type="email"
              inputMode="email"
              value={email}
              maxLength={200}
              autoComplete="off"
              placeholder="tom@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="bf-field">
            <label className="bf-label" htmlFor={`${formId}-role`}>
              Signing as
            </label>
            <select
              id={`${formId}-role`}
              className="ca-select"
              value={role}
              onChange={(e) => setRole(isPartyRole(e.target.value) ? e.target.value : "additional")}
            >
              {ADDABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="ca-banner" data-tone="danger">
              <TriangleAlert size={16} strokeWidth={2} aria-hidden />
              <span>{error}</span>
            </p>
          )}

          <div className="ca-row">
            <button
              type="button"
              className="ca-btn ca-btn-dark"
              disabled={busy}
              onClick={() => void submit()}
            >
              <Check size={16} strokeWidth={2.4} aria-hidden />
              {busy ? "Adding…" : "Add signer"}
            </button>
            <button
              type="button"
              className="ca-btn ca-btn-quiet"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="ca-btn ca-btn-ghost bf-addbtn"
            onClick={() => setAdding(true)}
          >
            <UserPlus size={16} strokeWidth={2} aria-hidden />
            Add another signer
          </button>
          <p className="bf-help">
            <Mail size={13} strokeWidth={2} aria-hidden /> Everyone listed signs the same link. Cue
            does not email them — you send the link yourself.
          </p>
        </>
      )}
    </section>
  );
}

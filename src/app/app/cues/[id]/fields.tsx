"use client";

/* The controls.
 *
 * One component per `QuestionType`, dispatched by `<QuestionField>` from the
 * question spec. Nothing here knows which template it is rendering — a sixth
 * shoot type is data in templates.ts, so a control that special-cased a key
 * would be the first crack in that.
 *
 * Also home to the small client widgets the share and record screens need
 * (clipboard, Web Share, print, notes). They live here rather than in
 * builder.tsx so those two pages do not pull the whole builder into their
 * bundle to get a copy button.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Loader2, Printer, Share2, TriangleAlert } from "lucide-react";
import { formatCount, type Question, type VarValue } from "@/lib/agreement";
import { saveNotes } from "./actions";

/* ── Money ──
   Stored as integer cents, always. The display string is local state so that
   typing "1", "12", "12." is not fought by a formatter mid-keystroke, and the
   number that leaves this component is produced by integer arithmetic on the
   digits — never by multiplying a float by 100. */

export function centsToText(cents: number): string {
  if (!Number.isFinite(cents) || cents === 0) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const rest = abs % 100;
  const dollars = Math.floor(abs / 100);
  return rest ? `${sign}${dollars}.${String(rest).padStart(2, "0")}` : `${sign}${dollars}`;
}

export function textToCents(text: string): number {
  const digits = text.replace(/[^\d.]/g, "");
  const dot = digits.indexOf(".");
  const whole = dot === -1 ? digits : digits.slice(0, dot);
  const frac = dot === -1 ? "" : digits.slice(dot + 1).replace(/\./g, "");
  return Number(whole || "0") * 100 + Number(`${frac}00`.slice(0, 2));
}

/** Keeps a half-typed amount typable: digits, at most one dot, at most 2dp. */
function cleanMoney(input: string): string {
  const kept = input.replace(/[^\d.]/g, "").slice(0, 15);
  const dot = kept.indexOf(".");
  if (dot === -1) return kept;
  return `${kept.slice(0, dot + 1)}${kept.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/* ── Shared shell ── */

type Common = {
  q: Question;
  value: VarValue | undefined;
  onChange: (value: VarValue) => void;
  disabled?: boolean;
};

function Field({
  q,
  controlId,
  helpId,
  children,
}: {
  q: Question;
  controlId: string;
  helpId: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="bf-field">
      <label className="bf-label" htmlFor={controlId}>
        {q.label}
      </label>
      {children}
      {q.help && (
        <p className="bf-help" id={helpId}>
          {q.help}
        </p>
      )}
    </div>
  );
}

/* ── text / textarea ── */

function TextField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const helpId = q.help ? `${base}-h` : undefined;

  return (
    <Field q={q} controlId={controlId} helpId={helpId}>
      <input
        id={controlId}
        className="ca-input"
        type="text"
        value={String(value ?? "")}
        placeholder={q.placeholder}
        aria-describedby={helpId}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function TextareaField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const helpId = q.help ? `${base}-h` : undefined;

  return (
    <Field q={q} controlId={controlId} helpId={helpId}>
      <textarea
        id={controlId}
        className="ca-textarea"
        value={String(value ?? "")}
        placeholder={q.placeholder}
        aria-describedby={helpId}
        disabled={disabled}
        rows={5}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/* ── date ──
   Native picker, and the value is passed straight through. It is already
   "YYYY-MM-DD", which is exactly what the engine formats and what the `date`
   column takes; routing it through `new Date()` is how a contract ends up
   naming the day before the wedding. */

function DateField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const helpId = q.help ? `${base}-h` : undefined;

  return (
    <Field q={q} controlId={controlId} helpId={helpId}>
      <input
        id={controlId}
        className="ca-input bf-date"
        type="date"
        value={String(value ?? "")}
        aria-describedby={helpId}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/* ── money ── */

function MoneyField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const helpId = q.help ? `${base}-h` : undefined;
  const cents = typeof value === "number" ? value : 0;

  /* Initialised once. The only writer of this key is this control, and a
     question hidden by `showIf` unmounts, so it re-reads on the way back. */
  const [text, setText] = useState(() => centsToText(cents));

  return (
    <Field q={q} controlId={controlId} helpId={helpId}>
      <div className="bf-affixed" data-disabled={disabled || undefined}>
        <span className="bf-affix" aria-hidden>
          $
        </span>
        <input
          id={controlId}
          className="bf-affixed-input ca-nums"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder="0"
          aria-describedby={helpId}
          disabled={disabled}
          onChange={(e) => {
            const next = cleanMoney(e.target.value);
            setText(next);
            onChange(textToCents(next));
          }}
          onBlur={() => setText(centsToText(textToCents(text)))}
        />
      </div>
    </Field>
  );
}

/* ── percent ── */

function PercentField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const helpId = q.help ? `${base}-h` : undefined;
  const number = typeof value === "number" ? value : 0;
  const [text, setText] = useState(() => (number ? String(number) : ""));

  return (
    <Field q={q} controlId={controlId} helpId={helpId}>
      <div className="bf-affixed" data-suffix data-disabled={disabled || undefined}>
        <input
          id={controlId}
          className="bf-affixed-input ca-nums"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder="0"
          aria-describedby={helpId}
          disabled={disabled}
          onChange={(e) => {
            const cleaned = cleanMoney(e.target.value);
            const parsed = cleaned === "" ? 0 : clamp(Number(cleaned) || 0, 0, 100);
            // Re-show the clamp — typing 140 must visibly become 100 rather than
            // sitting on screen as 140 while the document says 100 — but only
            // when the clamp actually moved the number. Rewriting the text
            // unconditionally would turn "0." back into "0" and make a decimal
            // impossible to type.
            setText(cleaned === "" || parsed === Number(cleaned) ? cleaned : String(parsed));
            onChange(parsed);
          }}
        />
        <span className="bf-affix" aria-hidden>
          %
        </span>
      </div>
    </Field>
  );
}

/* ── toggle ──
   A real switch, so a screen reader announces on/off rather than "button". The
   label sits beside it and is wired with aria-labelledby: a <label for> pointing
   at a button is not a labelling relationship browsers honour. */

function ToggleField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const labelId = `${base}-l`;
  const helpId = q.help ? `${base}-h` : undefined;
  const on = value === true;

  return (
    <div className="bf-field bf-field-switch">
      <div className="bf-switch-text">
        <span className="bf-label" id={labelId}>
          {q.label}
        </span>
        {q.help && (
          <p className="bf-help" id={helpId}>
            {q.help}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={helpId}
        className="bf-switch"
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span className="bf-switch-track" aria-hidden>
          <span className="bf-switch-knob" />
        </span>
      </button>
    </div>
  );
}

/* ── choice ──
   Real radios under the segmented control: arrow-key navigation, one tab stop,
   and a form-associated group come free. Long option labels stack rather than
   being crushed into four 60px columns on a phone. */

const SEGMENT_MAX = 4;
const SHORT_LABEL = 14;

function ChoiceField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const labelId = `${base}-l`;
  const helpId = q.help ? `${base}-h` : undefined;
  const options = q.options ?? [];
  const current = String(value ?? "");

  if (options.length > SEGMENT_MAX) {
    return (
      <Field q={q} controlId={controlId} helpId={helpId}>
        <select
          id={controlId}
          className="ca-select"
          value={current}
          aria-describedby={helpId}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {!options.some((o) => o.value === current) && <option value="">Choose…</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const layout = options.every((o) => o.label.length <= SHORT_LABEL) ? "row" : "col";

  return (
    <div className="bf-field">
      <span className="bf-label" id={labelId}>
        {q.label}
      </span>
      <div
        className="bf-seg"
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={helpId}
        data-layout={layout}
      >
        {options.map((o) => (
          <label className="bf-seg-item" key={o.value}>
            <input
              type="radio"
              name={controlId}
              value={o.value}
              checked={current === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {q.help && (
        <p className="bf-help" id={helpId}>
          {q.help}
        </p>
      )}
    </div>
  );
}

/* ── slider ──
   The control this screen is judged on. A photographer sets "400 images" and
   "30 days" with a thumb, standing in a field.

   ponytail: `navigator.vibrate` is called where it exists, but iOS Safari does
   not implement the Vibration API at all and these users are overwhelmingly on
   iPhone — so the haptic is a bonus and never the feedback. The feel has to come
   from CSS: the thumb scales under the finger, the fill tracks it, the value
   pops on every step, and the detents are visible on the track. Upgrade path is
   none: there is no iOS web haptic to reach for. */

const MAX_TICKS = 24;

function SliderField({ q, value, onChange, disabled }: Common) {
  const base = useId();
  const controlId = `${base}-c`;
  const labelId = `${base}-l`;
  const helpId = q.help ? `${base}-h` : undefined;

  const min = q.min ?? 0;
  const max = q.max ?? 100;
  const step = q.step && q.step > 0 ? q.step : 1;
  const number = typeof value === "number" ? value : min;
  const shown = clamp(number, min, max);
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;

  const steps = (max - min) / step;
  const ticks = Number.isInteger(steps) && steps > 1 && steps <= MAX_TICKS ? steps : 0;

  const [exact, setExact] = useState(() => q.custom === true && number % step !== 0);
  const [draft, setDraft] = useState(() => String(number));

  return (
    <div
      className="bf-field bf-slider"
      data-ticks={ticks || undefined}
      style={{ "--bf-pct": `${pct}%`, "--bf-ticks": ticks || 1 } as React.CSSProperties}
    >
      <div className="bf-slider-head">
        <span className="bf-label" id={labelId}>
          {q.label}
        </span>
        <output className="bf-slider-out" htmlFor={controlId} aria-live="off">
          {/* Keyed on the value so the pop animation restarts on every step,
              with no timer and no transition that has nothing to transition. */}
          <span className="bf-slider-num ca-nums" key={shown}>
            {formatCount(number)}
          </span>
          {q.unit && <span className="bf-slider-unit">{q.unit}</span>}
        </output>
      </div>

      {exact ? (
        <div className="bf-affixed">
          <input
            id={controlId}
            className="bf-affixed-input ca-nums"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft}
            aria-labelledby={labelId}
            aria-describedby={helpId}
            disabled={disabled}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
              setDraft(cleaned);
              onChange(cleaned === "" ? min : clamp(Number(cleaned), min, Number.MAX_SAFE_INTEGER));
            }}
          />
          {q.unit && (
            <span className="bf-affix bf-affix-unit" aria-hidden>
              {q.unit}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="bf-track">
            <input
              id={controlId}
              className="bf-range"
              type="range"
              min={min}
              max={max}
              step={step}
              value={shown}
              aria-labelledby={labelId}
              aria-describedby={helpId}
              aria-valuetext={q.unit ? `${formatCount(shown)} ${q.unit}` : undefined}
              disabled={disabled}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (next === number) return;
                if ("vibrate" in navigator) navigator.vibrate(8);
                setDraft(String(next));
                onChange(next);
              }}
            />
          </div>
          <div className="bf-slider-ends" aria-hidden>
            <span>{formatCount(min)}</span>
            <span>{formatCount(max)}</span>
          </div>
        </>
      )}

      {q.help && (
        <p className="bf-help" id={helpId}>
          {q.help}
        </p>
      )}

      {q.custom && (
        <button
          type="button"
          className="bf-linkbtn"
          aria-pressed={exact}
          disabled={disabled}
          onClick={() => {
            setDraft(String(number));
            setExact((v) => !v);
          }}
        >
          {exact ? "Back to the slider" : "Enter an exact number"}
        </button>
      )}
    </div>
  );
}

/* ── Dispatch ── */

export function QuestionField(props: Common) {
  switch (props.q.type) {
    case "textarea":
      return <TextareaField {...props} />;
    case "date":
      return <DateField {...props} />;
    case "money":
      return <MoneyField {...props} />;
    case "percent":
      return <PercentField {...props} />;
    case "toggle":
      return <ToggleField {...props} />;
    case "choice":
      return <ChoiceField {...props} />;
    case "slider":
      return <SliderField {...props} />;
    case "text":
      return <TextField {...props} />;
  }
}

/* ── Share and record widgets ── */

function useFlash(ms = 2200): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);

  return [on, flash];
}

export function CopyButton({
  text,
  label = "Copy link",
  done = "Copied",
  variant = "ca-btn-dark",
}: {
  text: string;
  label?: string;
  done?: string;
  variant?: string;
}) {
  const [copied, flash] = useFlash();
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      className={`ca-btn ${variant}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setFailed(false);
          flash();
        } catch {
          // Clipboard access can be denied outright (insecure context, or the
          // user said no). Say so rather than showing a false "Copied".
          setFailed(true);
        }
      }}
    >
      {failed ? (
        <TriangleAlert size={16} strokeWidth={2} aria-hidden />
      ) : copied ? (
        <Check size={16} strokeWidth={2.4} aria-hidden />
      ) : (
        <Copy size={16} strokeWidth={2} aria-hidden />
      )}
      {failed ? "Select it and copy" : copied ? done : label}
    </button>
  );
}

/* Capability detection as an external store rather than an effect: the server
   snapshot is `false` so hydration matches, and the client snapshot is read on
   the first commit. `navigator.share` never changes during a page's life, so
   there is nothing to subscribe to. */
const noSubscribe = () => () => {};
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const cannotShare = () => false;

/** Renders nothing where the Web Share API does not exist — which is most
    desktop browsers, and this button is here for the phone. */
export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const can = useSyncExternalStore(noSubscribe, canShare, cannotShare);
  if (!can) return null;

  return (
    <button
      type="button"
      className="ca-btn ca-btn-primary"
      onClick={async () => {
        try {
          await navigator.share({ url, title, text });
        } catch {
          // Includes the user dismissing the sheet, which is not an error.
        }
      }}
    >
      <Share2 size={16} strokeWidth={2} aria-hidden />
      Share
    </button>
  );
}

/** The PDF. agreement.css carries the print stylesheet, so this is the whole
    implementation — no renderer, no worker, no storage. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button type="button" className="ca-btn ca-btn-ghost" onClick={() => window.print()}>
      <Printer size={16} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

/** Internal notes. `canEditField("notes", status)` is true for every status, so
    this is the one control that stays live on a sealed record. */
export function NotesCard({ cueId, initial }: { cueId: number; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"clean" | "dirty" | "saving" | "saved">("clean");
  const savedRef = useRef(initial);

  useEffect(() => {
    if (text === savedRef.current) return;
    setState("dirty");
    const timer = setTimeout(async () => {
      setState("saving");
      const body = text;
      const result = await saveNotes(cueId, body);
      if (result.ok) {
        savedRef.current = body;
        setState("saved");
      } else {
        setState("dirty");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [text, cueId]);

  return (
    <section className="ca-card ca-card-pad bf-notes doc-no-print">
      <div className="ca-spread">
        <h2 className="ca-h2">Private notes</h2>
        <SaveState state={state} />
      </div>
      <p className="bf-help bf-notes-help">
        Yours only. Never rendered into the agreement and never shown to the client,
        which is why they stay editable after the record is sealed.
      </p>
      <textarea
        className="ca-textarea"
        value={text}
        placeholder="Gate code, parking, who to call on the day…"
        aria-label="Private notes"
        onChange={(e) => setText(e.target.value)}
      />
    </section>
  );
}

export function SaveState({ state }: { state: "clean" | "dirty" | "saving" | "saved" | "error" }) {
  if (state === "clean") return null;

  return (
    <span className="bf-save" data-state={state} role="status">
      {state === "saving" && <Loader2 size={13} className="ca-spin" aria-hidden />}
      {state === "saved" && <Check size={13} strokeWidth={2.6} aria-hidden />}
      {state === "error" && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : state === "error"
            ? "Not saved"
            : "Unsaved changes"}
    </span>
  );
}

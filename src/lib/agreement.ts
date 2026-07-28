/* The agreement engine. Pure — no database, no React, no I/O — so the whole
   thing is unit-testable and so the *same* code renders the creator's live
   preview, the client's signing view, and the sealed snapshot. Three renderers
   would be three chances for the document a client signed to differ from the
   one that got sealed.

   A template is a question spec plus an ordered clause list. Questions produce
   `vars`; `showIf` gates which clauses survive; `{{tokens}}` fill the prose.
   Adding a shoot type is data in templates.ts, not code here. */

export type VarValue = string | number | boolean;
export type Vars = Record<string, VarValue>;

export type QuestionType =
  | "text"
  | "textarea"
  | "date"
  | "money"
  | "percent"
  | "toggle"
  | "choice"
  | "slider";

export type Question = {
  key: string;
  type: QuestionType;
  label: string;
  /** Sits under the control. Explain the consequence, not the control. */
  help?: string;
  placeholder?: string;
  default?: VarValue;
  /** choice only. */
  options?: readonly { value: string; label: string }[];
  /** slider only. `custom` adds an "enter an exact number" escape hatch. */
  min?: number;
  max?: number;
  step?: number;
  custom?: boolean;
  /** Suffix rendered inside the control — "photos", "hours". */
  unit?: string;
  /** See `matches`. Absent means always shown. */
  showIf?: string;
  /** Builder section heading. Questions are grouped in declaration order. */
  group: string;
};

export type Clause = {
  id: string;
  heading: string;
  /** Paragraphs separated by a blank line. `{{token}}` slots are filled from
      the render context. Plain text — never HTML. */
  body: string;
  showIf?: string;
  /** The creator cannot remove it. Disclaimer and signature clauses only. */
  locked?: boolean;
};

export type Template = {
  slug: string;
  name: string;
  blurb: string;
  /** Drives the tile colour in the picker. Matches --ca-tone-* in app.css. */
  tone: "rose" | "violet" | "teal" | "amber" | "blue" | "slate";
  /** Shown on the picker tile: "4 clauses · full day". */
  meta: string;
  questions: readonly Question[];
  clauses: readonly Clause[];
};

/* ── Conditions ──
   Atoms: `key`, `!key`, `key=value`. Joined with `&`, which means AND.

   The `&` was added on 2026-07-26 after the single-atom version produced five
   wrong contracts. Answers to hidden questions are deliberately kept in `vars`
   (toggling a section off and back on must not lose what was typed), so a
   clause gated on a *sub*-question stayed true after its parent toggle was
   switched off. Turning "take a deposit" off still produced a document
   demanding 30% up front, because the clause gated on `deposit_type=percent`
   rather than on `deposit`. Marking the deposit refundable produced a document
   that said both "non-refundable once paid" and "refundable in full".

   The earlier comment here said to reach for a derived var instead of growing
   the grammar. In practice that meant inventing bookkeeping vars whose only job
   was to express an AND, which is worse than the AND. This is still not an
   expression language: no OR, no parentheses, no precedence, and nothing to
   sandbox. If a template ever wants OR, write two clauses. */
export function matches(showIf: string | undefined, vars: Vars): boolean {
  if (!showIf) return true;
  return showIf.split("&").every((atom) => atomMatches(atom.trim(), vars));
}

function atomMatches(expr: string, vars: Vars): boolean {
  if (!expr) return true;

  const negated = expr.startsWith("!");
  const body = negated ? expr.slice(1) : expr;
  const eq = body.indexOf("=");

  const result =
    eq === -1
      ? truthy(vars[body])
      : String(vars[body.slice(0, eq)] ?? "") === body.slice(eq + 1);

  return negated ? !result : result;
}

/* Whether an answer means "yes, include the clause this gates".
   `false`, an empty string, and a numeric `0` all mean no: a slider at zero is
   zero revisions, and a clause reading "0 rounds of revisions are included" is
   not what anyone meant. Note this is *clause gating*, not answeredness — the
   builder's own `isAnswered` treats a deliberate 0 as answered, which is a
   different question and a different function. */
function truthy(value: VarValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return value !== 0;
  return true;
}

/** The questions currently worth showing, given the answers so far. */
export function visibleQuestions(
  template: Pick<Template, "questions">,
  vars: Vars,
): Question[] {
  return template.questions.filter((q) => matches(q.showIf, vars));
}

/** Defaults for every question, including ones not yet visible. */
export function defaultVars(template: Pick<Template, "questions">): Vars {
  const vars: Vars = {};
  for (const q of template.questions) {
    if (q.default !== undefined) vars[q.key] = q.default;
  }
  return vars;
}

/* Answers to questions that are no longer visible are kept in `vars`, not
   deleted: toggling "deposit" off and back on should not lose the amount the
   creator already typed. They simply stop reaching the document, because
   clause conditions run against the same `matches`. */

/* ── Formatting ── */

/** Money is stored as integer cents. Never float — 0.1 + 0.2 signs contracts. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    // Whole dollars read better in prose, but $1,234.50 must not become $1,235.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/* Date strings are "YYYY-MM-DD" and are formatted by splitting the string, not
   by `new Date(s)`. `new Date("2026-06-14")` parses as UTC midnight and then
   prints as June 13 for anyone west of Greenwich — which is every US
   photographer this product is for. A contract that names the wrong day is the
   whole ballgame. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/* Audit timestamps: "Jun 14, 2026, 4:12 PM CDT".
 *
 * Rendered in one named zone rather than the viewer's local time — an audit line
 * that reads differently depending on who is looking at it is not much of an
 * audit line.
 *
 * Spelled out as individual components on purpose. The obvious
 * `{ dateStyle, timeStyle, timeZoneName }` is a TypeError at runtime ("Invalid
 * option : option") because ECMA-402 forbids combining the style shorthands
 * with any individual component, and `timeZoneName` is one. It type-checks
 * cleanly and only throws when a signature actually exists to stamp, so it
 * survives every test that never seals a record. Do not "simplify" this back.
 */
const STAMP = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
  timeZoneName: "short",
});

export function formatStamp(iso: string | Date): string {
  return STAMP.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Calendar arithmetic on the date parts, for the same UTC-drift reason. */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ── Render context ── */

export type StudioIdentity = {
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type CueFacts = {
  title: string;
  clientName: string;
  clientEmail?: string | null;
  shootDate?: string | null;
  location?: string | null;
};

/**
 * Flattens studio, cue and vars into the dotted token namespace the clause
 * bodies read. Everything is a display string by the time it lands here, so
 * clause authors never format anything themselves and a number cannot reach
 * the document as "1234" where the rest of the page says "$1,234".
 */
export function buildContext(
  studio: StudioIdentity,
  cue: CueFacts,
  vars: Vars,
  questions: readonly Question[] = [],
): Record<string, string> {
  const ctx: Record<string, string> = {
    "studio.name": studio.name,
    "studio.legal_name": studio.legalName || studio.name,
    "studio.email": studio.email ?? "",
    "studio.phone": studio.phone ?? "",
    "studio.address": studio.address ?? "",
    "cue.title": cue.title,
    "client.name": cue.clientName,
    "client.email": cue.clientEmail ?? "",
    "shoot.date": cue.shootDate ? formatDate(cue.shootDate) : "",
    "shoot.location": cue.location ?? "",
  };

  const byKey = new Map(questions.map((q) => [q.key, q]));

  for (const [key, value] of Object.entries(vars)) {
    ctx[key] = displayValue(value, byKey.get(key));
  }

  return ctx;
}

function displayValue(value: VarValue, q: Question | undefined): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (q?.type === "money") return formatMoney(value);
    if (q?.type === "percent") return `${value}%`;
    return formatCount(value);
  }
  // A choice renders its human label, not its storage value: "on the day of
  // the shoot", never "day_of".
  const option = q?.options?.find((o) => o.value === value);
  if (option) return option.label;
  return value;
}

/* ── Rendering ── */

export type RenderedClause = {
  id: string;
  heading: string;
  /** Plain-text paragraphs. Rendered by React, which escapes them. */
  paragraphs: string[];
};

export type RenderedDocument = {
  title: string;
  clauses: RenderedClause[];
};

const TOKEN = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/* An unfilled token renders as a visible blank, never as raw `{{client.name}}`
   and never as an empty gap. The creator has to be able to see what is still
   missing in the preview, and if one somehow survives to a client it reads as
   an obviously incomplete form rather than as machinery leaking through. */
export const BLANK = "————";

export function fillTokens(body: string, ctx: Record<string, string>): string {
  return body.replace(TOKEN, (_, key: string) => {
    const value = ctx[key.toLowerCase()];
    /* Whitespace counts as unfilled, the same way `truthy` above trims before
       deciding. A pasted newline in a textarea is not an answer, and treating it
       as one produced the worst bug this file can produce: the paragraph filter
       below drops a whitespace-only paragraph, so the clause rendered as a
       heading over nothing, `hasBlanks` found no marker, and a contract with no
       terms in it passed the send gate. Blanking it here fixes that at the
       source and puts a visible ———— in the preview for the creator to fill. */
    return value === undefined || value.trim() === "" ? BLANK : value;
  });
}

/**
 * True when the rendered document is missing something a reader needs.
 *
 * `sendCue` calls this the authority on whether a Cue is ready to send, and the
 * builder's Send button reads the same function — so what it has to support is
 * "nothing is missing", not "no blank paragraphs". A document it passes gets
 * frozen, and a sent Cue cannot be edited.
 *
 * `renderAgreement` runs `fillTokens` over exactly three strings — the title,
 * each clause heading, and each body — and this used to inspect one of them.
 * No template puts a token in a heading today, but the product's whole
 * extension model is that a new shoot type is *data*, and `renderAgreement`
 * supports heading tokens; the first author to use one would otherwise get a
 * silently broken gate.
 *
 * A creator who types the marker into their own text will trip this. That was
 * already true of the paragraph check and is the right trade: one confusing
 * block on a draft they can still edit, against sending a contract with a hole
 * in it.
 */
export function hasBlanks(doc: RenderedDocument): boolean {
  if (doc.title.includes(BLANK)) return true;
  return doc.clauses.some(
    (c) => c.heading.includes(BLANK) || c.paragraphs.some((p) => p.includes(BLANK)),
  );
}

export function renderAgreement(
  template: Pick<Template, "clauses" | "questions">,
  studio: StudioIdentity,
  cue: CueFacts,
  vars: Vars,
  /** Clause ids the creator removed. Locked clauses ignore this. */
  omitted: readonly string[] = [],
): RenderedDocument {
  const ctx = buildContext(studio, cue, vars, template.questions);
  const dropped = new Set(omitted);

  const clauses = template.clauses
    .filter((c) => (c.locked || !dropped.has(c.id)) && matches(c.showIf, vars))
    .map((c) => ({
      id: c.id,
      heading: fillTokens(c.heading, ctx),
      paragraphs: fillTokens(c.body, ctx)
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    }));

  return { title: fillTokens(cue.title, ctx), clauses };
}

/* ── Snapshot and hash ──
   The audit artifact is canonical JSON of the rendered document, not HTML.
   HTML would make the hash hostage to every whitespace change in a React
   component — a template tweak two years from now would invalidate the hash of
   a contract signed today. The rendered text is the thing the parties actually
   agreed to; that is what gets hashed. */

export type Snapshot = {
  version: 1;
  document: RenderedDocument;
  studio: StudioIdentity;
  cue: CueFacts;
  templateSlug: string;
  parties: { name: string; email: string; role: string }[];
};

/** Stable key order at every level, so the same content always hashes alike. */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

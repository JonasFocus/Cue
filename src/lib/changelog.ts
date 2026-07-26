/* Pure changelog rules, kept out of the route and the component for the same
   reason as waitlist.ts: the route is I/O and status-code mapping, the
   component is DOM wiring, and everything actually decidable lives here where
   a test can reach it without a Request, a database or a browser. */

/* The single source of truth for the entry type. The CHECK constraint in
   db/migrations/006_changelog.sql, the POST/PATCH allowlist and the console's
   type picker all derive from this list. */
export const CHANGE_KINDS = ["feature", "fix", "breaking"] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

export function isChangeKind(value: unknown): value is ChangeKind {
  return (
    typeof value === "string" && (CHANGE_KINDS as readonly string[]).includes(value)
  );
}

export const MAX_CODE = 12;
export const MAX_VERSION = 20;
export const MAX_TITLE = 160;
export const MAX_REF = 12;

export type ChangeEntry = {
  id: number;
  code: string;
  version: string;
  kind: ChangeKind;
  title: string;
  ref: string | null;
  createdAt: string;
};

/** Everything a row carries except its identity and its timestamp. */
export type ChangeFields = {
  code: string;
  version: string;
  kind: ChangeKind;
  title: string;
  ref: string | null;
};

/* A literal tuple, not Object.keys: db.ts interpolates these straight into a
   SET clause, so the column names must be constants in the source and never
   anything that arrived over the wire. */
export const CHANGE_FIELDS = ["code", "version", "kind", "title", "ref"] as const;

/**
 * Seven hex characters, git-short-hash shaped, because that is what the
 * reference design reads them as. The composer sends a real commit sha instead
 * whenever the operator has one to paste, so this is only the default.
 */
export function generateCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 7);
}

/**
 * Issue references are stored bare and rendered with a '#'.
 *
 * The operator types whichever of "#420" and "420" is on their clipboard, and
 * without this the two forms round-trip differently and the list renders
 * "##420" for half of them.
 */
export function normaliseRef(raw: unknown): string | null {
  const value = String(raw ?? "")
    .trim()
    .replace(/^#+/, "");
  return value || null;
}

type Bounded = { ok: true; value: string } | { ok: false; error: string };

function bounded(raw: unknown, field: string, max: number): Bounded {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: `${field} is required` };
  if (value.length > max) {
    return { ok: false, error: `${field} must be ${max} characters or fewer` };
  }
  /* Rejected, not truncated. Silently cutting a title at 160 characters loses
     the operator's words with nothing on screen to say so. */
  return { ok: true, value };
}

export type ParsedDraft =
  | { ok: true; fields: ChangeFields }
  | { ok: false; error: string };

/**
 * Validates a POST body into a complete row.
 *
 * `code` is the one optional field: an absent or blank one is generated here,
 * which is what makes adding an entry a title and nothing else.
 */
export function parseChangelogDraft(body: unknown): ParsedDraft {
  const { code, version, kind, title, ref } = (body ?? {}) as Record<string, unknown>;

  if (!isChangeKind(kind)) return { ok: false, error: "invalid kind" };

  const parsedTitle = bounded(title, "title", MAX_TITLE);
  if (!parsedTitle.ok) return parsedTitle;

  const parsedVersion = bounded(version, "version", MAX_VERSION);
  if (!parsedVersion.ok) return parsedVersion;

  const rawCode = String(code ?? "").trim();
  const parsedCode = rawCode
    ? bounded(rawCode, "code", MAX_CODE)
    : ({ ok: true, value: generateCode() } as const);
  if (!parsedCode.ok) return parsedCode;

  const parsedRef = normaliseRef(ref);
  if (parsedRef && parsedRef.length > MAX_REF) {
    return { ok: false, error: `ref must be ${MAX_REF} characters or fewer` };
  }

  return {
    ok: true,
    fields: {
      code: parsedCode.value,
      version: parsedVersion.value,
      kind,
      title: parsedTitle.value,
      ref: parsedRef,
    },
  };
}

export type ParsedPatch =
  | { ok: true; id: number; fields: Partial<ChangeFields> }
  | { ok: false; error: string };

/**
 * Validates a PATCH body into the subset of columns to write.
 *
 * An empty subset is an error rather than a no-op: the update builds its SET
 * clause from these keys, and "nothing to set" is a bug in the caller worth
 * seeing as a 400 instead of a silent 200.
 */
export function parseChangelogPatch(body: unknown): ParsedPatch {
  const { id, ...rest } = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "invalid id" };
  }

  const fields: Partial<ChangeFields> = {};

  if ("kind" in rest) {
    if (!isChangeKind(rest.kind)) return { ok: false, error: "invalid kind" };
    fields.kind = rest.kind;
  }

  for (const [field, max] of [
    ["title", MAX_TITLE],
    ["version", MAX_VERSION],
    ["code", MAX_CODE],
  ] as const) {
    if (!(field in rest)) continue;
    const parsed = bounded(rest[field], field, max);
    if (!parsed.ok) return parsed;
    fields[field] = parsed.value;
  }

  if ("ref" in rest) {
    const parsed = normaliseRef(rest.ref);
    if (parsed && parsed.length > MAX_REF) {
      return { ok: false, error: `ref must be ${MAX_REF} characters or fewer` };
    }
    fields.ref = parsed;
  }

  if (!Object.keys(fields).length) return { ok: false, error: "nothing to update" };

  return { ok: true, id, fields };
}

/* ── Grouping and time ── */

/* The one operator is US Central, so every stamp on this surface renders in
   Chicago time regardless of where the browser happens to be. Doing it with
   Intl's own timeZone means no offset arithmetic and no DST table. */
const CENTRAL = "America/Chicago";

/** "March 15, 2026" — the release heading. */
export function releaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: CENTRAL,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Mar 15, 3:04 PM CT" — the per-entry tooltip. */
export function entryStamp(iso: string): string {
  const stamp = new Date(iso).toLocaleString("en-US", {
    timeZone: CENTRAL,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${stamp} CT`;
}

/* Screenshot order: New Features, then Bug Fixes, then Breaking Changes. */
const KIND_ORDER: Record<ChangeKind, number> = { feature: 0, fix: 1, breaking: 2 };

export type KindGroup = { kind: ChangeKind; entries: ChangeEntry[] };

export type Release = {
  version: string;
  /** The newest entry in the release, already formatted in Central time. */
  date: string;
  groups: KindGroup[];
};

/**
 * Folds a flat newest-first list into the release → type → entries shape the
 * console renders.
 *
 * Version order follows first appearance, so the newest release heads the page
 * without anyone having to sort version strings — "2.10.0" sorts below
 * "2.4.0" as text and comparing them properly is a semver parser nobody asked
 * for. The release date is likewise its newest entry, which is why adding a
 * line never asks for a date.
 */
export function groupReleases(entries: ChangeEntry[]): Release[] {
  const releases = new Map<string, Release>();

  for (const entry of entries) {
    let release = releases.get(entry.version);
    if (!release) {
      release = {
        version: entry.version,
        date: releaseDate(entry.createdAt),
        groups: [],
      };
      releases.set(entry.version, release);
    }

    let group = release.groups.find((g) => g.kind === entry.kind);
    if (!group) {
      group = { kind: entry.kind, entries: [] };
      release.groups.push(group);
    }
    group.entries.push(entry);
  }

  for (const release of releases.values()) {
    release.groups.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  }

  return [...releases.values()];
}

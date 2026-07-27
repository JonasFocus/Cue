import Link from "next/link";
import {
  FileSignature,
  FilePenLine,
  FileText,
  Inbox,
  Plus,
  Search,
  Send,
  SearchX,
} from "lucide-react";
import { formatDate } from "@/lib/agreement";
import {
  groupCount,
  resolveStatusGroup,
  STATUS_GROUP_ALL,
  STATUS_GROUPS,
  STATUS_LABEL,
  STATUS_TONE,
  type CueStatus,
  type StatusGroup,
} from "@/lib/cue";
import { countByStatus, listCues, type CueSummary } from "@/lib/cue-db";
import { requireStudio } from "@/lib/studio";
import { templateBySlug } from "@/lib/templates";
import "./workspace.css";

/* Reads one creator's own rows on every request. Nothing here is cacheable, and
   a stale list after sending a Cue is worse than a round trip. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Your Cues" };

/* Filter chips. The group vocabulary is shared with the sidebar and the mobile
   tab bar from src/lib/cue.ts — see the comment there for why a chip is a group
   of statuses rather than one, and why its key is a status name. */
const ALL = STATUS_GROUP_ALL;
const GROUPS = STATUS_GROUPS;

const ROW_ICON: Record<CueStatus, typeof FileText> = {
  draft: FilePenLine,
  sent: FileText,
  opened: FileText,
  partially_signed: FileText,
  signed: FileSignature,
  voided: FileText,
  declined: FileText,
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(status: string, query: string): string {
  const params = new URLSearchParams();
  if (status !== ALL.key) params.set("status", status);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/app?${search}` : "/app";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (parts[0][0] + last).toUpperCase();
}

/* Stamped on the server, from the clock that rendered the page. The page is
   force-dynamic and no client component re-renders these rows, so there is
   nothing to mismatch on hydration — the cost is that a tab left open all
   afternoon still says "2 hr ago". Right trade for a list you navigate rather
   than watch; the alternative is a client component and a timer per row.

   Days come from elapsed hours, not calendar days: 30 hours ago reads
   "Yesterday" even if it was technically two dates back.

   The clock is read in here rather than passed in from the page: react-hooks's
   purity rule rightly refuses a Date.now() call in a component body. */
function relative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return formatDate(iso.slice(0, 10));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { studio } = await requireStudio();
  const params = await searchParams;

  const query = one(params.q).trim().slice(0, 80);
  const group = resolveStatusGroup(one(params.status));

  const [cues, counts] = await Promise.all([
    // The whole group goes to SQL. Filtering it in memory would apply LIMIT
    // before the filter and quietly drop the oldest awaiting Cue off the one
    // screen that exists to chase it.
    listCues(studio.id, {
      status: group.key === ALL.key ? undefined : group.statuses,
      query,
      limit: 200,
    }),
    countByStatus(studio.id),
  ]);

  const count = (g: StatusGroup) => groupCount(g, counts);
  const total = count(ALL);
  const awaiting = count(STATUS_GROUPS[1]!);
  const filtered = group.key !== ALL.key || Boolean(query);

  return (
    <div className="ca-pane">
      <header className="cw-head ca-rise">
        <div>
          <h1 className="ca-h1">Your Cues</h1>
          <p className="ca-sub">
            {total === 0
              ? "Every agreement starts from a template. Yours starts here."
              : `${plural(total, "agreement")} · ${awaiting} awaiting signature`}
          </p>
        </div>
        <Link className="ca-btn ca-btn-primary" href="/app/new">
          <Plus size={16} strokeWidth={2.5} />
          New Cue
        </Link>
      </header>

      {total > 0 && (
        <div className="cw-toolbar">
          <nav className="cw-chips" aria-label="Filter Cues">
            {GROUPS.map((g) => (
              <Link
                key={g.key}
                className="cw-chip"
                href={hrefFor(g.key, query)}
                data-active={g.key === group.key}
                aria-current={g.key === group.key ? "page" : undefined}
              >
                {g.label}
              </Link>
            ))}
          </nav>

          {/* Plain GET form: search works with JavaScript switched off, the
              result is a linkable URL, and the back button behaves. */}
          <form className="cw-search" action="/app">
            {group.key !== ALL.key && (
              <input type="hidden" name="status" value={group.key} />
            )}
            <Search size={15} strokeWidth={2} aria-hidden />
            <input
              className="cw-search-input"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search title or client"
              aria-label="Search your Cues"
            />
            <button type="submit" className="ca-sr-only">
              Search
            </button>
          </form>
        </div>
      )}

      {cues.length > 0 ? (
        <>
          <div className="ca-card cw-list">
            {/* Column labels for the eye only. Each row carries its own
                aria-label sentence, so repeating the headings to a screen
                reader would just double every row. */}
            <div className="cw-thead" aria-hidden>
              <span>Agreement</span>
              <span>Status</span>
              <span>Shoot date</span>
              <span>Updated</span>
              <span />
            </div>
            <div className="ca-stagger">
              {cues.map((cue, i) => (
                <Row key={cue.id} cue={cue} index={i} />
              ))}
            </div>
          </div>

          <p className="cw-foot">
            <span>
              {filtered
                ? `Showing ${cues.length} of ${plural(total, "agreement")}`
                : plural(total, "agreement")}
            </span>
            <span className="cw-foot-note">
              <Send size={12} strokeWidth={1.9} aria-hidden />
              {awaiting} awaiting signature
            </span>
          </p>
        </>
      ) : (
        <div className="ca-card cw-blank">
          {filtered ? (
            <div className="ca-empty">
              <span className="ca-empty-mark">
                <SearchX size={20} strokeWidth={1.75} />
              </span>
              <h2 className="ca-h2">Nothing matches</h2>
              <p className="ca-sub">
                {query
                  ? `No Cue in ${group.key === ALL.key ? "your workspace" : `“${group.label}”`} matches “${query}”.`
                  : `You have no Cues in “${group.label}” yet.`}
              </p>
              <Link className="ca-btn ca-btn-ghost cw-empty-btn" href="/app">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="ca-empty">
              <span className="ca-empty-mark">
                <Inbox size={20} strokeWidth={1.75} />
              </span>
              <h2 className="ca-h2">Create your first Cue</h2>
              <p className="ca-sub">
                Pick a template, add your client, and you have an agreement ready to
                send. Drafts are free and cost you nothing to explore.
              </p>
              <Link className="ca-btn ca-btn-primary cw-empty-btn" href="/app/new">
                <Plus size={16} strokeWidth={2.5} />
                New Cue
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ cue, index }: { cue: CueSummary; index: number }) {
  const template = templateBySlug(cue.templateSlug);
  const Icon = ROW_ICON[cue.status];
  const shoot = cue.shootDate ? formatDate(cue.shootDate) : "No date yet";
  const updated = relative(cue.updatedAt);
  const templateName = template?.name ?? cue.templateSlug;

  return (
    <Link
      className="cw-row"
      href={`/app/cues/${cue.id}`}
      style={{ "--i": index } as React.CSSProperties}
      aria-label={`${cue.title} — ${templateName} for ${cue.clientName}. ${STATUS_LABEL[cue.status]}. Shoot ${shoot}. Updated ${updated}.`}
    >
      <span className="cw-doc" data-tone={template?.tone ?? "slate"} aria-hidden>
        <Icon size={15} strokeWidth={1.9} />
      </span>
      <span className="cw-title ca-truncate">{cue.title}</span>
      <span className="cw-sub ca-truncate">
        {templateName} · {cue.clientName}
      </span>
      <span className="cw-status">
        <span className="ca-pill" data-tone={STATUS_TONE[cue.status]}>
          {STATUS_LABEL[cue.status]}
        </span>
      </span>
      <span className="cw-date">{shoot}</span>
      <span className="cw-updated">{updated}</span>
      <span className="cw-face" aria-hidden>
        {initials(cue.clientName)}
      </span>
    </Link>
  );
}

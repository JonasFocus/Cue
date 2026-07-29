import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Command,
  FileSignature,
  FileText,
  Heart,
  Inbox,
  MousePointer2,
  PanelLeft,
  PenLine,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";
import { AnimHost } from "./anim-host";

/* ponytail: product shots are CSS/DOM, not images — no asset pipeline, and they
   restyle with the tokens. Swap for real screenshots once the app UI exists. */

const ICONS = {
  doc: FileText,
  signed: FileSignature,
  draft: PenLine,
} as const;

type CueRow = {
  icon: keyof typeof ICONS;
  name: string;
  template: string;
  date: string;
  updated: string;
  initials: string;
  pill: { label: string; tone?: "ok" | "wait" };
};

const CUES: CueRow[] = [
  {
    icon: "signed",
    name: "Harper & Wells",
    template: "Wedding · 4 pages",
    date: "Jun 14",
    updated: "2 hr ago",
    initials: "AH",
    pill: { label: "Signed", tone: "ok" },
  },
  {
    icon: "doc",
    name: "Alvarez Engagement Shoot",
    template: "Portrait · 3 pages",
    date: "Jun 21",
    updated: "Yesterday",
    initials: "RA",
    pill: { label: "Awaiting", tone: "wait" },
  },
  {
    icon: "doc",
    name: "Okafor Elopement Film",
    template: "Elopement · 5 pages",
    date: "Jul 02",
    updated: "3 days ago",
    initials: "NO",
    pill: { label: "Awaiting", tone: "wait" },
  },
  {
    icon: "draft",
    name: "Fenn Co. Brand Session",
    template: "Commercial · 6 pages",
    date: "Jul 09",
    updated: "10 min ago",
    initials: "TB",
    pill: { label: "Draft" },
  },
  {
    icon: "signed",
    name: "Marsh Family Portraits",
    template: "Portrait · 3 pages",
    date: "Apr 02",
    updated: "Apr 02",
    initials: "KM",
    pill: { label: "Signed", tone: "ok" },
  },
];

const TEMPLATES = [
  { label: "Wedding", icon: Heart, tone: "rose", meta: "4 pages · full day" },
  { label: "Elopement", icon: Sparkles, tone: "violet", meta: "5 pages · travel" },
  { label: "Portrait", icon: User, tone: "teal", meta: "3 pages · half day" },
];

const FILTERS = ["All", "Awaiting", "Signed", "Drafts"];

/** The agreement workspace. `compact` trims it to a small feature tile. */
export function MockApp({ compact = false }: { compact?: boolean }) {
  return (
    <AnimHost className="cue-mock" aria-hidden>
      <div className="cue-mock-body">
        <div className="cue-mock-side">
          <span className="cue-mock-ws">
            <i className="cue-mock-ws-mark" />
            <b>Harper Studio</b>
            <ChevronDown size={11} strokeWidth={2} />
            <PanelLeft size={12} strokeWidth={1.75} className="cue-mock-ws-panel" />
          </span>

          {!compact && (
            <span className="cue-mock-quick">
              <Command size={11} strokeWidth={1.75} />
              Quick actions
              <kbd>K</kbd>
            </span>
          )}

          <span className="cue-mock-side-label">Workspace</span>
          <span className="cue-mock-side-item" data-active="true">
            <Inbox size={13} strokeWidth={1.75} /> All Cues <b>28</b>
          </span>
          <span className="cue-mock-side-item">
            <Clock size={13} strokeWidth={1.75} /> Awaiting
            <i className="cue-mock-live" />
            <b>2</b>
          </span>
          <span className="cue-mock-side-item">
            <Check size={13} strokeWidth={1.75} /> Signed <b>24</b>
          </span>

          {!compact && (
            <>
              <span className="cue-mock-side-label">Templates</span>
              {TEMPLATES.map(({ label, icon: Icon, tone }) => (
                <span className="cue-mock-side-item" key={label}>
                  <i className="cue-mock-tile" data-tone={tone}>
                    <Icon size={9} strokeWidth={2.25} />
                  </i>
                  {label}
                </span>
              ))}

              <div className="cue-mock-side-foot">
                <div className="cue-mock-quota-row">
                  <span style={{ color: "var(--cue-ink)" }}>Free plan</span>
                  <span>3 of 5</span>
                </div>
                <div className="cue-mock-progress" style={{ margin: "7px 0 9px" }}>
                  <i />
                </div>
                <span className="cue-mock-upgrade">Upgrade</span>
              </div>
            </>
          )}
        </div>

        <div className="cue-mock-main">
          <div className="cue-mock-top">
            <span className="cue-mock-crumb">
              Workspace <i>/</i> <b>All Cues</b>
            </span>
            <span className="cue-mock-icon-btn">
              <Search size={12} strokeWidth={1.75} />
            </span>
            <span className="cue-mock-icon-btn">
              <SlidersHorizontal size={12} strokeWidth={1.75} />
            </span>
            <span className="cue-mock-new">
              <Plus size={11} strokeWidth={2.5} /> New Cue
            </span>
          </div>

          {!compact && (
            <div className="cue-mock-toolbar">
              {FILTERS.map((f) => (
                <span
                  className="cue-mock-chip"
                  data-active={f === "All"}
                  key={f}
                >
                  {f}
                </span>
              ))}
              <span className="cue-mock-sort">
                <ArrowUpDown size={10} strokeWidth={2} /> Shoot date
              </span>
            </div>
          )}

          <div className="cue-mock-table">
            {!compact && (
              <div className="cue-mock-thead">
                <span>Agreement</span>
                <span>Status</span>
                <span>Shoot date</span>
                <span>Updated</span>
                <span />
              </div>
            )}

            {(compact ? CUES.slice(0, 2) : CUES).map((c) => {
              const Icon = ICONS[c.icon];
              return (
                <div className="cue-mock-row" key={c.name}>
                  <span className="cue-mock-cell">
                    <i className="cue-mock-doc">
                      <Icon size={11} strokeWidth={1.9} />
                    </i>
                    <span className="cue-mock-file-meta">
                      <span>{c.name}</span>
                      <span>{c.template}</span>
                    </span>
                  </span>
                  <span className="cue-mock-pill" data-tone={c.pill.tone}>
                    {c.pill.label}
                  </span>
                  <span className="cue-mock-col">{c.date}</span>
                  <span className="cue-mock-col">{c.updated}</span>
                  <span className="cue-mock-face">{c.initials}</span>
                </div>
              );
            })}
          </div>

          {!compact && (
            <div className="cue-mock-foot">
              <span>28 agreements</span>
              <span className="cue-mock-foot-note">
                <Send size={10} strokeWidth={1.9} /> 2 awaiting signature
              </span>
            </div>
          )}
        </div>
      </div>
    </AnimHost>
  );
}

/** Small floating card — the template shelf you start from. */
export function MockTemplates() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Templates</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 14 }}>
        Start from one, make it yours
      </div>
      <div className="cue-mock-quota">
        {TEMPLATES.map(({ label, icon: Icon, tone, meta }, i) => (
          <span className="cue-mock-tpl" key={label} data-active={i === 0}>
            <i className="cue-mock-tile" data-tone={tone}>
              <Icon size={10} strokeWidth={2.25} />
            </i>
            <span className="cue-mock-tpl-meta">
              <span>{label}</span>
              <span>{meta}</span>
            </span>
            {i === 0 && <Check size={12} strokeWidth={3} />}
          </span>
        ))}
      </div>
    </div>
  );
}

const SETUP = [
  "Studio name and colour",
  "Standard terms",
  "Payment schedule",
  "Signature block",
];

/** Small floating card — the one-time setup checklist. */
export function MockSetup() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Set up your studio</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 12 }}>
        1 of 4 done
      </div>
      <div className="cue-mock-progress" style={{ marginBottom: 14 }}>
        <i style={{ transform: "scaleX(0.25)" }} />
      </div>
      <div className="cue-mock-quota">
        {SETUP.map((label, i) => (
          <span className="cue-mock-task" key={label} data-done={i === 0}>
            <i className="cue-mock-ring">
              <Check size={9} strokeWidth={4} />
            </i>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small floating card — the send click, on a loop. */
export function MockSend() {
  return (
    <AnimHost className="cue-mock-card cue-send" aria-hidden>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Harper &amp; Wells</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 16 }}>
        Wedding · 4 pages · ready
      </div>
      <span className="cue-send-btn">
        <span className="cue-send-face" data-state="idle">
          <Send size={12} strokeWidth={2} /> Send Cue
        </span>
        <span className="cue-send-face" data-state="done">
          <Check size={13} strokeWidth={3} /> Sent
        </span>
      </span>
      <span className="cue-send-cursor">
        {/* White body, dark outline — the cursor has to read against both the
            white card it travels over and the dark button it lands on. */}
        <MousePointer2 size={15} strokeWidth={1.75} fill="#fff" />
      </span>
    </AnimHost>
  );
}

const SIGNERS = ["Ava Harper", "Daniel Wells", "Harper Studio"];

/** Small floating card — every party signs, then the record seals. */
export function MockSeal() {
  return (
    <AnimHost className="cue-mock-card cue-seal" aria-hidden>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Harper &amp; Wells</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 14 }}>
        Wedding · 4 pages
      </div>
      <div className="cue-seal-stage">
        <div className="cue-mock-quota" style={{ gap: 10 }}>
          {SIGNERS.map((name, i) => (
            <span className="cue-seal-row" key={name}>
              {name}
              <i className="cue-seal-tick" data-i={i}>
                <Check size={10} strokeWidth={4} />
              </i>
            </span>
          ))}
        </div>
        <span className="cue-seal-pill">
          <ShieldCheck size={11} strokeWidth={2} /> Record sealed
        </span>
      </div>
    </AnimHost>
  );
}

/** Small floating card — the secure signing link. */
export function MockLink() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Send size={14} strokeWidth={1.75} style={{ color: "var(--cue-accent)" }} />
        <span style={{ fontWeight: 500 }}>Signing link sent</span>
      </div>
      <div className="cue-mock-quota">
        {["Unguessable token", "Opens on any phone", "Expires when signed"].map(
          (label) => (
            <div
              key={label}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}
            >
              <Check size={12} strokeWidth={2.5} style={{ color: "var(--cue-accent)" }} />
              {label}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Small floating card — studio branding on the client-facing Cue. */
export function MockBrand() {
  return (
    <div className="cue-mock-card cue-mock-brand" aria-hidden>
      <div className="cue-mock-brand-bar">
        <i className="cue-mock-brand-mark" />
        <span>
          <b>Harper Studio</b>
          <span>Your studio on every Cue</span>
        </span>
      </div>
      <div className="cue-mock-brand-doc">
        <span className="cue-mock-brand-kicker">Wedding agreement</span>
        <span className="cue-mock-brand-title">Harper &amp; Wells</span>
        <span className="cue-mock-brand-meta">Prepared by Harper Studio</span>
      </div>
    </div>
  );
}

const LIBRARY = [
  { name: "Harper & Wells", meta: "Wedding · Jun 14", tone: "ok" as const },
  { name: "Okafor Elopement", meta: "Elopement · Jul 02", tone: "wait" as const },
];

/** Small floating card — find a Cue by search, not by inbox scroll. */
export function MockLibrary() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div className="cue-mock-library-search">
        <Search size={12} strokeWidth={2} />
        <span>wedding</span>
      </div>
      <div className="cue-mock-quota" style={{ marginTop: 12 }}>
        {LIBRARY.map((row) => (
          <div className="cue-mock-library-row" key={row.name}>
            <span className="cue-mock-library-meta">
              <span>{row.name}</span>
              <span>{row.meta}</span>
            </span>
            <span className="cue-mock-pill" data-tone={row.tone}>
              {row.tone === "ok" ? "Signed" : "Awaiting"}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: "var(--cue-muted)",
        }}
      >
        2 of 28 Cues
      </div>
    </div>
  );
}

/** Small floating card — the sealed record. */
export function MockRecord() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div style={{ fontWeight: 500 }}>Agreement record sealed</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 14 }}>
        Harper &amp; Wells · 4 pages
      </div>
      <div className="cue-mock-quota">
        <div className="cue-mock-quota-row">
          <span>Document hash</span>
          <span>a91f…7c2</span>
        </div>
        <div className="cue-mock-quota-row">
          <span>Sealed</span>
          <span>Jun 14, 4:12 PM</span>
        </div>
        <div className="cue-mock-quota-row">
          <span>Emailed to both parties</span>
          <Check size={12} strokeWidth={2.5} style={{ color: "var(--cue-accent)" }} />
        </div>
      </div>
    </div>
  );
}

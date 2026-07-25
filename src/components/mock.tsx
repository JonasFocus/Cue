import {
  Check,
  Clock,
  FileSignature,
  FileText,
  Files,
  Inbox,
  PenLine,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";

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
  meta: string;
  pill?: { label: string; tone?: "ok" | "wait" };
};

const CUES: CueRow[] = [
  {
    icon: "signed",
    name: "Harper & Wells — Wedding",
    meta: "Signed 2 hr ago · Jun 14",
    pill: { label: "Signed", tone: "ok" },
  },
  {
    icon: "doc",
    name: "Alvarez Engagement Shoot",
    meta: "Sent yesterday · viewed twice",
    pill: { label: "Awaiting", tone: "wait" },
  },
  {
    icon: "doc",
    name: "Okafor Elopement — Film",
    meta: "Sent 3 days ago · viewed once",
    pill: { label: "Awaiting", tone: "wait" },
  },
  {
    icon: "draft",
    name: "Brand Session — Retainer",
    meta: "Edited 10 min ago",
    pill: { label: "Draft" },
  },
  {
    icon: "signed",
    name: "Marsh Family Portraits",
    meta: "Signed Apr 2 · PDF stored",
    pill: { label: "Signed", tone: "ok" },
  },
];

const AUDIT = [
  { label: "Cue sent", meta: "Jun 12" },
  { label: "Opened by client", meta: "Jun 13" },
  { label: "Consent recorded", meta: "Jun 14" },
  { label: "Signed and sealed", meta: "2 hr ago", done: true },
];

/**
 * Full agreement-workspace window.
 * `detail` adds the third inspector pane used by the hero shot.
 */
export function MockApp({
  compact = false,
  detail = false,
}: {
  compact?: boolean;
  detail?: boolean;
}) {
  return (
    <div className="cue-mock" aria-hidden>
      <div className="cue-mock-bar">
        <span className="cue-mock-dot" style={{ background: "#ff5f57" }} />
        <span className="cue-mock-dot" style={{ background: "#febc2e" }} />
        <span className="cue-mock-dot" style={{ background: "#28c840" }} />
        <span style={{ marginLeft: 10, color: "var(--cue-muted)" }}>
          Cue — All agreements
        </span>
        {detail && (
          <span className="cue-mock-bar-cta">
            <Send size={11} strokeWidth={2} /> New Cue
          </span>
        )}
      </div>

      <div className="cue-mock-body" data-detail={detail}>
        <div className="cue-mock-side">
          <span className="cue-mock-side-label">Workspace</span>
          <span className="cue-mock-side-item" data-active="true">
            <Inbox size={13} strokeWidth={1.75} /> All Cues <b>28</b>
          </span>
          <span className="cue-mock-side-item">
            <Clock size={13} strokeWidth={1.75} /> Awaiting <b>2</b>
          </span>
          <span className="cue-mock-side-item">
            <Check size={13} strokeWidth={1.75} /> Signed <b>24</b>
          </span>
          <span className="cue-mock-side-label">Templates</span>
          <span className="cue-mock-side-item">
            <Files size={13} strokeWidth={1.75} /> Wedding
          </span>
          <span className="cue-mock-side-item">
            <Files size={13} strokeWidth={1.75} /> Elopement
          </span>
          {!compact && (
            <span className="cue-mock-side-item">
              <Files size={13} strokeWidth={1.75} /> Portrait
            </span>
          )}

          {detail && (
            <div className="cue-mock-side-foot">
              <div className="cue-mock-quota-row">
                <span style={{ color: "var(--cue-ink)" }}>Free plan</span>
                <span>3 / 5</span>
              </div>
              <div className="cue-mock-progress" style={{ margin: "7px 0" }}>
                <i style={{ width: "60%", animation: "none" }} />
              </div>
              <div className="cue-mock-quota-row">
                <span>Cues sent</span>
                <span>2 left</span>
              </div>
            </div>
          )}
        </div>

        <div className="cue-mock-main">
          <div className="cue-mock-search">
            <Search size={12} strokeWidth={1.75} />
            Search agreements, clients, or dates
          </div>

          {(compact ? CUES.slice(0, 2) : CUES).map((c, i) => {
            const Icon = ICONS[c.icon];
            return (
              <div
                className="cue-mock-file"
                data-selected={detail && i === 0}
                key={c.name}
              >
                <Icon
                  size={15}
                  strokeWidth={1.75}
                  style={{ color: "var(--cue-muted)", flex: "none" }}
                />
                <span className="cue-mock-file-meta">
                  <span>{c.name}</span>
                  <span>{c.meta}</span>
                </span>
                {c.pill && (
                  <span className="cue-mock-pill" data-tone={c.pill.tone}>
                    {c.pill.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {detail && (
          <div className="cue-mock-detail">
            <div className="cue-mock-preview">
              <ShieldCheck size={22} strokeWidth={1.5} />
            </div>
            <div style={{ fontWeight: 500, marginTop: 12 }}>
              Harper &amp; Wells
            </div>
            <div style={{ color: "var(--cue-muted)", fontSize: 10 }}>
              Wedding agreement · 4 pages
            </div>

            <div className="cue-mock-detail-block">
              <div className="cue-mock-detail-head">
                <PenLine size={11} strokeWidth={2} /> Signature
              </div>
              <div className="cue-mock-sign">Amelia Harper</div>
              <div className="cue-mock-detail-line">
                <Check
                  size={10}
                  strokeWidth={3}
                  style={{ color: "var(--cue-accent)" }}
                />
                Consent recorded
              </div>
            </div>

            <div className="cue-mock-detail-block">
              <div className="cue-mock-detail-head">Audit trail</div>
              <div className="cue-mock-timeline">
                {AUDIT.map((a) => (
                  <div
                    className="cue-mock-timeline-row"
                    data-done={a.done}
                    key={a.label}
                  >
                    {a.done ? (
                      <span className="cue-mock-tick-done">
                        <Check size={8} strokeWidth={4} />
                      </span>
                    ) : (
                      <i className="cue-mock-tick" />
                    )}
                    {a.label}
                    <b>{a.meta}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small floating card — the free-plan allowance. */
export function MockAllowance() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Free plan</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 14 }}>
        Five Cues, no card needed
      </div>
      <div className="cue-mock-quota">
        <div className="cue-mock-progress">
          <i style={{ width: "60%", animation: "none" }} />
        </div>
        <div className="cue-mock-quota-row">
          <span>3 sent</span>
          <span>5 total</span>
        </div>
      </div>
    </div>
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

/** Small floating card — the sealed record. */
export function MockRecord() {
  return (
    <div className="cue-mock-card" aria-hidden>
      <div style={{ fontWeight: 500 }}>Final PDF sealed</div>
      <div style={{ color: "var(--cue-muted)", fontSize: 11, marginBottom: 14 }}>
        Harper &amp; Wells · 4 pages
      </div>
      <div className="cue-mock-quota">
        <div className="cue-mock-quota-row">
          <span>Document hash</span>
          <span>a91f…7c2</span>
        </div>
        <div className="cue-mock-quota-row">
          <span>Emailed to both parties</span>
          <Check size={12} strokeWidth={2.5} style={{ color: "var(--cue-accent)" }} />
        </div>
      </div>
    </div>
  );
}

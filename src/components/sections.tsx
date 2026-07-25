import {
  Archive,
  Camera,
  Check,
  ChevronRight,
  FileSignature,
  Palette,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import { Reveal } from "./reveal";
import { MockApp, MockLink, MockRecord } from "./mock";

/* Compact lifecycle strip — product proof under the core line, not a second hero. */
const PROOF_STEPS = [
  { label: "Sent", tone: "sent" as const },
  { label: "Opened", tone: "wait" as const },
  { label: "Signed", tone: "ok" as const },
];

/* ── The statement beat ── */

export function Statement() {
  return (
    <section className="cue-section cue-statement-section">
      <div className="cue-shell">
        <Reveal>
          <div className="cue-statement-block">
            <p className="cue-statement cue-statement-muted">
              Agreements live in email threads, scanned PDFs, and screenshots on
              a phone. Chasing a signature costs a day you did not have.
            </p>
            <p className="cue-statement cue-statement-ink">
              Send the Cue. Get the yes. Keep the record.
            </p>

            <div className="cue-proof" aria-hidden>
              <span className="cue-proof-meta">
                <i className="cue-proof-avatar">HW</i>
                Harper &amp; Wells
              </span>
              <span className="cue-proof-steps">
                {PROOF_STEPS.map((step, i) => (
                  <span className="cue-proof-step" key={step.label}>
                    {i > 0 && (
                      <ChevronRight
                        size={12}
                        strokeWidth={2}
                        className="cue-proof-sep"
                      />
                    )}
                    <span className="cue-proof-pill" data-tone={step.tone}>
                      {step.label}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Features ── */

const TOP = [
  {
    icon: Camera,
    title: "Made For Creatives",
    body: "Being built around the moments before a shoot, not enterprise document workflows.",
  },
  {
    icon: Zap,
    title: "Fast To Send",
    body: "Templates and saved details will cut the repetitive setup down to a minute.",
  },
  {
    icon: Smartphone,
    title: "Easy To Sign",
    body: "Clients will review and sign on a phone. No account, no app, no friction.",
  },
];

const BOTTOM = [
  {
    icon: Palette,
    title: "Feels Like You",
    body: "Every agreement will carry your name and branding, so the paperwork looks professional.",
    visual: <MockApp compact />,
  },
  {
    icon: ShieldCheck,
    title: "Sealed After Signing",
    body: "Each finished Cue will be frozen as an immutable snapshot with a document hash.",
    visual: <MockRecord />,
  },
  {
    icon: Search,
    title: "Searchable Library",
    body: "Every agreement findable by client, date, or shoot type. Nothing lost in an inbox.",
    visual: <MockLink />,
  },
];

export function Features() {
  return (
    <section id="features" className="cue-section cue-features-section">
      <div className="cue-shell">
        <Reveal>
          <div className="cue-eyebrow-block">
            <h2 className="cue-h2">{"Everything the agreement\nneeds to be"}</h2>
            <p className="cue-lede">
              What we are building: from inquiry to signed agreement, without
              the paperwork feeling like paperwork.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="cue-grid-3 cue-features-top">
            {TOP.map(({ icon: Icon, title, body }) => (
              <div className="cue-card" key={title}>
                <div className="cue-card-head">
                  <span className="cue-icon">
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <h3 className="cue-card-title">{title}</h3>
                </div>
                <p className="cue-card-body">{body}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div className="cue-grid-3" style={{ marginTop: 16 }}>
            {BOTTOM.map(({ icon: Icon, title, body, visual }) => (
              <div key={title}>
                <div className="cue-feature-visual">{visual}</div>
                <div className="cue-feature-tail">
                  <div className="cue-card-head">
                    <span className="cue-icon">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <h3 className="cue-card-title">{title}</h3>
                  </div>
                  <p className="cue-card-body">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Capability ── */

const CELLS = [
  {
    icon: FileSignature,
    title: "Create",
    body: "Start from a wedding, elopement, or portrait template and personalise the details.",
  },
  {
    icon: Send,
    title: "Send",
    body: "Cue will generate a secure signing link with an unguessable token you can share anywhere.",
  },
  {
    icon: Check,
    title: "Sign",
    body: "Your client will review, consent, and sign on whatever device is already in their hand.",
  },
  {
    icon: Archive,
    title: "Keep",
    body: "The final PDF, signer details, and audit trail will be stored and emailed to both parties.",
  },
];

export function Capability() {
  return (
    <section className="cue-section">
      <div className="cue-shell">
        <Reveal>
          <div className="cue-eyebrow-block">
            <h2 className="cue-h2">{"One place for every\nclient agreement"}</h2>
            <p className="cue-lede">
              Not a form builder and not studio management software. Cue will do
              one job properly.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div style={{ marginTop: 56 }}>
            <MockApp />
            {/* The mock is convincing enough to read as a screenshot of a
                shipping app. Say what it is. */}
            <p className="cue-hero-note" style={{ textAlign: "center" }}>
              A design preview of the interface we are building. Nothing in it
              is live yet.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="cue-split">
            {CELLS.map(({ icon: Icon, title, body }) => (
              <div className="cue-split-cell" key={title}>
                <div className="cue-card-head">
                  <span className="cue-icon">
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <h3 className="cue-card-title">{title}</h3>
                </div>
                <p className="cue-card-body">{body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

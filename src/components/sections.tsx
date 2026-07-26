import { Archive, Check, FileSignature, Send } from "lucide-react";
import { Reveal } from "./reveal";
import { MockApp, MockBrand, MockLibrary, MockRecord } from "./mock";

/* ── Features ── */

/* Soft-wells Features layout. */
const WELLS = [
  {
    title: "Distinctly yours",
    body: "Your name. Your mark. Every Cue feels like your studio.",
    visual: <MockBrand />,
  },
  {
    title: "Sealed and settled",
    body: "A final PDF. An immutable record. Certainty you keep.",
    visual: <MockRecord />,
  },
  {
    title: "Always at hand",
    body: "Find any Cue by client, date, or shoot. Instantly.",
    visual: <MockLibrary />,
  },
] as const;

export function Features() {
  return (
    <section id="features" className="cue-section cue-features-section">
      <div className="cue-shell cue-shell-wide">
        <Reveal>
          <div className="cue-eyebrow-block">
            <h2 className="cue-h2">{"Everything essential.\nNothing else."}</h2>
            <p className="cue-lede cue-features-lede">
              Client agreements, considered. For photographers and
              videographers who prefer quiet confidence to busy software.
            </p>
            <p className="cue-features-whisper">
              Crafted for creatives · Effortless to send · Beautiful to sign
            </p>
          </div>
        </Reveal>

        <Reveal className="cue-reveal cue-reveal-stagger">
          <div className="cue-features-wells">
            {WELLS.map(({ title, body, visual }) => (
              <article className="cue-feature-well" key={title}>
                <div className="cue-feature-stage">{visual}</div>
                <h3 className="cue-feature-title">{title}</h3>
                <p className="cue-feature-body">{body}</p>
              </article>
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
            <h2 className="cue-h2">{"One place for every\nCue"}</h2>
            <p className="cue-lede">
              Not a form builder. Not a studio suite. One job, done properly.
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

import { Archive, Check, FileSignature, Send } from "lucide-react";
import { Reveal } from "./reveal";
import { MockApp, MockBrand, MockLibrary, MockRecord } from "./mock";

/* ── Features ── */

/* Soft-wells Features layout. */
const WELLS = [
  {
    title: "Distinctly yours",
    body: "Your name. Your colour. Every Cue feels like your studio.",
    visual: <MockBrand />,
  },
  {
    title: "Sealed and settled",
    body: "A frozen document. A sealed record. Certainty you keep.",
    visual: <MockRecord />,
  },
  {
    title: "Always at hand",
    body: "Find any Cue by client or title. Filter by status. Instantly.",
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
    body: "Start from a wedding, elopement, portrait, commercial, video, or blank template and personalise the details.",
  },
  {
    icon: Send,
    title: "Send",
    body: "Cue generates a secure signing link with an unguessable token. Text it, email it, send it however you already talk to your client.",
  },
  {
    icon: Check,
    title: "Sign",
    body: "Your client reviews, consents, and signs on whatever device is already in their hand. No account, no app, no download.",
  },
  {
    icon: Archive,
    title: "Keep",
    body: "The sealed document, signer details, and audit events stay in your library. Print or save a copy from your browser.",
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

/* The one future claim the site makes on purpose (see docs/roadmap.txt):
   Krevo's original product, announced as returning inside Cue. Styled as an
   announcement panel, not a feature, so the pricing cards stay present-tense. */
export function Storage() {
  return (
    <section id="storage" className="cue-section">
      <div className="cue-shell">
        <Reveal>
          <div className="cue-storage">
            <div className="cue-storage-grid" aria-hidden />
            <div style={{ position: "relative" }}>
              <p className="cue-storage-pill">Coming this fall</p>
              <h2 className="cue-h2">{"Cloud storage\nreturns to Cue"}</h2>
              <p className="cue-lede">
                Krevo began as cloud storage. This fall it comes back, rebuilt
                inside Cue: the agreement, the shoot, and every file it
                produced, in one place.
              </p>
              <p className="cue-storage-cta">
                <a href="#waitlist">Join the waitlist to hear it first</a>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

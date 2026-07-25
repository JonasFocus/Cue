import { PenLine, Plus } from "lucide-react";
import { Reveal } from "./reveal";
import { Waitlist } from "./waitlist";

/* ponytail: native <details> — no accordion state, no library, keyboard and
   find-in-page work for free. */

const FAQS = [
  {
    q: "Is a Cue legally binding?",
    a: "Cue records the signer's identity, their consent, timestamps, and delivery events, then freezes the agreement as an immutable snapshot with a document hash. That audit record is what makes an electronic signature defensible. Cue is not a law firm, so use your own agreement terms or have a lawyer review your template.",
  },
  {
    q: "Does my client need an account?",
    a: "No. They open the secure link, read the agreement on whatever device they are holding, and sign. There is nothing to download, install, or register for.",
  },
  {
    q: "What does the free plan actually include?",
    a: "Five sent Cues in total, not five per month. Every one of them includes the standard templates, the final PDF, and the full audit trail. No card is required to start.",
  },
  {
    q: "What happens after a Cue is signed?",
    a: "Cue renders a final PDF, stores the signed record with its audit trail, and emails a copy to you and your client. The agreement is sealed at that point and cannot be edited.",
  },
  {
    q: "Can I use my own agreement wording?",
    a: "Yes. Start from one of the templates and edit it, or paste in the terms you already use. Saved templates and custom branding are part of the Creator plan.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="cue-section">
      <div className="cue-shell">
        <Reveal>
          <div className="cue-faq">
            <div>
              <h2 className="cue-h2" style={{ textAlign: "left" }}>
                {"Frequently asked\nquestions"}
              </h2>
              <p className="cue-lede" style={{ textAlign: "left" }}>
                Still have questions? Reach out at hello@cue.krevo.io
              </p>
            </div>

            <div className="cue-faq-list">
              {FAQS.map(({ q, a }) => (
                <details className="cue-faq-item" key={q}>
                  <summary>
                    {q}
                    <Plus className="cue-faq-plus" size={18} strokeWidth={2} aria-hidden />
                  </summary>
                  <p className="cue-faq-answer">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "#steps", label: "How it works" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "https://www.krevo.io", label: "Krevo" },
      { href: "mailto:hello@cue.krevo.io", label: "Contact" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

export function Cta() {
  return (
    <section id="cta" className="cue-section" style={{ paddingBottom: 0 }}>
      <div className="cue-shell">
        <Reveal>
          <div className="cue-cta">
            <div className="cue-cta-grid" aria-hidden />
            <div style={{ position: "relative" }}>
              <h2 className="cue-h2">{"Send the Cue.\nGet the yes."}</h2>
              <p
                className="cue-lede"
                style={{ marginInline: "auto", maxWidth: "52ch" }}
              >
                Five agreements free, no card required. Your next client can sign
                before the deposit conversation even starts.
              </p>
              <div style={{ marginTop: 28 }}>
                <Waitlist id="waitlist" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="cue-footer" style={{ marginTop: 88 }}>
      <div className="cue-shell">
        <div className="cue-footer-grid">
          <div>
            <span className="cue-brand">
              <span className="cue-brand-mark">
                <PenLine size={15} strokeWidth={2} />
              </span>
              Cue
            </span>
            <p style={{ marginTop: 14, fontSize: 15, color: "var(--cue-muted)" }}>
              Client agreements for photographers and videographers. A Krevo
              product.
            </p>
          </div>

          {FOOTER_LINKS.map((col) => (
            <div className="cue-footer-col" key={col.heading}>
              <h4>{col.heading}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cue-footer-legal">
          <span>&copy; {new Date().getFullYear()} Krevo. All rights reserved.</span>
          <span>Cue is not a law firm and does not provide legal advice.</span>
        </div>
      </div>
    </footer>
  );
}

import { PenLine, Plus } from "lucide-react";
import { Reveal } from "./reveal";
import { Waitlist } from "./waitlist";

/* ponytail: native <details> — no accordion state, no library, keyboard and
   find-in-page work for free. */

/* Every answer about the product itself is in the future tense on purpose: none
   of the signing, PDF, email, or audit features are built yet. The only thing
   this site does today is take a waitlist address. */

const FAQS = [
  {
    q: "Can I use Cue today?",
    a: "Not yet. Cue is being built, and this page is ahead of it — there is nothing to sign in to. The waitlist is the whole product for now: leave your email and you will hear from us the day it opens, once.",
  },
  {
    q: "Will a Cue be legally binding?",
    a: "That is the design. Each Cue will record the signer's identity, their consent, timestamps, and delivery events, then freeze the agreement as an immutable snapshot with a document hash — that kind of audit record is what makes an electronic signature defensible. Cue is not a law firm and gives no legal advice, so use your own agreement terms or have a lawyer review your template.",
  },
  {
    q: "Will my client need an account?",
    a: "No. The plan is a secure link they open on whatever device they are holding, with nothing to download, install, or register for.",
  },
  {
    q: "What will the free plan include?",
    a: "Five sent Cues in total, not five per month, each with the standard templates, the final PDF, and the full audit trail. No card at signup. Pricing is the current plan, not a promise — it can change before launch.",
  },
  {
    q: "What will happen after a Cue is signed?",
    a: "Cue will render a final PDF, store the signed record with its audit trail, and email a copy to you and your client. Once sealed, the agreement cannot be edited.",
  },
  {
    q: "Will I be able to use my own agreement wording?",
    a: "Yes — start from a template and edit it, or paste in the terms you already use. Saved templates and custom branding are planned for the Creator plan.",
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

/* Root-relative, not bare hashes: the footer also renders on /legal/*, where
   "#features" resolves against that page and goes nowhere. */
const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#steps", label: "How it works" },
      { href: "/#faq", label: "FAQ" },
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
          {/* Anchor the whole card, not the input inside it: targeting the
              field scrolls the heading up behind the sticky nav. */}
          <div className="cue-cta" id="waitlist">
            <div className="cue-cta-grid" aria-hidden />
            <div style={{ position: "relative" }}>
              <h2 className="cue-h2">{"Send the Cue.\nGet the yes."}</h2>
              <p
                className="cue-lede"
                style={{ marginInline: "auto", maxWidth: "52ch" }}
              >
                Cue is still being built. Leave your email and you will hear from
                us the day it opens — your first five agreements will be free, no
                card required.
              </p>
              <div style={{ marginTop: 28 }}>
                <Waitlist />
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
              {/* h3, not h4: the page has no h3 above it, so h4 skipped a
                  level. design.css still styles `.cue-footer-col h4`, hence the
                  inline copy of those three rules — drop it when that selector
                  is renamed. */}
              <h3>
                {col.heading}
              </h3>
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

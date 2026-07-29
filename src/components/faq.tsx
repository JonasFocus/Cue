import { Mail, Plus } from "lucide-react";
import { Reveal } from "./reveal";
import { Waitlist } from "./waitlist";
import { CueMark } from "@/components/cue-mark";

/* ponytail: native <details> — no accordion state, no library, keyboard and
   find-in-page work for free. */

/* Present tense throughout: the signing flow, the seal, the audit trail and the
   library all ship. The one thing that is gated is account creation — see the
   `user.create.before` hook in src/lib/auth.ts — so that is what the access
   question answers, and nothing here promises an open signup. */

const FAQS = [
  {
    q: "Can I use Cue today?",
    a: "Yes — Cue is live. Accounts are invite-only, because we let new studios in a few at a time so every one gets looked after. Leave your email and we will send you a link, with five free Cues waiting and no card required.",
  },
  {
    q: "Is a Cue legally binding?",
    a: "That is the design. Every Cue captures signer identity, explicit consent to sign electronically, timestamps, open and view events, and a sealed document hash — a defensible audit trail without enterprise software. Cue is not a law firm and does not give legal advice — bring your own terms, or have a lawyer review your template.",
  },
  {
    q: "Does my client need an account?",
    a: "No account, no app, no friction. They open a secure link on the phone already in their hand, read a clean mobile layout, consent, and sign. You get the yes without chasing logins.",
  },
  {
    q: "What is included for free?",
    a: "Five sent Cues on real client work — every template, the full signing experience, a final PDF, and the complete audit trail on each one. No card, ever, unless you choose to upgrade. Enough to feel the workflow before you pay for it.",
  },
  {
    q: "What happens after my client signs?",
    a: "The yes becomes the record. Cue seals the agreement, hashes the document, closes the audit trail, and files it in your library — searchable, downloadable as a final PDF, and untouchable once sealed.",
  },
  {
    q: "Can I use my own agreement wording?",
    a: "Yes — your terms, your studio. Start from a template and edit it, or open the blank one and paste in what you already use. On Pro, saved templates and your studio branding keep every Cue looking like you.",
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
                FAQ
              </h2>
              <p className="cue-lede" style={{ textAlign: "left" }}>
                How the send, the yes, and the record work — and what you get on
                day one.
              </p>
              <a
                className="cue-btn cue-btn-light cue-faq-contact"
                href="mailto:hello@krevo.io"
              >
                <Mail size={16} strokeWidth={1.9} aria-hidden />
                Email us
              </a>
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
      { href: "mailto:hello@krevo.io", label: "Contact" },
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
              field alone would scroll the heading out of view (and behind
              the sticky nav on desktop). */}
          <div className="cue-cta" id="waitlist">
            <div className="cue-cta-grid" aria-hidden />
            <div style={{ position: "relative" }}>
              <h2 className="cue-h2">
                {"Send the Cue.\nGet the yes.\nKeep the record."}
              </h2>
              <p
                className="cue-lede"
                style={{ marginInline: "auto", maxWidth: "52ch" }}
              >
                Cue is live, and access is by invite. Leave your email and we
                will send you a link — five free Cues waiting, no card, no
                commitment.
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
                <CueMark size={15} />
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
                  level. design.css styles `.cue-footer-col h3` to match. */}
              <h3>{col.heading}</h3>
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

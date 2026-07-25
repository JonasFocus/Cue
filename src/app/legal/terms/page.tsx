import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — Cue",
  description:
    "The terms for using the Cue website and waitlist while the product is still being built.",
};

const UPDATED = "25 July 2026";

const body: React.CSSProperties = {
  marginTop: 14,
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--cue-ink-soft)",
};

const heading: React.CSSProperties = {
  marginTop: 40,
  fontSize: 21,
  letterSpacing: "-0.02em",
};

export default function TermsPage() {
  return (
    <section className="cue-section">
      <div className="cue-shell">
        <h1 className="cue-h2" style={{ textAlign: "left" }}>
          Terms
        </h1>
        <p className="cue-lede" style={{ textAlign: "left" }}>
          Last updated {UPDATED}. These terms cover this website and its
          waitlist. They do not cover the Cue product, because it does not exist
          yet.
        </p>

        <h2 style={heading}>What this site is</h2>
        <p style={body}>
          A marketing page for a product being built by Krevo, plus a form that
          collects email addresses. There are no customer accounts, no signing
          service, and nothing to pay for. Anything described on this site is
          what we plan to build.
        </p>

        <h2 style={heading}>Nothing here is a contract or an offer</h2>
        <p style={body}>
          Features, timelines, and the prices shown on the pricing section are
          current intentions. They can change, and some of them may never ship.
          Joining the waitlist does not reserve a price, guarantee access, or
          create any obligation on either side. We may close the list or contact
          people in whatever order makes sense.
        </p>

        <h2 style={heading}>Using the site</h2>
        <p style={body}>
          Submit your own email address, not someone else&apos;s. Do not attempt
          to break, overload, or probe the site or the form; the form is
          rate-limited and abusive traffic gets blocked. You can ask to be
          removed from the list at any time by emailing{" "}
          <a href="mailto:hello@cue.krevo.io">hello@cue.krevo.io</a>.
        </p>

        <h2 style={heading}>No warranty</h2>
        <p style={body}>
          The site is provided as it is. It may be offline, incomplete, or wrong
          in places while the product is under construction. To the extent the
          law allows, Krevo is not liable for any loss arising from your use of
          this site or from relying on what it describes.
        </p>

        <h2 style={heading}>Not legal advice</h2>
        <p style={body}>
          Cue is not a law firm and does not provide legal advice. Nothing on
          this site — and nothing in any agreement template Cue may offer later —
          is a substitute for a lawyer reviewing your contracts.
        </p>

        <h2 style={heading}>Content</h2>
        <p style={body}>
          The text, design, and marks on this site belong to Krevo. Do not
          republish them as your own.
        </p>

        <h2 style={heading}>Changes</h2>
        <p style={body}>
          These terms will be rewritten before Cue opens to customers, and again
          when there is a service to attach them to. The date at the top shows
          the current version. Questions go to{" "}
          <a href="mailto:hello@cue.krevo.io">hello@cue.krevo.io</a>.
        </p>
      </div>
    </section>
  );
}

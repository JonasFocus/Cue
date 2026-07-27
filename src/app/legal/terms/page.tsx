import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: `/legal/terms` },
  openGraph: { title: 'Terms — Cue', description: 'The terms that cover the Cue site, waitlist, and application.', url: `/legal/terms` },
  title: "Terms — Cue",
  description:
    "The terms for using the Cue website, waitlist, and application while the product is still being built.",
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
          Last updated {UPDATED}. These terms cover this website, its waitlist,
          and the Cue application — creating a studio account, preparing
          agreements, and signing one someone sent you.
        </p>

        <h2 style={heading}>What this is</h2>
        <p style={body}>
          A product being built by Krevo: a marketing page, a waitlist form, and
          an application that prepares client agreements from templates, issues a
          signing link, and keeps the signed record. It is pre-launch and free.
          There is nothing to pay for and no billing of any kind.
        </p>

        <h2 style={heading}>What Cue does and does not do</h2>
        <p style={body}>
          Cue prepares a document from a template you fill in, gives you a link
          to share, records who signed it and when, and keeps that record. It
          does not send email — no email provider is connected, so sharing the
          link is entirely up to you. It does not collect payments, hold money,
          or chase anyone for a signature.
        </p>
        <p style={body}>
          <strong>The templates are a starting point, not a contract drafted for
          you.</strong> They have not been reviewed for your jurisdiction or your
          circumstances. You are responsible for what your agreement says and for
          having it reviewed. See &ldquo;Not legal advice&rdquo; below.
        </p>

        <h2 style={heading}>If you send agreements</h2>
        <p style={body}>
          You are responsible for the content of every Cue you send and for
          having the right to enter the client details you type in. Do not use
          Cue to send anything unlawful, or to impersonate anyone. Once you send
          a Cue its wording is frozen, and once every party has signed, the
          record is sealed and neither you nor we can alter it — that permanence
          is the point of the product, so read what you send before you send it.
        </p>

        <h2 style={heading}>If you were sent an agreement</h2>
        <p style={body}>
          You do not need an account and you are not a customer of Krevo. The
          agreement is between you and whoever sent it; Cue only carries it and
          records the signature. If you disagree with what it says, take it up
          with the sender rather than with us — we cannot change it, and after
          sealing, neither can they.
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
          rate-limited on a best-effort basis. You can ask to be
          removed from the list at any time by emailing{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">hello@krevo.io</a>.
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
          These terms will be rewritten again before Cue starts charging for
          anything. The date at the top shows the current version. Questions go to{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">hello@krevo.io</a>.
        </p>
      </div>
    </section>
  );
}

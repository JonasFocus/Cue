import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: `/legal/terms` },
  openGraph: { title: 'Terms — Cue', description: 'The terms that cover the Cue site, the access list, and the application.', url: `/legal/terms` },
  title: "Terms — Cue",
  description:
    "The terms for using the Cue website, requesting access, running a studio account, and signing an agreement someone sent you.",
};

const UPDATED = "29 July 2026";

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
          Last updated {UPDATED}. These terms cover this website, asking for
          access, and the Cue application — running a studio account, preparing
          agreements, and signing one someone sent you.
        </p>

        <h2 style={heading}>What this is</h2>
        <p style={body}>
          A product run by Krevo: a marketing site and a live application that
          prepares client agreements from templates, issues a signing link, and
          keeps the signed record. It is in production and in use.
        </p>
        <p style={body}>
          <strong>It is free.</strong> Cue takes no payments and holds no card
          details — there is no billing of any kind, and the prices shown on the
          pricing section are not yet charged. If that changes, these terms and
          that section change first.
        </p>

        <h2 style={heading}>Getting an account</h2>
        <p style={body}>
          Accounts are invite-only. Asking for access does not create one: an
          account exists only once we issue an invitation to a specific email
          address, and the application will refuse to create one for any other.
          We may decide who to invite and in what order, and we may decline
          without giving a reason.
        </p>
        <p style={body}>
          Access can also be time-limited or withdrawn — an invitation may carry
          an end date, and we can revoke one. If your access ends, the
          agreements you have already sealed are not deleted by that alone; see
          the privacy page for what happens to data and how to have it removed.
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

        <h2 style={heading}>Plans and prices are not an offer</h2>
        <p style={body}>
          The plans and prices shown on the pricing section describe what Cue
          intends to charge. <strong>Nothing is charged today.</strong> Cue
          does not generate or email PDF files; the current record can be
          printed or saved with your browser. Cloud storage is announced for
          this fall; dates can move, and an announcement is not a promise of
          what ships or when. Asking for access does not reserve a price or
          create an obligation on either side.
        </p>

        <h2 style={heading}>Using the site</h2>
        <p style={body}>
          Submit your own email address, not someone else&apos;s. Do not attempt
          to break, overload, or probe the site or the form; the form is
          rate-limited on a best-effort basis. You can ask to be removed from
          the access list at any time by emailing{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">hello@krevo.io</a>.
        </p>

        <h2 style={heading}>No warranty</h2>
        <p style={body}>
          Cue is provided as it is. It is run by one person and may be offline,
          may lose a request, or may be wrong in places. To the extent the law
          allows, Krevo is not liable for any loss arising from your use of it
          or from relying on what it describes — including any loss arising from
          an agreement you prepared, sent, or signed with it.
        </p>

        <h2 style={heading}>Not legal advice</h2>
        <p style={body}>
          Cue is not a law firm and does not provide legal advice. Nothing on
          this site, and nothing in any agreement template Cue offers, is a
          substitute for a lawyer reviewing your contracts.
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

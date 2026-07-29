import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: `/legal/privacy` },
  openGraph: {
    title: "Privacy — Cue",
    description: "Exactly what Cue stores, why, and how to have it deleted.",
    url: `/legal/privacy`,
  },
  title: "Privacy — Cue",
  description:
    "Exactly what Cue stores when you ask for access, run a studio account, or sign an agreement — where it lives, who processes it, and how to have it deleted.",
};

/* Every claim here must stay true of the code AND of the infrastructure. The
   sources are:
     - the access list: src/app/actions.ts
     - studio accounts and Cues: src/lib/studio.ts, src/lib/cue-db.ts, and the
       Better Auth tables from db/migrations/005_auth_schema.sql
     - signing evidence: src/app/s/[token]/actions.ts and cue_party in 007
     - who processes it: vercel.json (region), DATABASE_URL (Neon), and
       src/lib/redis.ts (Upstash)
   If any of those start collecting, sending, or moving something else, this
   page changes in the SAME commit. It has been wrong twice: it described only
   the waitlist after the application shipped, and it went on describing "a
   single rented virtual server" for a day after the move to Vercel and Neon.
   Both are the exact failure this rule exists to prevent. */

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

const subheading: React.CSSProperties = {
  marginTop: 26,
  fontSize: 17,
  letterSpacing: "-0.01em",
};

const list: React.CSSProperties = { ...body, paddingLeft: 20, listStyle: "disc" };

export default function PrivacyPage() {
  return (
    <section className="cue-section">
      <div className="cue-shell">
        <h1 className="cue-h2" style={{ textAlign: "left" }}>
          Privacy
        </h1>
        <p className="cue-lede" style={{ textAlign: "left" }}>
          Last updated {UPDATED}. Cue holds different things depending on how you
          met it. Find yourself below — only that section applies to you.
        </p>

        <h2 style={heading}>If you asked for access</h2>
        <ul style={list}>
          <li>Your email address.</li>
          <li>Your name, if you typed one — that field is optional.</li>
          <li>
            A SHA-256 hash of your IP address, salted with a secret held only on
            the server and not in the source code. The address itself is not
            stored and the hash cannot be turned back into it. It exists only to
            rate-limit the form against abuse.
          </li>
          <li>The user-agent string your browser sends, truncated.</li>
          <li>The date and time you submitted the form.</li>
        </ul>
        <p style={body}>
          That is the entire record. If we invite you, the same row also holds
          the invitation: the address it was issued to, the plan it starts you
          on, when it opens and ends, whether it has been used, and whether it
          was withdrawn.
        </p>
        <p style={body}>
          The marketing and legal pages set no cookies and run no analytics,
          tracking pixels, or third-party scripts. Fonts are served from this
          site, not from a third party. Signing in to a studio account sets one
          cookie — the session — and that is the only cookie Cue ever sets.
        </p>

        <h2 style={heading}>If you created a studio account</h2>
        <p style={body}>
          A studio account is for photographers and videographers who use Cue to
          prepare and send agreements.
        </p>

        <h3 style={subheading}>Your account</h3>
        <ul style={list}>
          <li>Your name and email address.</li>
          <li>
            Your password, stored only as a one-way hash. We never hold the
            password itself and cannot recover it.
          </li>
          <li>
            For each sign-in session: a session token, its expiry, your
            browser&rsquo;s user-agent string, and{" "}
            <strong>your IP address, stored in full rather than hashed</strong>.
            That comes from the authentication library Cue uses and is how a
            session can be recognised and revoked. It is not used for analytics
            or advertising.
          </li>
        </ul>

        <h3 style={subheading}>Your studio profile</h3>
        <ul style={list}>
          <li>
            Whatever you enter: studio name, legal name, contact email, phone
            number, business address, and a brand colour.
          </li>
        </ul>

        <h3 style={subheading}>The agreements you create</h3>
        <ul style={list}>
          <li>
            Everything you type into a Cue: its title, your client&rsquo;s name
            and email address, the shoot date and location, every answer you give
            in the builder — fees, deposits, deliverables and the rest — and any
            private notes you add.
          </li>
          <li>
            Once sent: a frozen copy of the finished agreement, a SHA-256
            fingerprint of it, and the unguessable link token.
          </li>
        </ul>

        <h2 style={heading}>If you signed an agreement someone sent you</h2>
        <p style={body}>
          You did not create an account and were not asked to. The photographer
          or videographer who sent you the link chose to use Cue and entered your
          details; Cue stores them on their behalf. When you sign, Cue records:
        </p>
        <ul style={list}>
          <li>The name and email address the sender entered for you.</li>
          <li>The full legal name you typed.</li>
          <li>
            An image of the signature, if you drew one. Drawing is optional —
            your typed name is the signature — and when you do not draw, no
            image is stored.
          </li>
          <li>
            The date and time you confirmed you had read the agreement, and the
            date and time you signed.
          </li>
          <li>
            A salted SHA-256 hash of your IP address — not the address itself —
            and your browser&rsquo;s user-agent string, truncated.
          </li>
          <li>
            A timestamped list of events on that agreement: when the link was
            issued, when it was first opened, each time it was viewed, and when
            it was signed and sealed.
          </li>
        </ul>
        <p style={body}>
          This is deliberate: it is the record that makes a signature mean
          something to both of you. It is described to you before you sign, and
          shown on the sealed agreement afterwards.
        </p>
        <p style={body}>
          <strong>Once an agreement is sealed it cannot be altered</strong> — by
          the sender, or by us. That is the point of it. See below for what that
          means for deletion.
        </p>

        <h2 style={heading}>What we do with all of it</h2>
        <p style={body}>
          We use it to run the product and nothing else. We do not sell or share
          it, add anyone to a newsletter, or use it for advertising or profiling.
          There is no analytics tool, no tracking pixel, and no third-party
          script on any page.
        </p>
        <p style={body}>
          Being straight about the current state:{" "}
          <strong>no email provider is connected to Cue at all.</strong> The
          application cannot send anything automatically — not a signing link,
          not a copy of a sealed agreement, not a reminder. When you send an
          agreement, you share the link yourself.
        </p>
        <p style={body}>
          That includes your invitation. When we have room, one person writes to
          you by hand from{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">
            hello@krevo.io
          </a>{" "}
          with your link. Your address is used for that and nothing else — no
          newsletter, no sequence, no third-party mailing tool holding a copy of
          it.
        </p>

        <h2 style={heading}>Who at Cue can see it</h2>
        <p style={body}>
          Cue is run by one person. That operator can see studio accounts, their
          usage, and the agreements they have created — including the client
          names, email addresses and signing records inside them — through a
          private, password-protected console. This exists so that accounts can
          be supported when something goes wrong, and it is the only way anyone
          at Cue reaches your data.
        </p>
        <p style={body}>
          Two limits on it, enforced by the software rather than by policy:{" "}
          <strong>a sealed agreement cannot be altered by the operator either</strong>{" "}
          — the record is immutable to us in exactly the way it is to both
          parties — and administrative actions are written to their own audit
          log. There is no way for anyone to sign, edit, or impersonate on your
          behalf.
        </p>

        <h2 style={heading}>Where it lives, and who else touches it</h2>
        <p style={body}>
          Everything is in one PostgreSQL database, behind HTTPS. Signature
          images sit in that same database as data, not with a file-storage
          provider. Nothing is copied to a marketing or analytics tool, because
          there is not one.
        </p>
        <p style={body}>
          Cue runs on rented infrastructure rather than machines Krevo owns, so
          three companies necessarily hold or pass your data. They are all of
          them:
        </p>
        <ul style={list}>
          <li>
            <strong>Vercel</strong> — runs the application and serves every
            page, from its northern Virginia region.
          </li>
          <li>
            <strong>Neon</strong> — hosts the PostgreSQL database, in AWS
            us-east-1, also in northern Virginia. This is where every account,
            agreement, signature and audit record actually sits.
          </li>
          <li>
            <strong>Upstash</strong> — holds rate-limiting counters only, keyed
            by the salted IP hash described above. It never sees an email
            address, an agreement, or a signature, and Cue keeps working if it
            is unavailable.
          </li>
        </ul>
        <p style={body}>
          All three are in the United States. If you are in the UK or EU, that
          means your data is processed outside it. Each is used as a supplier
          running infrastructure, under its own terms — none of them is given
          your data for their own purposes, and none is paid for it.
        </p>
        <p style={body}>
          Krevo does not run a separate off-site backup. What exists is
          whatever point-in-time history Neon keeps for the plan Cue is on,
          which is a supplier feature rather than a promise we are making to
          you. Cue is run by one person: treat a sealed agreement you rely on as
          something to download and keep your own copy of.
        </p>

        <h2 style={heading}>Getting your data removed</h2>
        <p style={body}>
          Email{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">
            hello@krevo.io
          </a>{" "}
          from the address concerned and we will act on it.
        </p>
        <ul style={list}>
          <li>
            <strong>Access list:</strong> we delete the row, and any invitation
            issued to that address. Nothing is retained.
          </li>
          <li>
            <strong>Studio account:</strong> we delete the account, the studio
            profile, and every Cue and draft belonging to it.
          </li>
          <li>
            <strong>If you signed something:</strong> write to us and we will
            tell you what is held and pass the request to the sender, whose
            agreement it is. We will not quietly alter a sealed record — an
            agreement both parties relied on is not ours to edit — but we will
            delete it outright on a legitimate request, and tell you when we
            have.
          </li>
        </ul>

        <h2 style={heading}>What we are not claiming</h2>
        <p style={body}>
          Cue is in production, but it is built and run by one person. It has
          not been audited or certified against any privacy or security
          standard, it has had no penetration test, and there is no data
          protection officer. Cue is not a law firm and gives no legal advice;
          the agreements it produces are templates you are expected to have
          reviewed.
        </p>
        <p style={body}>
          We are telling you exactly what is collected and where it sits so you
          can judge it on that, rather than on a badge.
        </p>

        <h2 style={heading}>Changes</h2>
        <p style={body}>
          If what we collect changes, this page changes with it and the date at
          the top moves. Questions go to{" "}
          <a className="cue-link" href="mailto:hello@krevo.io">
            hello@krevo.io
          </a>
          .
        </p>
      </div>
    </section>
  );
}

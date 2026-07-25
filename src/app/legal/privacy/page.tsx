import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Cue",
  description:
    "What Cue stores when you join the waitlist, where it lives, and how to have it deleted.",
};

/* Every claim here must stay true of src/app/actions.ts and src/lib/db.ts. If
   the waitlist starts collecting or sending anything else, this page changes in
   the same commit. */

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

const list: React.CSSProperties = { ...body, paddingLeft: 20, listStyle: "disc" };

export default function PrivacyPage() {
  return (
    <section className="cue-section">
      <div className="cue-shell">
        <h1 className="cue-h2" style={{ textAlign: "left" }}>
          Privacy
        </h1>
        <p className="cue-lede" style={{ textAlign: "left" }}>
          Last updated {UPDATED}. Cue has not launched. The only thing this site
          does with your information is keep a waitlist, so this page is short.
        </p>

        <h2 style={heading}>What we store when you join the waitlist</h2>
        <ul style={list}>
          <li>Your email address.</li>
          <li>Your name, if you typed one — that field is optional.</li>
          <li>
            A salted SHA-256 hash of your IP address. We do not store the address
            itself, and the hash cannot be turned back into it. It exists only to
            rate-limit the form against abuse.
          </li>
          <li>The user-agent string your browser sends, truncated.</li>
          <li>The date and time you submitted the form.</li>
        </ul>
        <p style={body}>
          That is the entire record. The marketing pages set no cookies and run
          no analytics, tracking pixels, or third-party scripts. Fonts are served
          from this site, not from a third party.
        </p>

        <h2 style={heading}>What we do with it</h2>
        <p style={body}>
          We intend to email you once, when Cue opens up. Being straight about
          the current state: no email provider is connected to this system at
          all, so as of {UPDATED} nothing has been sent to anyone on the list and
          nothing can be sent automatically. Beyond that, the operator counts
          signups and reads the list in a password-protected console.
        </p>
        <p style={body}>
          We do not sell or share the list, add you to a newsletter, or use it
          for advertising.
        </p>

        <h2 style={heading}>Where it lives</h2>
        <p style={body}>
          In one PostgreSQL database on a single rented virtual server, reachable
          only from the application on a private network, behind HTTPS. It is not
          copied to any third-party marketing or analytics tool.
        </p>

        <h2 style={heading}>Getting your data removed</h2>
        <p style={body}>
          Email <a href="mailto:hello@cue.krevo.io">hello@cue.krevo.io</a> from
          the address you signed up with and we will delete the row. There is no
          account to close — a waitlist entry is all we hold.
        </p>

        <h2 style={heading}>What we are not claiming</h2>
        <p style={body}>
          Cue is a pre-launch product built by one person. We have not been
          audited or certified against any privacy or security standard, and we
          do not have a data protection officer. We are telling you exactly what
          is collected and where it sits so you can judge it on that.
        </p>

        <h2 style={heading}>Changes</h2>
        <p style={body}>
          If what we collect changes, this page changes with it and the date at
          the top moves. Questions go to{" "}
          <a href="mailto:hello@cue.krevo.io">hello@cue.krevo.io</a>.
        </p>
      </div>
    </section>
  );
}

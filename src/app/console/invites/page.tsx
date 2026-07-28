import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailPlus, SearchX } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { formatStamp } from "@/lib/agreement";
import { adminOverview } from "@/lib/admin";
import {
  inviteState,
  INVITE_STATE_LABEL,
  INVITE_STATE_TONE,
  listInvites,
  toDateInput,
  type InviteState,
} from "@/lib/invite";
import { SITE_URL } from "@/lib/site-url";
import { requireOperator } from "@/lib/studio";
import { CopyInviteLink, InviteComposer, InviteControls } from "./invites";
import "../console.css";

/* The invite list: who has been let in, for how long, and whether they turned
 * up.
 *
 * Its own tab rather than part of Customers, because an invitee is not a
 * customer yet — most rows here have no studio behind them, and folding "people
 * who might sign up" into "studios and their clients' data" would make both
 * screens harder to read.
 *
 * Same three rules as /console/studios:
 *   • requireOperator() gates the route. Not "is there a session" — these rows
 *     decide who can create an account at all.
 *   • force-dynamic and robots: noindex. The page renders live invite tokens,
 *     which are bearer credentials; a cached copy is an access grant.
 *   • nothing personal is logged, here or in invite.ts.
 *
 * Server-rendered end to end. The only client components on the surface are the
 * composer, the per-row controls and the copy button, which is why no control
 * anywhere on this page can reach a column the actions did not name. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invites · Cue Console",
  robots: { index: false, follow: false },
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** The access period as one readable phrase. */
function period(startsAt: string, expiresAt: string | null, state: InviteState): string {
  if (state === "pending") return `From ${day(startsAt)}`;
  if (!expiresAt) return "No end date";
  return `${state === "expired" ? "Ended" : "Until"} ${day(expiresAt)}`;
}

export default async function InvitesPage() {
  const operator = await requireOperator();
  if (!operator) redirect("/console/login");

  const [overview, invites] = await Promise.all([adminOverview(), listInvites()]);

  const now = new Date();
  const rows = invites.map((invite) => ({
    ...invite,
    state: inviteState(invite, now),
    // Built here rather than in the client component: SITE_URL is resolved from
    // the deployment's own environment, so a preview never hands somebody a
    // link into production.
    url: `${SITE_URL}/invite/${invite.token}`,
  }));

  const active = rows.filter((r) => r.state === "active").length;
  const accepted = rows.filter((r) => r.acceptedUserId).length;
  const waiting = rows.filter((r) => r.state === "active" && !r.acceptedUserId).length;

  return (
    <div className="cx">
      <div className="cx-col cs-col">
        <header className="cx-top">
          <span className="cx-mark">
            <CueMark size={13} />
          </span>
          <span className="cx-wordmark">
            Console<span>cue.krevo.io</span>
          </span>
          <span className="cx-who">{operator.email}</span>
        </header>

        <nav className="cx-tabs" aria-label="Console views">
          <Link className="cx-tab" href="/console">
            Overview
          </Link>
          <Link className="cx-tab" href="/console/studios">
            Customers
            <b>{overview.studios.toLocaleString()}</b>
          </Link>
          <Link className="cx-tab" href="/console/invites" aria-current="page">
            Invites
            <b>{rows.length.toLocaleString()}</b>
          </Link>
        </nav>

        <main className="cx-pane">
          <section className="cx-hero">
            <div className="cx-hero-art cx-art" aria-hidden>
              <div className="cx-dither" />
            </div>
            <div className="cx-hero-body">
              <span className="cx-hero-status cx-ok">
                <span className="cx-dot" />
                {active === 1 ? "1 live invite" : `${active.toLocaleString()} live invites`}
              </span>

              <h1 className="cx-hero-title">
                {rows.length === 0
                  ? "Nobody invited yet."
                  : accepted === 0
                    ? "Nobody has taken up an invite yet."
                    : `${accepted.toLocaleString()} of ${rows.length.toLocaleString()} invites turned into a studio.`}
              </h1>
              <p className="cx-hero-sub">
                Cue is invite-only. An account can only be created for an address
                on this list, and access stops the moment its window closes — at
                their next request, not at their next sign-in.
              </p>

              <div className="cx-figures">
                <span className="cx-figure">
                  <b>{rows.length.toLocaleString()}</b>
                  <span>invited</span>
                </span>
                <span className="cx-figure">
                  <b>{active.toLocaleString()}</b>
                  <span>active</span>
                </span>
                <span className="cx-figure">
                  <b>{accepted.toLocaleString()}</b>
                  <span>signed up</span>
                </span>
                <span className="cx-figure">
                  <b>{waiting.toLocaleString()}</b>
                  <span>not yet</span>
                </span>
              </div>
            </div>
          </section>

          <p className="cx-label">Invite someone</p>
          <p className="cs-hint">
            Nothing is emailed — there is no mail provider, so copying the link and
            sending it yourself is the delivery, exactly as it is for a Cue. The
            link opens a page with their name on it and creates the account for
            that address only.
          </p>
          <div className="cs-panel">
            <InviteComposer />
          </div>

          <p className="cx-label">Everyone invited</p>
          <p className="cs-hint">
            Saving an empty date clears the end date and makes the invite
            open-ended. To end somebody&rsquo;s access today, revoke it — an end
            date before the invite started is refused, and revoking can be undone.
          </p>
          <div className="ci-list">
            {rows.length === 0 && (
              <p className="cx-empty ci-empty">
                <SearchX size={15} strokeWidth={1.75} aria-hidden />
                No invites yet. The first one goes above.
              </p>
            )}

            {rows.map((invite) => (
              <article className="ci-row" key={invite.id}>
                <div className="ci-who">
                  <b>{invite.name}</b>
                  <span>{invite.email}</span>
                  {invite.note ? <em>{invite.note}</em> : null}
                </div>

                <div className="ci-meta">
                  <span className="cs-tag" data-tone={INVITE_STATE_TONE[invite.state]}>
                    {INVITE_STATE_LABEL[invite.state]}
                  </span>
                  <span className="cs-date">
                    {period(invite.startsAt, invite.expiresAt, invite.state)}
                  </span>
                  <span
                    className="cs-date"
                    title={invite.acceptedAt ? formatStamp(invite.acceptedAt) : undefined}
                  >
                    {invite.acceptedAt
                      ? `Signed up ${day(invite.acceptedAt)}`
                      : "Not signed up"}
                  </span>
                  <CopyInviteLink url={invite.url} />
                </div>

                <InviteControls
                  inviteId={invite.id}
                  expiresAt={toDateInput(invite.expiresAt)}
                  revoked={invite.revokedAt !== null}
                  accepted={invite.acceptedUserId !== null}
                  personLabel={invite.name}
                />
              </article>
            ))}
          </div>

          <p className="cx-note">
            <MailPlus size={12} strokeWidth={2} aria-hidden /> Revoking takes effect
            on their next request, not at their next sign-in. Nothing is deleted
            when access ends — their Cues and sealed records survive and come back
            with their access. Every change here is recorded against your account.
          </p>
        </main>
      </div>
    </div>
  );
}

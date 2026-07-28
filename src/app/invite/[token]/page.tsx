import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Sparkles } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { formatDate } from "@/lib/agreement";
import { FREE_SENT_ALLOWANCE } from "@/lib/cue";
import { inviteByToken, inviteState, type InviteState } from "@/lib/invite";
import { currentUser } from "@/lib/studio";
import { InviteSignupForm } from "./form";
import "./invite.css";

/* The invite landing page: what a friend sees when they open the link the
 * console generated.
 *
 * A route of its own rather than `?i=` on the signup form, because the link is
 * the product here — it gets pasted into a message and it should look like an
 * invitation when it opens, not like a form with a query string. `/invite/<24
 * bytes of base64url>` is also the same shape as the client signing link at
 * `/s/[token]`, which is the other place this product hands somebody a URL
 * instead of an account.
 *
 * The token is a bearer credential, so:
 *   • noindex, and force-dynamic — a cached invite page is somebody's name and
 *     email address sitting in a CDN;
 *   • the closed-door copy never distinguishes "no such token" from "revoked",
 *     so guessing tells you nothing;
 *   • nothing about the invite is logged.
 *
 * And it is still not the enforcement. What actually closes signup is the
 * `user.create.before` hook in src/lib/auth.ts — this page is what makes a real
 * invite pleasant rather than what makes a fake one fail.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're invited to Cue",
  // Never the invitee's name: a link preview in a group chat should not unfold
  // somebody's email address to everyone in it.
  description: "An invitation to try Cue.",
  robots: { index: false, follow: false },
};

const CLOSED: Record<InviteState | "unknown", { title: string; body: string }> = {
  // "unknown" and "revoked" deliberately read the same. A wrong link and a
  // withdrawn one are the same non-answer to anybody trying tokens.
  unknown: {
    title: "This invite link isn't valid.",
    body: "Check you copied the whole link. If it still doesn't open, ask for a new one.",
  },
  revoked: {
    title: "This invite link isn't valid.",
    body: "Check you copied the whole link. If it still doesn't open, ask for a new one.",
  },
  pending: {
    title: "You're a little early.",
    body: "This invitation hasn't opened yet. Try the same link again shortly — it will work then.",
  },
  expired: {
    title: "This invitation has expired.",
    body: "The window on this link has closed. Ask for a new one and we'll open it back up.",
  },
  active: { title: "", body: "" }, // unreachable; the active branch renders the form
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Already signed in? The workspace is the answer to every question this page
  // asks. requireStudio() there sends them on to /app/locked if their own
  // access has since ended.
  if (await currentUser()) redirect("/app");

  const { token } = await params;
  const invite = await inviteByToken(token);
  const state = invite ? inviteState(invite, new Date()) : null;

  if (!invite || state !== "active") {
    const copy = CLOSED[state ?? "unknown"];
    return (
      <main className="cue-auth">
        <div className="cue-hero-orb" aria-hidden />
        <div className="cue-hero-grid" aria-hidden />

        <div className="cue-auth-card ci-card ci-closed">
          <div className="ci-band" aria-hidden />
          <span className="ci-mark" aria-hidden>
            <CueMark size={22} />
          </span>

          <div className="ci-body">
            <h1 className="ci-title">{copy.title}</h1>
            <p className="ci-sub">{copy.body}</p>
            <p className="ci-foot">
              <a href="mailto:hello@krevo.io">hello@krevo.io</a> ·{" "}
              <Link href="/">What is Cue?</Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* First name only. "Hi Ana" is an invitation; "Hi Ana Okafor" is a database
     saying your full name back to you. */
  const firstName = invite.name.trim().split(/\s+/)[0] ?? invite.name;

  return (
    <main className="cue-auth">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <div className="cue-auth-card ci-card">
        <div className="ci-band" aria-hidden />
          <span className="ci-mark" aria-hidden>
            <CueMark size={22} />
          </span>

        <div className="ci-body">
          <span className="ci-chip">
            <Sparkles size={11} strokeWidth={2.25} aria-hidden />
            Invitation
          </span>

          <h1 className="ci-title">
            {firstName}, you&rsquo;re invited
            <br />
            to try Cue.
          </h1>
          <p className="ci-sub">
            Client agreements for photographers and videographers. Build one from
            a template, send a link, and your client signs without an account.
          </p>

          <div className="ci-facts">
            <span className="ci-fact">
              <b>{FREE_SENT_ALLOWANCE} Cues</b>
              <span>to send, free</span>
            </span>
            <span className="ci-fact">
              <b>No card</b>
              <span>nothing to cancel</span>
            </span>
            <span className="ci-fact">
              {/* The access period, stated before they sign up rather than
                  discovered on the day it ends. An open-ended invite says so. */}
              <b>
                {invite.expiresAt ? (
                  formatDate(invite.expiresAt.slice(0, 10))
                ) : (
                  <>
                    <Clock size={12} strokeWidth={2.25} aria-hidden /> Open
                  </>
                )}
              </b>
              <span>{invite.expiresAt ? "access until" : "no end date"}</span>
            </span>
          </div>

          <InviteSignupForm name={invite.name} email={invite.email} />
        </div>
      </div>
    </main>
  );
}

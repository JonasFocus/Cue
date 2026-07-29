import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailQuestion } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { currentUser } from "@/lib/studio";

/* A closed door, and nothing else.
 *
 * Signup is invite-only. The form lives at /invite/[token], behind a link the
 * console generates — there is no route to an account that does not start with
 * an invitation, so there is no form to put here. Kept as a page rather than
 * deleted because /app/signup is the URL people guess, and a 404 does not
 * explain anything.
 *
 * Neither this page nor the invite page is the enforcement: that is the
 * `user.create.before` hook in src/lib/auth.ts, which sits inside the account
 * creation and so also refuses a POST aimed straight at
 * /api/auth/sign-up/email.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invite only",
  robots: { index: false, follow: false },
};

export default async function AppSignupPage() {
  if (await currentUser()) redirect("/app");

  return (
    <main className="cue-auth">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <div className="cue-auth-card">
        <div className="cue-auth-head">
          <span className="cue-brand">
            <span className="cue-brand-mark">
              <CueMark size={15} />
            </span>
            Cue
          </span>
          <span className="cue-auth-chip">
            <MailQuestion size={11} strokeWidth={2.25} aria-hidden /> Invite only
          </span>
        </div>

        <div>
          <h1 className="cue-auth-title">Cue is invite-only.</h1>
          <p className="cue-auth-sub">
            New studios are let in a few at a time. Request access and
            we&rsquo;ll send you a link when there&rsquo;s room.
          </p>
        </div>

        <p className="cue-auth-foot">
          <Link href="/#waitlist">Request access</Link>
          {" · "}
          <Link href="/app/login">Already have a studio? Sign in</Link>
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { ACCESS_MESSAGE, accessForUser } from "@/lib/invite";
import { currentUser } from "@/lib/studio";
import { SignOutButton } from "./sign-out";

/* Where requireStudio() sends somebody whose invite is no longer live.
 *
 * Deliberately does NOT call requireStudio() itself — that is what sends people
 * here, and a page that redirects to itself is a loop rather than a screen. It
 * re-derives the decision directly, which also means an invite that has been
 * restored bounces the person straight back into the app on their next refresh.
 *
 * The layout renders this bare, without the sidebar: a workspace shell built
 * from Cue counts they can no longer open would be a cruel way to say this. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access ended",
  robots: { index: false, follow: false },
};

export default async function LockedPage() {
  const user = await currentUser();
  if (!user) redirect("/app/login");

  const access = await accessForUser(user);
  if (access.allowed) redirect("/app");

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
            <Lock size={11} strokeWidth={2.25} aria-hidden /> Locked
          </span>
        </div>

        <div>
          <h1 className="cue-auth-title">{ACCESS_MESSAGE[access.reason]}</h1>
          <p className="cue-auth-sub">
            {/* Says what is and is not gone. Somebody who has signed real
                agreements through this account needs to know the records did
                not evaporate with their access. */}
            Signed in as {user.email}. Nothing has been deleted — every Cue you
            sent and every record you sealed is still here, and they come back the
            moment your access does.
          </p>
        </div>

        <p className="cue-auth-sub">
          If this looks wrong, reply to the invite you were sent or write to{" "}
          <a href="mailto:hello@krevo.io">hello@krevo.io</a>.
        </p>

        <SignOutButton />
      </div>
    </main>
  );
}

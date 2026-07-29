"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { LogOut } from "lucide-react";
import { CueMark } from "@/components/cue-mark";

/* The chrome every console surface shares.
 *
 * It used to be copy-pasted three ways, and the copies had drifted into a
 * navigation hole: /console/studios and /console/invites offered Overview,
 * Customers and Invites only, so Guest list and Changelog could not be reached
 * from either one — and neither carried a sign-out, so leaving the console meant
 * going back to Overview first. Both were invisible from the dashboard, which
 * had the full set.
 *
 * One definition below, so a tab cannot exist on one surface and not another. */

/** Which console surface is being rendered. Also the `aria-current` key. */
export type ConsoleSurface = "overview" | "guests" | "changelog" | "studios" | "invites";

/* The dashboard's three views are in-place state on a polling client component,
   so they are query params on one route rather than routes of their own. From
   another surface they still have to be linkable, which is what `?tab=` is. */
export const CONSOLE_TABS: { key: ConsoleSurface; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/console" },
  { key: "guests", label: "Guest list", href: "/console?tab=guests" },
  { key: "changelog", label: "Changelog", href: "/console?tab=changelog" },
  { key: "studios", label: "Customers", href: "/console/studios" },
  { key: "invites", label: "Invites", href: "/console/invites" },
];

/**
 * Masthead, with the sign-out that only the dashboard used to have.
 *
 * A client component because signing out is a fetch: the server surfaces that
 * render it (Customers, Invites) cannot own that handler themselves.
 */
export function ConsoleMasthead({ operator }: { operator: string }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Better Auth rejects a body-less POST with 415 and never revokes the
  // session. Without the header the operator was redirected to the login page
  // while the session cookie stayed valid for its full life — on a shared
  // machine, that is a live session handed to the next person.
  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`sign-out returned ${res.status}`);
    } catch (err) {
      setError(
        `Sign-out failed (${(err as Error).message}) — you are STILL signed in. Try again.`,
      );
      setSigningOut(false);
      return;
    }
    window.location.href = "/console/login";
  }, []);

  return (
    <>
      <header className="cx-top">
        <span className="cx-mark">
          <CueMark size={13} />
        </span>
        <span className="cx-wordmark">
          Console<span>cue.krevo.io</span>
        </span>
        <span className="cx-who">{operator}</span>
        <button
          className="cx-signout"
          onClick={signOut}
          type="button"
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={13} strokeWidth={2} />
        </button>
      </header>
      {/* Rendered by the masthead rather than handed up to each surface: a
          failed sign-out has to be visible on whichever page it happened. */}
      {error && (
        <p className="cx-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * The tab strip for the routed surfaces, where every tab is a link.
 *
 * The dashboard renders its own — its three views are `useState` swaps that
 * must not navigate, since a navigation would remount the poll. It takes its
 * labels and order from CONSOLE_TABS all the same.
 */
export function ConsoleTabs({
  current,
  counts,
}: {
  current: ConsoleSurface;
  counts?: Partial<Record<ConsoleSurface, number>>;
}) {
  return (
    <nav className="cx-tabs" aria-label="Console views">
      {CONSOLE_TABS.map((tab) => {
        const count = counts?.[tab.key];
        return (
          <Link
            className="cx-tab"
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === current ? "page" : undefined}
          >
            {tab.label}
            {count !== undefined ? <b>{count.toLocaleString()}</b> : null}
          </Link>
        );
      })}
    </nav>
  );
}

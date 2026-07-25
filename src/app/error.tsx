"use client";

import Link from "next/link";
import { PenLine, RotateCw } from "lucide-react";
import { useEffect } from "react";

/* Catches any unhandled render or data error below the root layout so nobody
   ever meets Next's raw 500 page. Reuses the 404 classes verbatim — the styling
   lives in design.css, which this agent does not own, so no new CSS.
   ponytail: no global-error.tsx. That only catches throws in the root layout
   itself, which is a static component with no data access; it would also
   replace <html>/<body> and so lose design.css entirely, meaning an unstyled
   page for a failure mode that cannot currently happen. Add one if the root
   layout ever fetches anything. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error monitoring is wired yet, so the container log is the only record.
    console.error("[render]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="cue-404">
      <div className="cue-404-veil" aria-hidden />

      <div className="cue-404-shell">
        <div className="cue-404-card">
          <div className="cue-404-brandrow">
            <Link href="/" className="cue-404-brand">
              <span className="cue-404-mark">
                <PenLine size={15} strokeWidth={2} />
              </span>
              Cue
            </Link>
            <span className="cue-404-beta">Beta</span>
          </div>

          <p className="cue-404-code" aria-hidden>
            500
          </p>
          <h1 className="cue-404-title">That didn&rsquo;t load.</h1>
          <p className="cue-404-lede">
            Something on our end failed while building this page. Nothing you
            sent was lost. Try again in a moment.
          </p>

          {/* One CTA only: .cue-404-cta is a full-width pill, and the wordmark
              above is already the way home. */}
          <button type="button" className="cue-404-cta" onClick={reset}>
            <RotateCw size={15} strokeWidth={2.25} />
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}

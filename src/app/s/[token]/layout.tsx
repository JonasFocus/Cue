import type { Metadata } from "next";
import "./sign.css";

/* This route is outside the app shell on purpose.
 *
 * /app is a creator's workspace behind a session; /s/[token] is a stranger's
 * one-page contract. Sharing a layout would mean shipping the sidebar, the tab
 * bar, and the workspace stylesheet to a phone that will only ever see this
 * page once — and would invite the two surfaces to drift into looking like one
 * product with a broken navigation. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A signing link must never be indexed. It is an unguessable capability URL
  // whose whole security model is that only the recipient has it, so a copy in
  // a search index is the same as a leak. Restated on the page itself too.
  robots: { index: false, follow: false, nocache: true },
  title: "Agreement — Cue",
};

export default function SigningLayout({ children }: { children: React.ReactNode }) {
  return <div className="sg">{children}</div>;
}

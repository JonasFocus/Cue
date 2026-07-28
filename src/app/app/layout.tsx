import type { Metadata } from "next";
import { countByStatus } from "@/lib/cue-db";
import { accessForUser } from "@/lib/invite";
import { currentUser, ensureStudio } from "@/lib/studio";
import { Sidebar, TabBar } from "./nav";
import "./app.css";

/* The session lives in Postgres and is read per request, so nothing under /app
   is ever prerendered. Declared rather than inferred: a page here that happens
   not to touch the session would otherwise be statically built and serve one
   creator's shell to the next. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Cue", template: "%s — Cue" },
  // The workspace is one creator's private data behind a session. Nothing here
  // belongs in an index, and /app/login must not compete with the landing page.
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  /* ponytail: one layout for both the shell and its doorway, keyed on the
     session instead of a route group. /app/login and /app/signup are nested
     under this segment and would otherwise inherit a sidebar built from a
     studio that does not exist yet. A (workspace) route group would express it
     in the file tree, but it means two layouts and a second copy of the CSS
     import to keep in sync. Signed out, the children render bare and paint
     their own full-page auth card; signed in, they get the shell. Signed-in
     visits to /app/login redirect from the page itself, so the auth card is
     never framed by the sidebar. */
  if (!user) return children;

  /* /app/locked is the same case as the auth pages: signed in, but with nothing
     to put a sidebar around. A shell built from Cue counts somebody is no
     longer allowed to open would be a cruel way to say "your access ended".

     ponytail: this repeats the lookup requireStudio() makes on the page beneath
     it, exactly as the currentUser() and ensureStudio() calls above already do.
     One indexed lookup on a request that is making three anyway. Wrap all three
     in React's cache() together the day this shows up in a trace — doing it for
     this one alone would only make the duplication harder to see. */
  if (!(await accessForUser(user)).allowed) return children;

  const studio = await ensureStudio(user);
  const counts = await countByStatus(studio.id);

  return (
    <div className="ca">
      {/* 11 focusable sidebar items sit before the content on every page. The
          marketing site has had this since launch; the app, where a creator
          navigates far more often, did not. `.cue-skip` is styled in design.css
          and in scope because `.cue` is on <body>. */}
      <a href="#ca-main" className="cue-sr-only cue-skip">
        Skip to content
      </a>
      <div className="ca-shell">
        <Sidebar
          studioName={studio.name}
          email={user.email}
          plan={studio.plan}
          sentCount={studio.sentCount}
          counts={counts}
        />
        <main className="ca-main" id="ca-main">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}

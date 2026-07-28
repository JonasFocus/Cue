import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, SearchX, Users } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { formatStamp } from "@/lib/agreement";
import { adminOverview, parseStudioCursor, studioList } from "@/lib/admin";
import { PLAN_LABEL } from "@/lib/cue";
import { requireOperator } from "@/lib/studio";
import "../console.css";

/* The customer list.
 *
 * Cue is B2B: the customers are studios, and they have clients of their own. So
 * this screen shows other people's client counts, and the one behind it shows
 * their clients by name and email. Three consequences, all deliberate:
 *
 *   • requireOperator() gates the route. Not "is there a session" — a creator
 *     session must land on nothing, and the weaker check is exactly the bug
 *     that was found on three API routes on 2026-07-26.
 *   • force-dynamic and robots: noindex. A cached page of somebody else's
 *     customer list is the worst kind of stale.
 *   • nothing personal is logged, here or in admin.ts.
 *
 * Server-rendered end to end. The only client component on the surface is the
 * pair of forms in studios.tsx, which is a large part of why there is no edit
 * control anywhere near a signed record. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers · Cue Console",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function StudiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const operator = await requireOperator();
  if (!operator) redirect("/console/login");

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = one("q") ?? "";
  // An unparseable cursor is treated as no cursor rather than as an error: a
  // truncated URL should show the first page, not a 500.
  const cursor = parseStudioCursor(one("before"));

  const [overview, page] = await Promise.all([
    adminOverview(),
    studioList({ query, cursor, limit: PAGE_SIZE }),
  ]);

  const activation = overview.studios
    ? Math.round((overview.activated / overview.studios) * 100)
    : 0;

  const nextHref = page.nextCursor
    ? `/console/studios?${new URLSearchParams({
        ...(query ? { q: query } : {}),
        before: page.nextCursor,
      })}`
    : null;

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
          <Link className="cx-tab" href="/console/studios" aria-current="page">
            Customers
            <b>{overview.studios.toLocaleString()}</b>
          </Link>
          <Link className="cx-tab" href="/console/invites">
            Invites
          </Link>
        </nav>

        <main className="cx-pane">
          <section className="cx-hero">
            <div className="cx-hero-art cx-art" aria-hidden>
              <div className="cx-dither" data-tone="warm" />
            </div>
            <div className="cx-hero-body">
              <span className="cx-hero-status cx-ok">
                <span className="cx-dot" />
                {overview.studios === 1 ? "1 studio" : `${overview.studios.toLocaleString()} studios`}
              </span>

              <h1 className="cx-hero-title">
                {overview.studios === 0
                  ? "No customers yet."
                  : overview.activated === 0
                    ? "Nobody has sent a Cue yet."
                    : `${overview.activated.toLocaleString()} of ${overview.studios.toLocaleString()} studios have sent a Cue.`}
              </h1>
              <p className="cx-hero-sub">
                Activation is the number that matters before revenue does: a studio
                that has never sent a Cue has never actually used the product.
              </p>

              <div className="cx-figures">
                <span className="cx-figure">
                  <b>{overview.studios.toLocaleString()}</b>
                  <span>studios</span>
                </span>
                <span className="cx-figure">
                  <b>{activation}%</b>
                  <span>activated</span>
                </span>
                <span className="cx-figure">
                  <b>{overview.cuesSent.toLocaleString()}</b>
                  <span>Cues sent</span>
                </span>
                <span className="cx-figure">
                  <b>{overview.sealed.toLocaleString()}</b>
                  <span>sealed</span>
                </span>
                <span className="cx-figure">
                  <b>{overview.cuesCreated.toLocaleString()}</b>
                  <span>created</span>
                </span>
              </div>
            </div>
          </section>

          {/* A plain GET form: the query lives in the URL, so a search is
              linkable, back works, and the page stays server-rendered.
              Submitting drops `before`, which is what starting a new search
              should do. */}
          <form className="cs-toolbar" method="get" action="/console/studios">
            <label className="cx-search">
              <Search size={13} strokeWidth={2} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search studio name or owner email"
                aria-label="Search customers"
              />
            </label>
            <button className="cs-button" type="submit">
              Search
            </button>
            {query ? (
              <Link className="cs-quiet-link" href="/console/studios">
                Clear
              </Link>
            ) : null}
            <span className="cs-count">
              {page.total.toLocaleString()} {page.total === 1 ? "match" : "matches"}
            </span>
          </form>

          <table className="cx-table cs-table">
            {page.studios.length > 0 && (
              <thead className="cx-thead" role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    Studio
                  </th>
                  <th scope="col" role="columnheader">
                    Plan
                  </th>
                  <th scope="col" role="columnheader" className="cs-num">
                    Cues
                  </th>
                  <th scope="col" role="columnheader" className="cs-num">
                    Sent
                  </th>
                  <th scope="col" role="columnheader" className="cs-num">
                    Signed
                  </th>
                  <th scope="col" role="columnheader" className="cs-num">
                    Clients
                  </th>
                  <th scope="col" role="columnheader">
                    Last activity
                  </th>
                  <th scope="col" role="columnheader">
                    Joined
                  </th>
                </tr>
              </thead>
            )}

            <tbody role="rowgroup">
              {page.studios.length === 0 && (
                <tr role="row">
                  <td className="cx-empty" role="cell" colSpan={8}>
                    <SearchX size={15} strokeWidth={1.75} aria-hidden />
                    {query
                      ? `No customer matches “${query}”.`
                      : "No studios have signed up yet."}
                  </td>
                </tr>
              )}

              {page.studios.map((s) => (
                <tr className="cx-trow cs-trow" role="row" key={s.id}>
                  <td className="cs-name" role="cell">
                    <Link href={`/console/studios/${s.id}`}>
                      <b>{s.name}</b>
                      <span>{s.ownerEmail}</span>
                    </Link>
                  </td>
                  <td role="cell">
                    <span className="cs-tag" data-plan={s.plan}>
                      {PLAN_LABEL[s.plan]}
                    </span>
                  </td>
                  <td className="cs-num" role="cell">
                    {s.cuesCreated.toLocaleString()}
                  </td>
                  <td className="cs-num" role="cell">
                    {s.cuesSent.toLocaleString()}
                  </td>
                  <td className="cs-num" role="cell">
                    {s.signed.toLocaleString()}
                  </td>
                  <td className="cs-num" role="cell">
                    {s.clients.toLocaleString()}
                  </td>
                  <td className="cs-date" role="cell" title={formatStamp(s.lastActivity)}>
                    {day(s.lastActivity)}
                  </td>
                  <td className="cs-date" role="cell" title={formatStamp(s.createdAt)}>
                    {day(s.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(nextHref || cursor) && (
            <div className="cx-load-more cs-pager">
              {cursor ? (
                <Link
                  className="cs-quiet-link"
                  href={`/console/studios${query ? `?${new URLSearchParams({ q: query })}` : ""}`}
                >
                  Back to the first page
                </Link>
              ) : (
                <span />
              )}
              {nextHref ? (
                <Link className="cs-quiet-link" href={nextHref}>
                  Next {PAGE_SIZE} customers →
                </Link>
              ) : null}
            </div>
          )}

          <p className="cx-note">
            <Users size={12} strokeWidth={2} aria-hidden /> Ordered by last activity.
            Every row here is somebody else&rsquo;s business and their clients&rsquo;
            personal data — read it when a support request needs it, not otherwise.
            Profile and plan changes are recorded against your account.
          </p>
        </main>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { formatDate, formatStamp } from "@/lib/agreement";
import {
  adminCueDetail,
  adminTrail,
  studioClients,
  studioCues,
  studioDetail,
  studioUsage,
  type AdminTrailEntry,
} from "@/lib/admin";
import {
  CUE_STATUSES,
  EVENT_LABEL,
  FREE_SENT_ALLOWANCE,
  ROLE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/cue";
import { PLAN_LABEL } from "@/lib/cue";
import { requireOperator } from "@/lib/studio";
import { PlanControl, ProfileForm } from "../studios";
import "../../console.css";

/* One customer, in depth: who they are, how they are using Cue, the clients
   they have worked with, and every Cue they have made.
 *
 * Read-only about the record, editable about the account. The distinction is
 * the product:
 *
 *   • Editable — the studio's own profile fields and its plan. Both go through
 *     server actions in ../actions.ts, both re-check requireOperator(), and
 *     both write an admin_event.
 *   • Not editable, by anyone including us — cue, cue_party, cue_event. There
 *     is no control on this page that writes to them, no query in admin.ts that
 *     could, and a BEFORE UPDATE trigger on cue_event behind both. A sealed
 *     record being immutable is the entire promise; an operator able to quietly
 *     amend one would make the audit trail worthless retroactively.
 *
 * `?cue=<id>` swaps the lists for one Cue's read-only detail. A query parameter
 * rather than a nested route because the Cue only ever makes sense inside the
 * customer it belongs to, and the studio_id stays in the WHERE clause either
 * way. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Deliberately not the studio's name: a browser tab, a screen share or a
  // window title should not leak whose account is open.
  title: "Customer · Cue Console",
  robots: { index: false, follow: false },
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function trailDetail(entry: AdminTrailEntry): string {
  const meta = entry.meta ?? {};
  if (entry.action === "studio.plan") {
    const from = typeof meta.from === "string" ? meta.from : "?";
    const to = typeof meta.to === "string" ? meta.to : "?";
    return `${from} → ${to}`;
  }
  const fields = Array.isArray(meta.fields)
    ? meta.fields.filter((f): f is string => typeof f === "string")
    : [];
  return fields.length ? fields.join(", ") : "—";
}

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const operator = await requireOperator();
  if (!operator) redirect("/console/login");

  const { id } = await params;
  const studioId = Number(id);
  if (!Number.isSafeInteger(studioId) || studioId <= 0) notFound();

  const studio = await studioDetail(studioId);
  if (!studio) notFound();

  const search = await searchParams;
  const rawCue = Array.isArray(search.cue) ? search.cue[0] : search.cue;
  const cueId = Number(rawCue);
  const wantsCue = rawCue !== undefined && Number.isSafeInteger(cueId) && cueId > 0;

  const [usage, clients, cues, trail, detail] = await Promise.all([
    studioUsage(studioId),
    wantsCue ? Promise.resolve([]) : studioClients(studioId),
    wantsCue ? Promise.resolve([]) : studioCues(studioId),
    adminTrail(studioId, 20),
    // Scoped by studio id as well as Cue id, so a Cue reached through the wrong
    // customer's URL is a 404 rather than a quietly mismatched screen.
    wantsCue ? adminCueDetail(studioId, cueId) : Promise.resolve(null),
  ]);

  if (wantsCue && !detail) notFound();

  const allowance =
    studio.plan === "free"
      ? `${studio.sentCount} of ${FREE_SENT_ALLOWANCE} free sends used`
      : `${studio.sentCount} sends, no allowance cap on ${PLAN_LABEL[studio.plan]}`;

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
          </Link>
        </nav>

        <main className="cx-pane">
          <p className="cs-crumb">
            <Link href="/console/studios">
              <ArrowLeft size={12} strokeWidth={2} aria-hidden /> All customers
            </Link>
            {detail ? (
              <>
                <span aria-hidden>/</span>
                <Link href={`/console/studios/${studio.id}`}>{studio.name}</Link>
              </>
            ) : null}
          </p>

          <section className="cx-hero">
            <div className="cx-hero-art cx-art" aria-hidden>
              <div className="cx-dither" data-tone="cool" />
            </div>
            <div className="cx-hero-body">
              <span className="cx-hero-status">
                <span className="cs-tag" data-plan={studio.plan}>
                  {PLAN_LABEL[studio.plan]}
                </span>
                {studio.ownerEmail}
                {studio.ownerEmailVerified ? null : (
                  <span className="cx-warn">· email unverified</span>
                )}
              </span>

              <h1 className="cx-hero-title">{studio.name}</h1>
              <p className="cx-hero-sub">
                Signed up {day(studio.ownerSince)}. {allowance}.{" "}
                {usage.lastActivity
                  ? `Last touched a Cue ${day(usage.lastActivity)}.`
                  : "Has never created a Cue."}
              </p>

              <div className="cx-figures">
                <span className="cx-figure">
                  <b>{usage.total.toLocaleString()}</b>
                  <span>Cues</span>
                </span>
                <span className="cx-figure">
                  <b>{(usage.byStatus.signed ?? 0).toLocaleString()}</b>
                  <span>signed</span>
                </span>
                <span className="cx-figure">
                  <b>{(usage.byStatus.draft ?? 0).toLocaleString()}</b>
                  <span>drafts</span>
                </span>
                <span className="cx-figure">
                  <b>{studio.sentCount.toLocaleString()}</b>
                  <span>sends counted</span>
                </span>
              </div>
            </div>
          </section>

          {detail ? (
            <CueDetail studioName={studio.name} detail={detail} />
          ) : (
            <>
              <p className="cx-label">Usage by status</p>
              <div className="cx-list">
                {CUE_STATUSES.map((status) => (
                  <div className="cx-row" key={status}>
                    <span className={`cs-tone-${STATUS_TONE[status]}`}>
                      <span className="cx-dot" />
                    </span>
                    <span className="cx-row-name">{STATUS_LABEL[status]}</span>
                    <span className="cx-row-note">{status}</span>
                    <span className="cx-row-num">
                      {(usage.byStatus[status] ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <p className="cx-label">Their clients</p>
              <p className="cs-hint">
                Derived from the Cues themselves — there is no client table. Two Cues
                are the same client when they share an email address, or a name when
                there is no email.
              </p>
              <table className="cx-table cs-clients">
                {clients.length > 0 && (
                  <thead className="cx-thead" role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">
                        Client
                      </th>
                      <th scope="col" role="columnheader" className="cs-num">
                        Cues
                      </th>
                      <th scope="col" role="columnheader" className="cs-num">
                        Signed
                      </th>
                      <th scope="col" role="columnheader">
                        Latest
                      </th>
                      <th scope="col" role="columnheader">
                        Last Cue
                      </th>
                    </tr>
                  </thead>
                )}
                <tbody role="rowgroup">
                  {clients.length === 0 && (
                    <tr role="row">
                      <td className="cx-empty" role="cell" colSpan={5}>
                        This studio has not named a client yet.
                      </td>
                    </tr>
                  )}
                  {clients.map((c) => (
                    <tr className="cx-trow" role="row" key={c.key}>
                      <td className="cs-name" role="cell">
                        <b>{c.name}</b>
                        <span>{c.email ?? "no email on file"}</span>
                      </td>
                      <td className="cs-num" role="cell">
                        {c.cues.toLocaleString()}
                      </td>
                      <td className="cs-num" role="cell">
                        {c.signed.toLocaleString()}
                      </td>
                      <td role="cell">
                        <span className="cs-tag" data-tone={STATUS_TONE[c.latestStatus]}>
                          {STATUS_LABEL[c.latestStatus]}
                        </span>
                      </td>
                      <td className="cs-date" role="cell" title={formatStamp(c.lastAt)}>
                        {day(c.lastAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="cx-label">Their Cues</p>
              <table className="cx-table cs-cues">
                {cues.length > 0 && (
                  <thead className="cx-thead" role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">
                        Cue
                      </th>
                      <th scope="col" role="columnheader">
                        Status
                      </th>
                      <th scope="col" role="columnheader" className="cs-num">
                        Signed
                      </th>
                      <th scope="col" role="columnheader">
                        Shoot
                      </th>
                      <th scope="col" role="columnheader">
                        Created
                      </th>
                    </tr>
                  </thead>
                )}
                <tbody role="rowgroup">
                  {cues.length === 0 && (
                    <tr role="row">
                      <td className="cx-empty" role="cell" colSpan={5}>
                        No Cues on this account.
                      </td>
                    </tr>
                  )}
                  {cues.map((c) => (
                    <tr className="cx-trow cs-trow" role="row" key={c.id}>
                      <td className="cs-name" role="cell">
                        <Link href={`/console/studios/${studio.id}?cue=${c.id}`}>
                          <b>{c.title}</b>
                          <span>
                            {c.clientName} · {c.templateSlug}
                          </span>
                        </Link>
                      </td>
                      <td role="cell">
                        <span className="cs-tag" data-tone={STATUS_TONE[c.status]}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="cs-num" role="cell">
                        {c.signedParties}/{c.parties}
                      </td>
                      <td className="cs-date" role="cell">
                        {c.shootDate ? formatDate(c.shootDate) : "—"}
                      </td>
                      <td className="cs-date" role="cell" title={formatStamp(c.createdAt)}>
                        {day(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="cx-label">Account</p>
              <p className="cs-hint">
                The studio&rsquo;s own details, and its plan. Plan changes are manual
                because Stripe is deliberately not wired for version one. Nothing on
                this page can alter a Cue, a signature, or an audit event — not the
                studio&rsquo;s, and not ours.
              </p>
              <div className="cs-panel">
                <ProfileForm studio={studio} />
                <hr className="cs-rule" />
                <PlanControl studioId={studio.id} plan={studio.plan} />
              </div>

              <p className="cx-label">Operator actions on this account</p>
              <div className="cx-list">
                {trail.length === 0 && (
                  <div className="cx-row">
                    <span className="cx-idle">
                      <span className="cx-dot" />
                    </span>
                    <span className="cx-row-name">Nothing yet</span>
                    <span className="cx-row-note">
                      every change made from here is recorded
                    </span>
                    <span className="cx-row-num">—</span>
                  </div>
                )}
                {trail.map((entry) => (
                  <div className="cx-row" key={entry.id}>
                    <span className="cx-idle">
                      <ShieldCheck size={12} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="cx-row-name">
                      {entry.action === "studio.plan" ? "Plan changed" : "Profile edited"}
                      <em>{trailDetail(entry)}</em>
                    </span>
                    <span className="cx-row-note">{entry.operatorEmail}</span>
                    <span className="cx-row-num">{formatStamp(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── One Cue, read-only ──
   No form, no button, no action import. The absence is the feature. */
function CueDetail({
  studioName,
  detail,
}: {
  studioName: string;
  detail: NonNullable<Awaited<ReturnType<typeof adminCueDetail>>>;
}) {
  const { cue, parties, events } = detail;

  return (
    <>
      <p className="cs-readonly">
        <Lock size={12} strokeWidth={2} aria-hidden />
        Read-only. {studioName}&rsquo;s record, and a support view of it is not an
        edit of it — there is no path from this console to a Cue, a signature, or an
        audit event.
      </p>

      <p className="cx-label">{cue.title}</p>
      <div className="cx-list">
        <Fact label="Status" value={STATUS_LABEL[cue.status]} note={cue.status} />
        <Fact
          label="Client"
          value={cue.clientName}
          note={cue.clientEmail ?? "no email on file"}
        />
        <Fact
          label="Shoot"
          value={cue.shootDate ? formatDate(cue.shootDate) : "—"}
          note={cue.location ?? "no location"}
        />
        <Fact label="Template" value={cue.templateSlug} note="from src/lib/templates.ts" />
        <Fact label="Created" value={formatStamp(cue.createdAt)} />
        <Fact label="Sent" value={cue.sentAt ? formatStamp(cue.sentAt) : "—"} />
        <Fact label="Opened" value={cue.openedAt ? formatStamp(cue.openedAt) : "—"} />
        <Fact label="Sealed" value={cue.sealedAt ? formatStamp(cue.sealedAt) : "—"} />
        <Fact
          label="Document hash"
          value={cue.docHash ? `${cue.docHash.slice(0, 16)}…` : "—"}
          note={cue.hasSnapshot ? "snapshot frozen at send" : "not yet frozen"}
        />
        {cue.notes ? <Fact label="Internal note" value={cue.notes} /> : null}
      </div>

      <p className="cx-label">Parties</p>
      <div className="cx-list">
        {parties.length === 0 && (
          <div className="cx-row">
            <span className="cx-idle">
              <span className="cx-dot" />
            </span>
            <span className="cx-row-name">No parties</span>
            <span className="cx-row-note">—</span>
            <span className="cx-row-num">—</span>
          </div>
        )}
        {parties.map((p) => (
          <div className="cx-row" key={p.id}>
            <span className={p.signedAt ? "cx-ok" : "cx-idle"}>
              <span className="cx-dot" />
            </span>
            <span className="cx-row-name">
              {p.name}
              <em>{ROLE_LABEL[p.role]}</em>
            </span>
            <span className="cx-row-note">
              {p.signedAt
                ? `signed as “${p.typedName ?? p.name}”${p.hasSignature ? " + drawn mark" : ""}`
                : "awaiting signature"}
            </span>
            <span className="cx-row-num">
              {p.signedAt ? formatStamp(p.signedAt) : "—"}
            </span>
          </div>
        ))}
      </div>

      <p className="cx-label">Audit trail</p>
      <p className="cs-hint">
        Append-only in the database, enforced by a trigger. Signature images, IP
        hashes and user agents are stored but deliberately not read by this console.
      </p>
      <div className="cx-list">
        {events.length === 0 && (
          <div className="cx-row">
            <span className="cx-idle">
              <span className="cx-dot" />
            </span>
            <span className="cx-row-name">No events</span>
            <span className="cx-row-note">—</span>
            <span className="cx-row-num">—</span>
          </div>
        )}
        {events.map((e) => (
          <div className="cx-row" key={e.id}>
            <span className="cx-idle">
              <span className="cx-dot" />
            </span>
            <span className="cx-row-name">{EVENT_LABEL[e.kind] ?? e.kind}</span>
            <span className="cx-row-note">{e.kind}</span>
            <span className="cx-row-num">{formatStamp(e.createdAt)}</span>
          </div>
        ))}
      </div>

      {cue.snapshot ? (
        <>
          <p className="cx-label">Document as the client read it</p>
          <p className="cs-hint">
            Rendered from <code>cue.snapshot</code>, frozen at send — never
            re-rendered from the template, so a later template edit cannot change
            what this says.
          </p>
          <article className="cs-doc">
            <h2>{cue.snapshot.document.title}</h2>
            {cue.snapshot.document.clauses.map((clause) => (
              <section key={clause.id}>
                <h3>{clause.heading}</h3>
                {clause.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            ))}
          </article>
        </>
      ) : null}
    </>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="cx-row cs-fact">
      <span className="cx-row-note">{label}</span>
      <span className="cx-row-name">{value}</span>
      {note ? <span className="cx-row-note">{note}</span> : <span />}
    </div>
  );
}

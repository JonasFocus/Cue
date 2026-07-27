import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  Eye,
  FileSignature,
  Fingerprint,
  Hand,
  Lock,
  PenLine,
  Send,
  Sparkles,
} from "lucide-react";
import { formatStamp } from "@/lib/agreement";
import { EVENT_LABEL, STATUS_LABEL, STATUS_TONE, type EventKind } from "@/lib/cue";
import { getCue, getEvents, getParties, getSnapshot } from "@/lib/cue-db";
import { requireStudio } from "@/lib/studio";
import { AgreementView } from "@/components/agreement-view";
import { NotesCard, PrintButton } from "../fields";
import "../builder.css";

/* The sealed record.
 *
 * Everything on this page comes out of `cue.snapshot`, never out of templates.ts.
 * That is the entire point of a snapshot: a template edit two years from now
 * must not change a word of what somebody signed. Re-rendering here "because we
 * have the template anyway" would quietly undo it.
 *
 * "Download PDF" is `window.print()`. agreement.css carries a real print
 * stylesheet, so the browser's own PDF engine is the renderer — no worker, no
 * object storage, no headless Chrome. Every piece of app chrome on this page
 * carries `.doc-no-print` so what comes out is the document alone. */

export const metadata: Metadata = { title: "Cue record" };

const EVENT_ICON: Record<EventKind, typeof Send> = {
  created: Sparkles,
  sent: Send,
  opened: Eye,
  viewed: Eye,
  consented: Hand,
  signed: PenLine,
  sealed: Lock,
  voided: Ban,
  declined: Ban,
};

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cueId = Number(id);
  if (!Number.isSafeInteger(cueId) || cueId <= 0) notFound();

  const { studio } = await requireStudio();
  const cue = await getCue(studio.id, cueId);
  if (!cue) notFound();

  const [snapshot, parties, events] = await Promise.all([
    getSnapshot(studio.id, cue.id),
    getParties(cue.id),
    getEvents(cue.id),
  ]);

  if (!snapshot) {
    return (
      <div className="bf-record">
        <div className="ca-card ca-card-pad bf-share-card">
          <h1 className="ca-h1">There is no record yet.</h1>
          <p className="ca-sub">
            A record is written the moment a Cue is sent — that is when the wording is frozen and
            hashed. This one is still a draft, so the only version of it is the one you are editing.
          </p>
          <div className="ca-row bf-share-actions">
            <Link className="ca-btn ca-btn-primary" href={`/app/cues/${cue.id}`}>
              <FileSignature size={16} strokeWidth={2} aria-hidden />
              Back to the builder
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const partyName = new Map(parties.map((p) => [p.id, p.name]));

  return (
    <div className="bf-record">
      <header className="bf-record-head doc-no-print">
        <div className="bf-record-head-main">
          <h1 className="ca-h1">{snapshot.document.title}</h1>
          <div className="bf-head-meta">
            <span className="ca-pill" data-tone={STATUS_TONE[cue.status]}>
              {STATUS_LABEL[cue.status]}
            </span>
            {cue.sealedAt ? (
              <span className="bf-record-sealed">
                <CircleCheck size={13} strokeWidth={2.2} aria-hidden />
                Sealed {formatStamp(cue.sealedAt)}
              </span>
            ) : cue.sentAt ? (
              <span className="bf-head-template">Frozen {formatStamp(cue.sentAt)}</span>
            ) : null}
          </div>
        </div>
        <div className="bf-record-actions">
          <PrintButton />
          <Link className="ca-btn ca-btn-quiet" href="/app">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            All Cues
          </Link>
        </div>
      </header>

      <div className="bf-record-body">
        <div className="bf-record-doc">
          <AgreementView
            document={snapshot.document}
            studio={snapshot.studio}
            facts={{
              clientName: snapshot.cue.clientName,
              shootDate: snapshot.cue.shootDate,
              location: snapshot.cue.location,
              reference: `Cue #${cue.id}`,
            }}
            signatures={parties.map((p) => ({
              id: p.id,
              role: p.role,
              name: p.name,
              typedName: p.typedName,
              signaturePng: p.signaturePng,
              signedAt: p.signedAt,
            }))}
            docHash={cue.docHash}
            sealedAt={cue.sealedAt}
            brandColor={studio.brandColor}
          />
        </div>

        <aside className="bf-record-side">
          {cue.docHash && (
            <section className="ca-card ca-card-pad doc-no-print">
              <h2 className="ca-h2">
                <Fingerprint size={16} strokeWidth={2} aria-hidden /> Document hash
              </h2>
              <p className="bf-help">
                SHA-256 of the sealed snapshot in canonical JSON form — the document text, the
                studio and client details, and the parties — taken when the Cue was sent. If a
                single character of any of it changed, this value would not match. Independent
                verification is not possible yet: that needs an export of the snapshot, which
                does not exist.
              </p>
              <p className="bf-hash">{cue.docHash}</p>
            </section>
          )}

          <section className="ca-card ca-card-pad doc-no-print">
            <div className="ca-spread">
              <h2 className="ca-h2">Audit trail</h2>
              <span className="bf-clauses-count ca-nums">{events.length}</span>
            </div>
            <p className="bf-help">
              Append-only, enforced by the database rather than by convention. Times are US Central.
            </p>

            <ol className="bf-trail">
              {events.map((event) => {
                const Icon = EVENT_ICON[event.kind];
                const who = event.partyId ? partyName.get(event.partyId) : undefined;
                return (
                  <li className="bf-trail-item" key={event.id}>
                    <span className="bf-trail-mark" aria-hidden>
                      <Icon size={13} strokeWidth={2.2} />
                    </span>
                    <div className="bf-trail-text">
                      <span className="bf-trail-label">{EVENT_LABEL[event.kind]}</span>
                      {who && <span className="bf-trail-who">{who}</span>}
                      <time className="bf-trail-time ca-nums" dateTime={event.createdAt}>
                        {formatStamp(event.createdAt)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <NotesCard cueId={cue.id} initial={cue.notes ?? ""} />
        </aside>
      </div>
    </div>
  );
}

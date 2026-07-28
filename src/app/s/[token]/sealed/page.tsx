import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { AgreementView, type SignatureView } from "@/components/agreement-view";
import { getCueByToken } from "@/lib/cue-db";
import { rateLimit } from "@/lib/redis";
import {
  isSealed,
  isShareToken,
  STATUS_LABEL,
  VIEW_ATTEMPT_LIMIT,
  VIEW_RATE_WINDOW_SECONDS,
} from "@/lib/cue";
import { PrintButton } from "../sign";
import { formatStamp } from "@/lib/agreement";
import { clientIp } from "@/lib/client-ip";

/* The page a client lands on the instant after they sign.
 *
 * Its job is to be calm and to be honest. It states what was signed, by whom,
 * and when; it shows the hash; and it says plainly that no copy is being
 * emailed, because no email provider is wired (see AGENTS.md) and telling
 * somebody a copy is on its way when it is not is the exact failure this
 * product exists to prevent. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signed — Cue",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SealedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();

  /* Same limiter bucket as the signing page: this is the same document read by
     the same person, and the two must share one budget or a client bouncing
     between them burns through twice as fast. The limiter key is ephemeral, so
     it falls back to an unsalted digest when IP_SALT is missing; nothing
     durable is written here. */
  const salt = process.env.IP_SALT;
  const limiterKey = createHash("sha256")
    .update(`${await clientIp()}:${salt ?? "unsalted"}`)
    .digest("hex")
    .slice(0, 32);

  const limit = await rateLimit(`sv:${limiterKey}`, VIEW_ATTEMPT_LIMIT, VIEW_RATE_WINDOW_SECONDS);
  const found = limit.ok ? await getCueByToken(token) : null;
  if (!found) notFound();

  const { cue, snapshot, parties, studio } = found;

  const signatures: SignatureView[] = parties.map((party) => ({
    id: party.id,
    role: party.role,
    name: party.name,
    typedName: party.typedName,
    signaturePng: party.signaturePng,
    signedAt: party.signedAt,
  }));

  const signed = parties.filter((party) => party.signedAt);
  const outstanding = parties.length - signed.length;
  const sealed = isSealed(cue.status);

  return (
    <div
      className="sg-page"
      // See agreement-view.tsx: the hex shape is pinned by a CHECK constraint
      // in migration 007, so this cannot carry anything but a colour.
      style={
        studio.brandColor
          ? ({ "--sg-brand": studio.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* Same masthead as the signing page. The moment after signing is not
          the moment to change whose page this is. */}
      <header className="sg-top doc-no-print">
        <div className="sg-top-in">
          <span className="sg-mark" aria-hidden>
            {initials(snapshot.studio.name)}
          </span>
          <span className="sg-id">
            <span className="sg-studio">
              {snapshot.studio.legalName || snapshot.studio.name}
            </span>
            <span className="sg-prepared">Prepared by {snapshot.studio.name}</span>
          </span>
          <span className="sg-state" data-status={cue.status}>
            {STATUS_LABEL[cue.status]}
          </span>
        </div>
      </header>

      <main className="sg-main sg-main-sealed">
        <section className="sg-done doc-no-print">
          <span className="sg-done-tick" aria-hidden>
            <Check size={20} strokeWidth={3} />
          </span>

          <h1 className="sg-done-title">
            {sealed ? "Signed and sealed." : "Your signature is recorded."}
          </h1>

          <p className="sg-done-lede">
            {sealed
              ? "Everyone has signed. This record is now closed and can no longer be changed by anyone, including the sender."
              : `Your part is done. This agreement is waiting on ${outstanding} more ${
                  outstanding === 1 ? "signature" : "signatures"
                } before it is sealed.`}
          </p>

          <dl className="sg-done-facts">
            <div>
              <dt>Agreement</dt>
              <dd>{snapshot.document.title}</dd>
            </div>
            <div>
              <dt>Prepared by</dt>
              <dd>{snapshot.studio.legalName || snapshot.studio.name}</dd>
            </div>
            <div>
              <dt>Signed by</dt>
              <dd>
                {signed.length
                  ? signed.map((party) => party.typedName ?? party.name).join(", ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{sealed ? "Sealed" : "Last signature"}</dt>
              <dd>
                {sealed && cue.sealedAt
                  ? formatStamp(cue.sealedAt)
                  : signed.at(-1)?.signedAt
                    ? formatStamp(signed.at(-1)!.signedAt!)
                    : "—"}
              </dd>
            </div>
          </dl>

          {cue.docHash && (
            <div className="sg-done-hash">
              <ShieldCheck size={15} strokeWidth={2.25} aria-hidden />
              <div>
                <span>Document hash</span>
                <code>{cue.docHash}</code>
              </div>
            </div>
          )}

          {/* Said plainly, because it is the one thing a person will assume
              wrongly. No email provider is wired; nothing is being sent. */}
          <p className="sg-done-warn">
            <strong>Save your copy now.</strong> Cue does not email a copy yet, so
            this page and the link that brought you here are how you get back to
            it. Download or print it while you are here.
          </p>

          <PrintButton label="Download or print this agreement" />
        </section>

        <div className="sg-paper">
          <AgreementView
            document={snapshot.document}
            studio={snapshot.studio}
            facts={{
              clientName: snapshot.cue.clientName,
              shootDate: snapshot.cue.shootDate,
              location: snapshot.cue.location,
            }}
            signatures={signatures}
            docHash={cue.docHash}
            sealedAt={cue.sealedAt}
            brandColor={studio.brandColor}
          />
        </div>
      </main>

      <footer className="sg-foot doc-no-print">
        <p>
          Signed with <strong>Cue</strong>. Cue is not a law firm and gives no
          legal advice; it records what was agreed, by whom, and when.
        </p>
      </footer>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "C"
  );
}


import { ShieldCheck } from "lucide-react";
import type { RenderedDocument, StudioIdentity } from "@/lib/agreement";
import { formatDate, formatStamp } from "@/lib/agreement";
import { ROLE_LABEL, type PartyRole } from "@/lib/cue";
import "./agreement.css";

/* The rendered agreement, shared by the creator's live preview and the client's
   signing page. One component on purpose: the document a creator approves and
   the document a client signs must be the same pixels, and the surest way to
   guarantee that is for there to be only one of it.

   A Server Component — it takes data and returns markup, with no interactivity
   of its own. The signing controls wrap around it rather than living inside it. */

export type SignatureView = {
  id: number;
  role: PartyRole;
  name: string;
  typedName: string | null;
  signaturePng: string | null;
  signedAt: string | null;
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "C"
  );
}

export function AgreementView({
  document,
  studio,
  facts,
  signatures,
  docHash,
  sealedAt,
  brandColor,
}: {
  document: RenderedDocument;
  studio: StudioIdentity;
  facts: {
    clientName: string;
    shootDate?: string | null;
    location?: string | null;
    reference?: string | null;
  };
  signatures: SignatureView[];
  docHash?: string | null;
  sealedAt?: string | null;
  brandColor?: string | null;
}) {
  return (
    <article
      className="doc"
      // Safe to interpolate: brand_color carries a CHECK constraint pinning it
      // to ^#[0-9a-fA-F]{6}$ (migration 007), so nothing else can reach here.
      style={brandColor ? ({ "--doc-brand": brandColor } as React.CSSProperties) : undefined}
    >
      <div className="doc-paper">
        <header className="doc-head">
          <div className="doc-studio">
            <span className="doc-studio-mark" aria-hidden>
              {initials(studio.name)}
            </span>
            {studio.legalName || studio.name}
          </div>

          <h1 className="doc-title">{document.title}</h1>

          <dl className="doc-facts">
            <div className="doc-fact">
              <dt>Client</dt>
              <dd>{facts.clientName}</dd>
            </div>
            {facts.shootDate && (
              <div className="doc-fact">
                <dt>Date</dt>
                <dd>{formatDate(facts.shootDate)}</dd>
              </div>
            )}
            {facts.location && (
              <div className="doc-fact">
                <dt>Location</dt>
                <dd>{facts.location}</dd>
              </div>
            )}
            {facts.reference && (
              <div className="doc-fact">
                <dt>Reference</dt>
                <dd className="ca-nums">{facts.reference}</dd>
              </div>
            )}
          </dl>
        </header>

        <div className="doc-body">
          {document.clauses.map((clause) => (
            <section
              className="doc-clause"
              key={clause.id}
              data-locked={clause.id === "disclaimer" ? "disclaimer" : undefined}
            >
              <h2>{clause.heading}</h2>
              {clause.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </div>

        <section className="doc-signatures">
          <h2 className="doc-sig-role">Signatures</h2>
          <div className="doc-sig-grid">
            {signatures.map((s) => (
              <div className="doc-sig" key={s.id} data-signed={Boolean(s.signedAt)}>
                <div className="doc-sig-role">{ROLE_LABEL[s.role]}</div>
                <div className="doc-sig-name">{s.name}</div>

                {/* Three states, and they must not be confused: a drawn mark, a
                    typed signature with no drawn mark (equally valid — see
                    `isOptionalSignature`), and genuinely not yet signed. */}
                <div className="doc-sig-mark">
                  {s.signaturePng ? (
                    /* Not next/image: this is a data: URL of unknown intrinsic
                       size that must never hit the optimiser. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.signaturePng} alt={`Signature of ${s.typedName ?? s.name}`} />
                  ) : s.signedAt ? (
                    <span className="doc-sig-typed">{s.typedName ?? s.name}</span>
                  ) : (
                    <span className="doc-sig-pending">Awaiting signature</span>
                  )}
                </div>

                {s.signedAt ? (
                  <div className="doc-sig-meta">
                    Signed by {s.typedName ?? s.name}
                    <br />
                    {formatStamp(s.signedAt)}
                  </div>
                ) : (
                  <div className="doc-sig-meta">Not yet signed</div>
                )}
              </div>
            ))}
          </div>

          {sealedAt && docHash && (
            <div className="doc-seal">
              <ShieldCheck size={16} strokeWidth={2} aria-hidden />
              <div>
                <strong>Record sealed {formatStamp(sealedAt)}.</strong> This document can no
                longer be altered by either party. Its contents hash to:
                <div className="doc-hash">{docHash}</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

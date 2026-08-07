import { createHash } from "node:crypto";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban, CircleSlash, Clock, ShieldCheck } from "lucide-react";
import { AgreementView, type SignatureView } from "@/components/agreement-view";
import { getCueByToken } from "@/lib/cue-db";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/client-ip";
import {
  isSealed,
  isShareToken,
  isSignable,
  STATUS_LABEL,
  isPubliclySignable,
  VIEW_ATTEMPT_LIMIT,
  VIEW_RATE_WINDOW_SECONDS,
  type CueStatus,
} from "@/lib/cue";
import { PrintButton, SignPanel, ViewRecorder } from "./sign";

/* The client-facing signing page.
 *
 * Opened by a stranger with no account, on a phone, on venue wifi, and what
 * happens here is legally meaningful. So: the document is server-rendered
 * markup, the share token is the only credential, and nothing about the Cue is
 * ever taken from the URL beyond that token.
 *
 * Never cached, at any layer. A signing page that serves one client's contract
 * to the next is the worst bug this product could have. */
export const dynamic = "force-dynamic";

type Loaded =
  | { state: "gone" }
  | { state: "busy" }
  | {
      state: "ok";
      found: NonNullable<Awaited<ReturnType<typeof getCueByToken>>>;
    };

/* Wrapped in React's per-request cache so generateMetadata and the page body
   share one database round trip and one rate-limit increment, rather than
   charging a client two of each for one page view. */
const load = cache(async (token: string): Promise<Loaded> => {
  // Shape-checked before the database is touched at all: a token is 20–32
  // base64url characters, so anything else is a crawler or a typo and does not
  // deserve a query.
  if (!isShareToken(token)) return { state: "gone" };

  const salt = process.env.IP_SALT;
  const ip = await clientIp();

  /* Two derivations from one address, on purpose. The *limiter* key is
     ephemeral — it lives in Redis under a ten-minute TTL and is never written
     anywhere durable — so it falls back to a constant when IP_SALT is missing
     and keeps working in local dev. The *stored* hash lands in an audit record
     that the privacy page describes, and an unsalted SHA-256 of an IPv4 address
     is reversible by brute force in seconds, so it is simply null without a
     salt. Reading a contract must never be blocked on a secret; recording a
     false audit value must never happen because one is missing. */
  const limiterKey = createHash("sha256")
    .update(`${ip}:${salt ?? "unsalted"}`)
    .digest("hex")
    .slice(0, 32);
  // Generous by design (240 per ten minutes). A client refreshing their own
  // contract on bad venue wifi must never be locked out of it; this is here to
  // blunt someone walking the token space, and 2^128 already does that.
  const limit = await rateLimit(`sv:${limiterKey}`, VIEW_ATTEMPT_LIMIT, VIEW_RATE_WINDOW_SECONDS);
  if (!limit.ok) return { state: "busy" };

  const found = await getCueByToken(token);
  // One answer for "never existed", "voided and the token was cleared", and
  // "malformed". A stranger must not be able to tell them apart.
  if (!found) return { state: "gone" };

  return { state: "ok", found };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await load(token);

  /* Restated here rather than left to the layout. Metadata merges parent-first
     so the layout's value would survive anyway, but a signing link leaking into
     an index is not a failure worth relying on merge semantics to prevent. */
  const robots = { index: false, follow: false, nocache: true } as const;

  if (result.state !== "ok") return { title: "Agreement — Cue", robots };

  const studio = result.found.snapshot.studio;
  return {
    title: `${result.found.snapshot.document.title} — ${studio.name}`,
    description: `An agreement from ${studio.legalName || studio.name}, prepared for signature.`,
    robots,
  };
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await load(token);

  if (result.state === "gone") notFound();

  if (result.state === "busy") {
    return (
      <Shell>
        <Notice
          tone="wait"
          icon={<Clock size={19} strokeWidth={2} aria-hidden />}
          title="Give it a moment."
          body="This link has been opened a lot in the last few minutes. Wait a minute and refresh — nothing is lost, and your agreement is still here."
        />
      </Shell>
    );
  }

  const { found } = result;
  const { cue, snapshot, parties, studio, publicPartyId } = found;

  const signatures: SignatureView[] = parties.map((party) => ({
    id: party.id,
    role: party.role,
    name: party.name,
    typedName: party.typedName,
    signaturePng: party.signaturePng,
    signedAt: party.signedAt,
  }));

  /* A signing URL is deliberately bound to one party. Never derive this from
     a form choice: a bearer of Alice's link must not be able to sign Bob's
     line simply because both lines belong to the same Cue. */
  const authorisedParty = parties.find(
    (party) => party.id === publicPartyId && isPubliclySignable(party.role),
  );
  const unsigned = authorisedParty && !authorisedParty.signedAt ? [authorisedParty] : [];
  const signable = isSignable(cue.status) && unsigned.length > 0;

  return (
    <Shell brandColor={studio.brandColor} status={cue.status} snapshot={snapshot}>
      <ViewRecorder token={token} />
      {signable && (
        /* The keyboard and screen-reader route past a long contract. The gate
           is satisfied by reaching the sentinel this points at, so the same
           link that helps someone skip also lets them through it — which is
           the point: a gate only a mouse can pass is not an accessible one. */
        <a className="sg-skip doc-no-print" href="#agreement-end">
          Jump to the end of the agreement
        </a>
      )}

      <div className="sg-paper">
        <AgreementView
          // The frozen snapshot, never the live template: this is the text the
          // creator approved and the only text anyone may be asked to sign.
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
          // The one field read from the live studio row rather than the
          // snapshot — a rebrand should restyle an open agreement, not rewrite
          // it. Its hex shape is pinned by a CHECK constraint in migration 007.
          brandColor={studio.brandColor}
        />
      </div>

      {signable ? (
        <SignPanel
          token={token}
          signers={unsigned.map((party) => ({
            id: party.id,
            name: party.name,
            role: party.role,
          }))}
          // Count actual signatures, not "everyone minus the people this link
          // may sign" — a filtered-out party is not a signed one.
          signedCount={parties.filter((party) => party.signedAt).length}
          totalCount={parties.length}
        />
      ) : (
        <TerminalState status={cue.status} />
      )}
    </Shell>
  );
}

function TerminalState({ status }: { status: CueStatus }) {
  if (isSealed(status)) {
    return (
      <Notice
        tone="ok"
        icon={<ShieldCheck size={19} strokeWidth={2} aria-hidden />}
        title="This agreement is signed and sealed."
        body="Everyone has signed. The record above can no longer be changed by anyone, including the sender. Save or print it now — Cue does not email a copy."
        action={<PrintButton label="Download or print a copy" />}
      />
    );
  }

  /* Unreachable today and kept anyway: voidCue clears both cue.share_token
     and every cue_party.share_token in the voiding transaction, so a voided
     Cue cannot be loaded by token at all and lands on the 404 above. That is
     the stronger behaviour — it leaks nothing — but if voiding ever stops
     revoking the tokens this is the screen it should get rather than a blank
     one. */
  if (status === "voided") {
    return (
      <Notice
        tone="warn"
        icon={<CircleSlash size={19} strokeWidth={2} aria-hidden />}
        title="The sender withdrew this agreement."
        body="It was taken back before it was signed, so there is nothing to sign here. If you were expecting to sign something, contact whoever sent you this link — they will need to send a new one."
      />
    );
  }

  if (status === "declined") {
    return (
      <Notice
        tone="warn"
        icon={<Ban size={19} strokeWidth={2} aria-hidden />}
        title="This agreement was declined."
        body="It was turned down, so it is closed and cannot be signed. If that was a mistake, contact the sender and ask them to send a new agreement."
      />
    );
  }

  /* Everything else — a Cue whose parties have all signed but whose status has
     not caught up, which the sealing transaction makes impossible. Honest
     rather than reassuring, because if it ever shows up something is wrong. */
  return (
    <Notice
      tone="wait"
      icon={<Clock size={19} strokeWidth={2} aria-hidden />}
      title="Nothing to sign right now."
      body="This agreement is not open for signature. Refresh in a moment, or contact the sender if you were expecting to sign it."
    />
  );
}

function Notice({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: "ok" | "warn" | "wait";
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="sg-notice doc-no-print" data-tone={tone}>
      <span className="sg-notice-icon">{icon}</span>
      <div>
        <h2 className="sg-notice-title">{title}</h2>
        <p className="sg-notice-body">{body}</p>
        {action && <div className="sg-notice-action">{action}</div>}
      </div>
    </section>
  );
}

function Shell({
  children,
  brandColor,
  status,
  snapshot,
}: {
  children: React.ReactNode;
  brandColor?: string | null;
  status?: CueStatus;
  snapshot?: NonNullable<Awaited<ReturnType<typeof getCueByToken>>>["snapshot"];
}) {
  const studio = snapshot?.studio;

  return (
    <div
      className="sg-page"
      // Safe to interpolate: brand_color carries a CHECK constraint pinning it
      // to ^#[0-9a-fA-F]{6}$ (migration 007), so nothing else can reach here.
      style={brandColor ? ({ "--sg-brand": brandColor } as React.CSSProperties) : undefined}
    >
      <header className="sg-top doc-no-print">
        <div className="sg-top-in">
          <span className="sg-mark" aria-hidden>
            {initials(studio?.name ?? "Cue")}
          </span>
          <span className="sg-id">
            <span className="sg-studio">{studio ? studio.legalName || studio.name : "Cue"}</span>
            <span className="sg-prepared">
              {studio
                ? `Prepared by ${studio.name}`
                : "Client agreements for photographers and videographers"}
            </span>
          </span>
          {status && (
            <span className="sg-state" data-status={status}>
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
      </header>

      <main className="sg-main">{children}</main>

      <footer className="sg-foot doc-no-print">
        <p>
          Signed with <strong>Cue</strong>. Cue is not a law firm and gives no
          legal advice; it records what was agreed, by whom, and when.{" "}
          {/* This is the page where a stranger's name, signature and IP hash are
              collected, and until now it was the only surface with no route to
              the policy describing that. */}
          <a className="sg-foot-link" href="/legal/privacy">
            What Cue stores about you
          </a>
          .
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

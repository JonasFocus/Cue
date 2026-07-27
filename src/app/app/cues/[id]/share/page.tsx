import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Clock,
  Link2,
  MailX,
  MessageSquare,
  ScrollText,
} from "lucide-react";
import { formatDate } from "@/lib/agreement";
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/cue";
import { getCue, getParties } from "@/lib/cue-db";
import { requireStudio } from "@/lib/studio";
import { CopyButton, ShareButton } from "../fields";
import "../builder.css";

/* The moment after sending.
 *
 * Sharing the link *is* the delivery mechanism — no email provider is wired
 * (AGENTS.md), so this page says so plainly instead of letting a photographer
 * walk away believing a message went out. Getting that wrong means a client who
 * never hears about the agreement and a creator who thinks they did. */

export const metadata: Metadata = { title: "Cue sent" };

/** PUBLIC_URL first, `Host` only as a fallback. This URL gets copied into a text
    message to a client, so a spoofed Host header must not be able to decide
    where that link points. */
async function origin(): Promise<string> {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cueId = Number(id);
  if (!Number.isSafeInteger(cueId) || cueId <= 0) notFound();

  const { studio } = await requireStudio();
  const cue = await getCue(studio.id, cueId);
  if (!cue) notFound();

  const parties = await getParties(cue.id);

  if (!cue.shareToken) {
    return (
      <div className="bf-share">
        <div className="ca-card ca-card-pad bf-share-card">
          <h1 className="ca-h1">There is no link for this Cue.</h1>
          <p className="ca-sub">
            {cue.status === "draft"
              ? "It is still a draft. A signing link is issued the moment you send it."
              : "The link was withdrawn when this Cue was voided or declined. The record is still kept in full."}
          </p>
          <div className="ca-row bf-share-actions">
            <Link className="ca-btn ca-btn-primary" href={`/app/cues/${cue.id}`}>
              Back to the Cue
            </Link>
            <Link className="ca-btn ca-btn-ghost" href={`/app/cues/${cue.id}/record`}>
              <ScrollText size={16} strokeWidth={2} aria-hidden />
              View the record
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const url = `${await origin()}/s/${cue.shareToken}`;
  const when = cue.shootDate ? ` on ${formatDate(cue.shootDate)}` : "";
  const message =
    `Hi ${firstName(cue.clientName)} — here is the agreement for ${cue.title}${when}. ` +
    `Have a read and sign it here: ${url}\n\n` +
    `Anything you want changed, tell me before you sign and I will send a new one.\n\n` +
    `— ${studio.name}`;

  return (
    <div className="bf-share">
      <header className="bf-share-hero">
        <span className="bf-share-mark" aria-hidden>
          <CircleCheck size={26} strokeWidth={2} />
        </span>
        <h1 className="ca-h1">The Cue is built and locked.</h1>
        <p className="ca-sub">
          The wording is frozen and the audit trail has started. Send the link and the next thing
          that happens is a signature.
        </p>
      </header>

      <section className="ca-card ca-card-pad bf-share-card">
        <div className="ca-spread">
          <h2 className="ca-h2">
            <Link2 size={16} strokeWidth={2} aria-hidden /> The signing link
          </h2>
          <span className="ca-pill" data-tone={STATUS_TONE[cue.status]}>
            {STATUS_LABEL[cue.status]}
          </span>
        </div>

        <p className="bf-link" title={url}>
          {url}
        </p>

        <div className="ca-row bf-share-actions">
          <CopyButton text={url} label="Copy link" done="Link copied" />
          <ShareButton url={url} title={cue.title} text={`Your agreement from ${studio.name}`} />
        </div>

        <p className="ca-banner bf-share-note" data-tone="warn">
          <MailX size={16} strokeWidth={2} aria-hidden />
          <span>
            <strong>Cue has not emailed your client.</strong> There is no email provider wired up
            yet, so nothing was sent on your behalf — sharing this link is how the agreement
            reaches them. Text it, email it, or hand them the phone.
          </span>
        </p>
      </section>

      <section className="ca-card ca-card-pad bf-share-card">
        <h2 className="ca-h2">
          <MessageSquare size={16} strokeWidth={2} aria-hidden /> Something to send
        </h2>
        <p className="bf-help">Written for a text message. Change it to sound like you.</p>
        <pre className="bf-message">{message}</pre>
        <CopyButton
          text={message}
          label="Copy message"
          done="Message copied"
          variant="ca-btn-ghost"
        />
      </section>

      <section className="ca-card ca-card-pad bf-share-card">
        <h2 className="ca-h2">Who has signed</h2>
        <ul className="bf-party-list">
          {parties.map((party) => (
            <li className="bf-party" key={party.id}>
              <div className="bf-party-text">
                <span className="bf-party-name ca-truncate">{party.name || "Unnamed signer"}</span>
                <span className="bf-party-meta ca-truncate">
                  {ROLE_LABEL[party.role]}
                  {party.email ? ` · ${party.email}` : ""}
                </span>
              </div>
              {party.signedAt ? (
                <span className="ca-pill" data-tone="ok">
                  <Check size={12} strokeWidth={3} aria-hidden />
                  Signed
                </span>
              ) : (
                <span className="ca-pill" data-tone="wait">
                  <Clock size={12} strokeWidth={2.4} aria-hidden />
                  Waiting
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="ca-row bf-share-actions bf-share-foot">
        <Link className="ca-btn ca-btn-ghost" href="/app">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          All Cues
        </Link>
        <Link className="ca-btn ca-btn-quiet" href={`/app/cues/${cue.id}/record`}>
          <ScrollText size={16} strokeWidth={2} aria-hidden />
          The record
        </Link>
      </div>
    </div>
  );
}

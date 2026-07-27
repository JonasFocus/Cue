import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { StudioIdentity } from "@/lib/agreement";
import { getCue, getParties } from "@/lib/cue-db";
import { requireStudio } from "@/lib/studio";
import { questionGroups, templateBySlug } from "@/lib/templates";
import { Builder } from "./builder";
import "./builder.css";

/* The builder's server half: authorise, load, hand off.
 *
 * The template is passed down as a prop rather than imported by the client
 * component. `renderAgreement` runs in the browser for the live preview and
 * needs the clause bodies, but importing templates.ts from a client module
 * would put all six templates in the bundle to render one. */

export const metadata: Metadata = { title: "Cue" };

export default async function CuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cueId = Number(id);
  if (!Number.isSafeInteger(cueId) || cueId <= 0) notFound();

  const { studio } = await requireStudio();
  const cue = await getCue(studio.id, cueId);
  if (!cue) notFound();

  const template = templateBySlug(cue.templateSlug);
  // A slug with no template means the deploy dropped one out from under an
  // existing draft. Nothing useful can be rendered, and guessing is worse.
  if (!template) notFound();

  const parties = await getParties(cue.id);

  const identity: StudioIdentity = {
    name: studio.name,
    legalName: studio.legalName,
    email: studio.email,
    phone: studio.phone,
    address: studio.address,
  };

  return (
    <Builder
      cue={cue}
      parties={parties}
      template={template}
      groups={questionGroups(template)}
      studio={identity}
      brandColor={studio.brandColor}
    />
  );
}

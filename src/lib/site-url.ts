/* The canonical public origin, resolved once.
 *
 * This is read at BUILD time as well as at request time: the landing page is
 * statically prerendered, so `metadataBase`, the canonical link and `og:url`
 * are baked into the bundle. That is what the Dockerfile's `ARG PUBLIC_URL` was
 * working around, and it is why the order below matters.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the project's production hostname and is
 * available during the build, so a production build stamps the real domain
 * without anyone setting a variable. **It only resolves to cue.krevo.io once
 * the domain is attached to the project** — attach it before the first
 * production build, or the landing page permanently advertises a *.vercel.app
 * host.
 *
 * `VERCEL_URL` is the deployment-specific hostname, so every preview is
 * self-consistent: its share links point at itself rather than at production.
 * Getting that wrong is how a preview deploy texts a client a link into the
 * live database.
 *
 * PUBLIC_URL stays as an explicit override for the case where neither is right.
 * It is deliberately NOT set per-environment on Vercel — setting it on Preview
 * is precisely the "preview bakes the production URL" bug, relocated somewhere
 * easier to forget.
 */
function resolve(): string {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolve();

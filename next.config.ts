import path from "node:path";
import type { NextConfig } from "next";

/* Every header below used to live in the Caddyfile. Vercel sends none of them —
   not even HSTS — so losing Caddy means moving them here or shipping a signing
   product with no CSP. They are reproduced verbatim; if you are comparing
   against git history, the only deliberate change is X-Robots-Tag (see below).

   `headers()` is evaluated at build time, which is why the robots value can key
   off VERCEL_ENV rather than needing an env var of its own — CUE_ROBOTS is gone
   rather than ported. Production is indexable; preview deployments never are,
   which matters more here than it did on one box, because every branch now gets
   a public URL. */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "X-Robots-Tag",
    value: process.env.VERCEL_ENV === "production" ? "all" : "noindex, nofollow",
  },
  // Without HSTS only the redirect forces HTTPS, and an on-path attacker strips
  // that on first contact — before any session cookie is protected. Subdomains
  // included because this is a *.krevo.io host.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  /* 'unsafe-inline' is required: the App Router emits inline bootstrap scripts
     and inline style, and there is no nonce plumbing in the app. So script-src
     is not an XSS defence yet — frame-ancestors, base-uri, object-src and
     form-action are, and they cost nothing. Upgrade path: nonces via proxy.ts,
     then drop 'unsafe-inline'.

     `img-src data: blob:` is load-bearing for the signature pad and for
     rendering a captured signature back on the sealed record.

     This also blocks vercel.live, so the Vercel Toolbar will not load on
     previews. That is the correct trade — turn the toolbar off in project
     settings rather than widening script-src on the one product where the
     signing page is the whole thing being protected. */
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Caddy used to strip this. Vercel still sends `Server: Vercel` and the
  // x-vercel-* family, and those cannot be removed — smoke.sh no longer
  // pretends otherwise.
  poweredByHeader: false,

  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root and warn on every build. Pin it to this project instead.
  turbopack: { root: path.resolve(process.cwd()) },

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

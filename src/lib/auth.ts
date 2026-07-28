import { betterAuth } from "better-auth";
import { pool, pruneExpiredSessions } from "./db";
import { SITE_URL } from "./site-url";

/* Sessions for both surfaces: the customer app at /app and the operator console
   at /console. One instance, one cookie, one session table.

   Signup used to be disabled outright, and that was what kept whoever found
   /console out of it. Customers need accounts now, so the guard moved to the
   `role` column added in 007: /console checks it explicitly (see
   `isOperator` in src/lib/studio.ts) and every new account is a `creator`.
   Nothing in this file can grant `operator` — only a direct database write or
   scripts/seed-operator.mjs can. */

export const auth = betterAuth({
  database: pool,
  // Derived rather than configured: a preview deployment must authenticate
  // against its own origin, or Better Auth's origin check rejects the sign-in.
  baseURL: SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  /* Expired sessions are never collected by Better Auth. Prune on insert —
     the one moment rows appear — rather than moving the session store to
     `secondaryStorage`. Redis would expire them for free, but redis.ts is
     deliberately built to fail open — every other caller treats Redis being
     down as "carry on degraded" — and sessions cannot do that. Moving them
     there turns a Redis restart into "the operator is signed out of the
     console during the outage the console exists to report", and the
     watchdog restarts Redis without preserving its contents. A DELETE
     against the database that already holds the sessions costs one query per
     login and keeps auth dependent on exactly one datastore. */
  databaseHooks: {
    session: { create: { after: pruneExpiredSessions } },
  },
  advanced: {
    // Behind Caddy the app speaks plain HTTP, so Better Auth cannot infer that
    // the public origin is HTTPS. Force secure cookies in production.
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

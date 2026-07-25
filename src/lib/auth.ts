import { betterAuth } from "better-auth";
import { pool, pruneExpiredSessions } from "./db";

/* Guards the /console surface only. There is no public signup: the operator
   account is seeded once at deploy time, so `signUp` stays closed and the
   console cannot be joined by whoever finds the URL. */

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
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

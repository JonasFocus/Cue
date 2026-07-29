import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { pool, pruneExpiredSessions } from "./db";
import { inviteMayCreateAccount } from "./invite";
import { SITE_URL } from "./site-url";

/* Sessions for both surfaces: the customer app at /app and the operator console
   at /console. One instance, one cookie, one session table.

   Signup used to be disabled outright, and that was what kept whoever found
   /console out of it. Customers need accounts now, so the guard moved to the
   `role` column added in 007: /console checks it explicitly (see
   `isOperator` in src/lib/studio.ts) and every new account is a `creator`.
   Nothing in this file can grant `operator` — only a direct database write or
   scripts/seed-operator.mjs can.

   Signup is open to *invited* addresses only — see the `user.create.before`
   hook below and src/lib/invite.ts. scripts/seed-operator.mjs constructs its
   own betterAuth() instance without these hooks, so the one account that
   cannot hold an invite is still creatable. */

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
    /* The door. Not the signup form — that is markup, and markup is skippable:
       a POST straight at /api/auth/sign-up/email would sail past any check made
       in a React component. This runs inside the create, so every path that
       could make an account goes through it.

       Throws rather than returning false. `false` makes createWithHooks return
       null and the endpoint then fails somewhere further down with a shape
       nobody chose; an APIError is the refusal the client actually renders.

       A database failure here propagates and signup fails, which is the correct
       direction: an unreadable invite list is not an invitation. */
    user: {
      create: {
        before: async (user: { email: string }, context) => {
          const body = context?.body;
          const inviteToken =
            body && typeof body === "object" && "inviteToken" in body
              ? String(body.inviteToken ?? "")
              : "";
          if (await inviteMayCreateAccount(user.email, inviteToken)) return;
          throw new APIError("FORBIDDEN", {
            message:
              "Cue is invite-only right now. Use the link you were sent, or ask for one.",
          });
        },
      },
    },
  },
  advanced: {
    // Keep cookies secure on Vercel production deployments even when URL
    // inference changes between build and runtime contexts.
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

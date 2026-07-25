import { betterAuth } from "better-auth";
import { pool } from "./db";

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
  advanced: {
    // Behind Caddy the app speaks plain HTTP, so Better Auth cannot infer that
    // the public origin is HTTPS. Force secure cookies in production.
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

/**
 * Creates the single console operator account.
 *
 * Public signup is disabled in src/lib/auth.ts, so there is no HTTP path to
 * create this user — that is the point. This talks to Better Auth's internal
 * adapter directly so the password is hashed with the same scrypt parameters
 * the sign-in path verifies against.
 *
 *   DATABASE_URL=... BETTER_AUTH_SECRET=... \
 *   OPERATOR_EMAIL=... OPERATOR_PASSWORD=... node scripts/seed-operator.mjs
 */
import { betterAuth } from "better-auth";
import pg from "pg";

const { DATABASE_URL, BETTER_AUTH_SECRET, OPERATOR_EMAIL, OPERATOR_PASSWORD } =
  process.env;

if (!DATABASE_URL || !BETTER_AUTH_SECRET) {
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required");
}
if (!OPERATOR_EMAIL || !OPERATOR_PASSWORD) {
  throw new Error("OPERATOR_EMAIL and OPERATOR_PASSWORD are required");
}
if (OPERATOR_PASSWORD.length < 12) {
  throw new Error("OPERATOR_PASSWORD must be at least 12 characters");
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const auth = betterAuth({
  database: pool,
  secret: BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
});

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(OPERATOR_EMAIL);
if (existing) {
  console.log(`operator ${OPERATOR_EMAIL} already exists — nothing to do`);
  await pool.end();
  process.exit(0);
}

const user = await ctx.internalAdapter.createUser({
  email: OPERATOR_EMAIL,
  name: "Operator",
  emailVerified: true,
});

await ctx.internalAdapter.linkAccount({
  userId: user.id,
  providerId: "credential",
  accountId: user.id,
  password: await ctx.password.hash(OPERATOR_PASSWORD),
});

console.log(`created operator ${OPERATOR_EMAIL}`);
await pool.end();

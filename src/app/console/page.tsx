import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { isOperator } from "@/lib/studio";
import { Dashboard } from "./dashboard";
import "./console.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cue Console",
  robots: { index: false, follow: false },
};

export default async function ConsolePage() {
  // Better Auth reads the session out of Postgres, so this throws during the
  // exact outage the console exists to report. A thrown lookup is treated as
  // "no session": the operator lands on the login page instead of a raw 500.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("[console] session lookup failed", (err as Error).message);
  }
  if (!session) redirect("/console/login");
  // Signup is open now that customers have accounts, so `disableSignUp` no
  // longer keeps strangers out of this surface — the `role` column does.
  if (!(await isOperator(session.user.id))) redirect("/app");

  return <Dashboard operator={session.user.email} />;
}

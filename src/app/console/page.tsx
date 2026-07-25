import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Dashboard } from "./dashboard";
import "./console.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cue Console",
  robots: { index: false, follow: false },
};

export default async function ConsolePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/console/login");

  return <Dashboard operator={session.user.email} />;
}

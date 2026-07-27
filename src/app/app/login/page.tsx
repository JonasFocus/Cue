import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/studio";
import { LoginForm } from "./form";

/* No app.css import. This page renders bare through the /app layout (which
   only builds the shell when there is a session) and borrows the .cue tokens
   the root layout already sets on <body>, exactly like /console/login. */

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function AppLoginPage() {
  // Redirect from the page rather than the layout: the layout cannot tell a
  // signed-in visitor to /app/login apart from one to /app, and a signed-in
  // creator should never be shown a sign-in card they have already passed.
  if (await currentUser()) redirect("/app");
  return <LoginForm />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/studio";
import { SignupForm } from "./form";

export const metadata: Metadata = {
  title: "Create your studio",
  robots: { index: false, follow: false },
};

export default async function AppSignupPage() {
  if (await currentUser()) redirect("/app");
  return <SignupForm />;
}

import type { Metadata } from "next";
import { LoginForm } from "./form";

/* Deliberately does not import console.css — this page inherits the light
   .cue tokens from the root layout. Only the dashboard behind it goes dark. */

export const metadata: Metadata = {
  title: "Cue Console — sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginForm />;
}

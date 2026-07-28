"use client";

import { createAuthClient } from "better-auth/react";

const client = createAuthClient();

/* The one interactive thing on the locked screen, so the only "use client" in
   it. Same call and the same hard navigation as the sidebar's sign-out in
   nav.tsx — dropping every cached RSC payload matters more here, not less: the
   next person on this browser must not get a flash of a workspace its owner is
   no longer allowed to open. */
export function SignOutButton() {
  return (
    <button
      className="cue-btn cue-btn-dark cue-btn-block"
      type="button"
      onClick={async () => {
        await client.signOut();
        window.location.href = "/";
      }}
    >
      Sign out
    </button>
  );
}

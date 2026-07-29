import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { AnimHost } from "./anim-host";

const EASE = "var(--cue-ease)";
const rise = (delay: number) => ({
  animation: `cueRise 560ms ${EASE} ${delay}ms both`,
});

const SIGNATURE =
  "M6 46 C14 20 22 12 26 24 C30 36 22 50 18 42 C14 34 26 22 40 28 C50 32 48 44 56 43 C66 42 70 24 78 26 C85 28 80 44 88 44 C98 44 104 14 114 16 C122 18 114 44 124 45 C136 46 140 26 152 28 C161 30 156 45 166 44 C178 43 182 22 194 26 C203 29 196 45 206 44 C218 43 222 26 234 30 C243 33 238 46 248 44 C262 41 268 30 282 36 C288 39 292 34 296 26";

const SPINE = [
  { label: "Sent", meta: "Jun 12", step: "sent" },
  { label: "Opened", meta: "Jun 13", step: "opened" },
  { label: "Signed", meta: "Just now", step: "signed" },
] as const;

/** Status card: Draft → Sent → Opened → Signed, synced to the spine. */
function SigningCue() {
  return (
    <AnimHost className="cue-sign" aria-hidden>
      <div className="cue-sign-glow" aria-hidden />
      <div className="cue-sign-card">
        <div className="cue-sign-head">
          <Image
            className="cue-sign-avatar cue-sign-avatar-photo"
            src="/black-and-sabrian.jpg"
            alt=""
            width={36}
            height={36}
          />
          <span className="cue-sign-id">
            <span className="cue-sign-title">Harper &amp; Wells</span>
            <span className="cue-sign-meta">Wedding agreement · 4 pages</span>
          </span>
          <span className="cue-sign-pills">
            <span className="cue-sign-pill" data-state="draft">
              Draft
            </span>
            <span className="cue-sign-pill" data-state="sent">
              Sent
            </span>
            <span className="cue-sign-pill" data-state="opened">
              Opened
            </span>
            <span className="cue-sign-pill" data-state="signed">
              <Check size={10} strokeWidth={3} aria-hidden />
              Signed
            </span>
          </span>
        </div>

        <div className="cue-sign-pad">
          <span className="cue-sign-pad-label">Client signature</span>
          <svg className="cue-sign-svg" viewBox="0 0 302 64" role="presentation">
            <path className="cue-sign-path" d={SIGNATURE} pathLength={1} />
          </svg>
        </div>

        <div className="cue-sign-spine">
          <i className="cue-sign-spine-track" aria-hidden />
          <i className="cue-sign-spine-progress" aria-hidden />
          {SPINE.map((step) => (
            <span
              className="cue-sign-spine-step"
              key={step.label}
              data-step={step.step}
            >
              <i>
                <Check size={9} strokeWidth={4} />
              </i>
              <span className="cue-sign-spine-copy">
                <strong>{step.label}</strong>
                <em>{step.meta}</em>
              </span>
            </span>
          ))}
        </div>

        <p className="cue-sign-moment">Get the yes.</p>
      </div>
    </AnimHost>
  );
}

export function Hero() {
  return (
    <section className="cue-hero">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <div className="cue-shell cue-hero-copy" style={{ position: "relative" }}>
        <div style={rise(40)}>
          <span className="cue-badge">
            <span>Invite only</span>
            <span>New studios join a few at a time</span>
          </span>
        </div>

        <h1 className="cue-h1" style={rise(120)}>
          {"Send the Cue.\nGet the yes."}
        </h1>

        <p className="cue-hero-sub" style={rise(200)}>
          Cue turns a template into a polished client agreement, gives you a
          secure signing link, and keeps the signed record in one place. Your
          client signs on the phone already in their hand.
        </p>

        <div className="cue-hero-cta" style={rise(280)}>
          <a href="#waitlist" className="cue-btn cue-btn-dark">
            Request access
          </a>
          <p className="cue-hero-note">
            Your first five Cues are free — no card, ever, until you want more.
            Already have a studio? <Link href="/app/login">Sign in</Link>.
          </p>
        </div>

        <div style={rise(380)}>
          <SigningCue />
        </div>
      </div>
    </section>
  );
}

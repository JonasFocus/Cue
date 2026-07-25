import { Check, Send, ShieldCheck, Smartphone } from "lucide-react";

const EASE = "cubic-bezier(0.2,0.7,0.2,1)";
const rise = (delay: number) => ({
  animation: `cueRise 800ms ${EASE} ${delay}ms both`,
});

/* The hero visual is one CSS timeline (--cue-loop) playing the whole lifecycle:
   the agreement fills in, the status flips draft → sent → signed, the signature
   draws itself, and the audit trail ticks over. Delays below are absolute
   seconds against that same loop, so the beats stay in order. */

const AUDIT = [
  { label: "Cue sent", meta: "Jun 12", delay: 0.4 },
  { label: "Opened by client", meta: "Jun 13", delay: 1.6 },
  { label: "Consent recorded", meta: "Jun 14", delay: 2.8 },
  { label: "Signed and sealed", meta: "Just now", delay: 5.9 },
];

const LINES = [
  { width: "100%", delay: 0.2 },
  { width: "94%", delay: 0.45 },
  { width: "97%", delay: 0.7 },
  { width: "68%", delay: 0.95 },
];

const CHIPS = [
  { icon: Send, label: "Signing link sent", delay: 1.8 },
  { icon: Smartphone, label: "Opened on iPhone", delay: 3.2 },
  { icon: ShieldCheck, label: "PDF sealed · a91f…7c2", delay: 6.8 },
];

const SIGNATURE =
  "M6 46 C14 20 22 12 26 24 C30 36 22 50 18 42 C14 34 26 22 40 28 C50 32 48 44 56 43 C66 42 70 24 78 26 C85 28 80 44 88 44 C98 44 104 14 114 16 C122 18 114 44 124 45 C136 46 140 26 152 28 C161 30 156 45 166 44 C178 43 182 22 194 26 C203 29 196 45 206 44 C218 43 222 26 234 30 C243 33 238 46 248 44 C262 41 268 30 282 36 C288 39 292 34 296 26";

function SigningCue() {
  return (
    <div className="cue-sign" aria-hidden>
      <div className="cue-sign-card">
        <div className="cue-sign-head">
          <span className="cue-sign-avatar">HW</span>
          <span>
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
            <span className="cue-sign-pill" data-state="signed">
              Signed
            </span>
          </span>
        </div>

        <div className="cue-sign-doc">
          {LINES.map((line) => (
            <span
              className="cue-sign-line"
              key={line.delay}
              style={{ width: line.width }}
            >
              <i style={{ animationDelay: `${line.delay}s` }} />
            </span>
          ))}
        </div>

        <div className="cue-sign-pad">
          <span className="cue-sign-pad-label">Client signature</span>
          <svg className="cue-sign-svg" viewBox="0 0 302 64" role="presentation">
            <path className="cue-sign-path" d={SIGNATURE} pathLength={1} />
          </svg>
        </div>

        <div className="cue-sign-audit">
          {AUDIT.map((row) => (
            <span
              className="cue-sign-row"
              key={row.label}
              style={{ animationDelay: `${row.delay}s` }}
            >
              <i className="cue-sign-tick">
                <Check size={9} strokeWidth={4} />
              </i>
              {row.label}
              <b>{row.meta}</b>
            </span>
          ))}
        </div>
      </div>

      {CHIPS.map(({ icon: Icon, label, delay }, i) => (
        <span
          className="cue-sign-chip"
          data-i={i}
          key={label}
          style={{ animationDelay: `${delay}s` }}
        >
          <Icon size={13} strokeWidth={1.9} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Hero() {
  return (
    <section className="cue-hero">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <div className="cue-shell cue-hero-copy" style={{ position: "relative" }}>
        <div style={rise(60)}>
          <span className="cue-badge">
            <span>New</span>
            <span>Built for photographers and videographers</span>
          </span>
        </div>

        <h1 className="cue-h1" style={rise(160)}>
          {"Get the agreement\nout of the way."}
        </h1>

        <p className="cue-hero-sub" style={rise(260)}>
          Create a polished client agreement, send a secure signing link, and
          keep the signed copy in one place.
        </p>

        <div style={{ marginTop: 30, ...rise(360) }}>
          <a href="#pricing" className="cue-btn cue-btn-dark">
            Create your first Cue
          </a>
          <p className="cue-hero-note">
            Free for your first five Cues. No card needed.
          </p>
        </div>

        <div style={rise(480)}>
          <SigningCue />
        </div>
      </div>
    </section>
  );
}

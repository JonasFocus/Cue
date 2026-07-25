import { MockApp } from "./mock";

const EASE = "cubic-bezier(0.2,0.7,0.2,1)";
const rise = (delay: number) => ({
  animation: `cueRise 800ms ${EASE} ${delay}ms both`,
});

export function Hero() {
  return (
    <section className="cue-hero">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <div className="cue-shell" style={{ position: "relative" }}>
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
        </div>

        <div className="cue-hero-shot" style={{ marginTop: 48, ...rise(480) }}>
          <MockApp detail />
        </div>
      </div>
    </section>
  );
}

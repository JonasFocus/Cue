import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Features, Capability, Storage } from "@/components/sections";
import { Flow, Steps } from "@/components/flow";
import { Pricing } from "@/components/pricing";
import { Faq, Cta, Footer } from "@/components/faq";

export default function HomePage() {
  return (
    <>
      <a href="#main" className="cue-sr-only cue-skip">
        Skip to content
      </a>
      {/* Static and undismissable on purpose: the rename announcement is for
          returning Krevo visitors, costs one line, and needs no client state.
          It sits above the nav, so it scrolls away while the nav pins. */}
      <div className="cue-topbar">
        <p>
          <strong>Krevo Cloud is now Cue.</strong>{" "}
          <a href="#storage">Storage returns this fall</a>
        </p>
      </div>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <Flow />
        <Capability />
        <Steps />
        <Pricing />
        <Storage />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

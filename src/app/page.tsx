import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Features, Capability } from "@/components/sections";
import { Flow, Steps } from "@/components/flow";
import { Pricing } from "@/components/pricing";
import { Faq, Cta, Footer } from "@/components/faq";

export default function HomePage() {
  return (
    <>
      <a href="#main" className="cue-sr-only cue-skip">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <Flow />
        <Capability />
        <Steps />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

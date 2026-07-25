import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Statement, Features, Capability } from "@/components/sections";
import { Flow, Steps } from "@/components/flow";
import { Pricing } from "@/components/pricing";
import { Testimonials } from "@/components/testimonials";
import { Faq, Cta, Footer } from "@/components/faq";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Features />
        <Flow />
        <Capability />
        <Steps />
        <Pricing />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

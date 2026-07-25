"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

/* PLACEHOLDER COPY — these are not real customers. Replace with sourced,
   attributable quotes from early users (or delete the section) before launch. */
const QUOTES = [
  {
    name: "Placeholder Name",
    role: "Wedding Photographer",
    body: "I used to chase signatures over email for a week. Now the agreement goes out from my phone on the call and it is signed before I get home.",
  },
  {
    name: "Placeholder Name",
    role: "Wedding Videographer",
    body: "Couples sign on their phone without making an account. That one detail removed every excuse for a slow reply.",
  },
  {
    name: "Placeholder Name",
    role: "Studio Owner",
    body: "Every signed agreement has a PDF and an audit trail in one library. When a question comes up a year later, I can actually find the answer.",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const quote = QUOTES[index];
  const move = (step: number) =>
    setIndex((i) => (i + step + QUOTES.length) % QUOTES.length);

  return (
    <section id="testimonials" className="cue-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">What creatives actually say</h2>
          <p className="cue-lede">
            From solo shooters to small studios — Cue fits the week before a
            shoot.
          </p>
        </div>

        <figure className="cue-quote" aria-live="polite">
          <div className="cue-quote-head">
            <span className="cue-avatar" aria-hidden>
              {initials(quote.name)}
            </span>
            <figcaption>
              <div style={{ fontFamily: "var(--font-geist), sans-serif", fontWeight: 500 }}>
                {quote.name}
              </div>
              <div style={{ color: "var(--cue-muted)", fontSize: 15 }}>{quote.role}</div>
            </figcaption>
          </div>

          <div className="cue-stars" aria-label="Five out of five">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={17} fill="currentColor" strokeWidth={0} aria-hidden />
            ))}
          </div>

          <blockquote className="cue-quote-body">&ldquo;{quote.body}&rdquo;</blockquote>
        </figure>

        <div className="cue-quote-nav">
          <button type="button" onClick={() => move(-1)} aria-label="Previous testimonial">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Next testimonial">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

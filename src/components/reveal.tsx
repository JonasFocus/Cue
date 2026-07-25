"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll reveal: adds `.is-visible` the first time the wrapper scrolls into
 * view. The `.cue-reveal` class owns the transition and reduced-motion.
 */
export function Reveal({
  className = "cue-reveal",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.classList.add("is-visible");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // Promote for the enter only — drop after the transition finishes.
        el.style.willChange = "transform, opacity";
        el.classList.add("is-visible");
        io.disconnect();
        const clear = () => {
          el.style.willChange = "";
          el.removeEventListener("transitionend", clear);
        };
        el.addEventListener("transitionend", clear);
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

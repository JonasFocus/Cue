"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Check, FileSignature, Sparkles } from "lucide-react";
import { MockLink, MockRecord, MockSeal, MockSend, MockSetup, MockTemplates } from "./mock";

/* ── Tabbed walkthrough ── */

const TABS = [
  {
    tab: "Send the Cue",
    icon: FileSignature,
    title: "Send the Cue",
    lede: "From template to signing link in a minute.",
    body: "Start from a wedding, elopement, portrait, commercial, video, or blank template. Personalise the details, then Cue creates a secure link you can share anywhere.",
    statValue: "Under a minute",
    statLabel: "From template to ready-to-send",
    visual: <MockTemplates />,
  },
  {
    tab: "Get the yes",
    icon: Check,
    title: "Get the yes",
    lede: "No account for your client.",
    body: "Your client opens the link on whatever device is in their hand, reads a clean mobile layout, consents, and signs. Nothing to download or install.",
    statValue: "Any device",
    statLabel: "Nothing to download or install",
    visual: <MockLink />,
  },
  {
    tab: "Keep the record",
    icon: Archive,
    title: "Keep the record",
    lede: "Signed means settled.",
    body: "The moment every required signer has signed, Cue seals the frozen agreement and keeps its document hash and audit events in your library. You can print or save the record from your browser.",
    statValue: "Immutable",
    statLabel: "Snapshot, hash, and audit trail",
    visual: <MockRecord />,
  },
];

export function Flow() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TABS[active];

  // Automatic activation: only the selected panel renders, but it is a static
  // client-side swap with nothing to fetch, so following focus costs nothing.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % TABS.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + TABS.length) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="cue-section cue-flow-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">{"Three steps.\nOne Cue."}</h2>
          <p className="cue-lede">
            From a template to a sealed record. Built for the moments before a
            shoot.
          </p>
        </div>

        <div className="cue-tabs" role="tablist" aria-label="How Cue works">
          {TABS.map((t, i) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              id={`cue-tab-${i}`}
              aria-selected={i === active}
              aria-controls="cue-flow-panel"
              tabIndex={i === active ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              className="cue-tab"
              onClick={() => setActive(i)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.tab}
            </button>
          ))}
        </div>

        <div
          key={active}
          className="cue-tabpanel"
          role="tabpanel"
          id="cue-flow-panel"
          aria-labelledby={`cue-tab-${active}`}
          // The panel holds no focusable children, so without this a keyboard
          // user tabs straight past its content.
          tabIndex={0}
        >
          <div className="cue-tabpanel-copy">
            <Sparkles
              size={22}
              strokeWidth={2}
              style={{ color: "var(--cue-accent)" }}
            />
            <h3 style={{ marginTop: 34, fontSize: 24, letterSpacing: "-0.02em" }}>
              {current.title}
            </h3>
            <p style={{ marginTop: 14, fontSize: 15, color: "var(--cue-ink-soft)" }}>
              {current.lede}
            </p>
            <p
              style={{
                marginTop: 14,
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--cue-ink-soft)",
              }}
            >
              {current.body}
            </p>

            <div className="cue-tabpanel-stat">
              <h4 style={{ fontSize: 19, letterSpacing: "-0.02em" }}>
                {current.statValue}
              </h4>
              <p style={{ marginTop: 8, fontSize: 15, color: "var(--cue-ink-soft)" }}>
                {current.statLabel}
              </p>
            </div>
          </div>

          <div className="cue-tabpanel-visual">{current.visual}</div>
        </div>
      </div>
    </section>
  );
}

/* ── Scroll-linked steps ── */

const STEPS = [
  {
    label: "Step 01",
    title: "Set up your studio once",
    body: "Add your business name, brand colour, and standard terms. Cue reuses them on every Cue from then on.",
    visual: <MockSetup />,
  },
  {
    label: "Step 02",
    title: "Send your first Cue",
    body: "Pick a template, fill in the client and shoot details, and send the signing link straight from your phone or laptop.",
    visual: <MockSend />,
  },
  {
    label: "Step 03",
    title: "Get the yes on file",
    body: "Your client signs. Cue seals the record. The frozen document, its hash, and its audit events stay in your library.",
    visual: <MockSeal />,
  },
];

export function Steps() {
  const railRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const rail = railRef.current;
    const fill = fillRef.current;
    if (!rail || !fill) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = STEPS.length;

    // Drive the rail + step dots via the DOM so scroll never re-renders mocks.
    let frame = 0;
    let lastProgress = -1;
    const apply = (progress: number) => {
      if (Math.abs(progress - lastProgress) < 0.001) return;
      lastProgress = progress;
      fill.style.transform = `scaleY(${progress})`;
      for (let i = 0; i < count; i++) {
        const step = stepRefs.current[i];
        if (!step) continue;
        const active = progress >= (i + 0.35) / count;
        if (step.dataset.active !== String(active)) {
          step.dataset.active = String(active);
        }
      }
    };

    const update = () => {
      frame = 0;
      if (reduced) {
        apply(1);
        return;
      }
      const rect = rail.getBoundingClientRect();
      const anchor = window.innerHeight * 0.55;
      const ratio = (anchor - rect.top) / Math.max(rect.height, 1);
      apply(Math.min(1, Math.max(0, ratio)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section id="steps" className="cue-section cue-steps-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">{"Your first Cue\nin three steps"}</h2>
          <p className="cue-lede">
            Add your studio once. Send from a template. Get the signed record
            back.
          </p>
        </div>

        <div className="cue-steps" ref={railRef}>
          <div className="cue-steps-rail" aria-hidden>
            <div className="cue-steps-rail-fill" ref={fillRef} />
          </div>

          {STEPS.map((step, i) => (
            <div
              className="cue-step"
              key={step.label}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
            >
              <div className="cue-step-label">
                <span className="cue-step-dot" aria-hidden />
                {step.label}
              </div>

              <div className="cue-step-visual">{step.visual}</div>

              <div>
                <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>
                  {step.title}
                </h3>
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--cue-ink-soft)",
                  }}
                >
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

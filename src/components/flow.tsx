"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, FileSignature, Send, Sparkles } from "lucide-react";
import { MockAllowance, MockApp, MockLink, MockRecord } from "./mock";

/* ── Tabbed walkthrough ── */

const TABS = [
  {
    tab: "Pick a template",
    icon: FileSignature,
    title: "Start From A Template",
    lede: "Choose the agreement that fits the job.",
    body: "Wedding, elopement, portrait, or retainer. Personalise the couple, the date, the deliverables, and the terms, then save it as your own.",
    statValue: "Under a minute",
    statLabel: "From template to ready-to-send",
    visual: <MockAllowance />,
  },
  {
    tab: "Send the link",
    icon: Send,
    title: "Send A Secure Link",
    lede: "No account for your client.",
    body: "Cue will create a signing link protected by an unguessable token. Your client will open it on a phone, read a clean mobile layout, and sign.",
    statValue: "Any device",
    statLabel: "Nothing to download or install",
    visual: <MockLink />,
  },
  {
    tab: "Keep the record",
    icon: Archive,
    title: "Keep The Record",
    lede: "Signed means settled.",
    body: "The moment it is signed, Cue will freeze the agreement, render a final PDF, store the audit trail, and email a copy to both parties.",
    statValue: "Immutable",
    statLabel: "Snapshot, hash, and audit trail",
    visual: <MockRecord />,
  },
];

export function Flow() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TABS[active];

  // Manual activation is not needed here — each panel is already rendered
  // client-side, so following focus costs nothing.
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
    <section className="cue-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">{"From inquiry to signed,\nin three steps"}</h2>
          <p className="cue-lede">
            Here is what we are building. None of it is live yet — the waitlist
            is the one thing on this page that works today.
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
    title: "Set up your details once",
    body: "Add your business name, branding, and standard terms. Cue will reuse them on every agreement from then on.",
    visual: <MockAllowance />,
  },
  {
    label: "Step 02",
    title: "Send your first Cue",
    body: "Pick a template, fill in the client and shoot details, and send the signing link straight from your phone or laptop.",
    visual: <MockApp compact />,
  },
  {
    label: "Step 03",
    title: "Get the yes on file",
    body: "Once it is built: your client signs, Cue seals the PDF, and the signed record lands in your library and both inboxes.",
    visual: <MockRecord />,
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
    <section id="steps" className="cue-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">{"Up and running\nin three steps"}</h2>
          <p className="cue-lede">
            The day Cue opens, your first five agreements will be free — no
            card.
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
                    marginTop: 12,
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

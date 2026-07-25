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
    body: "Cue creates a signing link protected by an unguessable token. Your client opens it on a phone, reads a clean mobile layout, and signs.",
    statValue: "Any device",
    statLabel: "Nothing to download or install",
    visual: <MockLink />,
  },
  {
    tab: "Keep the record",
    icon: Archive,
    title: "Keep The Record",
    lede: "Signed means settled.",
    body: "The moment it is signed, Cue freezes the agreement, renders a final PDF, stores the audit trail, and emails a copy to both parties.",
    statValue: "Immutable",
    statLabel: "Snapshot, hash, and audit trail",
    visual: <MockRecord />,
  },
];

export function Flow() {
  const [active, setActive] = useState(0);
  const current = TABS[active];

  return (
    <section className="cue-section">
      <div className="cue-shell">
        <div className="cue-eyebrow-block">
          <h2 className="cue-h2">From inquiry to signed in minutes.</h2>
          <p className="cue-lede">
            Three steps, and none of them feel like admin.
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
              aria-controls={`cue-panel-${i}`}
              className="cue-tab"
              onClick={() => setActive(i)}
            >
              {t.tab}
            </button>
          ))}
        </div>

        <div
          key={active}
          className="cue-tabpanel"
          role="tabpanel"
          id={`cue-panel-${active}`}
          aria-labelledby={`cue-tab-${active}`}
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
    body: "Add your business name, branding, and standard terms. Cue reuses them on every agreement from then on.",
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
    body: "Your client signs, Cue seals the PDF, and the signed record lands in your library and both inboxes.",
    visual: <MockRecord />,
  },
];

export function Steps() {
  const railRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (reduced) {
        setProgress(1);
        return;
      }
      const rect = rail.getBoundingClientRect();
      const anchor = window.innerHeight * 0.55;
      const ratio = (anchor - rect.top) / Math.max(rect.height, 1);
      setProgress(Math.min(1, Math.max(0, ratio)));
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
            Your first agreement can go out today, on the free plan.
          </p>
        </div>

        <div className="cue-steps" ref={railRef}>
          <div className="cue-steps-rail" aria-hidden>
            <div
              className="cue-steps-rail-fill"
              style={{ height: `${progress * 100}%` }}
            />
          </div>

          {STEPS.map((step, i) => (
            <div
              className="cue-step"
              key={step.label}
              data-active={progress >= (i + 0.35) / STEPS.length}
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

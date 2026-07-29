"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { CueMark } from "@/components/cue-mark";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#steps", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let stuck = false;
    const onScroll = () => {
      const next = window.scrollY > 8;
      if (next === stuck) return;
      stuck = next;
      header.dataset.stuck = String(next);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Closing unmounts the sheet, which drops focus to <body>. Put it back on
      // the control that opened it.
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="cue-nav" data-stuck="false" ref={headerRef}>
      <div className="cue-shell">
        <div className="cue-nav-inner">
          <Link href="/" className="cue-brand">
            <span className="cue-brand-mark">
              <CueMark size={15} />
            </span>
            Cue
          </Link>

          <nav className="cue-nav-links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="cue-nav-link">
                {l.label}
              </a>
            ))}
            {/* Sign-in lives in the desktop link group rather than beside the
                CTA: the brand, the CTA and the toggle already fill the shell at
                320px. Below 900px the sheet carries it instead. */}
            <Link href="/app/login" className="cue-nav-link">
              Sign in
            </Link>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Two doors, deliberately unequal: existing creators sign in above,
                everyone else joins the waitlist. */}
            <a href="#waitlist" className="cue-btn cue-btn-dark cue-nav-cta">
              Join the waitlist
            </a>
            <button
              type="button"
              ref={toggleRef}
              className="cue-nav-toggle"
              aria-expanded={open}
              // The sheet only exists while open, and aria-controls pointing
              // at a missing id is worse than no aria-controls at all.
              aria-controls={open ? "cue-nav-sheet" : undefined}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="cue-nav-sheet" id="cue-nav-sheet">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href="#waitlist" onClick={() => setOpen(false)}>
              Join the waitlist
            </a>
            <Link href="/app/login" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

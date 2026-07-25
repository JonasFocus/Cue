"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, PenLine, X } from "lucide-react";

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
              <PenLine size={15} strokeWidth={2} />
            </span>
            Cue
          </Link>

          <nav className="cue-nav-links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="cue-nav-link">
                {l.label}
              </a>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* There is no customer sign-in yet — /console is the operator's ops
                surface with signup disabled, so linking it here promised an
                account nobody can have. Interest is the only real action on this
                page. Light styling keeps it from competing with the hero CTA. */}
            <a href="#waitlist" className="cue-btn cue-btn-light cue-nav-cta">
              Join the waitlist
            </a>
            <button
              type="button"
              ref={toggleRef}
              className="cue-nav-toggle"
              aria-expanded={open}
              aria-controls="cue-nav-sheet"
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
          </nav>
        )}
      </div>
    </header>
  );
}

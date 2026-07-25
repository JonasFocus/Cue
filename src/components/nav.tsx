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
            {/* Secondary on purpose: the hero's waitlist CTA is the one action
                this page is asking for, so the nav must not compete with it. */}
            <Link href="/console/login" className="cue-btn cue-btn-light cue-nav-cta">
              Sign in
            </Link>
            <button
              type="button"
              className="cue-nav-toggle"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="cue-nav-sheet">
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

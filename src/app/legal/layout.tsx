import Link from "next/link";
import { PenLine } from "lucide-react";
import { Footer } from "@/components/faq";

/* The marketing Nav is not reused here: its links are same-page anchors into
   sections that do not exist on a legal page. A brand link home is enough. */

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="cue-nav" data-stuck="true">
        <div className="cue-shell">
          <div className="cue-nav-inner">
            <Link href="/" className="cue-brand">
              <span className="cue-brand-mark">
                <PenLine size={15} strokeWidth={2} />
              </span>
              Cue
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <Footer />
    </>
  );
}

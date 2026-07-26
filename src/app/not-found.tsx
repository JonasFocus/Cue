import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { CueMark } from "@/components/cue-mark";

export default function NotFound() {
  return (
    <main className="cue-404">
      <Image
        src="/404-horizon.jpg"
        alt=""
        fill
        priority
        quality={92}
        sizes="100vw"
        className="cue-404-bg"
      />
      <div className="cue-404-veil" aria-hidden />

      <div className="cue-404-shell">
        <div className="cue-404-card">
          <div className="cue-404-brandrow">
            <Link href="/" className="cue-404-brand">
              <span className="cue-404-mark">
                <CueMark size={15} />
              </span>
              Cue
            </Link>
            <span className="cue-404-beta">Beta</span>
          </div>

          <p className="cue-404-code" aria-hidden>
            404
          </p>
          <h1 className="cue-404-title">This page drifted off.</h1>
          <p className="cue-404-lede">
            The link may be old, or the page never existed. Either way, there is
            nothing to sign here.
          </p>

          <Link href="/" className="cue-404-cta">
            <ArrowLeft size={15} strokeWidth={2.25} />
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}

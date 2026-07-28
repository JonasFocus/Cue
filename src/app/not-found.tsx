import Link from "next/link";
import { CueMark } from "@/components/cue-mark";

/* The 404.
 *
 * The signature rule is the whole idea: a client's last act on this product is
 * putting their name on a line, so an empty one is the most direct way to say
 * a document is not here. It carries the meaning the page used to spend a
 * 96px "404" and a paragraph on.
 *
 * Everything else was removed rather than restyled — a photographic
 * background, a blurred glass card, a Beta badge, and a violet/pink palette
 * that appeared nowhere else in the product. They made this page look like it
 * belonged to different software.
 */
export default function NotFound() {
  return (
    <main className="cue-404">
      <div className="cue-404-inner">
        <Link href="/" className="cue-404-mark" aria-label="Cue home">
          <CueMark size={26} />
        </Link>

        <h1 className="cue-404-title">Nothing to sign here.</h1>
        <p className="cue-404-lede">This link has expired, or it never existed.</p>

        {/* Decorative: the sentence above already carries the meaning, so a
            screen reader gets no value from a second, wordless telling. */}
        <div className="cue-404-rule" aria-hidden>
          <span className="cue-404-line" />
          <span className="cue-404-caption">no document</span>
        </div>

        <Link href="/" className="cue-404-back">
          Back to Cue
        </Link>
      </div>
    </main>
  );
}

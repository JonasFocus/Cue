/**
 * The Cue mark — one continuous handwritten gesture, the stroke a signature
 * leaves behind.
 *
 * Defined once and imported by every surface (nav, footer, console masthead,
 * login card, error and 404 pages). It was previously a stock `lucide` pen
 * icon repeated in seven files, which is both generic and seven places to
 * forget when the brand changes.
 *
 * Drawn at stroke-width 3 on a 24 unit box: the amplitude and weight are tuned
 * so the gesture still reads at the 15px it renders in the nav, where a thinner
 * or flatter curve collapses into a squiggle.
 *
 * `currentColor` lets the containing chip own the colour — white on the blue
 * marketing tile, dark on the console's light one.
 */
export function CueMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 15.4c3.2.2 4.2-6.8 7.3-6.8 2.6 0 2 6.2 4.4 6.2 1.4 0 2.1-1.3 2.6-2.4"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

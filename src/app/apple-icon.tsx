import { ImageResponse } from "next/og";

/* Rendered by Satori, which supports a subset of CSS: flexbox only (no grid),
   and every element with more than one child needs an explicit display:flex. */

/* This is what a shared link shows instead of a preview card. There is no
   opengraph-image on purpose — an og:image of any shape makes Apple's
   LinkPresentation draw the tall hero card, and removing it drops the preview
   to the one-line strip with the site icon at the end, the way krevo.io reads.
   Slack, Twitter and LinkedIn fall back to text-plus-icon for the same reason.
   Cue otherwise ships only an SVG favicon, which Apple does not reliably
   render here, so this PNG is the icon that actually gets picked up.
   Full-bleed and square: iOS applies its own corner mask, and pre-rounded
   corners would be clipped a second time. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0086ff",
        }}
      >
        {/* The Cue mark, inlined — Satori renders SVG but cannot import a
            component. Keep in sync with src/components/cue-mark.tsx. */}
        <svg width="116" height="116" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 15.4c3.2.2 4.2-6.8 7.3-6.8 2.6 0 2 6.2 4.4 6.2 1.4 0 2.1-1.3 2.6-2.4"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}

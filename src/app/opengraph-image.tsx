import { ImageResponse } from "next/og";

/* Rendered by Satori, which supports a subset of CSS: flexbox only (no grid),
   and every element with more than one child needs an explicit display:flex. */

/* Square on purpose. Apple's LinkPresentation picks the tall hero card for a
   wide 1200x630 image and a compact one-line strip for a small square one, so
   the shape of this file is what controls how large a shared link renders in
   iMessage. Slack, Twitter and LinkedIn follow the same shape into their own
   compact layouts. Nothing here is set in type small enough to need reading —
   at strip size this is a ~100px thumbnail, so the mark carries it. */
export const alt = "Cue — send the Cue, get the yes, keep the record";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f7f7",
          backgroundImage:
            "radial-gradient(420px 300px at 50% 4%, rgba(0,134,255,0.18) 0%, rgba(247,247,247,0) 72%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 168,
            height: 168,
            borderRadius: 48,
            background: "#0086ff",
          }}
        >
          {/* The Cue mark, inlined — Satori renders SVG but cannot import a
              component. Keep in sync with src/components/cue-mark.tsx. */}
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 15.4c3.2.2 4.2-6.8 7.3-6.8 2.6 0 2 6.2 4.4 6.2 1.4 0 2.1-1.3 2.6-2.4"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: -3,
            color: "#000",
          }}
        >
          Cue
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 26,
            color: "#6b6b6b",
          }}
        >
          Client agreements
        </div>
      </div>
    ),
    size,
  );
}

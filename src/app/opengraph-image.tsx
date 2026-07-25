import { ImageResponse } from "next/og";

/* Rendered by Satori, which supports a subset of CSS: flexbox only (no grid),
   and every element with more than one child needs an explicit display:flex. */

export const alt = "Cue — send the Cue, get the yes, keep the record";
export const size = { width: 1200, height: 630 };
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
          justifyContent: "center",
          padding: "0 96px",
          background: "#f7f7f7",
          backgroundImage:
            "radial-gradient(900px 460px at 50% -8%, rgba(0,134,255,0.20) 0%, rgba(247,247,247,0) 70%)",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 62,
              height: 62,
              borderRadius: 18,
              background: "#0086ff",
            }}
          >
            {/* The pen mark from the nav, inlined — Satori cannot load icons. */}
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ fontSize: 46, fontWeight: 600, color: "#000", letterSpacing: -1.5 }}>
            Cue
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -3.4,
            color: "#000",
          }}
        >
          Get the agreement out of the way.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 31,
            lineHeight: 1.4,
            color: "#6b6b6b",
            maxWidth: 880,
          }}
        >
          Client agreements for photographers and videographers. Send it, get it
          signed, keep the record.
        </div>

        {/* Footer rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 52,
            paddingTop: 30,
            borderTop: "1px solid #e4e4e4",
            fontSize: 25,
            color: "#8a8a8a",
          }}
        >
          <div
            style={{ display: "flex", width: 9, height: 9, borderRadius: 5, background: "#0086ff" }}
          />
          Free for your first five Cues
        </div>
      </div>
    ),
    size,
  );
}

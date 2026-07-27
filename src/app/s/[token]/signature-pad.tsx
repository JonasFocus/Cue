"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/* A signature pad, written by hand.
 *
 * Pointer Events rather than mouse + touch: one code path covers a mouse, a
 * finger, and an Apple Pencil, and `setPointerCapture` keeps a stroke attached
 * to the canvas when a finger slides off its edge mid-letter — which happens on
 * every phone-sized signature.
 *
 * No dependency. A signature pad is ~120 lines of canvas, and the three things
 * that actually make one usable (device-pixel scaling, midpoint smoothing, and
 * not destroying the drawing on a viewport resize) are exactly the three things
 * a library would hide. */

type Point = { x: number; y: number };

export type SignaturePadHandle = {
  /** The drawn mark as a PNG data URL, or null if the pad is empty. */
  toDataURL: () => string | null;
  clear: () => void;
};

const INK = "#14161a";
const LINE_WIDTH = 2.2;

/* Backing-store scale is capped at 2 even on 3x phones. Beyond 2x nobody can
   see the difference in a 2mm-wide ink line, but the PNG keeps growing — and
   this file is posted over venue wifi. */
const MAX_SCALE = 2;

export function SignaturePad({
  disabled,
  onMarkChange,
  describedBy,
  ref,
}: {
  disabled: boolean;
  onMarkChange?: (hasMark: boolean) => void;
  describedBy: string;
  ref?: React.Ref<SignaturePadHandle>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const drawing = useRef(false);
  const moved = useRef(false);
  const last = useRef<Point>({ x: 0, y: 0 });
  const lastMid = useRef<Point>({ x: 0, y: 0 });
  const marked = useRef(false);
  /* The CSS box the current backing store was built for. Pointer coordinates
     are mapped into it, so a stroke stays aligned even if the element is
     currently laid out at some other size. */
  const box = useRef({ w: 0, h: 0 });

  const [hasMark, setHasMark] = useState(false);

  const notify = useCallback(
    (value: boolean) => {
      if (marked.current === value) return;
      marked.current = value;
      setHasMark(value);
      onMarkChange?.(value);
    },
    [onMarkChange],
  );

  /* (Re)builds the backing store. Assigning canvas.width resets every context
     property, so the whole context is configured here and nowhere else. */
  const configure = useCallback((w: number, h: number) => {
    const canvas = canvasRef.current;
    if (!canvas || w <= 0 || h <= 0) return;

    // Snapshot first. A client who has already drawn must not lose their mark
    // to a reflow — that is the classic bug in every hand-rolled pad.
    let previous: HTMLCanvasElement | null = null;
    if (marked.current && canvas.width > 0 && canvas.height > 0) {
      previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
    }

    const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Every drawing call below is in CSS pixels; the transform does the rest.
    // Without this the signature is a blurry mess on every phone made since 2015.
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = LINE_WIDTH;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctxRef.current = ctx;

    // Stretched into the new box rather than re-sampled cleverly: the mark
    // surviving an orientation change matters, a few pixels of anisotropy does not.
    if (previous) ctx.drawImage(previous, 0, 0, w, h);

    box.current = { w, h };
  }, []);

  const clear = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) ctx.clearRect(0, 0, box.current.w, box.current.h);
    drawing.current = false;
    notify(false);
  }, [notify]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    /* Without ResizeObserver the canvas would keep its default 300×150 backing
       store and no context would ever be configured, which fails *silently* —
       the client draws and nothing appears. On this page that is unacceptable,
       so size it once from the box we have and settle for window resize. */
    if (typeof ResizeObserver === "undefined") {
      const size = () => {
        const rect = wrap.getBoundingClientRect();
        configure(Math.round(rect.width), Math.round(rect.height));
      };
      size();
      window.addEventListener("orientationchange", size);
      return () => window.removeEventListener("orientationchange", size);
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === box.current.w && h === box.current.h) return;

      /* Width is the trigger, deliberately. Opening the mobile keyboard to
         type a legal name resizes the visual viewport *vertically*; rebuilding
         the backing store on that would resample — or, in the naive version,
         erase — a signature the client already drew, every single time they
         tapped the name field. Only a genuine reflow (an orientation change,
         a desktop window drag) moves the width. The pad's height is a fixed
         px value in sign.css precisely so it cannot drift on its own. */
      if (box.current.w !== 0 && w === box.current.w) return;

      configure(w, h);
    });

    observer.observe(wrap);
    return () => observer.disconnect();
  }, [configure]);

  useImperativeHandle(
    ref,
    () => ({
      toDataURL: () =>
        marked.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null,
      clear,
    }),
    [clear],
  );

  /* Mapped through the bounding rect rather than offsetX/offsetY: offsetX is
     relative to the padding box and lies when the element is scaled, and the
     rect is the only measurement that stays true if the layout changes between
     configure() and this stroke. */
  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (box.current.w / (rect.width || 1)),
      y: (event.clientY - rect.top) * (box.current.h / (rect.height || 1)),
    };
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !ctxRef.current) return;
    // Stops the iOS text-selection callout and the desktop drag-image, both of
    // which otherwise interrupt a slow, careful signature.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const point = pointFrom(event);
    drawing.current = true;
    moved.current = false;
    last.current = point;
    lastMid.current = point;
  }

  function extend(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!drawing.current || !ctx) return;

    /* The whole difference between a signature and a scribble: each segment is
       a quadratic curve from the previous midpoint, through the previous raw
       point as its control, to the new midpoint. Consecutive curves share a
       tangent at the midpoints, so the line is smooth without ever redrawing
       the path — one beginPath/stroke per move event, not per stroke. */
    const point = pointFrom(event);
    const mid = {
      x: (last.current.x + point.x) / 2,
      y: (last.current.y + point.y) / 2,
    };

    ctx.beginPath();
    ctx.moveTo(lastMid.current.x, lastMid.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.stroke();

    last.current = point;
    lastMid.current = mid;
    moved.current = true;
    notify(true);
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;

    const ctx = ctxRef.current;
    if (ctx) {
      if (moved.current) {
        // Close the gap between the last midpoint and where the pointer
        // actually stopped, or every stroke ends half a sample short.
        ctx.beginPath();
        ctx.moveTo(lastMid.current.x, lastMid.current.y);
        ctx.lineTo(last.current.x, last.current.y);
        ctx.stroke();
      } else {
        // A tap that never moved is a dot — the tittle on an i, the full stop
        // after an initial. lineTo() onto the same point paints nothing.
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, LINE_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      notify(true);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="sg-pad" data-disabled={disabled || undefined}>
      <div className="sg-pad-frame" ref={wrapRef} data-marked={hasMark || undefined}>
        {/* `role="img"` with a state-dependent name, not `aria-labelledby`:
            the id it was pointed at is the *name input's* label, so the pad
            announced itself as "Your full legal name". A bare <canvas> has no
            role and no fallback content, so most screen readers announced
            nothing at all — a blind client was never told the pad existed. */}
        <canvas
          ref={canvasRef}
          className="sg-pad-canvas"
          role="img"
          aria-label={
            hasMark
              ? "Signature pad. A mark has been drawn."
              : "Signature pad. Optional — your typed name above is enough to sign."
          }
          aria-describedby={describedBy}
          onPointerDown={begin}
          onPointerMove={extend}
          onPointerUp={end}
          // Capture means a pointer leaving the element keeps reporting here,
          // so `leave` is only reached in the browsers that decline capture —
          // and `cancel` fires when the OS steals the gesture (a system swipe,
          // an incoming call). Both must finish the stroke rather than leave
          // `drawing` stuck true.
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {/* Baseline and prompt are CSS, never painted onto the canvas — a
            guide line that ended up inside the exported PNG would become part
            of the signature on the record. */}
        <span className="sg-pad-hint" aria-hidden>
          Sign here (optional)
        </span>
      </div>

      <p className="ca-sr-only" role="status">
        {hasMark ? "Signature drawn." : ""}
      </p>

      <div className="sg-pad-foot">
        <span className="sg-pad-note">
          Optional. Use your finger, a stylus, or a mouse.
        </span>
        <button
          type="button"
          className="sg-ghost"
          onClick={clear}
          disabled={disabled || !hasMark}
        >
          <Eraser size={14} strokeWidth={2.25} aria-hidden />
          Clear
        </button>
      </div>
    </div>
  );
}

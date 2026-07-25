"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Marks the host with `.is-paused` when it leaves the viewport so CSS can
 * freeze descendant keyframe loops without tearing them down.
 */
export function AnimHost({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.classList.toggle("is-paused", !entry.isIntersecting);
      },
      { rootMargin: "80px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `cue-anim-host ${className}` : "cue-anim-host"}
      {...rest}
    >
      {children}
    </div>
  );
}

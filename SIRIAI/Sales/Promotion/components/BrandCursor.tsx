"use client";

import { useEffect, useRef } from "react";

/**
 * The 8px difference-blended square from the cd-study system, which hides the
 * native cursor site-wide.
 *
 * Exception: over real text fields the square hides and the native caret returns
 * (see globals.css) — at a booth the invite-code input must read as typable.
 * Coarse pointers keep their native cursor entirely.
 */
export default function BrandCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMove = (e: PointerEvent) => {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      const t = e.target as Element | null;
      const overField = !!(t && t.closest && t.closest("input, textarea, [contenteditable]"));
      el.style.opacity = overField ? "0" : "1";
    };
    const onLeave = () => {
      el.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={ref} className="cd-cursor" style={{ opacity: 0 }} aria-hidden />;
}

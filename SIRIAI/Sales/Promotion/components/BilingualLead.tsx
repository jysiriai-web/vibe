"use client";

import { Fragment, useEffect, useRef } from "react";

export interface BiLine {
  en: string;
  ko: string;
}

/**
 * EN→KO word-by-word swap, adapted from cd-study for a SHORT closing section.
 * The reference drives the swap by scroll position, which needs a tall section with
 * runway below the line; our closing is short and last, so the line rests near the
 * viewport bottom and never rises. Instead we fire the swap ONCE, on a time-based
 * left-to-right stagger, the first time the line scrolls into the lower viewport.
 * Robust to any section height — it always resolves to fully-legible Korean.
 */
export default function BilingualLead({
  lines,
  className,
}: {
  lines: BiLine[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const en = [...root.querySelectorAll<HTMLElement>(".mv-en-line .mv-w")];
    const ko = [...root.querySelectorAll<HTMLElement>(".mv-ko-line .mv-w")];
    if (!ko.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      en.forEach((w) => (w.style.opacity = "0"));
      ko.forEach((w) => (w.style.opacity = "1"));
      return;
    }

    en.forEach((w) => (w.style.opacity = "1"));
    ko.forEach((w) => (w.style.opacity = "0"));

    const timers: ReturnType<typeof setTimeout>[] = [];
    let fired = false;

    const swap = () => {
      fired = true;
      window.removeEventListener("scroll", onScroll);
      en.forEach((w, i) => timers.push(setTimeout(() => (w.style.opacity = "0"), i * 42)));
      ko.forEach((w, i) => timers.push(setTimeout(() => (w.style.opacity = "1"), 240 + i * 46)));
    };

    const onScroll = () => {
      if (fired) return;
      const r = root.getBoundingClientRect();
      // fire once the line has risen into the lower ~80% of the viewport
      if (r.top < window.innerHeight * 0.8) swap();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // in case it is already in view

    return () => {
      window.removeEventListener("scroll", onScroll);
      timers.forEach(clearTimeout);
    };
  }, [lines]);

  return (
    <div ref={ref} className={className}>
      {lines.map((l, i) => (
        <div className="mv-line" key={i}>
          <span className="mv-en-line" aria-hidden>
            {l.en.split(" ").map((w, j, arr) => (
              <Fragment key={j}>
                <span className="mv-w">{w}</span>
                {j < arr.length - 1 ? " " : ""}
              </Fragment>
            ))}
          </span>
          <span className="mv-ko-line">
            {l.ko.split(" ").map((w, j, arr) => (
              <Fragment key={j}>
                <span className="mv-w">{w}</span>
                {j < arr.length - 1 ? " " : ""}
              </Fragment>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

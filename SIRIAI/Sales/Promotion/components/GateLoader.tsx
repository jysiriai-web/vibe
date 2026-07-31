"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The brand's entry moment, ported from cd-study's loader: a typed line over two
 * corner blooms that foreshadow the hero's field, then a fade that hands off to it.
 *
 * Shortened for the booth — the reference types at 46ms/char and holds 480ms; we
 * type at 34ms and hold 300ms (~1.35s total). It plays on every gate load rather
 * than once per session: at a trade show one tab serves many visitors, so
 * "first visit only" would mean only the day's first visitor sees it.
 */

const FULL = "Creator Intelligence for Beauty";
const CHAR_MS = 34;
const HOLD_MS = 300;
const FADE_MS = 700; // matches the .loader opacity transition

export default function GateLoader({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [caretOff, setCaretOff] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [gone, setGone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const finish = () => {
      setCaretOff(true);
      setHiding(true);
      doneRef.current(); // the hero reveals *while* the loader fades — one continuous moment
      timers.push(setTimeout(() => setGone(true), FADE_MS + 50));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(FULL);
      finish();
      return () => timers.forEach(clearTimeout);
    }

    let i = 0;
    const type = () => {
      setText(FULL.slice(0, i));
      if (i < FULL.length) {
        i++;
        timers.push(setTimeout(type, CHAR_MS));
      } else {
        timers.push(setTimeout(finish, HOLD_MS));
      }
    };
    type();

    return () => timers.forEach(clearTimeout);
  }, []);

  if (gone) return null;

  return (
    <div className={`loader${hiding ? " hide" : ""}`} aria-hidden>
      <span className="l-bloom bl" />
      <span className="l-bloom tr" />
      <div className="intro">
        <span>{text}</span>
        <span
          className="caret"
          style={caretOff ? { opacity: 0, animation: "none" } : undefined}
        />
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Company, Segment } from "@/lib/types";
import SiriMark from "./SiriMark";
import VisualView from "./VisualView";
import ListView from "./ListView";
import BilingualLead from "./BilingualLead";
import { INQUIRY_URL, HOMEPAGE_URL } from "@/lib/links";

type Mode = "visual" | "list";

export default function ExperienceShell({
  segment,
  company,
}: {
  segment: Segment;
  company: Company;
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("visual");
  const [wiping, setWiping] = useState(false);
  const busy = useRef(false);

  function switchTo(next: Mode) {
    if (next === mode || busy.current) return;
    if (reduce) {
      setMode(next);
      return;
    }
    busy.current = true;
    setWiping(true);
    window.setTimeout(() => setMode(next), 430);
    window.setTimeout(() => {
      setWiping(false);
      busy.current = false;
    }, 950);
  }

  const accent = segment.accent;
  const shellStyle = {
    ["--color-accent"]: accent.base,
    ["--color-accent-deep"]: accent.deep,
    ["--color-accent-soft"]: accent.soft,
    ["--accent"]: accent.base,
  } as React.CSSProperties;

  const nextMode: Mode = mode === "visual" ? "list" : "visual";

  return (
    // pt-3: 헤더의 margin-top이 main 밖으로 상쇄돼 main 자체가 밀려나면서
    // min-h-dvh와 합쳐져 12px 스크롤이 생겼다. 패딩으로 상쇄를 막는다.
    <main style={shellStyle} className="relative min-h-dvh pt-3">
      {/* floating glass nav */}
      <header className="glass sticky top-3 z-30 mx-3 rounded-[16px] md:mx-6 md:top-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-5">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="처음으로" className="text-ink-3 transition-colors hover:text-ink">
              ←
            </Link>
            <a
              href={HOMEPAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SIRIAI 홈페이지"
              className="transition-opacity hover:opacity-70"
            >
              <SiriMark withWordmark={false} height={17} />
            </a>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="font-display text-[0.98rem] font-medium leading-none">
              {company.brand}
            </span>
            <span
              className="rounded-full px-2.5 py-1 font-display text-[0.58rem] font-medium hairline-sm"
              style={{ background: accent.tint, color: accent.deep }}
            >
              {segment.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Toggle mode={mode} onSwitch={switchTo} accent={accent.base} />
            <a
              href={INQUIRY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ink hidden rounded-full px-4 py-2 text-sm sm:inline-flex"
            >
              문의하기
            </a>
          </div>
        </div>
      </header>

      {/* view */}
      <div className="relative mt-3">
        {mode === "visual" ? (
          <VisualView segment={segment} company={company} />
        ) : (
          <ListView segment={segment} company={company} />
        )}
      </div>

      {/* wipe transition */}
      <AnimatePresence>
        {wiping && (
          <motion.div
            key="wipe"
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
            style={{ background: "var(--color-ink)" }}
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)", "inset(0 0 0 100%)"] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.95, times: [0, 0.45, 1], ease: [0.76, 0, 0.24, 1] }}
          >
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 0.95, times: [0, 0.3, 0.6, 1] }}
              className="font-display text-[clamp(2.5rem,8vw,6rem)] font-medium tracking-[-0.03em] text-paper"
            >
              {nextMode === "visual" ? "Visual" : "Data"}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* mobile sticky CTA */}
      <div className="glass sticky bottom-0 z-20 mx-3 mb-3 rounded-[14px] p-2 sm:hidden">
        <a
          href={INQUIRY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ink w-full justify-center rounded-full py-3 text-sm"
        >
          문의하기 →
        </a>
      </div>

      {/* conversion bridge — 리스트 모드에서만. 비주얼은 드래그 전용 풀스크린이라
          아래에 섹션이 붙으면 스크롤이 생겨 탐색 경험이 흐트러진다. */}
      {mode === "list" && (
      <section className="relative border-t border-line bg-paper">
        <div className="relative z-10 mx-auto flex min-h-[34vh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center md:px-12">
          <p className="kicker" style={{ color: accent.base }}>
            SIRIAI&nbsp;&times;&nbsp;{company.brand}
          </p>
          <BilingualLead
            className="mt-6 font-display text-[clamp(1.8rem,4vw,3rem)] leading-[1.06] tracking-[-0.025em]"
            lines={[
              { en: "The simplest way,", ko: "가장 쉬운 방법으로," },
              { en: "to the most inspired collaboration.", ko: "가장 감각적인 협업을 진행할 수 있습니다." },
            ]}
          />
          <p className="mx-auto mt-6 max-w-md text-[0.95rem] leading-relaxed text-ink-2 text-pretty">
            세그먼트에 맞춘 크리에이터 라인업과 비주얼·데이터 운영까지 — 시리아이(
            <span className="font-jp">しりあい</span>)가 한 팀처럼 움직입니다.
          </p>
          <a
            href={INQUIRY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ink mt-9 px-[1.5em] py-[0.86em] text-[max(13px,0.849vw)]"
          >
            캠페인 문의하기
            <svg viewBox="0 0 15 15" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
              <path
                d="M4 11L11 4M11 4H5.5M11 4V9.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
        <footer
          className="relative z-10 border-t border-line bg-paper py-6 text-center kicker"
          style={{ fontSize: 9 }}
        >
          SIRIAI — Creator Intelligence for Beauty · INTERCHARM 2026 · Booth&nbsp;C-24
        </footer>
      </section>
      )}
    </main>
  );
}

/* ── segmented toggle ────────────────────────────────────── */

function Toggle({
  mode,
  onSwitch,
  accent,
}: {
  mode: Mode;
  onSwitch: (m: Mode) => void;
  accent: string;
}) {
  const items: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "visual", label: "비주얼", icon: <GridIcon /> },
    { id: "list", label: "리스트", icon: <RowsIcon /> },
  ];
  return (
    <div className="relative flex rounded-full border border-line bg-white/45 p-1">
      {items.map((it) => {
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onSwitch(it.id)}
            className="relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8rem] transition-colors"
            style={{ color: active ? "#fff" : "var(--color-ink-2)" }}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId="toggle-pill"
                className="absolute inset-0 -z-10 rounded-full"
                style={{ background: accent }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            {it.icon}
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

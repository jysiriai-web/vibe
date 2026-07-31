"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Company, Segment } from "@/lib/types";
import VisualCanvas from "./VisualCanvas";

export default function VisualView({
  segment,
  company,
}: {
  segment: Segment;
  company: Company;
}) {
  const accent = segment.accent.base;
  const sectionRef = useRef<HTMLElement>(null);

  /* 사진 월이 뷰포트를 정확히 채우게 한다 — 하단 클로징 섹션이 비주얼 화면 안으로
     삐져나오지 않고, 스크롤 큐는 화면 하단에 딱 걸리도록.
     떠 있는 글라스 헤더 높이는 브레이크포인트·줄바꿈에 따라 달라지므로 실측한다. */
  const [wallH, setWallH] = useState<number | null>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setWallH(Math.max(420, Math.round(window.innerHeight - top)));
    };
    measure();
    window.addEventListener("resize", measure);
    const hdr = document.querySelector("header");
    const ro = hdr ? new ResizeObserver(measure) : null; // 헤더가 줄바꿈되면 재측정
    if (hdr && ro) ro.observe(hdr);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  /* 캔버스를 처음 잡는 순간 인트로 카드를 걷는다 — 사진 위에 계속 떠 있으면
     탐색을 가리고 혼란스럽다. (비주얼은 스크롤이 없으므로 드래그가 그 신호) */
  const [explored, setExplored] = useState(false);

  return (
    <section
      ref={sectionRef}
      /* calc()는 SSR·첫 페인트용 근사값, 이후 실측값(wallH)이 덮어쓴다 */
      className="relative h-[calc(100dvh-88px)] min-h-[420px] w-full overflow-hidden border-b border-line"
      style={wallH ? { height: wallH } : undefined}
    >
      <VisualCanvas
        items={segment.gallery}
        accent={accent}
        onInteract={() => setExplored(true)}
      />

      {/* floating intro — 드래그를 시작하면 사라진다.
          투명해진 뒤에도 포인터를 먹으면 드래그를 막으므로 이벤트도 같이 끈다. */}
      <div className="pointer-events-none absolute inset-0 z-[6] p-5 md:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={explored ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
          transition={{ duration: explored ? 0.45 : 0.8, ease: [0.22, 1, 0.36, 1] }}
          className={`glass-soft max-w-md rounded-[20px] p-6 md:p-7 ${
            explored ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          <p className="kicker" style={{ color: accent }}>
            {segment.kicker}
          </p>
          <h2 className="mt-4 whitespace-pre-line font-display text-[clamp(1.8rem,3.4vw,2.9rem)] font-medium leading-[1.04] tracking-[-0.022em] text-balance">
            {segment.headline}
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-ink-2 text-pretty">
            {segment.sub}
          </p>
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <span className="kicker">Curated for</span>
            <span className="font-display text-base font-medium">{company.brand}</span>
          </div>
        </motion.div>
      </div>

      {/* corner caption */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-[6] hidden md:block">
        <p className="kicker" style={{ fontSize: 10 }}>
          SIRIAI CREATOR NETWORK — DRAG TO EXPLORE
        </p>
      </div>

      {/* 스크롤 큐 없음 — 비주얼은 스크롤이 아니라 드래그로 탐색하는 화면이다.
          아래 클로징 섹션도 리스트 모드에서만 렌더된다(ExperienceShell). */}
    </section>
  );
}

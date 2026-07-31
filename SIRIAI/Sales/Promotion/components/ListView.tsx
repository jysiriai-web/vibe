"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import type { Company, Creator, Segment } from "@/lib/types";
import Donut from "./charts/Donut";
import Bars from "./charts/Bars";

const PAGE_SIZE = 20;

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export default function ListView({
  segment,
  company,
}: {
  segment: Segment;
  company: Company;
}) {
  const accent = segment.accent.base;

  const total = segment.creators.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const start = page * PAGE_SIZE;
  const pageRows = segment.creators.slice(start, start + PAGE_SIZE);

  return (
    /* 좌우 폭이 넉넉하므로 전체를 약 125%로 키운다 — 폭·타이포·여백·차트를
       실제 값으로 스케일업(zoom/transform은 흐려지고 레이아웃이 틀어진다). */
    <div className="mx-auto max-w-[90rem] px-8 pb-32 pt-12 md:px-16">
      {/* header */}
      <motion.header
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-8 border-b border-line pb-10 md:flex-row md:items-end md:justify-between"
      >
        <div className="max-w-3xl">
          <p className="font-display text-[0.8rem] font-medium hairline text-accent uppercase">
            {segment.kicker} · Intelligence Report
          </p>
          <h2 className="mt-5 font-display text-[clamp(2.1rem,3.6vw,3rem)] font-medium leading-tight tracking-[-0.022em] text-balance">
            {/* 조사 없이 잇는다 — 브랜드명의 35%가 영문으로 끝나 을/를을 확정할 수 없다
                (KOCOSTAR→"코코스타"인지 "코코스타알"인지 알 수 없음). */}
            {company.brand} 맞춤 크리에이터 라인업
          </h2>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft text-pretty">
            {segment.thesis}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="kicker">Total Reach</p>
          <p className="font-display text-5xl font-medium leading-none tnum">{segment.reach}</p>
        </div>
      </motion.header>

      {/* metrics */}
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-line bg-line md:grid-cols-4">
        {segment.metrics.map((m, i) => (
          <motion.div
            key={m.label}
            custom={i + 1}
            variants={fade}
            initial="hidden"
            animate="show"
            className="bg-paper p-7"
          >
            <p className="font-display text-[0.72rem] hairline-sm text-muted uppercase">{m.label}</p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="font-display text-[2.9rem] font-medium leading-none tnum">{m.value}</span>
              {m.unit && <span className="text-base text-ink-soft">{m.unit}</span>}
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              {m.delta && (
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[0.7rem] tnum"
                  style={{ background: segment.accent.tint, color: segment.accent.deep }}
                >
                  {m.delta}
                </span>
              )}
              <span className="text-[0.85rem] text-muted">{m.caption}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* charts */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <motion.div
          custom={5}
          variants={fade}
          initial="hidden"
          animate="show"
          className="rounded-[22px] border border-line bg-paper p-8"
        >
          <p className="mb-6 font-display text-[0.75rem] hairline-sm text-muted uppercase">
            콘텐츠 카테고리 믹스
          </p>
          <Donut data={segment.categories} accent={accent} />
        </motion.div>
        <motion.div
          custom={6}
          variants={fade}
          initial="hidden"
          animate="show"
          className="rounded-[22px] border border-line bg-paper p-8"
        >
          <p className="mb-6 font-display text-[0.75rem] hairline-sm text-muted uppercase">
            크리에이터 티어 분포
          </p>
          <Bars data={segment.followers} accent={accent} />
        </motion.div>
      </div>

      {/* roster table */}
      <motion.div
        custom={7}
        variants={fade}
        initial="hidden"
        animate="show"
        className="mt-6 overflow-hidden rounded-[22px] border border-line bg-paper"
      >
        <div className="flex flex-col gap-4 border-b border-line px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-[0.75rem] hairline-sm text-muted uppercase">
              추천 크리에이터 로스터
            </p>
            <p className="mt-1.5 font-mono text-[0.75rem] tnum text-muted">
              네트워크 {segment.metrics[0]?.value ?? "—"}명 · {total}인 선별 · {start + 1}–
              {Math.min(start + PAGE_SIZE, total)} 표시
            </p>
          </div>
          <button
            onClick={() => downloadRosterCsv(segment, company)}
            className="pill-glass self-start px-5 py-3 text-[0.92rem] sm:self-auto"
          >
            <DownloadIcon />
            Raw 데이터 (엑셀·CSV)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="font-display text-[0.72rem] hairline-sm text-muted uppercase [&>th]:px-8 [&>th]:py-4 [&>th]:font-normal">
                <th className="w-16">#</th>
                <th>크리에이터</th>
                <th>카테고리</th>
                <th className="text-right">팔로워</th>
                <th className="text-right">인게이지먼트</th>
                <th className="text-right">티어</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((cr) => (
                <Row key={cr.handle} cr={cr} accent={segment.accent} />
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 border-t border-line px-8 py-5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="font-mono text-[0.88rem] text-muted transition-colors hover:text-ink disabled:opacity-30"
              aria-label="이전 페이지"
            >
              ← 이전
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  aria-current={i === page ? "page" : undefined}
                  className="grid h-10 w-10 place-items-center rounded-full font-mono text-[0.88rem] tnum transition-colors"
                  style={
                    i === page
                      ? { background: accent, color: "#0a0a0a" }
                      : { color: "var(--color-ink-2)" }
                  }
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="font-mono text-[0.88rem] text-muted transition-colors hover:text-ink disabled:opacity-30"
              aria-label="다음 페이지"
            >
              다음 →
            </button>
          </div>
        )}
      </motion.div>

      <p className="mt-6 text-center font-display text-[0.72rem] hairline-sm text-muted uppercase">
        Data shown is a representative mock · 실데이터 연동 시 동일 구조로 자동 반영
      </p>
    </div>
  );
}

/** Build an Excel-openable CSV (UTF-8 BOM so Korean renders) of the full roster
    and trigger a client-side download. Zero dependencies. */
function downloadRosterCsv(segment: Segment, company: Company) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (cells: (string | number)[]) => cells.map(esc).join(",");

  // 추출 시각 (KST) — sv-SE 로케일이 "YYYY-MM-DD HH:mm" 형태를 준다
  const stamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace("T", " ");

  const meta = [
    row(["브랜드", company.brand]),
    row(["프로모션 코드", company.code]),
    row(["추출 시각", `${stamp} KST`]),
    "",
  ];

  const headers = row([
    "순위",
    "핸들",
    "인스타그램",
    "카테고리",
    "팔로워",
    "ER(%)",
    "예상 도달",
    "티어",
    "세그먼트",
  ]);

  const lines = segment.creators.map((c) => {
    const er = parseFloat(c.engagement) || 0;
    return row([
      c.rank,
      `@${c.handle}`,
      `https://instagram.com/${c.handle}`,
      c.category,
      c.followersRaw, // 정수 — 엑셀에서 정렬·합계 가능
      er, // "%" 제거한 숫자
      Math.round(c.followersRaw * (er / 100)), // 예상 도달 = 팔로워 × ER
      c.tier,
      segment.label, // 중립 브랜드면 "추천 라인업"이 들어간다
    ]);
  });

  const csv = "﻿" + [...meta, headers, ...lines].join("\r\n");
  const safe = (s: string) => s.replace(/[\\/:*?"<>|·]/g, "").replace(/\s+/g, "_");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SIRIAI_${safe(company.brand)}_크리에이터로스터.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Row({ cr, accent }: { cr: Creator; accent: Segment["accent"] }) {
  return (
    <tr className="border-t border-line-2 text-base transition-colors hover:bg-paper-2/70 [&>td]:px-8 [&>td]:py-4">
      <td className="font-mono text-sm tnum text-muted">{String(cr.rank).padStart(2, "0")}</td>
      <td>
        <div className="flex items-center gap-4">
          <Image
            src={cr.photo}
            alt={`@${cr.handle}`}
            width={56}
            height={56}
            quality={60}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-line"
            style={{ background: accent.tint }}
          />
          <span className="font-mono text-[1rem] text-ink">@{cr.handle}</span>
        </div>
      </td>
      <td className="text-ink-soft">{cr.category}</td>
      <td className="text-right font-mono text-sm tnum text-ink">{cr.followers}</td>
      <td className="text-right font-mono text-sm tnum text-ink">{cr.engagement}</td>
      <td className="text-right">
        <span
          className="rounded-[7px] px-2.5 py-1.5 font-display text-[0.7rem] font-medium hairline-sm uppercase"
          style={{ background: accent.tint, color: accent.deep }}
        >
          {cr.tier}
        </span>
      </td>
    </tr>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

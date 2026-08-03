// 회사 레지스트리 생성기 — 마스터시트 CSV → lib/companies.ts
//
// 사용법:
//   1) Google 시트를 CSV로 내보낸다 (파일 → 다운로드 → CSV).
//   2) node scripts/generate-companies.mjs <시트.csv> lib/companies.ts
//
// 컬럼 매핑·헤더행·분류규칙은 아래 CONFIG만 바꾸면 다른 이벤트/시트로 재사용 가능하다.
// (docs/CUSTOMIZE.md 의 "1. 회사 데이터" 참고)

import fs from "node:fs";

// ── 시트 구조 설정 (여기만 바꾸면 다른 시트에 맞출 수 있음) ─────────────
// 현재 기준: 마스터시트 `26년 8월` 탭 (일반 아웃바운드).
// 참고 — `26년 7월 (인터참)` 탭은 열이 다르다: gubun=D(3) brand=E(4) code=N(13)
//        contactEmail=L(11) contactName=I(8) instagram=H(7) phone=K(10)
const CONFIG = {
  headerRow: 8, // 헤더가 있는 행(1-based). 데이터는 그 다음 행부터.
  col: {
    // 0-based 열 인덱스 (A=0, B=1, …, X=23)
    gubun: 1, // B — 구분
    brand: 2, // C — 브랜드명
    code: 23, // X — 프로모션 코드
    email: 6, // G — 이메일       (없애려면 -1)
    contactEmail: -1, // 8월 탭엔 담당자 이메일 열이 따로 없음
    contactName: 7, // H — 담당자
    instagram: 5, // F — 인스타
    phone: 8, // I — 담당자 연락처
  },
  // 세그먼트 분류 규칙: 구분 문자열 → 세그먼트 키.
  // 8월 구분은 5버킷(스킨케어·색조·헤어바디·향수·이너뷰티) — "메이크업"은 안 쓴다.
  // 색조만 beauty, 나머지는 skincare 데이터를 쓰되 문구는 중립으로 나간다
  // (중립 판정은 lib/segments.ts 의 COPY_CONFIDENT_GUBUN 이 담당).
  segmentOf: (gubun) => (/색조|메이크업/.test(gubun) ? "beauty" : "skincare"),
};
// ──────────────────────────────────────────────────────────────

const SRC = process.argv[2];
const OUT = process.argv[3] || "lib/companies.ts";
if (!SRC) {
  console.error("사용법: node scripts/generate-companies.mjs <시트.csv> [출력경로]");
  process.exit(1);
}

let csv = fs.readFileSync(SRC, "utf8").replace(/^﻿/, "");

function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const t = (v) => (v || "").trim();
const at = (r, i) => (i >= 0 ? t(r[i]) : "");

// 자리표시자 브랜드명 → 포괄 명칭
const PLACEHOLDER = /^\(?\s*(unspecified|unknown|n\/?a|none|tbd|미상|없음|미정|확인필요)\s*\)?$/i;
function cleanBrand(raw) {
  const s = t(raw);
  if (!s || PLACEHOLDER.test(s)) return "브랜드";
  if (s.replace(/[^A-Za-z가-힣0-9]/g, "").length < 2) return "브랜드";
  return s;
}

const rows = parseCsv(csv);
const seen = new Set();
const recs = [];
for (const r of rows.slice(CONFIG.headerRow)) {
  const code = at(r, CONFIG.col.code);
  const brand = at(r, CONFIG.col.brand);
  if (!code || !brand || seen.has(code.toUpperCase())) continue;
  seen.add(code.toUpperCase());
  const gubun = at(r, CONFIG.col.gubun);
  recs.push({
    code,
    brand: cleanBrand(brand),
    segment: CONFIG.segmentOf(gubun),
    gubun,
    email: at(r, CONFIG.col.email),
    contactEmail: at(r, CONFIG.col.contactEmail),
    contactName: at(r, CONFIG.col.contactName),
    instagram: at(r, CONFIG.col.instagram),
    phone: at(r, CONFIG.col.phone),
  });
}
recs.sort((a, b) => a.code.localeCompare(b.code));

const q = (s) => JSON.stringify(s);
const body = recs
  .map((r) =>
    `  { code: ${q(r.code)}, brand: ${q(r.brand)}, segment: ${q(r.segment)}, gubun: ${q(r.gubun)}, email: ${q(r.email)}, contactEmail: ${q(r.contactEmail)}, contactName: ${q(r.contactName)}, instagram: ${q(r.instagram)}, phone: ${q(r.phone)} },`,
  )
  .join("\n");

const beauty = recs.filter((r) => r.segment === "beauty").length;
const withEmail = recs.filter((r) => r.email || r.contactEmail).length;

const out = `// AUTO-GENERATED — scripts/generate-companies.mjs 로 마스터시트에서 생성.
// 손으로 고치지 말 것. 총 ${recs.length}건 · beauty ${beauty} · skincare ${recs.length - beauty} · 이메일 ${withEmail}.
//
// ⚠️ 연락처(email 등)는 서버 데이터다. 이 파일은 서버에서만 import되며(lib/codes.ts),
//    개인화 페이지(클라이언트)로는 code/brand/segment/gubun 만 넘긴다.

export interface Company {
  code: string;
  brand: string;
  segment: "beauty" | "skincare";
  gubun: string;
  email?: string;
  contactEmail?: string;
  contactName?: string;
  instagram?: string;
  phone?: string;
}

export const COMPANIES: Company[] = [
${body}
];
`;

fs.writeFileSync(OUT, out, "utf8");
console.log(`wrote ${OUT} — total=${recs.length} beauty=${beauty} skincare=${recs.length - beauty} withEmail=${withEmail}`);

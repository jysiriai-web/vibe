import type {
  Segment,
  SegmentId,
  Creator,
  GalleryItem,
  CreatorTier,
  CreatorStatus,
  Metric,
} from "./types";
import { INFLUENCERS, POOL, type Influencer } from "./influencers";

/* ──────────────────────────────────────────────────────────────
   2 segments: 뷰티(색조) / 스킨케어.
   Roster + photo wall are built from real influencer handles & photos
   (lib/influencers.ts). Per-creator metrics are deterministic illustrative
   mock (the dashboard is labeled "representative") since the source list
   provides handles only.
─────────────────────────────────────────────────────────────── */

function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function fmtK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

const STATUSES: CreatorStatus[] = ["확정", "확정", "제안중", "협의중", "확정", "제안중", "협의중"];

/** One source of truth for a handle's mock metrics — the roster and the photo-wall
    hover cards both call this, so a creator shown in both places reads identically. */
function metricsForHandle(handle: string, cats: string[]) {
  const f = Math.round(8 + seed(handle) * 392) * 1000; // 8K–400K
  const e = 4 + seed(handle + "e") * 12; // 4–16%
  const tier: CreatorTier = f >= 280000 ? "MEGA" : f >= 120000 ? "MACRO" : f >= 45000 ? "MID" : "MICRO";
  const category = cats[Math.floor(seed(handle + "c") * cats.length) % cats.length];
  return { f, e, tier, category };
}

function buildSegmentData(list: Influencer[], cats: string[], rosterN: number, galleryN: number) {
  // roster
  const raw = list.slice(0, rosterN).map((inf) => {
    const m = metricsForHandle(inf.handle, cats);
    return {
      handle: inf.handle,
      photo: inf.photos[0] ?? "",
      category: m.category,
      f: m.f,
      engagement: m.e.toFixed(1) + "%",
      tier: m.tier,
    };
  });
  raw.sort((a, b) => b.f - a.f);
  const creators: Creator[] = raw.map((r, i) => ({
    rank: i + 1,
    handle: r.handle,
    photo: r.photo,
    category: r.category,
    followers: fmtK(r.f),
    followersRaw: r.f,
    engagement: r.engagement,
    tier: r.tier,
    status: STATUSES[i % STATUSES.length],
  }));

  // photo wall — first photo of each, then the rest; each tile carries the
  // handle's metrics so a hover reads as a data record
  const galleryItem = (id: string, src: string, handle: string): GalleryItem => {
    const m = metricsForHandle(handle, cats);
    return {
      id,
      src,
      handle,
      followers: fmtK(m.f),
      engagement: m.e.toFixed(1) + "%",
      tier: m.tier,
      category: m.category,
    };
  };
  const gallery: GalleryItem[] = [];
  list.forEach((inf) => {
    if (inf.photos[0]) gallery.push(galleryItem(inf.handle + "-0", inf.photos[0], inf.handle));
  });
  list.forEach((inf) =>
    inf.photos.slice(1).forEach((p, j) =>
      gallery.push(galleryItem(inf.handle + "-" + (j + 1), p, inf.handle)),
    ),
  );

  // headline aggregates (illustrative)
  const reach = fmtK(raw.reduce((s, r) => s + r.f, 0));
  const avgEng = raw.length ? (raw.reduce((s, r) => s + parseFloat(r.engagement), 0) / raw.length).toFixed(1) : "0";

  return {
    creators,
    gallery: gallery.slice(0, galleryN),
    reach,
    avgEng,
    count: list.length,
    followers: [
      { label: "MEGA", value: Math.max(1, raw.filter((r) => r.tier === "MEGA").length) },
      { label: "MACRO", value: Math.max(1, raw.filter((r) => r.tier === "MACRO").length) },
      { label: "MID", value: Math.max(1, raw.filter((r) => r.tier === "MID").length) },
      { label: "MICRO", value: Math.max(1, raw.filter((r) => r.tier === "MICRO").length) },
    ],
  };
}

const BEAUTY_CATS = ["메이크업", "립 / 틴트", "베이스", "아이", "컬러"];
const SKIN_CATS = ["스킨케어 루틴", "성분 리뷰", "더마", "클린뷰티", "트러블 케어"];

// roster now spans the full available network (paginated 20/page in the list view)
const bd = buildSegmentData(INFLUENCERS.beauty, BEAUTY_CATS, 100, 36);
const sd = buildSegmentData(INFLUENCERS.skincare, SKIN_CATS, 100, 36);

function metrics(d: ReturnType<typeof buildSegmentData>, poolCount: number, focus: Metric): Metric[] {
  return [
    { label: "네트워크 크리에이터", value: String(poolCount), unit: "명", caption: "매칭 가능 풀 규모" },
    { label: "로스터 합산 도달", value: d.reach, delta: `선별 ${d.creators.length}인`, caption: "선별 크리에이터 팔로워 합산" },
    { label: "평균 인게이지먼트", value: d.avgEng, unit: "%", caption: "선별 로스터 기준" },
    focus,
  ];
}

const beauty: Segment = {
  id: "beauty",
  label: "뷰티 · 색조",
  kicker: "SEGMENT — COLOR & MAKEUP",
  headline: "사랑받는 사람들과\n함께하세요.",
  sub: "색조 전문 크리에이터의 감각으로 발색·텍스처·무드를 가장 설득력 있게 보여줍니다.",
  thesis:
    "색조·메이크업 브랜드를 위한 크리에이터 라인업입니다. 발색과 무드를 직관적으로 전달하는 색조 전문 크리에이터로 신제품의 첫인상을 설계합니다.",
  // the brand ramp's burning core — 색조/메이크업 sits at its most saturated point
  accent: {
    base: "#e62e61",
    deep: "#ffd3df",
    soft: "rgba(230, 46, 97, 0.30)",
    tint: "rgba(230, 46, 97, 0.14)",
  },
  reach: bd.reach,
  metrics: metrics(bd, POOL.beauty, { label: "색조 콘텐츠 비중", value: "68", unit: "%", caption: "발색·GRWM·룩 중심" }),
  categories: [
    { name: "메이크업", pct: 42 },
    { name: "립 / 틴트", pct: 24 },
    { name: "베이스", pct: 18 },
    { name: "아이 / 컬러", pct: 16 },
  ],
  followers: bd.followers,
  creators: bd.creators,
  gallery: bd.gallery,
  ticker: ["COLOR & MAKEUP", `${POOL.beauty} CREATORS`, "발색 · 무드 · 텍스처", "GRWM", "색조 전문"],
};

const skincare: Segment = {
  id: "skincare",
  label: "스킨케어",
  kicker: "SEGMENT — SKINCARE & DERMA",
  headline: "사랑받는 사람들과\n함께하세요.",
  sub: "스킨케어 전문 크리에이터의 신뢰도로 효능·텍스처·루틴 메시지를 설득력 있게 전달합니다.",
  thesis:
    "스킨케어·더마 브랜드를 위한 신뢰 기반 라인업입니다. 루틴·성분 콘텐츠에 강한 크리에이터의 진정성으로 효능 메시지에 근거를 부여하고 재구매로 연결합니다.",
  // the ramp's warm edge — 스킨케어's calmer, trust-led register
  accent: {
    base: "#ffc70d",
    deep: "#ffeaa0",
    soft: "rgba(255, 199, 13, 0.30)",
    tint: "rgba(255, 199, 13, 0.14)",
  },
  reach: sd.reach,
  metrics: metrics(sd, POOL.skincare, { label: "루틴/성분 콘텐츠", value: "72", unit: "%", caption: "효능·텍스처 중심" }),
  categories: [
    { name: "스킨케어 루틴", pct: 38 },
    { name: "성분 리뷰", pct: 28 },
    { name: "더마 / 트러블", pct: 20 },
    { name: "클린뷰티", pct: 14 },
  ],
  followers: sd.followers,
  creators: sd.creators,
  gallery: sd.gallery,
  ticker: ["SKINCARE & DERMA", `${POOL.skincare} CREATORS`, "루틴 · 성분 · 효능", "TRUST", "스킨케어 전문"],
};

export const SEGMENTS: Record<SegmentId, Segment> = { beauty, skincare };

export function getSegment(id: SegmentId): Segment {
  return SEGMENTS[id];
}

/* ──────────────────────────────────────────────────────────────
   구분(시트 D열)이 비어 있는 브랜드 — 현재 493건 중 271건(55%).
   로스터/차트 데이터는 스킨케어 것을 그대로 쓰되, 브랜드의 카테고리를
   단정하는 노출 문구는 전부 중립으로 바꾼다. "스킨케어 브랜드를 위한…"이
   틀린 브랜드에게 그대로 나가면 부스에서 바로 신뢰를 잃기 때문.
─────────────────────────────────────────────────────────────── */
const NEUTRAL_COPY = {
  label: "추천 라인업",
  kicker: "SIRIAI — CURATED SELECTION",
  headline: "사랑받는 사람들과\n함께하세요.",
  sub: "브랜드의 감도에 맞는 크리에이터로 제품의 첫인상을 설득력 있게 설계합니다.",
  thesis:
    "브랜드의 감도에 맞춰 선별한 크리에이터 라인업입니다. 카테고리와 타깃을 공유해 주시면, 더 정밀하게 맞춘 라인업으로 다시 제안드립니다.",
} as const;

/** 회사에 맞는 세그먼트. 구분값이 없으면 노출 문구만 중립으로 덮어쓴다(데이터는 동일). */
export function getSegmentForCompany(company: { segment: SegmentId; gubun: string }): Segment {
  const base = getSegment(company.segment);
  if (company.gubun.trim()) return base;

  // 마지막 지표는 세그먼트 특화 문구("루틴/성분 콘텐츠")이므로 함께 중립화
  const metrics = base.metrics.map((m, i) =>
    i === base.metrics.length - 1
      ? { ...m, label: "핵심 콘텐츠 비중", caption: "선별 크리에이터 기준" }
      : m,
  );
  return { ...base, ...NEUTRAL_COPY, metrics };
}

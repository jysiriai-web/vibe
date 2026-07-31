// 재사용 브랜드 소싱 엔진 (프로필 구동) — 0_intake  · 표준형 v2 (Source→Verify)
// 사용법: profiles/<name>.json 을 읽어 Workflow의 args(실제 JSON 객체)로 넘긴다.
//   Workflow({ scriptPath: ".../0_intake/source_brands.workflow.js", args: <파싱한 profile> })
// 결과 final[]을 CSV(브랜드명,카테고리,인스타,근거)로 저장 → run.py --file --tab <target_tab> 로 시트 투입.
// 도메인 로직(무엇을 찾나)은 전부 profile에 있다. 이 파일은 "기계장치"만.
//
// 비대칭 세팅(정확도↑·낭비↓): 오케스트레이터(나)는 max로 똑똑하게, 워커는 Sonnet·medium로 싸게.
//   - finder(웹서치+추출): 검색이 일을 함 → max effort 불필요(머릿속 추측↑·환각↑·토큰낭비).
//   - verify(실존+인스타+ICP 재검색 확인): 정확도의 핵심 → 환각/동명혼동을 여기서 죽인다.
// 프로필에서 덮어쓰기: workerModel("sonnet"|"opus"), finderEffort, verifyEffort, verifyBatch.
export const meta = {
  name: 'source-brands',
  description: '프로필(args) 기반 신규 타깃 소싱: 니치별 병렬 웹서치 → skipList 중복제거 → 배치 병렬 실존검증. 도메인은 profile, 엔진은 범용.',
  phases: [
    { title: 'Source', detail: '프로필 니치별 병렬 웹 검색 (Sonnet·medium)' },
    { title: 'Verify', detail: 'skipList 중복제거 + 실존·인스타·ICP 재검색 검증 (Sonnet·medium)' },
  ],
}

let P = args || {}
if (typeof P === "string") { try { P = JSON.parse(P) } catch (e) { P = {} } }  // args 문자열화 방어
const NICHES = P.niches || []
const SKIP = P.skipList || []
const PER_NICHE = P.perNiche || "6~12"
const WORKER = P.workerModel || "sonnet"      // 워커는 기본 Sonnet (Opus 원하면 프로필에서 "opus")
const FINDER_EFFORT = P.finderEffort || "medium"
const VERIFY_EFFORT = P.verifyEffort || "medium"
const VB = P.verifyBatch || 12

if (!NICHES.length) {
  log("[중단] profile.niches 가 비어있음 — args 로 프로필을 넘겼는지 확인.")
  return { error: "no niches in profile", candidates: [] }
}

const RULES = [
  "신규 타깃 발굴 작업.",
  "대상 설명: " + (P.target || P.name || ""),
  "포함 기준(ICP): " + (P.include || ""),
  "제외 기준: " + (P.exclude || ""),
  "정확성: " + (P.accuracy || "실재하는 것만·웹검색 확인·출처 필수. 동명 타대상 혼동 금지. 지어내지 말 것."),
].join("\n")

const ITEM = {
  type: "object", additionalProperties: false,
  properties: {
    brand: { type: "string" }, category: { type: "string" },
    instagram: { type: "string" }, rationale: { type: "string" },
  },
  required: ["brand", "category", "instagram", "rationale"],
}
const CAND_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { niche: { type: "string" }, candidates: { type: "array", items: ITEM } },
  required: ["niche", "candidates"],
}
const FINAL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    candidates: { type: "array", items: ITEM },
    dropped: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { brand: { type: "string" }, reason: { type: "string" } },
        required: ["brand", "reason"],
      },
    },
  },
  required: ["candidates", "dropped"],
}

// ── Source: 니치별 병렬 웹 검색 ──────────────────────────────────────────────
phase('Source')
const found = (await parallel(NICHES.map(n => () =>
  agent(
    RULES + "\n\n=== 담당 니치 ===\n\"" + (n.label || n) + "\"\n이 니치에서 위 기준에 맞는 신규 후보를 웹 검색으로 " + PER_NICHE + "개 찾아라. ★진짜 메이저·대기업·글로벌 대형(롬앤·토코보·클리오 급)은 빼라 — 우리가 콜드로 발굴할 '중소 인디'(약간 알려진 정도는 OK)로, 신생 우선이되 연식에 집착 말 것. 단 실재하지 않는 이름을 지어내 칸 채우는 건 절대 금지(검증에서 다 걸러짐). 아래는 이미 확보됐으니 제외(중복 금지):\n" + (SKIP.join(", ") || "(없음)") + "\n각 후보를 {brand, category, instagram, rationale}. 반드시 웹 검색으로 실재 확인된 것만. 근거에 출처 한 줄 포함.\n★검색 예산 = 최대 " + (P.searchCap || 12) + "회. 확실한 후보가 모이면 즉시 반환하라. 완벽/추가 발굴을 위해 과검색하다 토큰 한도에 걸려 결과를 0으로 날리는 게 최악이다 — 적게라도 '반드시 반환'이 1순위.",
    { label: "source:" + (n.key || "n"), phase: 'Source', schema: CAND_SCHEMA, model: WORKER, effort: FINDER_EFFORT }
  )
))).filter(Boolean)

// 한·영 순서 무관 중복제거: 한글파트·영문파트를 각각 키로 추출해 둘 중 하나라도 겹치면 dup
//   "오드타입 (Oddtype)" 과 "Oddtype (오드타입)" 이 같은 키(오드타입·oddtype)를 공유 → 잡힘
const hangul = s => (s || "").replace(/[^가-힣]/g, "")
const latin = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
const keysOf = s => [hangul(s), latin(s)].filter((k, i) => k.length >= (i === 0 ? 2 : 3))
const seen = new Set()
SKIP.forEach(s => keysOf(s).forEach(k => seen.add(k)))
const isDup = s => keysOf(s).some(k => seen.has(k))
const addSeen = s => keysOf(s).forEach(k => seen.add(k))
const all = found.flatMap(r => r.candidates || [])
const deduped = []
for (const c of all) {
  if (c.brand && !isDup(c.brand)) { addSeen(c.brand); deduped.push(c) }
}
log("소싱 원본 " + all.length + " → skipList/중복 제거 후 " + deduped.length + " → 실존 검증")

if (!deduped.length) {
  return { profile: P.name || "(unnamed)", raw: all.length, afterDedup: 0, finalCount: 0, final: [], dropped: [] }
}

// ── Verify: 배치 병렬로 실존·인스타·ICP 재검색 검증 (환각/동명혼동 제거) ───────
phase('Verify')
const batches = []
for (let i = 0; i < deduped.length; i += VB) batches.push(deduped.slice(i, i + VB))

const VERIFY_PROMPT = RULES + "\n\n=== 실존 검증 (정확도 게이트) ===\n아래 후보 각각을 웹 검색으로 검증한다:\n" +
  "1) 실재? — 실제로 존재하는 브랜드인지 검색으로 확인. 확인 불가/근거 빈약하면 무조건 drop(보수적).\n" +
  "2) 인스타? — 핸들이 실제 그 브랜드 계정인지 확인. 틀리면 교정, 확인 불가면 빈칸(@ 없이). 지어내기 금지. 동명 타브랜드 계정 혼동 금지.\n" +
  "3) ICP? — 포함/제외 기준에 맞는지. 대기업·계열, 제외 카테고리, OEM/원료/B2B/디바이스면 drop.\n" +
  "4) ★'진짜 메이저·대기업'만 drop(핵심·균형) — 다음만 탈락: ⓐ누구나 아는 국민 메이저/베스트셀러(롬앤·토코보·클리오·페리페라·라카·디어달리아·토리든 급) ⓑ대기업·중견·상장사에 인수됐거나 계열(아모레·LG생건·애경·구다이 등) ⓒ글로벌 대형으로 이미 큰 곳. ★단 '인디인데 좀 알려진' 중소(예: 멜릭서·시오리스급)는 통과 — 연식(2021년 이전)만으로 자르지 말 것. 판단 기준은 '인플루언서 마케팅 콜드 영업이 먹힐 중소 인디인가'. 진짜 메이저만 확실히 drop하고, 중소 인디면 애매해도 통과(사용자가 검토함).\n" +
  "통과분만 candidates(카테고리 정규화, rationale에 출처 유지), 탈락은 dropped(brand,reason).\n후보(JSON):\n"

const verifiedBatches = await parallel(batches.map((b, i) => () =>
  agent(VERIFY_PROMPT + JSON.stringify(b),
    { label: 'verify:' + i, phase: 'Verify', schema: FINAL_SCHEMA, model: WORKER, effort: VERIFY_EFFORT })
))

// 배치 실패(세션한도·529 등) 시 그 배치는 미검증 상태로라도 보존 → 데이터 무손실 원칙 유지
const seen2 = new Set()
const final = [], dropped = []
verifiedBatches.forEach((r, i) => {
  const safe = r || { candidates: batches[i], dropped: [] }
  for (const c of (safe.candidates || [])) {
    if (c.brand && !keysOf(c.brand).some(k => seen2.has(k))) { keysOf(c.brand).forEach(k => seen2.add(k)); final.push(c) }
  }
  for (const d of (safe.dropped || [])) dropped.push(d)
})
log("검증 후 통과 " + final.length + " · 탈락 " + dropped.length)

return {
  profile: P.name || "(unnamed)",
  raw: all.length,
  afterDedup: deduped.length,
  finalCount: final.length,
  final,
  dropped,
}

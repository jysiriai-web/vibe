// 회사/브랜드의 공식 인스타그램 핸들 확보 (출처 검증) — 인터참 대상용
// args = { items:[{company,website}], batch?, workerModel?, effort? }
// 출처로 그 브랜드 공식 계정임을 확인된 핸들만. 동명 타계정·추측 금지 → 못 찾으면 notfound/uncertain.
export const meta = {
  name: 'find-instagram',
  description: '회사/브랜드 공식 인스타 핸들을 웹검색으로 확보(출처 검증·동명계정 금지). 못 찾으면 빈칸.',
  phases: [{ title: 'Instagram', detail: '배치 병렬 공식 IG 핸들 확보' }],
}
let P = args || {}
if (typeof P === "string") { try { P = JSON.parse(P) } catch (e) { P = {} } }
const ITEMS = P.items || []
const BATCH = P.batch || 8
const MODEL = P.workerModel || "sonnet"
const EFFORT = P.effort || "medium"
if (!ITEMS.length) { log("[중단] items 비어있음"); return { error: "no items", results: [] } }

const RULES =
`INTERCHARM 참가 한국 뷰티 브랜드/회사의 '공식 인스타그램 핸들'을 웹검색으로 확보한다. 정확도 최우선:
- 그 브랜드의 공식 IG만. 공식 웹사이트에서 링크된 계정·공식이 명시된 계정·팔로워/내용으로 그 브랜드임이 분명한 계정만 채택.
- @ 없이 핸들만(예: dinto_official). 확인 불가·동명 타계정 충돌·계정 없음이면 instagram 빈칸 + status=notfound(없음)/uncertain(불확실). 추측·생성 절대 금지.
- 운영사(법인) 계정보다 소비자 '브랜드' 계정 우선. website가 주어지면 그 사이트에서 IG 링크 먼저 확인.
각 회사를 {company, instagram, status, source, note}로 반환. company는 입력과 동일하게.`

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          company: { type: "string" },
          instagram: { type: "string" },
          status: { type: "string", enum: ["found", "notfound", "uncertain"] },
          source: { type: "string" },
          note: { type: "string" },
        },
        required: ["company", "instagram", "status", "source", "note"],
      },
    },
  },
  required: ["results"],
}

phase('Instagram')
const batches = []
for (let i = 0; i < ITEMS.length; i += BATCH) batches.push(ITEMS.slice(i, i + BATCH))
const res = await parallel(batches.map((b, i) => () =>
  agent(RULES + "\n\n회사 목록(JSON):\n" + JSON.stringify(b),
    { label: 'ig:' + i, phase: 'Instagram', schema: SCHEMA, model: MODEL, effort: EFFORT })
))
const out = []
res.forEach((r, i) => {
  if (r && r.results) out.push(...r.results)
  else batches[i].forEach(it => out.push({ company: it.company, instagram: "", status: "failed", source: "", note: "배치 실패 — 재실행" }))
})
const tally = {}
out.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1 })
log("IG 처리 " + out.length + " · " + JSON.stringify(tally))
return { count: out.length, tally, results: out }

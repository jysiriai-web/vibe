// 브랜드 공식 홈페이지 + 공식 인스타 확보·검증 (출처=공식사이트 footer 확인) — 1_collect
// args = { items:[{company,current_ig,current_homepage}], batch?, workerModel?, effort?, searchCap? }
// 검증 방식(사용자 승인, 2026-06-22): 공식 사이트에서 링크된 계정/콘텐츠 일치 확인된 것만. 동명(특히 동남아/중동 일반인)·추측 금지. 못 믿으면 빈칸.
export const meta = {
  name: 'collect-assets',
  description: '브랜드별 공식 홈페이지+인스타를 웹검색으로 확보·검증(공식사이트 footer 확인·못 믿으면 빈칸). 배치 병렬.',
  phases: [{ title: 'Collect', detail: '배치 병렬 홈페이지·인스타 확보·검증' }],
}
let P = args || {}
if (typeof P === "string") { try { P = JSON.parse(P) } catch (e) { P = {} } }
const ITEMS = P.items || []
const BATCH = P.batch || 6
const MODEL = P.workerModel || "sonnet"
const EFFORT = P.effort || "medium"
const CAP = P.searchCap || 4   // 브랜드당 검색 예산 (과검색 금지 → 빨리 반환 → 한도 전 완료)
if (!ITEMS.length) { log("[중단] items 비어있음"); return { error: "no items", results: [] } }

const RULES =
`각 브랜드의 '공식 홈페이지'와 '공식 인스타그램'을 웹검색으로 확보·검증한다. 정확도 최우선:
- 홈페이지 = 그 브랜드 자체 공식몰/사이트(자사 도메인) 우선. ★자사몰이 전혀 없고 플랫폼 입점(올리브영·무신사·29CM·스마트스토어·자사 미운영)만이 유일한 공식 판매처면, 그 플랫폼의 '브랜드관/스토어/상세페이지' URL을 fallback으로 기입(빈칸보다 나음). 단순 기사·블로그·리뷰 ✗. 그래도 없으면 빈칸.
- 인스타 = ①공식 사이트 footer/SNS 링크에 있는 계정, 또는 ②계정 내용이 그 브랜드임이 분명한 계정만. current_ig가 주어지면 그게 그 브랜드 공식인지 검증 → 맞으면 confirmed, 틀리면 corrected. ★동명 타계정(특히 동남아/중동/일반인 계정)·추측 절대 금지. 확인 못 하면 빈칸+uncertain.
- 핸들은 @ 없이 핸들만(예: dinto_cosmetic). 홈페이지는 도메인(예: dinto.co.kr).
- 공식 채널이 2개 이상 명백히 유효하면(예: 자사몰+대표 입점관, 또는 명백한 공식 IG 2개) 두 값을 개행(줄바꿈)으로 구분해 한 필드(homepage 또는 instagram)에 함께 기입 가능. 애매하면 1개만.
- 검색은 브랜드당 ${CAP}회 이내로 절제. 과검색하다 한도로 결과 0 되는 것보다 적게라도 반드시 반환이 1순위.
각 브랜드를 {company, homepage, instagram, status, source} 로 반환. company는 입력과 동일하게.`

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          company: { type: "string" }, homepage: { type: "string" }, instagram: { type: "string" },
          status: { type: "string", enum: ["found", "confirmed", "corrected", "uncertain"] },
          source: { type: "string" },
        },
        required: ["company", "homepage", "instagram", "status", "source"],
      },
    },
  },
  required: ["results"],
}

phase('Collect')
const batches = []
for (let i = 0; i < ITEMS.length; i += BATCH) batches.push(ITEMS.slice(i, i + BATCH))
const HINT = P.hint ? "\n" + P.hint : ""
const res = await parallel(batches.map((b, i) => () =>
  agent(RULES + HINT + "\n\n브랜드 목록(JSON):\n" + JSON.stringify(b),
    { label: 'collect:' + i, phase: 'Collect', schema: SCHEMA, model: MODEL, effort: EFFORT })
))
const out = []
res.forEach((r, i) => {
  if (r && r.results) out.push(...r.results)
  else batches[i].forEach(it => out.push({ company: it.company, homepage: "", instagram: "", status: "failed", source: "배치 실패" }))
})
const tally = {}
out.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1 })
log("자산수집 " + out.length + " · " + JSON.stringify(tally))
return { count: out.length, tally, results: out }

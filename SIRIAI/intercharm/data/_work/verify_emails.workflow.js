// 회사 리스트의 공식 컨택 이메일 확보·검증 (출처 필수) — 인터참/1_collect 공용
// args = { items:[{company,website,current_email,tier,confidence,reason}], batch?, workerModel?, effort? }
// 빈칸=찾고, 저신뢰=검증/교정. 배치별 독립 → 끊겨도 완료 배치는 결과에 보존(데이터 무손실).
export const meta = {
  name: 'verify-emails',
  description: '회사 리스트의 공식 컨택 이메일을 웹검색으로 확보/검증(출처 필수·도메인 일치). 빈칸=확보, 저신뢰=확인/교정.',
  phases: [{ title: 'Verify', detail: '배치 병렬 이메일 확보·검증 (출처 필수)' }],
}

let P = args || {}
if (typeof P === "string") { try { P = JSON.parse(P) } catch (e) { P = {} } }
const ITEMS = P.items || []
const BATCH = P.batch || 8
const MODEL = P.workerModel || "sonnet"
const EFFORT = P.effort || "medium"

if (!ITEMS.length) { log("[중단] items 비어있음"); return { error: "no items", results: [] } }

const RULES =
`INTERCHARM KOREA 참가사의 '실제 그 회사에 닿는 공식 컨택 이메일'을 확보/검증한다. 정확도 최우선 — 틀린 메일·딴 회사 메일은 절대 금지(과거 동명/운영사 혼동으로 오귀속 사고 있었음).
규칙:
- 모든 이메일은 웹 검색으로 확인하고 source(출처 URL) 필수. 출처로 그 회사 것임을 확인 못하면 found/confirmed 처리 금지.
- 도메인 점검: 이메일 도메인이 그 회사 공식 웹사이트 도메인과 일치하면 신뢰↑. gmail/naver 등 범용 도메인은 공식 출처(자사몰 footer·사업자정보·디렉터리)에서 그 회사 것임을 확인된 경우만 허용.
- current_email 있으면: 그게 그 회사 실제 컨택인지 검증 → 맞으면 status=confirmed(email 유지), 틀리면 status=corrected(정확한 email로 교체).
- current_email 빈칸이면: 공식 컨택 이메일을 찾아 status=found.
- 확인 불가·애매·동명 충돌이면: 추측 금지 → status=uncertain(email은 current 유지 또는 빈칸), note에 사유.
- 회사 식별은 회사명+웹사이트로 확정(동명 타사 금지).
각 회사를 {company, email, status, source, note}로 반환. company는 입력과 동일하게.`

const DEEP = P.deep ? "\n\n[심층 탐색 모드] 1차 검색에서 공식 이메일을 못 찾았거나 빈칸인 곳들이다. 자사몰 footer 외에 추가 출처를 적극 동원하라: ①사업자정보(bizno.net·나이스기업정보·웰컴) ②잡코리아/사람인/원티드 채용공고의 담당자 메일 ③INTERCHARM 공식 전시사 디렉터리 상세페이지(intercharmkorea.com) ④영문명·대표자명·사업자등록번호 역검색 ⑤전화번호로 회사 특정 후 도메인 추정 확인. 그래도 공식 출처로 그 회사 것임을 확인 못 하면 uncertain 유지(추측 절대 금지)." : ""

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          company: { type: "string" },
          email: { type: "string" },
          status: { type: "string", enum: ["confirmed", "corrected", "found", "uncertain", "notfound"] },
          source: { type: "string" },
          note: { type: "string" },
        },
        required: ["company", "email", "status", "source", "note"],
      },
    },
  },
  required: ["results"],
}

phase('Verify')
const batches = []
for (let i = 0; i < ITEMS.length; i += BATCH) batches.push(ITEMS.slice(i, i + BATCH))

const res = await parallel(batches.map((b, i) => () =>
  agent(RULES + DEEP + "\n\n회사 목록(JSON):\n" + JSON.stringify(b), {
    label: 'verify:' + i, phase: 'Verify', schema: SCHEMA, model: MODEL, effort: EFFORT,
  })
))

const out = []
res.forEach((r, i) => {
  if (r && r.results) { out.push(...r.results) }
  else {                                  // 배치 실패(한도/오류) → 미처리 표시(재실행용), 원본 보존
    batches[i].forEach(it => out.push({
      company: it.company, email: it.current_email || "", status: "failed",
      source: "", note: "배치 실패 — 재실행 필요",
    }))
  }
})

const tally = {}
out.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1 })
log("이메일 처리 " + out.length + " · " + JSON.stringify(tally))
return { count: out.length, tally, results: out }

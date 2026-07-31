# Cluster: areas

## Report

## SIRIAI V2 → V3 Business Areas — Source Extraction Report

This report extracts the BUSINESS AREAS (사업분야) structure from the SIRIAI V2 source folder so it can be rebuilt as a V3 interactive page. All Korean copy and numbers below are quoted verbatim from source and can be reused as-is.

---

### 1. TOP-LEVEL BUSINESS AREAS (사업분야) — exact set, names, subtitles, order

The canonical top-level structure is **4 areas**, confirmed across three source files that agree with each other:
- `사업분야 정리.txt` (the index/skeleton)
- `01_내용/건진_정보.md` §3 "4분야 (준용 막간 설명 + 카피 초안)"
- `_보관/골격_v1.md` §3 (영역별 깊이) and the 한눈 목차 (IA)

The `사업분야 정리.txt` file lists the raw numbered headings:
```
01. architecture
02. Visual Contents   (▶ glabal seeding / ▶ Korean seeding / ▶ model styling / ▶)
03. Software Engineering
04. Private Brand
```

The richer, deck-facing naming (from `건진_정보.md` §3 and `골격_v1.md`) maps these to the 4 areas as presented. The ORDER is **01 → 02 → 03 → 04**:

| # | Korean name (deck-facing) | English / subtitle | Raw heading in 사업분야 정리.txt |
|---|---|---|---|
| **01** | **아키텍팅** ("우리가 일하는 방식") | architecture | `01. architecture` |
| **02** | **비주얼 콘텐츠** = **인플루언서 비즈니스** | Visual Contents | `02. Visual Contents` |
| **03** | **sa:ai** ("소프트웨어 비즈니스") | Software Engineering | `03. Software Engineering` |
| **04** | **PB (Private Brand)** | Private Brand | `04. Private Brand` |

**IMPORTANT correction to the task's premise:** The task said "area #1 is 인플루언서 비즈니스" and asked to confirm #2/#3/#4. The source does NOT make 인플루언서 비즈니스 the #1 area. In the source:
- **#1 (01) is 아키텍팅 / architecture** — "틀 없이 니즈를 해결하는 problem solver 집단. 기초 설계~완성~실행 A to Z."
- **인플루언서 비즈니스 IS the #2 area (02 비주얼 콘텐츠).** Source quote: *"02 비주얼 콘텐츠 = 인플루언서 비즈니스(단, '대행사/실행사' 프레임 거부 → 다른 단어). deck의 심장 · 매출 키 비즈니스."*

So the hypotheses partly hold: #2 = Visual Contents (= 인플루언서 비즈니스), #3 = sa:ai (AI), #4 = Private Brand/PB. But area numbering is shifted: **인플루언서 비즈니스 = #2, not #1.** If V3 intends to lead with 인플루언서 비즈니스 as area #1, that is a V3 re-ordering decision, not what V2 source says.

The `골격_v1.md` 한눈 목차 confirms the four-card index order explicitly: *"4영역(아키텍팅·비주얼콘텐츠·sa:ai·PB)을 한 화면에 카드/인덱스로."*

---

### 2. PER-AREA DETAIL (status, subtitle, key messages, numbers, process)

#### 01 — 아키텍팅 (architecture) — STATUS: thin / mostly placeholder
- **Subtitle/one-line:** "우리가 일하는 방식" — *"당신이 놓친 건 예산이 아니라, 비어 있는 '자리'."* (카피 초안)
- **Key messages:** "틀 없이 니즈를 해결하는 problem solver 집단. 기초 설계~완성~실행 A to Z." Differentiator example: "틈결 = 진행이력 없던 프로젝트를 기획·완수 → 플랫폼 기반 인플루언서 업체가 못하는 근간."
- **Numbers/process:** None specific in source. 골격_v1 says *"짧고 강하게."*
- **Status:** No dedicated detail txt file. Exists only as copy notes in 건진_정보.md/골격_v1.md → treat as **coming_soon / thin** (headline + one line only).

#### 02 — 비주얼 콘텐츠 / 인플루언서 비즈니스 — STATUS: READY (the richest area, "the heart" / 심장)
This is the only area with full, ready-to-ship content. It contains sub-services. Source: *"deck의 심장 · 매출 키 비즈니스 · 정보 풍부하되 고급 브랜딩 필수. 국내(시딩·릴스·오프라인·매거진)/해외(글로벌시딩·美틱톡UGC·박람회). 후불제·리스크0·검수."* Headline copy: *"가입자 풀이 아니라, 당신께 맞는 사람을."*

The detail screen layouts (상세화면 구성안) are written for the two seeding services. Below are the ready sub-services:

**02-A — korea seeding (국내 시딩) — READY**
- **Intro title:** "맞는 사람을, 매번 새로 찾습니다"
- **Body:** "시리아이의 국내 시딩은 이미 등록된 인플루언서 풀을 돌려쓰지 않습니다. 캠페인마다 브랜드의 목적과 결에 가장 잘 맞는 사람을 그때그때 새로 선별해 연결합니다."
- **무엇이 다른가 (title):** "풀에서 고르는 게 아니라, 결을 읽고 발굴합니다" — "같은 리스트를 반복 제안하지 않습니다."
- **선별 기준 (title):** "브랜드가 원하는 조건으로, 정밀하게" — criteria: 성별 / 연령대 / ER 등 인게이지먼트 지수 / 감도·무드 / 주 타깃층. Examples verbatim:
  - "10~20대 여성 / 팔로워 3천 이상 / 비포&애프터 가능 / 피부 표현이 깨끗한"
  - "30~40대 워킹맘 / 팔로워 1만 이상 / 단가 40만 원대 / 머릿결이 좋은"
- **리스트 제공 (title):** "1.5~2배수 리스트로, 충분한 선택지 안에서" — "추려진 후보는 최종 진행 수량의 약 **1.5~2배수** 리스트로 제공됩니다. 브랜드가 직접 하는 일은 리스트 컨펌과 제품 발송까지이며, 이후 콘텐츠 업로드 관리와 진행 점검은 시리아이가 전담합니다."
- **진행 프로세스 (6단계):** "브랜드 소통 → 조건 기반 선별 → 1.5~2배수 리스트 제공 → 컨펌·발송 → 업로드 전담 관리 → 정산·보고서" (rendered in 이미지_05_진행프로세스.svg with step 05 "업로드 전담 관리" highlighted)
- **Note:** korea seeding 폴더에 아직 캡처가 없음 → 실제 컷 수집 필요. Diagrams 02·05 are designed (SVG), not photos.

**02-B — global seeding (글로벌 시딩) — READY (most number-rich)**
- **Intro title:** "세계 곳곳의 진짜 후기로, 데뷔합니다" — "총 **75개국**을 대상으로, 각 나라의 SNS 문화에 맞춰 현지 인플루언서가 진짜 사용 후기를 만들도록 설계."
- **규모·커버리지 (title):** "**75개국, 12개 이상의 플랫폼**" — "TikTok·Instagram·YouTube·샤오홍슈 등 **12개 이상**의 콘텐츠 플랫폼 위에서, **나노 인플루언서**를 중심으로 숏폼 시딩." (SVG 이미지_커버리지.svg renders: 75개국 / 12+ 콘텐츠 플랫폼 / 나노 중심; platform pills TikTok·Instagram·YouTube·샤오홍슈·외 다수)
- **콘텐츠 타입 (title):** "원하는 결로, 정확히 지정해서" — types: **리뷰·튜토리얼·챌린지·비포&애프터**; 지정 가능: 성별·연령·국가·콘텐츠 타입.
- **플랜 (title):** "두 가지 플랜, 최소 수량 제한 없이"
  - **Standard** 플랜 = **ENGAGE+ 이상** 등급, **1건당 5만 원**
  - **Premium** 플랜 = **ENGAGE++ 이상** 등급, **1건당 10만 원** (일부 국가 상이)
  - 최소 수량 제한 없음; 콘텐츠 IP(2차 활용권)는 별도 구매.
  - ⚠️ **PRICING DISPLAY RULE:** "단가(5만/10만)는 deck 비노출 — 내부 자료에만. 화면엔 '두 플랜·최소수량 없음'까지만." (So V3 should show two plans + "최소 수량 제한 없음" but NOT the 5만/10만 figures.)
- **진행 프로세스 (6단계):** "계약 → 1.5배수 리스트 제공 → 컨펌·발송 → 업로드 전담 관리 → 완료 기준 정산 → 실시간 보고서" (SVG 이미지_프로세스.svg; note global uses **1.5배수**, korea uses **1.5~2배수**)
- **차별점 (title):** "매칭을 넘어, AI와 현지화로" — "AI 기반 인게이지먼트 분석과 글로벌 현지화 전략으로 브랜드와 고객의 연결 가능성을 실질적으로 확장." (links to 03 sa:ai)
- **Other key numbers (from 건진_정보.md §2):** Global Seeding = **75개국·120,000 큐레이터·12+ 플랫폼**; 단일 캠페인 제공 최대 **200**; 업로드율 **100%**; NCT 일본 댄스챌린지 **55건**; ZB1 북미 TOP5.

**02-C — model styling — READY (short)**
- 모듈형: "**1단계부터 3단계까지 모듈형으로 선택**" (모델 섭외만 / 기획만 / 촬영까지 일괄 위탁). "전체 서비스를 함께 이용할 경우 할인 적용."

**02-D — 기타 (other 02 sub-services) — READY (short copy each):**
- **YouTube campaign:** 영상 기반 깊이 전달. 과금 = "**진행비용 기준 15%의 커미션 체계**", 고정 단가 없음, 콘텐츠 1건 단위, 일정 금액 이상부터 별도 패키지. 데이터 기반 크리에이터 선별, 효율 낮은 크리에이터 제외.
- **라이브 커머스:** 제작사 **스튜디오 온일칠공(ON170)** 협력. "**누적 3,500회 이상 방송 제작 경험**." 채널: **네이버·카카오·11번가·그립**. 촬영 방식: **홈라이브 / 스튜디오 라이브 / 출장 라이브**. 목적별(매출 중심/브랜딩 중심) 기획형 라이브 패키지. 부가: 시청자 유입·바이럴·타게팅 광고·채팅 서포터즈.
- **브랜드 콘텐츠 제작 (브랜디드):** 제품을 감각적·정제된 방식으로 시각화. 신발·라이프스타일 소품·패션 잡화·테크 기기 중심. 광고용/자사몰 썸네일/SNS 업로드. 조명·연출·소품·촬영 스타일을 브랜드 콘셉트로.
- **인스타 콘텐츠 제작:** 시즌 무드·제품 사용 맥락·키비주얼 연출. AI 생성 이미지·모션·숏폼 혼합. 모델 착용 컷·키비주얼형·이벤트 그래픽. **월간 단위 정기 운영** 가능. 브랜드는 제품 이미지+콘셉트 가이드만 전달.

#### 03 — sa:ai (Software Engineering / 소프트웨어 비즈니스) — STATUS: thin / placeholder (no dedicated detail file)
- **Definition (건진_정보.md §3):** "8division 개발팀 분사가 뿌리. **모든 SNS/플랫폼 콘텐츠를 아카이빙하는 솔루션** — 브랜드용(발행 콘텐츠 효과·감도·생존 추적) + 개인용(플랫폼 무관 내가 본 콘텐츠 원큐 저장 = 콘텐츠 라이브러리)."
- **figma 3축:** **Performance · Creative · Archivo** / tagline "**Creators remember us. Connection, accelerated.**" / 카피 축 "관계→데이터→기록".
- **Numbers/process:** None. 골격_v1: *"제품답게."* Generative-AI integrations mentioned: Sora·Gemini·DALL·E·Midjourney.
- **Status:** No content txt/상세화면 구성안 file → **coming_soon / in-progress**. global seeding 차별점 블록reserves "sa:ai 분석 화면 자리 (03 sa:ai와 연계)".

#### 04 — PB (Private Brand) — STATUS: coming_soon (explicitly "준비중")
- **Source (건진_정보.md §3):** "**준비중** (대표 김동현 전담 · **6/10** · **필름/디스플레이** · 피보팅). 신비·여백·실루엣·**2026**으로 암시. (상투어 X)."
- **골격_v1:** "2026·필름/디스플레이 · 실루엣·여백으로 신비. 가장 절제."
- **구조.md §2:** "04 PB는 헤드+한 줄로 성립(클릭 깊이 얕게)."
- ⚠️ Brand rule: NO 상투어 — do NOT write "Coming soon / 곧 / 준비중" literally; imply via silhouette/whitespace/"2026".

---

### 3. Relationship: 인플루언서 비즈니스 ↔ visual contents / seeding (korea/global)

**Seeding is a SUB-SERVICE inside the 인플루언서 비즈니스 area, not a separate top-level area.** The source equates the two at the area level and nests seeding under it:

- `건진_정보.md` §3: *"02 비주얼 콘텐츠 = 인플루언서 비즈니스 ... 국내(시딩·릴스·오프라인·매거진)/해외(글로벌시딩·美틱톡UGC·박람회)."* → So **국내 시딩 (korea seeding)** and **글로벌 시딩 (global seeding)** are the domestic/overseas seeding sub-services of the single area "02 비주얼 콘텐츠 = 인플루언서 비즈니스."
- `사업분야 정리.txt` structurally nests them: `02. Visual Contents` has bullet children `▶ glabal seeding`, `▶ Korean seeding`, `▶ model styling`.
- The 상세화면 구성안 files describe what unfolds **when you click the seeding service inside the 02 area** ("이 서비스를 deck에서 클릭했을 때 펼쳐지는 '상세 화면'").
- `구조.md` row 3: "02는 공간 가장 큼 (국내/해외·프로세스·케이스 多)" and uses a layered pattern (surface card → click detail) with "02 내부는 국내/해외/케이스 탭 or 가로 흐름."

**Naming caution:** The brand explicitly **rejects the '대행사/실행사' (agency) frame** for this area — "'대행사/실행사' 프레임 거부 → 다른 단어." So while it IS the influencer business, V3 should avoid agency-vendor wording.

---

### 4. Candidate Q&A (client questions) per area, answers drawn from source

**02 인플루언서 비즈니스 / 시딩 (most important):**
- **Q: 어떤 인플루언서를 어떻게 골라주나요? (차별점/리스트 제공)** A: 등록된 풀을 돌려쓰지 않고, 캠페인마다 결을 읽어 새로 발굴. 성별·연령대·ER·감도·무드·주 타깃 조건으로 좁혀 **최종 진행 수량의 약 1.5~2배수 리스트**로 제공 (글로벌은 1.5배수).
- **Q: 우리가 직접 해야 하는 일은 어디까지인가요?** A: "브랜드가 직접 하는 일은 **리스트 컨펌과 제품 발송까지**이며, 이후 콘텐츠 업로드 관리와 진행 점검은 시리아이가 전담."
- **Q: 비용은 어떻게 정산되나요? (리스크/후불)** A: "콘텐츠는 **업로드 완료 기준으로 정산**되어 비용 손실을 최적화." (= 후불제·리스크0; 업로드분만 청구.) ⚠️ 글로벌 단가 5만/10만은 deck 비노출.
- **Q: 성과 보고/리포팅은?** A: "**실시간으로 확인 가능한 온라인 보고서**를 통해 캠페인 성과를 추적." 프로세스 마지막 단계 = 정산·보고서 / 실시간 보고서.
- **Q: 타임라인/프로세스는?** A: 6단계 — (국내) 브랜드 소통 → 조건 기반 선별 → 1.5~2배수 리스트 → 컨펌·발송 → 업로드 전담 관리 → 정산·보고서. (해외) 계약 → 1.5배수 리스트 → 컨펌·발송 → 업로드 전담 관리 → 완료 기준 정산 → 실시간 보고서.
- **Q: 콘텐츠 2차 활용(IP)은 가능한가요?** A: "콘텐츠 IP(**2차 활용권**)는 별도 구매를 통해 확보." (글로벌 시딩)
- **Q: 해외도 되나요? 어디까지?** A: "총 **75개국** 대상, **TikTok·Instagram·YouTube·샤오훙슈 등 12개 이상** 플랫폼, **나노 인플루언서** 중심 숏폼." 콘텐츠 타입(리뷰·튜토리얼·챌린지·비포&애프터)과 성별·연령·국가·타입 지정 가능. AI 기반 인게이지먼트 분석 + 글로벌 현지화 전략.
- **Q: 최소 수량 있나요?** A: "두 플랜 모두 **최소 수량 제한 없이** 유연하게 운영." 

**01 아키텍팅:** Q: 뭘 하는 팀인가요? A: 틀 없이 니즈를 해결하는 **problem solver 집단**, 기초 설계~완성~실행 A to Z (진행이력 없던 프로젝트도 기획·완수).

**03 sa:ai:** Q: 어떤 솔루션인가요? A: 모든 SNS/플랫폼 콘텐츠를 아카이빙하는 솔루션 — 브랜드용(효과·감도·생존 추적) + 개인용 콘텐츠 라이브러리. 3축 Performance·Creative·Archivo. (제품 상세는 아직 미확정/준비중.)

**04 PB:** Q: 자체 브랜드가 있나요? A: 2026 전개 예정, 필름/디스플레이 방향 (대표 직접 전담, 준비중) — deck에서는 상투어 없이 절제된 암시로만.

---

### 5. Image / SVG / asset filenames and what they depict

**Designed SVG diagrams (Paper #F3EEE2 / Ink #211A33 / lavender #5a4a85 / JetBrains Mono labels — on-brand, ready to embed):**
- `korea seeding/이미지_02_무엇이다른가.svg` — Left vs right comparison: "기존 방식: 등록된 풀에서 고른다 / 캠페인마다 같은 리스트 반복" vs "SIRIAI 국내 시딩: 조건을 읽고 매번 새로 발굴" with condition pills (성별·연령·ER·감도·타겟).
- `korea seeding/이미지_05_진행프로세스.svg` — Korea 6-step horizontal process (01 브랜드 소통 → 02 조건 기반 선별 → 03 1.5~2배수 리스트 → 04 컨펌·발송 → **05 업로드 전담 관리** [highlighted] → 06 정산·보고서).
- `global seeding/이미지_커버리지.svg` — Coverage stats: **75개국 / 12+ 콘텐츠 플랫폼 / 나노 중심**; platform pills TikTok·Instagram·YouTube·샤오홍슈·외 다수.
- `global seeding/이미지_콘텐츠타입.svg` — 4 content-type cards: 리뷰 / 튜토리얼 / 챌린지 / 비포 & 애프터; footer "지정 가능 — 성별 · 연령 · 국가 · 콘텐츠 타입".
- `global seeding/이미지_프로세스.svg` — Global 6-step process (01 계약 → 02 1.5배수 리스트 → 03 컨펌·발송 → **04 업로드 전담 관리** [highlighted] → 05 완료 기준 정산 → 06 실시간 보고서).

**Photo captures (real campaign content, for intro/case cuts):**
- `global seeding/capture/스크린샷 2026-06-08 050043.png` … through `…050333.png` — **~32 screenshots** of real global seeding influencer content (the 상세화면 구성안 says "capture 폴더에 기존 캡처 30여 장" → use for intro + cases).
- `기타/Youtube campaign/capture/` — 4 screenshots (스크린샷 2026-06-08 055532–055548).
- `기타/인스타 콘텐츠 제작/capture/` — 10 screenshots (055844–055933).
- `기타/브랜드 콘텐츠 제작/capture/` — 1 screenshot (061615).
- `기타/라이브 커머스/capture/` — 1 screenshot (061726).
- **korea seeding has NO capture folder** — real cuts still need to be collected (source note: "korea seeding 폴더에 아직 캡처가 없음 → 수집 필요").

---

### Supporting structure notes for V3 (from 구조.md / 골격_v1.md)
- Deck IA = short intro (problem/perspective) → 한눈 목차 (4-area cards) → per-area depth → evidence → contact. 4-area index card grid is the leading 목차 option ("안 A — 4 번호 카드 그리드").
- Layered disclosure principle: surface card (head + 1 line + thumbnail) → click for detail. "NN/g: 2단까지, 3단 중첩 금지." No PPT "dump everything on one slide."
- Brand tokens (must obey): Paper #F3EEE2, Ink #211A33, accent lavender #5a4a85 / #e9e3f3 / #cabce8, panel #FBF8F1; fonts Pretendard (KR body), Helvetica/Arimo (EN), JetBrains Mono (labels). Schibsted Grotesk is banned.

## keyFacts

- V2 defines 4 top-level 사업분야 in order: 01 아키텍팅(architecture), 02 비주얼 콘텐츠=인플루언서 비즈니스(Visual Contents), 03 sa:ai(Software Engineering), 04 PB(Private Brand)
- CORRECTION: 인플루언서 비즈니스 is area #2 (02 비주얼 콘텐츠), NOT #1. Area #1 is 아키텍팅/architecture. Source: 건진_정보.md §3 and 골격_v1.md
- Source for raw headings: C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/01_내용/사업분야/사업분야 정리.txt lists 01.architecture / 02.Visual Contents / 03.Software Engineering / 04.Private Brand
- 02 비주얼 콘텐츠 is the only READY area (deck의 심장/매출 키); sub-services: korea seeding, global seeding, model styling, YouTube campaign, 라이브 커머스, 브랜드 콘텐츠 제작, 인스타 콘텐츠 제작
- Seeding (korea + global) is a SUB-SERVICE nested under area 02 인플루언서 비즈니스, NOT a separate top-level area: '국내(시딩...)/해외(글로벌시딩...)'
- Brand rejects '대행사/실행사' (agency) framing for the influencer business area — use 다른 단어
- 01 아키텍팅 = thin/placeholder: 'problem solver 집단, 기초 설계~완성~실행 A to Z'; copy '당신이 놓친 건 예산이 아니라, 비어 있는 자리'; no numbers
- 03 sa:ai = thin/coming_soon: '모든 SNS/플랫폼 콘텐츠를 아카이빙하는 솔루션' (브랜드용+개인용 라이브러리); figma 3축 Performance·Creative·Archivo; tagline 'Creators remember us. Connection, accelerated.'; no dedicated detail file
- 04 PB = explicitly 준비중/coming_soon: 대표 김동현 전담, 6/10, 필름/디스플레이, 2026; imply via 신비·여백·실루엣; NO 상투어 (no literal 'Coming soon/준비중')
- korea seeding intro title: '맞는 사람을, 매번 새로 찾습니다' — 등록된 풀을 돌려쓰지 않음
- korea seeding 선별 기준: 성별·연령대·ER 등 인게이지먼트 지수·감도·무드·주 타깃; examples '10~20대 여성/팔로워 3천 이상/비포&애프터 가능/피부 표현이 깨끗한' and '30~40대 워킹맘/팔로워 1만 이상/단가 40만 원대/머릿결이 좋은'
- Influencer list delivery: korea = 최종 진행 수량의 약 1.5~2배수 리스트; global = 약 1.5배수 리스트
- Brand's job stops at: 리스트 컨펌과 제품 발송까지; 이후 콘텐츠 업로드 관리·진행 점검은 시리아이 전담
- korea seeding 6-step process: 브랜드 소통 → 조건 기반 선별 → 1.5~2배수 리스트 제공 → 컨펌·발송 → 업로드 전담 관리 → 정산·보고서
- global seeding 6-step process: 계약 → 1.5배수 리스트 제공 → 컨펌·발송 → 업로드 전담 관리 → 완료 기준 정산 → 실시간 보고서
- global seeding: 총 75개국, 12개 이상 콘텐츠 플랫폼 (TikTok·Instagram·YouTube·샤오훙슈/샤오홍슈 등), 나노 인플루언서 중심 숏폼
- global seeding content types: 리뷰·튜토리얼·챌린지·비포&애프터; 지정 가능: 성별·연령·국가·콘텐츠 타입
- global seeding plans: Standard=ENGAGE+ 이상 1건당 5만 원; Premium=ENGAGE++ 이상 1건당 10만 원 (일부 국가 상이); 최소 수량 제한 없음
- PRICING DISPLAY RULE: 단가(5만/10만)는 deck 비노출 — 내부 자료에만; 화면엔 '두 플랜·최소수량 없음'까지만
- 2차 활용: 콘텐츠 IP(2차 활용권)는 별도 구매를 통해 확보
- Reporting: 실시간으로 확인 가능한 온라인 보고서로 캠페인 성과 추적; 정산은 업로드 완료 기준 (후불·리스크0)
- Global Seeding scale numbers (건진_정보.md): 75개국·120,000 큐레이터·12+ 플랫폼; 단일 캠페인 제공 최대 200; 업로드율 100%; NCT 일본 댄스챌린지 55건; ZB1 북미 TOP5
- YouTube campaign 과금: 진행비용 기준 15%의 커미션 체계, 고정 단가 없음, 콘텐츠 1건 단위; 효율 낮은 크리에이터 제외
- 라이브 커머스: 제작사 스튜디오 온일칠공(ON170) 협력; 누적 3,500회 이상 방송 제작; 채널 네이버·카카오·11번가·그립; 홈라이브/스튜디오 라이브/출장 라이브
- model styling: 1단계부터 3단계까지 모듈형 선택(섭외/기획/촬영); 전체 이용 시 할인
- 인스타 콘텐츠 제작: 월간 단위 정기 운영 가능; AI 생성 이미지·모션·숏폼 혼합
- Ready SVG assets (on-brand): korea 이미지_02_무엇이다른가.svg, 이미지_05_진행프로세스.svg; global 이미지_커버리지.svg, 이미지_콘텐츠타입.svg, 이미지_프로세스.svg — paths under V2/01_내용/사업분야/02. visual contents/
- global seeding/capture has ~32 real content screenshots (스크린샷 2026-06-08 050043~050333.png); korea seeding has NO captures (수집 필요)
- Brand design tokens (must obey): Paper #F3EEE2, Ink #211A33, lavender accents #5a4a85/#e9e3f3/#cabce8, panel #FBF8F1; fonts Pretendard(KR)/Helvetica·Arimo(EN)/JetBrains Mono(labels); Schibsted Grotesk banned
- Deck IA from 골격_v1.md/구조.md: intro(문제·관점) → 한눈 목차(4-area cards) → 영역별 깊이 → 증거(Trusted by) → Studio → Contact; layered disclosure surface→click, max 2 levels
- R&R: 김동현(CEO·PB기획)/박슬범(운영)/조준용(세일즈·deck)/황윤경(인플루언서 운영); SIRIAI = 知り合い (아는 사이/지인)

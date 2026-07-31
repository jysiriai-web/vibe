# Cluster: structure-prior-decks

## Report

# SIRIAI Prior Deck Review (V1 archive + V2 prototypes) — IA, Sections, Reuse/Avoid for V3 Chatbot Page

This reviews the company's earlier "사업소개서 (deck)" attempts to extract the information architecture, the official company description, the interaction patterns already explored, the open decisions/TODOs, and concrete reusable copy/data — all oriented toward building a **V3 chatbot-style interactive page** ("living question chips + side history + chatbot").

---

## 0. The single most important strategic frame (carries straight into V3)

The whole V2 effort converged on **one purpose** that V3 must keep:

> "홈이 '우리는 이런 걸 **믿는다**'고 말한다면, 이 Deck은 '그걸 실제로 **해냈다**'를 증명한다." → 목표는 단 하나: 협업을 저울질하는 사람이 "이 팀이면 되겠다"고 느끼고 **대화 한 건을 시작**하게.

- **소개(❌) → 증명(⭕).** The team's #1 lesson across two full rebuilds: the deck is NOT a company intro (the homepage already does that). It is **proof / a dossier of "we actually did this."** (`PLAN.html` PRD tab; `사업소개서_필요사항.md §0`.)
- **Audience = semi-warm.** Someone who already clicked through from the homepage's `#deck` anchor. A brand manager/CEO weighing collaboration. They don't need to be convinced SIRIAI exists — they need one feeling: "this team can solve my stuck problem."
- **Single CTA = "막혀 있는 결정 하나를 가져와 주세요" → "대화 시작하기."** Both V2 mockups end on a single free-text input (a stuck decision) that triggers a conversation — **this is essentially already a chatbot prompt**, and is the natural seam for the V3 chatbot concept.
- **The 회사소개서.txt brief literally anticipated the chatbot UX:** "ex. 소요시간은 얼마인가요? (누르면 제미나이 대답하듯) 14일 소요됩니다." — i.e., **clickable questions that get answered conversationally.** This is the V3 "living question chips" pattern, written down at the very start.

---

## 1. Information Architecture — what sections existed, in what order

There are **three distinct IA generations.** The newest (v4 Dossier) is the team's currently-confirmed direction.

### V1 (archive, `work_summary.html`, 2026-06-01) — abandoned "유사 홈페이지"
A linear marketing-site structure. Documented mostly as the **failure case** to avoid: "누가·왜 보는지 안 정하고 화면부터 / 홈 소개를 그대로 반복 / 수치·스펙 자랑(영업메일 톤) / '있어보이는' 디자인이 목적이 됨." Key V1 artifacts: PRD_SIRIAI_v0.2, 카피뱅크 (Manifesto 3안 / Practices 헤드라인 / Contact 3안 / FAQ). Positioning then = "야심찬 확장" (marketing = the entrance, architecture = the destination) — **later explicitly KILLED.**

### V2 / V3-deck (`deck_시안.html`) — single linear scroll, 8 sections
Order (this is the cleanest canonical IA list):
1. **Hero** — `SIRIAI 知り合い · 아는 사이` / "당신의 브랜드는 이미 좋습니다. 시장이 아직 모를 뿐."
2. **Our lens (관점)** — "'무엇을 파는가'보다 '무엇을 놓쳤는가'를." + 3 pillars (관계의 눈 · 끝까지 곁에 · 기술로 정확히).
3. **What we do (영역 4분야)** — 4 cards: 아키텍팅 / 비주얼 콘텐츠 / sa:ai / 프라이빗 브랜드. **Click-to-expand (modal).**
4. **Selected work** — 2 anonymous case cards (K-Entertainment, Global Seeding). **Click-to-expand (modal).**
5. **The Siriai method (The Plan)** — process timeline 계약→…→정산.
6. **Trusted by** — stats + brand name list.
7. **The studio** — 4 members + "설계자로 분사."
8. **Contact (전환)** — single stuck-decision textarea → 대화 시작하기.

### V4 "Dossier Index" (`deck_시안_v4_dossier.html`) — CONFIRMED current direction (2026-06-08)
After the team-lead feedback "현 deck_시안 v3 = 결국 v1 실패와 같음 (예쁜 홈페이지)" and "what-we-do와 selected-work가 왜 따로인지 이해 안 됨", they **scrapped the linear scroll** and adopted a **"Dossier Index"** form (won 30/30 in an adversarial 5-concept review). Left sticky-nav IA:
- **00 Cover** — "좋은 브랜드가 안 알려지는 건, 도달이 아니라 관계의 문제다."
- **01 The Turn** — "도달을 더 사기 전에, 들어설 '자리'부터." Establishes the **shared 4-step spine: 진단 → 설계 → 실행 → 증거.**
- **02 아키텍팅** (Architecting) — dossier drawer
- **03 비주얼 콘텐츠** (Visual Content, marked **심장/heart**) — the deepest drawer; 국내/해외 two rails; "workbench" fixed-height panel
- **04 sa:ai** (Software engine panel)
- **05 프라이빗 브랜드** (Private Brand, locked "2026~")
- **06 Studio**
- **07 Contact**

**Key V4 structural decision (most relevant to V3):** the **Selected Work section was DELETED** and **cases were fused into each area as its final "증거 (proof)" step.** Each of the 4 areas is a closed "index drawer" → click → in-place full-page accordion expands → `[정의 → 진단·설계·실행·증거 4-step rail → 방법·도구 → case card]`. **"한 번에 한 방 (one room at a time)."** The team's principle: "이 deck의 인터랙션 = '어느 dossier를 열까' 하나, 나머지는 읽기."

---

## 2. Official company description (from 회사소개서.txt + corroborating files)

`회사소개서.txt` is the **original founder brief** (tone + content requirements), not finished copy. Verbatim key points:

**톤앤무드 (verbatim):**
- 레퍼런스: monopo, 코스모스(cosmos), minimalist, 노션(일부), 12랩스 (복잡도·프로세스 참고)
- 신비주의 / 영어 베이스 / 차분함·느림 / **화이트톤 (색감 최소화 — "어차피 MCP가 색감을 줌")** / **애니메이션 최소화**

**내용 요구 (verbatim highlights):**
- "보통은 한글로 하는데, **시리아이는 어떤 회사입니다, 스크롤 다운**, 이러이러한 것들이 있고, 어떤 파트너들이 함께한다."
- "**5인 정도로 구성**되어 있다. 객원 멤버 추가 (김바다 디자이너, 실장님 등)." ← team size = ~5 + guest members
- "회사연혁 필요 X, **R&R 굳.**" ← no company history; roles & responsibilities = good
- "고객사 적어야 함. on170 고객사 방식은 보기 불편함 → 로고 넣지 말고, **8디비전처럼 제작.**" (logos OFF; text-scan list)
- 사업분야: "**아키텍처링 → 기획·컨설팅** / **인플루언서 → 워딩 다르게 (콘텐츠 비즈니스로). 룩북·인플루언서·AI** / **소프트웨어 엔지니어링: sa:ai** — '최적화된 방식으로 브랜드나 어디에 필요한 솔루션을 만들고 있다' / **product 개발 → 26년 준비중.**"
- "사업영역 뭐뭐뭐 버튼이 있고, **클릭하면 프로세스 잘 설명** / 레퍼런스 잘 보여주게, 디테일하게 심플하게."
- "목적: **브랜딩 + 차별화.** 우리쪽이 굉장히 브랜딩이 잘 되어 있다는 것을 보여줄 것."
- "**ex. 소요시간은 얼마인가요? (누르면 제미나이 대답하듯) 14일 소요됩니다.** 등등 디테일에 집중." ← the chatbot-style Q&A seed
- "토코보 모집 폼 참고. 잘 읽힐 것." (target deadline in brief = **6월 10일**)

**The official company one-liner / message (locked "A안", from PLAN.html + 작업로그):**
> "좋은 브랜드가 안 알려지는 건, **도달**이 아니라 **관계**의 문제다." — 시리아이(知り合い)가 당신 브랜드를 시장과 '아는 사이'로.
> **3 pillars:** 관계의 눈 · 끝까지 곁에 · 기술로 정확히.

**Positioning (confirmed 2026-06-03 — supersedes V1):** 마케팅 실행력 + 기술 비전 = **두 기둥 완전 동등** (neither is a sub/entrance of the other). The earlier "마케팅=입구 / 아키텍처=목적지" hierarchy is **dead.**

**Company facts (from `회사소개서.txt` + open-items in 작업로그):**
- **SIRIAI = 知り合い ("아는 사이" / acquaintance).** This bilingual pun IS the brand.
- CEO/대표: **김동현 (DONGHYUN KIM)**. Team (Studio, English names only, no titles per decision P8): **DONGHYUN KIM (전략·PB) · SEULBUM PARK (운영) · YUNKYUNG HWANG (인플루언서) · JUNYONG CHO (세일즈)** — note 조준용/JUNYONG CHO is the working contact ("팀장").
- Address (from V4 footer + 작업로그 notion notes): **서울 용산구 한강대로293**, 070-7576-1944, 평균 응답 0~1일.
- Email (decision P7): **jysiriai@gmail.com**.
- DNA / lineage (benchmark doc): **8division** (dev team spin-off = root of sa:ai), **NURICLE** (실행력), **on170** (반면교사 / what NOT to do).
- 4 business areas: **01 아키텍팅** (problem-solver, A-to-Z 기초설계~실행, 틈결 프로젝트 = the proof), **02 비주얼 콘텐츠** (= influencer business reframed; **deck의 심장 · 매출 키 비즈니스**; 룩북·모델스타일링·릴스), **03 sa:ai** (software biz; all-SNS/platform **content archiving solution** — brand version tracks published-content survival; personal version = "콘텐츠 라이브러리"), **04 PB / Private Brand** (준비중, CEO 김동현 전담, 2026, 필름/디스플레이).

---

## 3. Interaction patterns already explored (10+ demos) — what aligns with V3

The brief required: surface = simple (image/reference + headline), **click → detail expands ("창이 늘어남")**, "그냥 1페이지 쭉 스크롤 아님" = **progressive disclosure**, matching monopo's 2-step IA.

### The 12 demo files (`03_디자인/시안/시안_데모/`) — each is the SAME deck with only the "02 펼침" interaction swapped:
| File | Pattern implied |
|---|---|
| `v01_읽기.html` | Inline reading scroll (click minimal) |
| `v02_사이드점프.html` | Inline + **left side-jump nav** |
| `v03_상단점프탭.html` | Inline + top jump-tabs |
| `v04_권역토글.html` | Inline + region toggle (국내/해외) |
| `v05_서브아코디언.html` | Inline sub-accordion |
| `v06_2단패널.html` | Inline **2-pane panel** (list → detail) |
| `v07_가로슬라이드.html` | **Horizontal slide** (PPT-like) — *advised against, "v1 답습"* |
| `v08_점진노출.html` | Progressive/gradual reveal |
| `v09_3탭압축.html` | 3-tab compression |
| `v10_풀페이지.html` | Full-page (02 only, older) |
| `v11_풀페이지_스크롤.html` | **Full-page overlay + inner read-scroll + home deep-link** |
| `v12_풀페이지_2단.html` | **Full-page overlay + 2-pane (left contents / right swappable) + home deep-link** ← **FINAL WINNER** |

### Confirmed selection (2026-06-08): **v12 풀페이지 + 2단** is the locked base.
Rationale: it's the right "그릇" because each dossier needs to be an **independent address-view** to support **home deep-links** (`#f-arch / #f-content / #f-saai / #f-pb` — clicking a homepage section jumps straight into that deck screen via `hashchange`). v07 (horizontal slide) was explicitly **rejected** as "most PPT-like / v1 repeat."

### The 3 detail-window forms (`구조_레이어드_데모.html`): **① Modal (가운데 떠오름) · ② Drawer (옆 서랍) · ③ Page transition (넘어감)** — **modal provisionally adopted**, others kept as toggle assets. The confirmed universal principle: **"표면 간결 → 클릭하면 디테일."**

### Alignment to the V3 "living question chips + side history + chatbot" concept:
- **STRONGLY ALIGNED — reuse the spirit:**
  - **The 4-step rail (진단→설계→실행→증거)** maps cleanly onto a guided chatbot flow / suggested-question progression.
  - **The single stuck-decision input** at Contact is already a chatbot prompt — make it the conversation entry.
  - **Home deep-link anchors** (`#f-arch/#f-content/#f-saai/#f-pb`) → in V3 these become "open this topic in the chat" entry points / pre-seeded question chips.
  - **The "soyo-time = 14일" clickable-Q→conversational-A** pattern from the brief = literally the **living question chips.**
  - **Left sticky nav (`.nav ol` in v4, v02 side-jump)** = the **side history / topic rail** of V3.
- **REUSE structurally, REFRAME for chat:** the **2-pane (v06/v12)** = chat on one side, persistent context/history on the other. The **"one room at a time"** rule = chat keeps focus on one topic; chips switch topics.
- **AVOID:** horizontal slide-hijack (v07) — repeatedly flagged as PPT/v1 regression and a scroll-hijack hazard; "클릭할 곳이 너무 많다" dashboard-feel (the V4 4-level workbench: open→tab→region→item was rejected by 준용 as a "클릭 미로"). **V3 chat should reduce clicks, not multiply them.**

---

## 4. Decisions, open TODOs, and unresolved questions (작업로그 + work_summary)

### Hard decisions (apply these):
- **소개→증명** purpose; **두 기둥 동등**; message A locked; **고객(브랜드)이 hero, 시리아이는 설계자** ("우리 잘한다" 자랑 금지, 영업메일 톤 금지, 주체 동사 사용).
- **Selected Work는 별도 섹션 폐지** → cases fused as each area's 증거 step (V4).
- Form = **v12 full-page + 2-pane + deep-link**; detail = **modal (잠정)**; **"표면 간결 → 클릭 디테일"** confirmed.
- **Partners = 8division식 text-scan list, NO logos.** Names = real (homepage already public). Case specifics = anonymized by industry.
- **Studio = monopo식** one-line stance, no org-chart/headcounts; English names only, no titles.
- Contact CTA = single stuck-decision input → "대화 시작하기" (weak verbs banned).

### Open / unresolved (the 9 "P-card" 빈칸 + risks — 준용's own decisions, do NOT push):
- **P1** 실명 노출 범위 (Trusted by 15~20, anchor 3, HYBE 그룹표기 여부)
- **P2** 02 case 수위 — **마루(MARU) 노출 ❌**, 틈결 영문표기 OK; numbers usable but **"안 씀"** (show *capability*, not number-as-limit)
- **P3** 94.6%/191 분모 — **unverified, do not publish** (the team found 87/191=45.5% ≠ 94.6%, no source doc); "정확한 수치가 핵심 아님"
- **P4** 기술 수치 (75개국·12만 큐레이터·20만 스코어링) — frame as **open capability** ("필요한 곳이면 어디든"), numbers only as small evidence
- **P5** 사명표기 (SIRIAI+知り合い 병기) · "두 기둥" 용어 폐기 OK
- **P6** 01 아키텍팅 무게 — **홈이 무조건 기준** (홈 = "AI 의사결정 구조 설계")
- **P8** Studio 멤버 공개 ✅ (names above)
- **P9** PB 공개범위 — 추후
- **Risks:** 홈 v2 대기 (톤·01 무게 잠정); 내용 = 준용 수작업 검수 중; 미검증수치 = 발표 전 전수 제거 필수; placeholder(⏳/📎/"~자리") = 배포 전 제거 체크리스트.

### Process meta-rules (from handoff feedback):
- "이어서 진행" = **context handoff, NOT a work order.** 내용/수치 결정은 준용 소관 — don't push decisions in chat.
- 준용 doesn't read MD; decisions shown as **visual 시안, not abstract text.**
- Brand tokens are **non-negotiable** (see §5).

---

## 5. Concrete reusable copy, data, and design tokens

### Reusable copy (verbatim, brand-approved):
- Hero: **"당신의 브랜드는 이미 좋습니다. 시장이 아직 모를 뿐."** / sub: "도달이 아니라, **관계**의 문제입니다." / anchor: "인플루언서가 있는 곳이면, 어디든 — 75개국 네트워크"
- Lens: **"'무엇을 파는가'보다 '무엇을 놓쳤는가'를."** / "도달을 더 사기 전에, '아는 사이'가 될 자리부터 설계합니다."
- 3 pillars: **관계의 눈** ("도달이 아니라 맞는 관계를") · **끝까지 곁에** ("리스트만 던지지 않습니다") · **기술로 정확히** ("감이 아니라 데이터로")
- What we do: "네 개의 방. 누르면, 일하는 과정이 열립니다." / "표면엔 목차만. 증거는 열어야 나옵니다. (한 번에 한 방)"
- 02 정의: **"가입자 풀에서 뽑지 않습니다. 매번 새로 발굴합니다."** / "돌려쓰지 않습니다."
- Method: "막막하지 않게, 관리 가능한 길로." / 후불제 · 리스크 0 · 미업로드 3단계 대응 · 검수 관리
- Studio: **"브랜드를 운영해 본 사람들이, 설계자로 분사했습니다."** / "그래서 당신이 어디서 막혔는지, 길게 설명하지 않아도 압니다."
- Contact: **"막혀 있는 결정 하나를 가져와 주세요."** / "관계는, 대화에서 시작됩니다." / placeholder: "지금 막혀 있는 결정을 한 줄로. (예: 신제품을 어느 시장부터, 누구와 알려야 할지 모르겠어요)"
- 4-step spine: **진단 → 설계 → 실행 → 증거**

### Reusable data points (use carefully per P-card rules):
- **75개국 · 12만(120,000) 큐레이터 · 12+ 플랫폼** (Global Seeding, from notion — 단가는 비노출)
- 단일 캠페인 제공 최대 **200** · 실행 파트너 **4곳** (오초·인플루넷·에녹·마루) · 인재풀 **1,100건** · 거래 브랜드 **17곳+**
- Case proofs (anonymized): **업로드율 100%** · 일본 틱톡 챌린지 **55건** · 북미(USA) 시딩 · ZB1/NCT = 그룹 표기로만
- Method timeline: 계약→컨택→리스트→컨펌→발송→업로드 관리→정산 · 평균 2주~1달 · 착수금 20%
- Brand list (provisional, pending consent): 무신사 · 카카오페이 · 이니스프리 · COSRX · 아이디병원 · CJ ENM · 강릉시 · 8division · 레이티드그린 · 잇퓨
- **DO NOT USE:** 94.6% · 191 · 87 · 8곳(→4곳 정정) · 모집율 400%(= display bug) · 일본 90% · 업로드율% as a stat · 마루(MARU) 실명.

### Design tokens (⚠️ mandatory — official, NOT Schibsted Grotesk which was a logged error):
- Colors: **Paper `#F3EEE2`** · **Ink `#211A33`** · ink-2 `rgba(33,26,51,.66)` · ink-3 `.46` · line `.13`. (Warm off-white surface `#FBF8F1`, never pure white.)
- Fonts: **EN = Helvetica Neue / Helvetica / Arimo** · **KR = Pretendard** · **JP = 知り合い (Hiragino/Noto Sans JP)** · **labels = JetBrains Mono (UPPERCASE, letter-spacing ~.16em)**.
- Accent: lavender `--lav #cabce8` / soft `#e9e3f3`; pill buttons (border-radius 100px); minimal animation; "있어보임 = 모션이 아니라 여백·타이포 위계·절제·progressive disclosure."

---

## 6. Net recommendation for V3 (reuse vs avoid)

**REUSE:** the proof-not-intro purpose; message A + 知り合い brand; the 4-step rail as the chatbot's guided spine; the single stuck-decision input as the conversation seed; the clickable-Q→conversational-A pattern (already in the original brief) as the living question chips; left sticky nav as the side history/topic rail; the v12 deep-link anchors as chip entry points; all verbatim copy and the brand tokens; 8division-style logo-less name list; the verified data points.

**AVOID:** linear "pretty homepage" scroll (V1/V3 failure); horizontal slide-hijack (v07); multi-level click mazes / dashboard feel (rejected V4 workbench); any unverified numbers and the MARU real name; pure white; new colors/fonts/emoji/neon (brand rule: "쓰는 순간 틀림").

**Key file paths:**
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/_archive/회사소개서.txt` — founder brief (tone + content + chatbot-Q seed)
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/_archive/work_summary.html` — V1 status/failure record
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/PLAN.html` — current PRD (purpose, audience, cascade, 1차 fail vs 2차)
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/02_구조/구조_레이어드_데모.html` — modal/drawer/page detail-form demo
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/03_디자인/deck_시안.html` — V3 linear 8-section deck (copy source)
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/03_디자인/deck_시안_v4_dossier.html` — confirmed Dossier Index direction
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/03_디자인/시안/시안_데모/` — 11 interaction-experiment archive (+ `_index.html`)
- `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/작업로그.md` — full decision/TODO log

## keyFacts

- Deck's single purpose: 소개(intro) → 증명(proof). 홈은 '믿는다', deck은 '해냈다'를 증명. Goal = one collaboration conversation.
- Audience = semi-warm: someone who clicked the homepage #deck anchor; a brand manager/CEO weighing collaboration.
- Brand = SIRIAI = 知り合い ('아는 사이' / acquaintance). Locked message A: '좋은 브랜드가 안 알려지는 건, 도달이 아니라 관계의 문제다.'
- 3 pillars: 관계의 눈 · 끝까지 곁에 · 기술로 정확히.
- 4 business areas: 01 아키텍팅 · 02 비주얼 콘텐츠 (the '심장'/heart, 매출 키 biz) · 03 sa:ai (content-archiving software) · 04 프라이빗 브랜드 (PB, 2026 준비중).
- Universal 4-step spine: 진단 → 설계 → 실행 → 증거.
- V4 'Dossier Index' is the confirmed direction (won 30/30 adversarial review); Selected Work section DELETED, cases fused into each area as its '증거' step; 'one room at a time'.
- Final interaction form confirmed (2026-06-08) = v12 풀페이지+2단 (full-page overlay + 2-pane), with home deep-links #f-arch/#f-content/#f-saai/#f-pb.
- Detail-window form provisionally = modal (drawer + page-transition kept as alternatives). Core rule: '표면 간결 → 클릭하면 디테일' (progressive disclosure).
- Original 회사소개서.txt brief already seeds the chatbot UX: 'ex. 소요시간은 얼마인가요? (누르면 제미나이 대답하듯) 14일 소요됩니다.'
- Contact CTA = single stuck-decision textarea → '대화 시작하기' ('막혀 있는 결정 하나를 가져와 주세요').
- 10 interaction demos in 시안_데모/ swap only the '02 펼침' behavior: v01 읽기, v02 사이드점프, v03 상단점프탭, v04 권역토글, v05 서브아코디언, v06 2단패널, v07 가로슬라이드, v08 점진노출, v09 3탭압축, v10 풀페이지 (+ v11 풀페이지스크롤, v12 풀페이지2단).
- v07 가로슬라이드 explicitly rejected as most PPT-like / 'v1 답습'; the V4 4-level workbench rejected as a '클릭 미로' (click maze).
- Studio members (English only, no titles): DONGHYUN KIM (전략·PB) · SEULBUM PARK (운영) · YUNKYUNG HWANG (인플루언서) · JUNYONG CHO (세일즈). CEO = 김동현 (DONGHYUN KIM).
- Team ~5 people + guest members (김바다 디자이너 등). No company history section. R&R section = good.
- Company info: 서울 용산구 한강대로293 · 070-7576-1944 · email jysiriai@gmail.com · 평균 응답 0~1일.
- Lineage/DNA: 8division (dev spin-off → sa:ai root), NURICLE (실행력), on170 (반면교사 / anti-reference).
- Partners list = 8division style: text-scan, NO logos, real names OK (homepage already public); case specifics anonymized by industry.
- Usable data: 75개국 · 120,000(12만) 큐레이터 · 12+ 플랫폼 · 단일 캠페인 최대 200 · 실행 파트너 4곳(오초·인플루넷·에녹·마루) · 인재풀 1,100건 · 거래 브랜드 17곳+ · 업로드율 100% · 일본 챌린지 55건.
- BANNED numbers/names: 94.6%, 191, 87, 8곳(→4곳 corrected), 일본 90%, 모집율 400% (display bug), 업로드율-as-stat, MARU(마루) real name.
- Provisional brand list (pending consent): 무신사·카카오페이·이니스프리·COSRX·아이디병원·CJ ENM·강릉시·8division·레이티드그린·잇퓨; HYBE acts = group notation only.
- Method timeline: 계약→컨택→리스트→컨펌→발송→업로드 관리→정산 · 평균 2주~1달 · 착수금 20% · 후불제·리스크 0.
- Brand tokens (mandatory): Paper #F3EEE2, Ink #211A33; EN=Helvetica/Arimo, KR=Pretendard, JP=Hiragino/Noto Sans JP, labels=JetBrains Mono UPPERCASE; lavender accent #cabce8; pill buttons; minimal animation. Schibsted Grotesk was a logged ERROR — banned.
- Hero copy: '당신의 브랜드는 이미 좋습니다. 시장이 아직 모를 뿐.' / sub '도달이 아니라, 관계의 문제입니다.'
- Tone (회사소개서.txt): monopo/cosmos/12labs references, 신비주의, 영어 베이스, 차분/느림, 화이트톤(색감 최소 — MCP gives color), 애니메이션 최소.
- Positioning confirmed: 마케팅 실행력 + 기술 비전 = 두 기둥 완전 동등; the V1 '마케팅=입구/아키텍처=목적지' hierarchy is killed.
- Process meta-rule: '이어서 진행' = context handoff NOT a work order; 내용/수치 결정 = 준용 소관, don't push in chat; show decisions as visual 시안 not abstract text.
- 9 open P-cards unresolved (준용's call): P1 실명범위, P2 02 case 수위, P3 94.6% 분모(미검증), P4 기술수치 framing, P5 사명표기, P6 01 무게(홈 기준), P8 Studio 공개, P9 PB 범위.
- Original founder deadline in brief was 6월 10일; 토코보 모집 폼 referenced as the 'reads well' form model.
- Three IA generations: V1 linear marketing site (failed) → V2/V3 deck_시안.html 8-section linear scroll → V4 deck_시안_v4_dossier.html Dossier Index (current).

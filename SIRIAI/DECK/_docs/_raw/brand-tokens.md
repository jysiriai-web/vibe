# Cluster: brand-tokens

## Report

# SIRIAI 브랜드 + 디자인 시스템 — V3 페이지 제작용 전체 추출

> 출처 = SIRIAI 공식 브랜드 원칙 문서 + 디자인 토큰 HTML (모두 `SIRIAI Field.html` 홈 히어로 실측 기반). 핵심 기준 파일은 다음 둘이며, **충돌 시 이 둘이 권위(authoritative)**다:
> - `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/03_디자인/SIRIAI 브랜드 원칙 (Claude용).md`
> - `C:/Users/whwns/Desktop/VIBE/Project/SIRIAI/V2/03_디자인/디자인_가이드.html`
>
> **중요한 시간순 주의:** `스터디/` 폴더의 3개 문서(2026-06-02 ~ 06-04 작성)는 초기 탐색 단계의 사고 과정으로, 일부 토큰(예: 베이스 화이트 #FFFFFF·#111111, 헤딩 명조 serif, 영문 Inter/Suisse)이 **나중에 폐기·정정**되었다. 최종 확정 토큰은 위 2개 권위 파일을 따른다. V3 페이지는 권위 파일의 토큰만 사용할 것.

---

## 0. 한 문단 요약 (먼저 내면화)

따뜻한 크림색 종이(Paper `#F3EEE2`) 위에 짙은 잉크(Ink `#211A33`) 텍스트를 올린 **차분하고 미니멀한 에디토리얼** 스타일. 영문 제목은 헬베티카 계열(Helvetica Neue/Arimo), 국문은 Pretendard, 작은 라벨만 모노스페이스(JetBrains Mono) 대문자로 자간을 넓혀 쓴다. 색은 평평한 색면이 아니라 **은은한 웜 그라데이션 글로우**(peach·lilac·cream)와 콘텐츠 이미지에서 나오며, 베이스는 항상 중립이다. 강조는 잉크 솔리드 알약(pill) 버튼 하나로 충분. 여백은 넉넉하게, 한 화면에 한 메시지. **순백 배경·검정 텍스트·형광색·무지개 그라데이션·이모지·두꺼운 컬러 박스는 쓰지 않는다.**

---

## 1. 색 (Color Tokens) — 정확한 hex

### 코어 토큰 (CSS 변수 그대로)
| 토큰 | 값 | 역할 |
|---|---|---|
| `--paper` | **`#F3EEE2`** | 기본 배경 (따뜻한 크림 종이) |
| `--surface` | **`#FFFFFF`** | 카드 / 글래스 표면 |
| `--ink` | **`#211A33`** | 기본 텍스트 · CTA 버튼 |
| `--ink-2` | `rgba(33,26,51,.66)` | 보조 텍스트 |
| `--ink-3` | `rgba(33,26,51,.46)` | 캡션 · 비활성 |
| `--line` | `rgba(33,26,51,.13)` | 헤어라인 · 구분선 (13%) |
| `--accent` | **`#2A6FDB`** | 파란 강조 — 텍스트 링크에만, 아주 드물게 |

> `#211A33` = RGB(33, 26, 51). 모든 ink-2/ink-3/line 토큰은 이 RGB의 알파 변형이다.

### 분위기 색(웜 워시) — 색감의 진짜 출처
Paper 위에 옅은 방사형(radial) 글로우를 1~3겹 겹친다. **평평한 색면 금지.**
| 토큰 | 값 |
|---|---|
| `--peach` | `rgba(246,201,168,.5)` |
| `--lilac` | `rgba(221,208,239,.45)` |
| `--cream` | `rgba(255,224,196,.4)` |

실제 적용 예 (디자인 토큰 HTML의 body 배경):
```css
background:
  radial-gradient(60% 50% at 16% 6%, rgba(246,201,168,.5), transparent 60%),
  radial-gradient(55% 45% at 88% 4%, rgba(221,208,239,.45), transparent 60%),
  #F3EEE2;
```

### Do/Don't 영역에서만 쓰는 보조색 (UI 메타 신호 — 본문 팔레트 아님)
- Do 박스: `background:rgba(127,174,127,.14)` · border `rgba(127,174,127,.3)` · 제목/체크 `#3f6b3f` · 마크 `#7fae7f` 계열
- Don't 박스: `background:rgba(201,138,138,.12)` · border `rgba(201,138,138,.3)` · 제목 `#8a5a5a` · 마크 `#b87a7a`
> 이 머스키 그린/로즈는 가이드 문서의 Do/Don't 표식용일 뿐, 브랜드 팔레트에 포함되지 않는다.

### 색 규칙
- **중립 베이스(Paper) + 잉크 텍스트**가 기본. 강조색은 이미지/워시에서 나오게 한다.
- 텍스트 위계는 **Ink → Ink-2 → Ink-3** 3단계로만.
- 구분선은 얇은 **Line(13%)** 헤어라인.
- 버튼/CTA는 **Ink 솔리드 알약(pill)**. 파란 Accent는 **텍스트 링크에만** 극히 드물게.
- `::selection` = 배경 Ink / 글자 Paper.
- **금지:** 순백(#FFF) 배경 + 순흑(#000) 텍스트, 채도 높은 단색 배경면, 무지개/형광 그라데이션.

---

## 2. 타이포그래피 (Typography)

### 폰트 스택 (이 5종만 사용 — CSS 변수)
```css
--f-en   : 'Helvetica Neue','Helvetica','Arimo','Pretendard',Arial,sans-serif;   /* 영문 디스플레이/제목 */
--f-kr   : 'Pretendard', system-ui, sans-serif;                                   /* 국문 제목/본문 */
--f-mono : 'JetBrains Mono', ui-monospace, monospace;                             /* 라벨/메타/시간/태그 */
--f-serif: 'Bodoni Moda', Georgia, serif;                                         /* 에디토리얼 악센트 (드뭄) */
--f-jp   : 'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP', sans-serif; /* 일문 (사명 知り合い 등에만) */
```

### 언어/역할별 폰트 매핑 (확정)
- **영문** = Helvetica Neue / Helvetica / **Arimo** (Helvetica 웹 폴백)
- **국문** = **Pretendard**
- **일문**(知り合い·しりあい 등 사명·일본 표기) = Hiragino / Noto Sans JP
- **라벨/eyebrow/메타/태그/시간** = **JetBrains Mono** (UPPERCASE)
- **에디토리얼 악센트**(큰 특별 제목에만, 드물게) = Bodoni Moda

### 역할별 규격 표
| 역할 | 폰트 | 두께 | 크기(반응형) | 자간 | 줄간 |
|---|---|---|---|---|---|
| 영문 헤드라인/Display | Helvetica/Arimo | 500 | `clamp(38px, 6vw, 82px)` | −0.022em | 1.08 |
| 국문 헤드라인 | Pretendard | 600 | `clamp(30px, 5.2vw, 74px)` | −0.015em | 1.16 |
| 서브/리드 문장 | Helvetica/Arimo | 400 | `clamp(15px, 1.4vw, 20px)` | −0.005em | 1.5 |
| 본문 | Pretendard | 400 | 16px | −0.005em | 1.6 |
| 라벨/eyebrow/메타 | JetBrains Mono | 400–500 | 9.5–13px, **UPPERCASE** | .16–.22em | — |
| 에디토리얼 악센트 | Bodoni Moda | 500 | 큰 특별 제목에만 | 0 | 1.1 |

### 자간 규칙 (공식 명시)
- 큰 제목일수록 **자간을 좁게**: −0.015 ~ −0.035em
- 본문: −0.005em
- 작은 라벨(모노): **넓게** +0.16em 이상 (.16–.22em)

### 기타 타이포 규칙
- 영문은 Helvetica/Arimo, 국문은 Pretendard. 한 화면에서 섞을 땐 **역할(제목/본문)로 구분.**
- 국문 제목·본문은 **`word-break: keep-all`** (어절 단위 줄바꿈).
- 헤딩은 크게 + 넉넉한 여백, 본문은 차분하게(대비 타이포). 영문은 작은 라벨/디스플레이로만 격을 준다.

### ⚠️ 금지 폰트 (중요)
- **Schibsted Grotesk** — **명시적으로 금지/오류.** 가이드 HTML 원문: *"2차 초기 Schibsted Grotesk(클로드 실측 오류) → 공식 Helvetica/Arimo."* Do/Don't 표에도 *"Schibsted·Inter·Roboto·Arial단독·맑은고딕"* 금지로 명기됨. → V3에서 절대 사용 금지.
- 그 외 금지: **Inter, Roboto, Arial 단독, 맑은 고딕(Malgun Gothic), 굴림(Gulim)**. 위 5종 스택만 허용.

### 웹폰트 로드 (필요 시)
- Pretendard: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`
- Google Fonts: `https://fonts.googleapis.com/css2?family=Arimo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Bodoni+Moda:wght@500&family=Noto+Sans+JP:wght@400;500&display=swap`

---

## 3. 간격 · 형태 (Spacing / Radius / Shadow / Borders / Grid)

### 간격 (Spacing scale)
- **화면 가장자리 여백:** `6vw` 또는 `clamp(22px, 5vw, 64px)`
- **페이지 상하 패딩 예:** `48px clamp(22px,5vw,64px)` (가이드 body)
- **제목 → 서브 간격:** `clamp(22px, 3.4vh, 36px)`
- **요소 묶음(아이콘·칩·버튼) gap:** `9–22px`
- **본문 최대 폭:** `max-width: 30em` (리드 문장은 ~46em까지)
- **페이지 콘텐츠 최대 폭:** `max-width: 1080px; margin:0 auto`
- **섹션 간 여백:** `margin-bottom: 52px` (가이드 기준)
- 크기는 **`clamp()`** 로 반응형, **여백은 넉넉하게**. 히어로는 항상 **중앙 정렬.**

### 모서리 둥글기 (Radius)
| 값 | 용도 |
|---|---|
| `12px` | 아이콘 버튼 · 작은 카드 |
| `18px` | 패널 · 상단 글래스 바 |
| `100px` | 버튼 · 태그 (알약 pill) |
> (가이드 내 부수 사용: note 박스 10px, 패널/dd 박스 14px — 위 3개가 표준 스케일)

### 표면 / 글래스 (Glass surface)
유리 바·고스트 버튼 표준:
```css
background: rgba(255,255,255,.55);
backdrop-filter: blur(20px) saturate(1.5);   /* 가이드 컴포넌트는 blur(20px) */
border: 1px solid var(--line);               /* 1px 헤어라인 */
box-shadow: 0 16px 44px rgba(33,26,51,.13);  /* 부드러운 그림자 */
```

### Shadow / Border 규칙
- 그림자는 **부드럽게** `0 16px 44px rgba(33,26,51,.13)` 한 종류. **진한 드롭섀도 금지.**
- 보더는 **1px 헤어라인 `--line` (rgba 33,26,51,.13)** 만. **두꺼운 컬러 보더·박스 금지.**

### 그리드 / 레이아웃 (Grid conventions)
- 팔레트 그리드: `repeat(auto-fill, minmax(150px,1fr))`, gap 14px
- 워시 그리드: `repeat(3,1fr)`, gap 14px
- Do/Don't: `1fr 1fr` (모바일 `@media(max-width:680px)`에서 1열)
- 섹션 레이아웃 패턴: **좌측 텍스트 / 우측 강한 비주얼 카드**(라운드 사각). 이미지는 회색 placeholder + 캡션.
- 섹션마다 **번호(01·02…) + uppercase 라벨(eyebrow) + 한 줄 주석** → "아카이브/색인(index)" 감성.
- 단일 스크롤 에디토리얼. 풀블리드 허용.

### 컴포넌트 스펙 (가이드 실측)
- **Primary 버튼(pill):** `background:var(--ink); color:var(--paper); border:none; border-radius:100px; padding:13px 26px; font:var(--f-en) 500 15px; letter-spacing:-.005em`
- **Ghost/Glass 버튼:** 위 글래스 표면 + `color:var(--ink)`
- **Tag/Label:** `font:var(--f-mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; padding:7px 14px; border-radius:100px; background:rgba(255,255,255,.55); border:1px solid var(--line); color:var(--ink-2)`
- **Badge:** 모노, 글래스 배경, `letter-spacing:.1em`, uppercase, `border-radius:100px`

---

## 4. 톤 & 매너 / 보이스 (Voice)

### 핵심 정체성
- **한 문장:** "시리아이는 '아는 사이(知り合い)'다 — 시장과 브랜드 사이의 거리를 좁히는, **똑똑하지만 따뜻한 설계자.**"
- **두 얼굴의 균형:** 따뜻함(知り合い: 관계·사람 중심) × 명민함(설계자·구조·데이터·AI). 교차점 = **"정제된 친밀함" / "따뜻한 지성."**
- **감도 테스트(한 줄):** *"차분한 갤러리에 들어선 느낌인데, 안내하는 사람이 다정하고 똑똑하다."* — 새 디자인·카피가 이 문장에 맞으면 OK, 어긋나면 재검토.

### 무드 키워드
- **그렇다:** 차분한 · 정제된 · 따뜻한 · 지적인 · 절제된 · 아카이브적 · 신뢰감 · 여백 있는 · 단단한 · 조용함(Quiet) · 신비(Mystic) · 기록(Archival) · 정밀(Precise) · 관계(知り合い)
- **아니다:** 요란한 · 화려한 · 싼티 · 공격적 영업 · 차가운 테크 · 과장된 · 빽빽한

### 톤 오브 보이스 (카피 규칙)
- **고객(브랜드)이 hero, 시리아이는 설계자(가이드).** "우리 잘한다" 자랑 금지. 모든 문장을 **"당신 브랜드가 ~"** 관점으로.
- 주체적 동사 사용: **설계한다 · 진단한다 · 발굴한다 · 증명한다.** 벤더 언어("제작해드립니다") 금지.
- 선언적·간결. 12랩스식 "어려운 걸 쉬운 결과 언어로 번역."
- 따뜻하되 가볍지 않게, 친절하되 격을 잃지 않게.
- **상투어 금지:** "Coming soon · to be continued · 준비중" 류 표현은 싸구려 → 여백·암시·연도(2026)로 대신하고, **쓸 바엔 차라리 없앤다.**

### "고객 hero" 리프레임 예시 (before → after)
| before (시리아이 hero = 영업메일) | after (고객 hero = 격↑) |
|---|---|
| "검증된 실행력과 AI 기술, 두 축으로 설계합니다" | **"당신의 브랜드는 이미 좋습니다. 아직 만나지 못한 사람들이 있을 뿐."** |
| "브랜드 페인포인트를 진단합니다" | **"당신이 놓친 건 예산이 아니라, 비어 있는 '자리'입니다. 우리는 그 자리를 찾습니다."** |
| "700만급 메가를 동원합니다" | **"당신 브랜드가 닿지 못한 700만의 시선. 우리가 그 다리를 놓습니다."** |
| "우리 방문률 94.6%" | **"당신의 캠페인이 흐지부지되지 않게 — 94.6%가 끝까지 움직였습니다."** |
| "우리 자체 AI입니다" | **"당신의 브랜드를 사람처럼 이해하는 기술. 그래서 매번 더 정확해집니다."** |

### 문장 단위 체크리스트 (모든 카피에 적용)
- ☐ 주어가 "우리"인가 "당신(브랜드)"인가? (우리면 의심)
- ☐ 일반 마케팅 카피처럼 들리나, **시리아이만** 할 수 있는 말인가?
- ☐ 구체적 숫자·사례가 있나? (예: 94.6%, 무신사)
- ☐ "왜?"에 답하나 (허세 점검)?
- ☐ 영업메일에도 쓸 문장인가? → 그렇다면 **격 미달, 다시.**

### 인터랙션 / 모션
- **fade-in on scroll만.** 애니메이션 최소. 차분·느림.
- 마이크로 인터랙션 절제(호버 시 미묘한 톤 변화 정도).
- *"있어 보이게 = 모션이 아니라 절제·타이포·여백으로."*

### Do / Don't (시각)
**Do**
- 배경 Paper `#F3EEE2` 고정 · 한 화면 한 메시지
- 제목 Helvetica/Pretendard, 본문 Pretendard — 두 종류로 끝
- 텍스트 위계 Ink/Ink-2/Ink-3 3단계
- 강조 = Ink 알약 버튼 하나 · 여백 넉넉
- 섹션번호·태그 = 모노 대문자 + 넓은 자간

**Don't**
- 순백 배경 + 검정 텍스트
- 형광·무지개 그라데이션 · 채도 높은 단색면
- 두꺼운 컬러 박스 · 진한 드롭섀도
- 이모지 · 클립아트 남발
- Schibsted · Inter · Roboto · Arial단독 · 맑은고딕

---

## 5. 로고 / 자산 (Logo & Assets)

- **읽은 7개 문서 내에 로고 이미지 파일 경로(자산 path)나 명시적 로고 사용 규칙은 없음.** 디자인 토큰 HTML에는 로고 `<img>` 참조가 없고, 헤더는 텍스트 라벨(`SIRIAI · Design Tokens (Official)`)로만 처리됨.
- 워드마크 표기: **"SIRIAI"** (영문 대문자). 사명 한자 표기 = **知り合い**(아는 사이/しりあい), 일본어 폰트(Hiragino/Noto Sans JP)로만 렌더.
- 자사 AI 제품명: **sa:ai** (Performance · Creative · **Archivo** 3축). "Built on: OpenAI · Anthropic · Gemini · Vercel · Next.js."
- Contact 메일: **jysiriai@gmail.com** (mailto, 이 주소만 사용).
> 참고: 리포지토리 다른 곳(`Dashboard/Liaison de LOREN/images/liaison/logo_ink.svg`)에 `logo_ink.svg`가 존재하나 이는 다른 캠페인(Liaison de LOREN) 자산이며 SIRIAI 브랜드 로고가 아니다. SIRIAI 자체 로고 자산 경로는 본 7개 문서에 정의되지 않음.

---

## 6. 클디(Claude Design) 핸드오프 구조 가이드

`클디/` 폴더 두 문서가 디자인 핸드오프 워크플로우를 정의한다.

### 워크플로우 구조 (`클로드디자인_사용법.md`)
1. **claude.ai** 웹/앱에서 대화로 단일 HTML 페이지(artifact)를 생성 → 우측 미리보기로 즉시 확인·수정.
2. 두 파일 역할 분리: `클로드디자인_사용법.md`(**어떻게** 쓰는지) + `클로드_프롬프트.md`(**무엇을** 붙여넣는지 = 재료).
3. 절차: claude.ai 새 대화 → `클로드_프롬프트.md`의 `─── 프롬프트 시작 ~ 끝 ───` 사이를 통째 복사 → 붙여넣기 → HTML 초안 → **미리보기 보며 말로 수정, 3~5회 반복.**
4. 수정 지시는 **"○번 섹션을…"처럼 위치를 콕 집어 + 구체적으로** ("Hero 그라데이션 더 진하게, 제목 폰트 더 크게").
5. 이미지는 클로드가 실제 생성 못 함 → **회색 placeholder 박스 + 캡션**으로 자리만, 진짜 비주얼은 Figma/디자이너 단계.
6. deck이 길면 답이 끊김 → "이어서 해줘" 또는 섹션별 분할 생성.

### 프롬프트가 강제하는 산출물 사양 (`클로드_프롬프트.md`)
- **단일 HTML 파일**(인라인 CSS/JS), 모바일 반응형.
- 홈과 톤 통일: 화이트 골격 + Hero 파스텔 그라데이션(베이지·라벤더·피치) + 가는 곡선 라인. (※ 권위 토큰에선 베이스가 Paper `#F3EEE2`이며 "화이트"는 스터디기 표현 — V3는 Paper 기준.)
- 폰트 Pretendard, 헤딩 크고 진한 잉크, 본문 회색 얇게, 강조 단어만 bold.
- 각 섹션 = **좌측 텍스트 + 우측 큰 비주얼 카드**(라운드 사각, 회색 placeholder + 캡션).
- 섹션마다 **번호(01·02…) + 작은 대문자 라벨 + 한 줄 주석** (아카이브/색인 느낌).
- 애니메이션 = **스크롤 fade-in만.** 미검증 정보(도시 시계·SF/Tokyo 거점·미검증 수치) 제외.
- 권장 섹션 구조: Hero → Approach(관점) → Practices(4: 아키텍팅·콘텐츠 비즈니스·sa:ai·프라이빗 브랜드) → Proof/Cases(질문형 제목 + 익명 업종) → Partners(실명 텍스트 리스트) → Studio → Contact(mailto:jysiriai@gmail.com). **sa:ai 별도 섹션은 삭제하고 Practices 03에 통합, 네비에서도 제외.**
- Partners 실명 OK: 무신사·카카오페이·HYBE·CJ ENM·JYP·이니스프리·COSRX·아이디병원·MOEV·oddtype + 기술스택(OpenAI·Anthropic·Gemini·Vercel·Next.js). 단 Proof의 케이스 스토리는 업종으로 **익명화**.

### 디자인 핸드오프 분담 (메모리 컨텍스트, 보강)
- 디자인 실험실 분담: **로컬에서 Code가 시안을 능동 제작→역제안, claude.ai(클디)는 최종 양산.**
- 배포는 로컬 개발 우선, Vercel 배포는 최종 확정 시에만.

---

## V3 제작용 즉시 적용 스니펫 (권위 토큰 통합)
```css
:root{
  --paper:#F3EEE2; --surface:#FFFFFF; --ink:#211A33;
  --ink-2:rgba(33,26,51,.66); --ink-3:rgba(33,26,51,.46);
  --line:rgba(33,26,51,.13); --accent:#2A6FDB;
  --peach:rgba(246,201,168,.5); --lilac:rgba(221,208,239,.45); --cream:rgba(255,224,196,.4);
  --f-en:'Helvetica Neue','Helvetica','Arimo','Pretendard',Arial,sans-serif;
  --f-kr:'Pretendard',system-ui,sans-serif;
  --f-mono:'JetBrains Mono',ui-monospace,monospace;
  --f-serif:'Bodoni Moda',Georgia,serif;
  --f-jp:'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif;
}
body{
  font-family:var(--f-kr); color:var(--ink); line-height:1.6; letter-spacing:-.005em;
  word-break:keep-all;
  background:
    radial-gradient(60% 50% at 16% 6%, var(--peach), transparent 60%),
    radial-gradient(55% 45% at 88% 4%, var(--lilac), transparent 60%),
    var(--paper);
}
```

**핵심 5가지 절대 준수:** ① 배경 Paper `#F3EEE2`, 텍스트 Ink `#211A33` ② 영문 Helvetica/Arimo · 국문 Pretendard · 라벨 JetBrains Mono(대문자) ③ **Schibsted Grotesk / Inter / Roboto / Arial단독 / 맑은고딕·굴림 금지** ④ 강조 = Ink 솔리드 알약 버튼 하나, 색감은 웜 워시(peach/lilac/cream)로 ⑤ 순백+순흑 금지, 형광·무지개 그라데이션·이모지·진한 그림자·두꺼운 컬러 박스 금지.

## keyFacts

- Paper(기본 배경) = #F3EEE2 (CSS --paper), RGB(243,238,226) 따뜻한 크림 종이
- Ink(기본 텍스트·CTA 버튼) = #211A33 (CSS --ink), RGB(33,26,51)
- Surface(카드/글래스 표면) = #FFFFFF (CSS --surface)
- Ink-2(보조 텍스트) = rgba(33,26,51,.66); Ink-3(캡션·비활성) = rgba(33,26,51,.46)
- Line(헤어라인·구분선) = rgba(33,26,51,.13) — 13% 투명도
- Accent(파란 강조, 텍스트 링크에만 드물게) = #2A6FDB
- 웜 워시 색: peach rgba(246,201,168,.5), lilac rgba(221,208,239,.45), cream rgba(255,224,196,.4) — Paper 위 radial-gradient 1~3겹, 평평한 색면 금지
- 영문 폰트 = 'Helvetica Neue','Helvetica','Arimo','Pretendard',Arial,sans-serif (Helvetica/Arimo)
- 국문 폰트 = 'Pretendard', system-ui, sans-serif
- 라벨/메타/태그 폰트 = 'JetBrains Mono', ui-monospace, monospace — 항상 UPPERCASE
- 일문 폰트(사명 知り合い 등) = Hiragino Sans / Hiragino Kaku Gothic ProN / Yu Gothic / Noto Sans JP
- 에디토리얼 악센트(드뭄, 큰 특별 제목) = 'Bodoni Moda', Georgia, serif
- Schibsted Grotesk는 명시적으로 금지/오류 — '2차 초기 Schibsted Grotesk(클로드 실측 오류) → 공식 Helvetica/Arimo'
- 금지 폰트: Schibsted Grotesk, Inter, Roboto, Arial단독, 맑은고딕, 굴림
- 자간 규칙: 큰 제목 -0.015~-0.035em(좁게), 본문 -0.005em, 라벨 모노 +0.16~0.22em(넓게)
- 영문 헤드라인: Helvetica/Arimo 500, clamp(38px,6vw,82px), -0.022em, line-height 1.08
- 국문 헤드라인: Pretendard 600, clamp(30px,5.2vw,74px), -0.015em, 1.16, word-break:keep-all
- 본문: Pretendard 400, 16px, -0.005em, line-height 1.6
- 라벨/eyebrow: JetBrains Mono 400-500, 9.5-13px, UPPERCASE, letter-spacing .16-.22em
- Radius: 12px(작은 카드/아이콘 버튼), 18px(패널/글래스 바), 100px(버튼·태그 알약 pill)
- 화면 가장자리 여백 = 6vw 또는 clamp(22px,5vw,64px); 본문 max-width 30em; 페이지 max-width 1080px
- 글래스 표면: rgba(255,255,255,.55) + backdrop-filter blur(20px) saturate(1.5) + 1px line 보더
- 표준 그림자(유일): 0 16px 44px rgba(33,26,51,.13) — 진한 드롭섀도 금지
- Primary 버튼 = Ink 솔리드 알약: background var(--ink), color var(--paper), border-radius 100px, padding 13px 26px, Helvetica 500 15px
- ::selection = 배경 Ink / 글자 Paper
- Pretendard CDN: https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css
- Google Fonts: Arimo(400-700), JetBrains Mono(400-500), Bodoni Moda(500), Noto Sans JP(400-500)
- 톤: 고객(브랜드)이 hero, 시리아이는 설계자(知り合い 가이드). '우리 잘한다' 자랑 금지, 모든 문장을 '당신 브랜드가~' 관점으로
- 감도 테스트 한 줄: '차분한 갤러리에 들어선 느낌인데, 안내하는 사람이 다정하고 똑똑하다'
- 주체적 동사 사용(설계한다·진단한다·발굴한다·증명한다), 벤더 언어('제작해드립니다') 금지
- 상투어 금지: 'Coming soon·to be continued·준비중' — 쓸 바엔 없앤다
- 모션 = 스크롤 fade-in만, 차분·최소
- 레이아웃: 좌측 텍스트 + 우측 큰 비주얼 카드(라운드 사각), 섹션마다 번호(01·02)+대문자 라벨+한 줄 주석(아카이브/색인 감성)
- 이미지는 회색 placeholder 박스 + 캡션으로 자리만 — claude.ai는 실제 사진 생성 못 함, 진짜 비주얼은 Figma/디자이너 단계
- Do: 배경 Paper #F3EEE2 고정, 한 화면 한 메시지, 텍스트 위계 Ink/Ink-2/Ink-3 3단계, 강조 Ink 알약 하나
- Don't: 순백+검정 텍스트, 형광·무지개 그라데이션, 채도 높은 단색면, 두꺼운 컬러 박스, 진한 드롭섀도, 이모지·클립아트 남발
- 권위 기준 파일 2개: 'V2/03_디자인/SIRIAI 브랜드 원칙 (Claude용).md'와 'V2/03_디자인/디자인_가이드.html' (둘 다 SIRIAI Field.html 홈 히어로 실측 기반)
- 스터디 폴더 3개 문서(2026-06-02~06-04)의 초기 토큰(#FFFFFF·#111111 베이스, 명조 헤딩, Inter/Suisse 영문)은 폐기·정정됨 — 최종은 권위 파일 따름
- SIRIAI 자체 로고 이미지 자산 경로/사용 규칙은 읽은 7개 문서에 정의되지 않음 (헤더는 텍스트 라벨로 처리). logo_ink.svg는 다른 캠페인(Liaison de LOREN) 자산
- 자사 AI 제품명 = sa:ai (Performance·Creative·Archivo 3축), Built on OpenAI·Anthropic·Gemini·Vercel·Next.js
- Contact 메일 = jysiriai@gmail.com (mailto, 이 주소만)
- 클디 핸드오프: claude.ai 대화로 단일 HTML artifact 생성→미리보기 보며 말로 3~5회 반복 수정. '클로드_프롬프트.md' 재료를 복붙, '○번 섹션을 구체적으로' 지시
- 산출물 제약: 단일 HTML(인라인 CSS/JS), 모바일 반응형, 미검증 정보(도시 시계·SF/Tokyo 거점·미검증 수치) 제외

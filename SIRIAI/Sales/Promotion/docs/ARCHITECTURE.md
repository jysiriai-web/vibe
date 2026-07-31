# 구조 (ARCHITECTURE)

## 데이터 흐름

```
[게이트 /]  코드 입력
     │  verifyCode(code)  ← 서버 액션 (lib/actions.ts)
     │     · normalizeCode → lookupCompany (lib/codes.ts, 서버 전용 레지스트리)
     │     · recordEntry (lib/access-log.ts) → 콘솔 로그 + (웹훅 있으면) 시트 O열 +1
     ▼
[개인화 /space/[code]]  서버 컴포넌트 (app/space/[code]/page.tsx)
     │  lookupCompany(code) → Company (연락처 포함, 서버에만 존재)
     │  getSegmentForCompany(company) → Segment (구분 없으면 중립 문구)
     │  ⚠ 클라이언트로는 { code, brand, segment, gubun } 만 전달 (이메일 제외)
     ▼
[ExperienceShell]  클라이언트 셸 — 비주얼 ⟷ 리스트 토글, 클로징 CTA
     ├─ VisualView → VisualCanvas  (드래그 사진 캔버스 + 호버 지표)
     └─ ListView   → Donut / Bars  (로스터 표 · 차트 · Raw CSV 다운로드)
```

## 라우트 (`app/`)

| 파일 | 역할 |
|---|---|
| `app/layout.tsx` | 폰트(Inter Tight + Noto Sans KR), 메타데이터, 전역 커서(BrandCursor) |
| `app/globals.css` | 디자인 토큰(색·여백·타이포), 유틸 클래스, 애니메이션 |
| `app/page.tsx` | 게이트 → `<Gate />` |
| `app/space/[code]/page.tsx` | 개인화 화면(서버). 코드로 회사 조회 → 세그먼트 → 셸 렌더 |
| `app/space/[code]/not-found.tsx` | 잘못된 코드 화면 |

## 라이브러리 (`lib/`)

| 파일 | 역할 |
|---|---|
| `companies.ts` | **자동 생성**. 회사 레지스트리(코드·브랜드·구분·연락처). 서버 전용. |
| `codes.ts` | 코드 정규화 + 조회(`lookupCompany`), 테스트 코드(`TEST-*`), `isTestCode` |
| `actions.ts` | 서버 액션 `verifyCode`(진입 검증+기록). 문의는 외부 링크라 여기 없음 |
| `segments.ts` | 세그먼트 데이터(카피·액센트·카테고리·로스터·갤러리), 중립 처리 `getSegmentForCompany` |
| `influencers.ts` | 크리에이터 풀(핸들 + 사진 경로). `segments.ts` 가 이걸로 로스터/갤러리 구성 |
| `access-log.ts` | 진입 기록 → 콘솔 + 웹훅(`ACCESS_LOG_WEBHOOK`). 테스트 코드는 시트 전송 스킵 |
| `links.ts` | 아웃링크 상수(문의하기 / 홈페이지) |
| `types.ts` | 공용 타입(`Segment`, `Creator`, `GalleryItem` …). `Company` 는 companies.ts에서 재수출 |

## 컴포넌트 (`components/`)

| 컴포넌트 | 역할 |
|---|---|
| `Gate` | 코드 입력 폼, 검증 상태, 성공 시 `/space/<코드>` 이동 |
| `GateLoader` | 진입 타이핑 로더("Creator Intelligence…") → 히어로로 페이드 |
| `GateCanvas` | 게이트 배경 — **자체 WebGL 셰이더**(블룸 그라데이션, 의존성 0). 실패 시 CSS 폴백 |
| `BrandCursor` | 전역 커스텀 커서(8px, difference 블렌드). 입력창 위에선 기본 커서 |
| `ExperienceShell` | 개인화 셸 — 헤더/토글/클로징. 비주얼⟷리스트 전환 애니메이션 |
| `VisualView` | 비주얼 섹션(풀스크린). 인트로 카드(드래그 시 사라짐) |
| `VisualCanvas` | **드래그 가능한 마소닉 사진 캔버스** — 관성/줌/키보드, 호버 시 크리에이터 지표 |
| `ListView` | 데이터 섹션 — 지표 카드 · 차트 · 로스터 표(20/페이지) · **Raw CSV 다운로드** |
| `charts/Donut` · `charts/Bars` | 카테고리 도넛 · 티어 분포 바 (SVG, 자체 구현) |
| `BilingualLead` | 클로징 헤드라인 EN→KO 스크롤-인 전환 |
| `SiriMark` | 브랜드 마크(로고 이미지) |

## 핵심 기술 노트

- **WebGL 필드(GateCanvas)**: fragment 셰이더 직접 작성. 두 가우시안 블룸을 합산해
  하나의 밀도 램프(black→amber→orange→pink)로 읽음. 컨텍스트 소실 시 조용히 CSS 폴백.
- **드래그 캔버스(VisualCanvas)**: 포인터 캡처 + 관성 + 러버밴드. 사진은 `next/image` 최적화.
- **연락처 서버-온리**: `companies.ts` 는 클라이언트 번들에 실리지 않음(서버 액션/컴포넌트에서만 import).
  개인화 페이지도 연락처를 클라이언트로 넘기지 않음(page.tsx에서 필드 선별).
- **진입 기록**: 성공/실패(오타) 모두 `[entry] {...}` JSON. 웹훅으로 시트 적재(선택).

## 데이터가 목업인 부분

크리에이터 **지표**(팔로워·ER·티어)는 핸들에서 결정적으로 생성한 **대표 목업**입니다
(원본 명단이 핸들만 제공). 화면에 "representative mock" 표기. 실 API 연동 시 같은 구조로 대체.
회사 정보(코드·브랜드·구분·연락처)는 실데이터(마스터시트).

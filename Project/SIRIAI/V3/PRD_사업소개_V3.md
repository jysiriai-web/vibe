# PRD — SIRIAI 사업소개 V3 (챗봇형 인터랙티브)

> Phase 1 산출물. 빌드된 구조를 기준으로 기술. 작성일 2026-06-09.
> 콘텐츠 인벤토리: [V2_콘텐츠_인벤토리.md](V2_콘텐츠_인벤토리.md) · 원본 정독: `_phase0_raw/*.md`

---

## 1. 제품 컨셉 / 목표

문서를 "읽는" 사업소개서가 아니라, 챗봇과 대화하듯 **필요한 정보만 꺼내 보는 체험형 제품**.
방문자가 사업분야를 탐색하다 자연스럽게 문의/미팅으로 이어진다.

- **전환 흐름:** 홈페이지 → **deck(이 페이지)** → 클라이언트 문의(이메일/오픈채팅)
- **핵심 전제:** 바뀌는 건 포맷/경험. 알맹이(V2 카피·데이터·레퍼런스)는 자산으로 그대로 살린다.
- **핵심 인상:** "살아있는" 질문 칩 캐러셀 — 질문들이 천천히 돌며 떠다니다 클릭하면 답이 열린다.

## 2. 정보구조(IA) · 화면 흐름

```
(0) Hero  "시리아이의 다양한 사업분야를 만나보세요"  + 진입 화살표
        │ (클릭/Enter)
(1) Hub   "무엇을 찾고 계신가요?"  4개 사업분야 카드
        │ (ready 카드 클릭)            (coming_soon 카드 → 티저 룸)
(2) Q&A 룸 (사업분야 상세)
        ├─ 좌: 헤드라인 + 인플루언서 비주얼 + 검증 수치 / (질문 열리면) 선택한 질문 컨텍스트
        ├─ 우: 질문 칩 캐러셀(살아있는) / (클릭 시) 답변 + 후속질문 칩
        ├─ 하단: 함께 제공하는 것(서비스) · 함께한 브랜드/사례 · 분야 CTA
        └─ 좌측 사이드바: 전체 목차(4분야) + "내가 본 질문" 히스토리
[전 구간] 우하단 플로팅 큐레이션 챗봇 + 상단 슬림 바(워드마크/브레드크럼)
```

전역 상태기계(`App.jsx`): `view: 'intro' → 'hub' → 'area'` + `activeAreaId` + `activeQ`(열린 질문, null이면 캐러셀) + `history[]` + `chatOpen`.

## 3. 사업분야 4개 정의 + 상태

| # | id | 명칭 | 상태 | 비고 |
|---|---|---|---|---|
| 1 | `influencer` | 인플루언서 비즈니스 | **ready** | 유일 완성. 11개 Q&A·서비스 7종·레퍼런스 4건·검증수치 4 |
| 2 | `architecting` | 아키텍팅 | coming_soon | 헤드라인+티저(암시). 카피만 |
| 3 | `saai` | sa:ai | coming_soon | 헤드라인+티저. 외부 figma 자료 |
| 4 | `pb` | Private Brand | coming_soon | 2026 암시. 상투어 금지 |

> V2 원본 순서는 01 아키텍팅이 먼저지만, V3 브리프 지시("1번=인플루언서")에 따라 인플루언서를 #1로 재배치. (DECISION)

## 4. Q&A 설계 — 질문 트리 (인플루언서)

루트 = `diff`(무엇이 다른가). 모든 말단(후속질문 없음 또는 `ctaLeaf`)에 CTA 노출.

```
diff (무엇이 다른가) ─┬─ ai (AI 선정) ── list
                     ├─ list (리스트 전달) ─┬─ timeline ── onboarding / report
                     │                      └─ report (보고) ── price
                     └─ reuse (2차 활용) ── overseas
timeline (기간) ── onboarding (착수금20%)·report
price (가격, 단가 비노출) ── onboarding · [CTA]
overseas (해외, 직접운영 X) ── reuse · diff
bigbrand (큰 브랜드) · ready (미팅 준비) ── [CTA]
```

- 각 질문: `{ id, entry, question, keywords[], answer{body, extra, visuals[]}, followUps[], ctaLeaf }`
- `entry:true` 질문은 캐러셀 앞쪽 + 챗봇 추천칩으로 우선 노출.
- 답변 비주얼 타입: `diagram`(온브랜드 SVG) · `process` · `stat` · `list` · `compare` · `note`.

## 5. 레퍼런스 통합 방식

- `area.references[]` 데이터 기반 모듈. 빈 배열이면 섹션 자동 숨김 → coming_soon 분야는 자연히 비노출.
- 카드: 브랜드 · 요약 · 지표 · 권역 · 플래그(`partner` 현지실행 / `consent: confidential` 대외비).
- ⚠️ 해외 케이스 `partner:true` → "직접 운영" 아님 명시. 실명/로고는 공개동의 후(`consent: pending`).

## 6. 사이드바 / 챗봇 동작

**사이드바(`Sidebar.jsx`):** 상단 전체 목차(4분야, ready/soon 구분·현재 분야 하이라이트) + 하단 "내가 본 질문" 히스토리(최근순, 클릭 시 해당 답변 복귀, 분야 자동 전환).

**챗봇(`Chatbot.jsx`):** 진짜 LLM 아님 — `content`의 Q&A 기반 **큐레이션형**.
- 동작: 입력/선택 → `keywords`+질문문 매칭(스코어 ≥ 임계) → 답변 버블. 매칭 없으면 폴백 + 추천칩 + 문의 CTA.
- UX: 인사말 → 추천칩 → 말풍선 · 타이핑 인디케이터 · "이 분야에서 자세히 보기" 점프 링크.
- 이유: 공개 영업용이라 가격·프로세스를 AI가 지어내면 안 됨. 신뢰가 핵심.

## 7. 모듈형 데이터 스키마

모든 콘텐츠는 `src/content.js` 단일 객체. 화면은 렌더만. 코드 하드코딩 금지.
```
content.meta { wordmark, jp, hero, hub, cta, channels, chatbot }
content.areas[] {
  id, order, title, subtitle, cardLine, status: 'ready'|'coming_soon',
  hero { eyebrow, headline, sub, image, imageAlt, imageCaption },
  proof[]{value,label}, services[]{name,en,blurb},
  qna[]{ id, entry, question, keywords[], answer{body,extra,visuals[]}, followUps[], ctaLeaf },
  references[]{ brand, summary, metric, region, partner, consent, group }, referencesNote,
  teaser{line,sub}, tech                 // coming_soon 전용
}
```
**확장 규칙:** 새 자료가 오면 해당 area의 `status`를 `ready`로 바꾸고 `hero·qna·references·services`만 채우면 화면에 자동으로 붙는다.

## 8. 기술 스택 결정 + 사유

- **React 18 + Vite** (DECISION). 사유: 선택·히스토리·챗봇·캐러셀 등 상태가 많아 컴포넌트화가 유리. 브리프 권장안이며 V2에 기존 셋업 없음 → 기본값. 콘텐츠는 단일 `content.js`로 완전 분리.
- 스타일: CSS 변수 토큰(`tokens.css`) 일원화 — 비주얼 변경은 토큰만 손대면 됨(클디 핸드오프 용이).
- 폰트: Pretendard(국문)/Arimo(영문)/JetBrains Mono(라벨)/Noto Sans JP(知り合い)/Bodoni Moda. ⛔ Schibsted Grotesk 금지.
- **배포 금지 — 로컬 전용.** vercel 등 외부 게시 일절 없음.

## 9. 미확정 TODO

| 항목 | 상태 | 비고 |
|---|---|---|
| 미팅(구글 캘린더) 예약 링크 | 🔴 미확보 | `content.meta.channels.meeting` 채우면 버튼 자동 노출 |
| 인플루언서 히어로 실사진 | 🔴 placeholder | 핸드오프/Figma 단계 교체 (`hero.image`) |
| 국내 시딩 실제 캡처 | 🔴 없음 | V2에 캡처 0장 — 수집 필요 |
| 브랜드 로고/실명 공개동의 | 🟡 미확정 | 특히 HYBE 계열 — 노출 전 확인 |
| 아키텍팅/sa:ai/PB 본문 | ⚪ coming_soon | 자료 확보 시 `status: ready` 전환 |
| 단가/미검증 수치 | ✅ 비노출 처리 | 인벤토리 §9 게이트 준수 |

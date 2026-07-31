# SIRIAI 제안 대시보드 — 재사용 템플릿

신규/아웃바운드 브랜드에게 보낼 인플루언서 캠페인 제안 대시보드를 **config 객체 하나만 갈아끼우면** 완성되도록 만든 단일 HTML 템플릿입니다.

기존 4종(Liaison · LUSOM · 틈결 DB · teumgyul Report)의 베스트 패턴을 하나의 엔진으로 합치고,
공통 약점(PDF 불가 · 하드코딩 · 모바일 미대응 · 원가 노출)을 표준 해결했습니다.

---

## 1. 새 브랜드 만드는 법 (3단계)

1. `index.html`을 복사 → `브랜드명.html` (예: `glowist.html`)
2. 파일 안의 **`const BRAND = { ... }`** 블록만 수정 (그 위/아래 "여기만 수정하세요" 배너 사이)
3. 더블클릭으로 열어 확인 → 끝. (집계 KPI·PDF·마스킹·SIRIAI 브랜드 스타일은 엔진이 자동 처리)

> 엔진(`applyBrand` 아래 `<script>`)은 **수정 불필요**합니다.

---

## 2. config 채우기 체크리스트

새 브랜드 정보(홈페이지·인스타)를 받으면 아래만 채우면 됩니다.

| 키 | 내용 | 비고 |
|---|---|---|
| `meta.name` | 브랜드 표기명 | 표지 워드마크·네비에 자동 반영 |
| `meta.mode` | `public` / `internal` | public = 원가·민감정보 마스킹 |
| `meta.sample` | `true`/`false` | 가상 데모면 true(표지 Sample 배지) |
| `brandKit.colors.accent` | 클라 악센트 **1색만** | 웜 클레이/브랜드색. **베이스(Paper/Ink)·폰트는 SIRIAI 고정** — 건드리지 않음 |
| `brandKit.logo` | 로고 SVG 경로 | 없으면 이름 워드마크(Helvetica) 자동 |
| `brandKit.coverImage` | 표지 이미지 경로 | 없으면 그라데이션 플레이스홀더 |
| `brandKit.coverCaption` | 표지 도시 캡션 | 예: `SEOUL · LOS ANGELES` |
| `copy` | eyebrow·tagline·badges 등 카피 | 브랜드 톤에 맞춰 |
| `whyUs.items` | "왜 SIRIAI" 3카드 | 보통 그대로 두고 브랜드명만 |
| `domestic.influencers` | 인플루언서 리스트(정규화) | **합산 KPI는 자동 계산** |
| `domestic.featuredNos` | 큐레이션 카드로 띄울 no 4개 | 없으면 ER 상위 4명 자동 |
| `domestic.comparison` | ER 비교(업계 vs 제안) | maxScale로 막대 자동 |
| `overseas.simulator` | 예산 시뮬레이터 계수 | 단가·계수만 바꾸면 견적 변경 |
| `overseas.reference` | PROVEN REFERENCE 실적 | 대외 공개 가능한 것만 |
| `process.tabs` | 진행 단계(국내/북미) | 단계 클릭 시 상세 모달 |
| `closing.packages` | A~F 패키지 | featured:true 1개 강조 |
| `closing.contact` | 연락처 | 메일·사이트·인스타 |
| `nav` | 하단 네비 라벨 6개 | 슬라이드 순서와 일치 |
| `share.image` | 카톡/OG 공유 썸네일 | 링크 공유 미리보기 |

### 인플루언서 객체 스키마
```js
{ no:1, name:'Yuna L.', followers:17100, views:2200, er:2.46, ig:'@yuna.l', costKRW:600000, img:null }
```
- `followers`·`views`는 **숫자**로 입력(콤마/만 단위 X) → 엔진이 `17.1K`/`만` 자동 포맷
- `costKRW`는 `internal` 모드에서만 노출, `public`에선 `협의`로 마스킹
- `img` 없으면 이름 첫 글자 그라데이션 아바타 자동

---

## 3. 확장성 (표준 장착)

- **모바일**: 768px 이하 자동 1~2열 재배치 + 하단 네비 가로스크롤 + 터치 스와이프
- **전체 PDF**: 툴바 `전체 PDF` → 6장을 가로 A4로 펼쳐 인쇄/저장 (화면 그대로)
- **간단 PDF**: 툴바 `간단 PDF` → 핵심 KPI·예산 시나리오·패키지·연락처만 1장 요약
- **영업/내부 모드**: `meta.mode` 또는 URL `?mode=internal` → 같은 파일로 대외본/내부본 분리

### PDF 저장 팁
브라우저 인쇄(Ctrl+P) → 대상 "PDF로 저장" → 배경 그래픽 켜기.
툴바 버튼이 인쇄 직전 막대·레이아웃을 자동 정리합니다.

---

## 4. 로컬 미리보기

```
# Dashboard 폴더에서
node .claude/static-server.js _SIRIAI_TEMPLATE 8077
# → http://localhost:8077
```
또는 `index.html`을 그냥 브라우저로 더블클릭(폰트 CDN만 필요).

---

## 5. 배포 (최종 확정 후)

단일 HTML이라 Vercel에 `index.html`만 올리면 끝.
브랜드별로 별도 폴더/링크로 운용 권장 (`/aurelle`, `/glowist` …).

---

## 설계 메모

- **SIRIAI 하우스 스타일 고정**: 배경 Paper `#F3EEE2` · 텍스트 Ink `#211A33` · 영문 Helvetica/Arimo · 국문 Pretendard · 라벨 JetBrains Mono · 에디토리얼 악센트 Bodoni Moda. 베이스·폰트는 엔진에 박혀 있고, config는 클라 **악센트 1색**만 절제 사용(웜 워시·이미지에서 색감이 나옴). 순백/순흑·채도 높은 색면·이모지·진한 그림자 금지.
- 색·폰트 = CSS 토큰(SIRIAI 고정) / 콘텐츠 = config / 인터랙션 = 공통 컴포넌트, **3계층 분리**
- 집계(합산 팔로워·평균 ER·조회수)는 `influencers` 배열에서 `reduce` 자동 산출 → 수치 불일치 원천 차단
- 아이콘은 이모지 대신 currentColor SVG → 잉크/악센트 색 자동 상속
- 모달 `role=dialog`/`aria-modal`+포커스 트랩, 정렬 `aria-sort`, `aria-current`, `prefers-reduced-motion`, 빈 상태 메시지 등 접근성 반영

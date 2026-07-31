# 범용화 가이드 — 다른 이벤트/브랜드/데이터로 바꾸기

이 앱은 InterCHARM 2026용으로 만들었지만, **아래 지점만 갈아끼우면** 다른 행사나
범용 세일즈 툴로 재사용할 수 있습니다. 위에서부터 교체 빈도·중요도 순.

---

## 1. 회사 데이터 (교체 1순위)

`lib/companies.ts` 는 **자동 생성 파일**입니다. 손으로 고치지 마세요.

**재생성:**
```bash
# 1) 마스터시트 → 파일 → 다운로드 → CSV
# 2)
node scripts/generate-companies.mjs <시트.csv> lib/companies.ts
```

**다른 시트 구조에 맞추기** — `scripts/generate-companies.mjs` 상단 `CONFIG` 만 수정:
```js
const CONFIG = {
  headerRow: 8,          // 헤더 행(1-based). 데이터는 그 다음 행부터
  col: {                 // 0-based 열 인덱스 (A=0 … N=13)
    gubun: 3,  brand: 4,  code: 13,
    email: 6,  contactEmail: 11,  contactName: 8,  instagram: 7,  phone: 10,
  },
  segmentOf: (gubun) => (gubun.includes("메이크업") ? "beauty" : "skincare"),
};
```
- 컬럼 위치가 다르면 `col` 인덱스만 바꾸면 됩니다. 없는 필드는 `-1`.
- **세그먼트 분류 규칙**은 `segmentOf` — 지금은 "메이크업 포함 → beauty, 그 외 → skincare".
  세그먼트를 늘리거나 규칙을 바꾸면 **여기 + `lib/segments.ts` 를 함께** 수정(→ 2번).

> 연락처(email 등)는 서버 데이터로만 쓰이고 방문자에겐 노출되지 않습니다.
> (`app/space/[code]/page.tsx` 가 클라이언트로 `code/brand/segment/gubun` 만 넘김)

---

## 2. 세그먼트 (분류·카피·색)

`lib/segments.ts` — 세그먼트별 화면 내용 전부.

- **세그먼트 정의**: `beauty` / `skincare` 두 객체. 각각 `label·kicker·headline·sub·thesis·accent·categories·metrics`.
- **중립 처리**: `getSegmentForCompany()` — 구분값이 빈 회사는 `NEUTRAL_COPY` 로 문구만 덮어씀
  (데이터는 그대로). 카테고리를 단정하지 않아야 할 때 씀.
- **액센트 색**: 각 세그먼트 `accent.base/deep/soft/tint`.
- **세그먼트 추가**: `SegmentId` 타입(`lib/types.ts`) + 이 파일의 정의 + 생성기 `segmentOf` 규칙,
  세 곳을 맞춰야 함.

크리에이터 **지표는 목업**입니다(핸들 seed 기반). 실데이터 연동 시 `buildSegmentData` 를 교체.

---

## 3. 크리에이터 명단 · 사진

- 명단: `lib/influencers.ts` — `INFLUENCERS.{beauty,skincare}` (핸들 + 사진 경로), `POOL` (풀 규모 숫자).
- 사진: `public/influencer/<beauty|skincare>/<핸들>_<n>.jpg`.
- 교체: 명단 배열과 사진 파일을 갈아끼우면 로스터/갤러리가 자동 반영됨.

---

## 4. 브랜딩

| 대상 | 위치 |
|---|---|
| 색·여백·타이포 토큰 | `app/globals.css` 상단 `@theme` / `:root` |
| 폰트 | `app/layout.tsx` (Google Fonts link) + globals.css `--font-*` |
| 로고 이미지 | `public/brand/mark-*.png`, 컴포넌트 `components/SiriMark.tsx` |
| 파비콘·메타 | `app/layout.tsx` `metadata` |
| 배경 필드 색 | `components/GateCanvas.tsx` 셰이더 상단 `ORANGE/AMBER/PINK` 상수 |

---

## 5. 카피 (문구)

| 화면 | 위치 |
|---|---|
| 게이트 헤드라인·안내문 | `components/Gate.tsx` |
| 세그먼트 헤드라인·서브·thesis | `lib/segments.ts` (각 세그먼트 + `NEUTRAL_COPY`) |
| 클로징 카피(EN→KO) | `components/ExperienceShell.tsx` 의 `<BilingualLead lines={…}>` |
| 리스트 표 제목/각주 | `components/ListView.tsx` |

---

## 6. 이벤트 종속 문구 (InterCHARM → 다른 행사)

딱 세 파일입니다:

- `app/layout.tsx` — `title`, `metadataBase`, OpenGraph.
- `components/Gate.tsx` — 상단 `INTERCHARM SEOUL 2026`, 하단 `© 2026 SIRIAI` 등.
- `components/ExperienceShell.tsx` — 푸터 `… INTERCHARM 2026 · Booth C-24`.

---

## 7. 아웃링크

`lib/links.ts` — 한 곳만 고치면 전 화면 반영.
```ts
export const INQUIRY_URL = "https://siriai-business.vercel.app/#contact"; // 문의하기
export const HOMEPAGE_URL = "https://siriai.kr";                          // 홈페이지(브랜드 마크)
```
> `#contact` 는 대상 페이지에 `id="contact"` 앵커가 있어야 이동함. 없으면 상단 로드(부작용 없음).

---

## 8. 진입 기록 → 구글시트

`lib/access-log.ts` + Apps Script 웹훅. 상세 설정은 **[접속기록-설정.md](접속기록-설정.md)**.
- 환경변수 `ACCESS_LOG_WEBHOOK` 에 Apps Script 웹앱 URL을 넣으면 시트에 적재 + 열람 횟수(O열) +1.
- 웹훅 원본 코드: `docs/apps-script/Code.gs` (순수 .gs, 마크다운 아님).
- 없어도 앱은 정상 동작(콘솔 로그만 남음). 테스트 코드는 전송을 건너뜀.

---

## 9. 테스트 코드

`lib/codes.ts` 의 `TEST_COMPANIES` — `TEST-COLOR / TEST-SKIN / TEST-NEUTRAL`.
시트에 없는 코드라 열람 횟수를 올리지 않고 시트 전송도 건너뜀(`isTestCode`). 게이트 UI엔 비노출.

---

## 배포 (Vercel)

```bash
vercel --prod --yes
```

⚠️ **알려진 함정**
- **배포마다 구 도메인 `siriai-sales.vercel.app` 이 자동 재부착됨**(프로젝트 rename 잔재).
  배포 후 원하는 도메인으로 다시 붙이고 구 도메인을 떼야 함:
  ```bash
  vercel alias set <새-배포-URL> <원하는-도메인>.vercel.app
  vercel alias rm siriai-sales.vercel.app --yes
  ```
  영구 해결: Vercel 대시보드 → 프로젝트 → Settings → Domains 에서 `siriai-sales.vercel.app` 제거.
- **Deployment Protection(SSO)** 이 켜지면 200을 반환해도 "Log in to Vercel" 벽이 뜸.
  공개 여부는 **로그인 없는 요청 + 본문**으로 확인할 것(상태코드만 보면 안 됨).
- Vercel은 **취약 Next.js 버전 배포를 차단**함 → 보안 패치 버전 유지.

## 릴리즈 전 체크리스트

- [ ] 마스터시트 최신본으로 `companies.ts` 재생성
- [ ] 이벤트 문구 3파일 교체(6번)
- [ ] 아웃링크(7번)가 공개 접근 가능한지(로그인 벽 없음) 확인
- [ ] `npm run build` 통과
- [ ] 클라이언트 번들에 이메일 미노출 확인:
      `grep -r "<샘플이메일>" .next/static` → 0건
- [ ] 배포 후 도메인 alias 정리(위 함정)

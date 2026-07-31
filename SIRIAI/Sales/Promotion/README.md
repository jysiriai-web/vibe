# SIRIAI · 개인화 세일즈 전환 웹앱

브랜드별 **초대 코드**로 진입하는 개인화 세일즈 페이지.
`코드 게이트 → 개인화 화면(비주얼 ⟷ 데이터) → 문의` 로 이어지는 오프라인 부스/행사용 전환 도구.

> 최초 구현은 **InterCHARM 2026**용이지만, 이벤트·브랜드·데이터를 갈아끼우면
> 범용 세일즈 툴로 재사용할 수 있게 설계돼 있습니다. → **[docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)**

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:3000
```

게이트에 코드 입력 → `/space/<코드>` 로 이동.
**테스트 코드**(시트를 건드리지 않음): `TEST-COLOR` · `TEST-SKIN` · `TEST-NEUTRAL`

## 스택

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Motion.
외부 UI 라이브러리 최소, 배경 효과는 의존성 없는 자체 WebGL 셰이더.

## 화면 흐름

1. **게이트** (`/`) — 초대 코드 입력. 타이핑 로더 + WebGL 그라데이션 필드.
2. **개인화 화면** (`/space/<코드>`) — 코드로 회사를 찾아 세그먼트에 맞춰 렌더.
   - **비주얼**: 드래그로 둘러보는 풀스크린 사진 캔버스 (마우스오버 시 크리에이터 지표).
   - **리스트**: 로스터 표(페이징) + 도넛/바 차트 + **Raw 데이터 CSV 다운로드**.
   - **문의하기**: 외부 사업소개/문의 페이지로 이동.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 파일·모듈 구조, 데이터 흐름 |
| [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) | **범용화 가이드** — 이벤트/브랜드/데이터 갈아끼우는 법 |
| [docs/접속기록-설정.md](docs/접속기록-설정.md) | 코드 진입 기록 → 구글시트 O열 연동 설정 |

## 핵심 규칙 (꼭 알 것)

- **`lib/companies.ts` 는 자동 생성 파일** — 손으로 고치지 말 것.
  마스터시트 CSV에서 `node scripts/generate-companies.mjs <시트.csv> lib/companies.ts` 로 재생성.
- **연락처(이메일 등)는 서버 데이터** — `lib/companies.ts` 는 서버에서만 import되고,
  개인화 페이지(클라이언트)로는 `code/brand/segment/gubun` 만 넘긴다. 방문자에겐 이메일 미노출.
- 이 레포에는 **실제 회사 연락처 데이터**가 들어 있으니 반드시 **비공개**로 다룰 것.

## 배포 (Vercel)

```bash
vercel --prod --yes
```

⚠️ 배포 세부 주의사항(도메인 alias 재부착 등)은 **[docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) → 배포** 참고.

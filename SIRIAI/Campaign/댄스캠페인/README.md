# 🌱 Garden — 캠페인 라이프사이클 대시보드

인플루언서 캠페인의 전주기(모집 → 업로드 → 가드닝 → 납품 → 정산)를 한 화면에서 관리하는 로컬 대시보드.
1차 대상: **베이온** 일본 댄스챌린지(MUAH!, 마루 × 시리아이) 틱톡 캠페인.

## 실행

**`dashboard.bat` 더블클릭** → 브라우저에서 `http://localhost:3737` 열림. (창을 닫으면 대시보드가 꺼짐)

- 최초 1회: `_bat/install-playwright.bat` 실행(영상 스크래핑용 크롬 엔진 설치, ~130MB)
- 로컬 전용 도구 — 스캔은 집(가정용) IP + 실제 브라우저 창으로 틱톡 봇 차단을 우회함

## 탭

| 탭 | 내용 |
|---|---|
| ① 모집 | 계정·팔로워·진행사(마루/시리아이). **모집 스캔** = 팔로워 자동 수집 |
| ② 업로드 | 콘텐츠 링크·검수(음원/음원구간/해시태그). **업로드 스캔** = 영상 자동 감지 |
| ③ 가드닝 | 팔로워 1K 미달 계정에 smmkings로 팔로워 보충(집행 버튼, 돈 나감) |
| ④ 납품 | 조회수·좋아요 등 성과, 히어로 콘텐츠, SIRIAI 베스트 |
| ⑤ 정산 | 비용·매출·마진 시뮬레이터 |

## 폴더 구조

```
Garden/
├─ dashboard.bat        메인 실행(더블클릭)
├─ src/                 백엔드(Node 내장 http, 의존성 0)
├─ public/              프론트(대시보드 UI + 정산 시뮬레이터)
├─ scripts/             CLI 도구(sync·execute·orders·scan-content 등)
├─ appsscript/          구글시트 브릿지(Code.gs — 시트에 배포)
├─ data/                캠페인별 상태(orders·scan-latest 등, gitignore)
├─ _bat/                유틸 실행(콘텐츠 스캔·설치·테스트)
├─ _docs/               참고 자료
├─ _archive/            과거 버전(gitignore)
├─ campaigns.json       캠페인 설정(시트 URL·목표치 등, gitignore·비밀)
└─ .env                 API 키(gitignore·비밀)
```

## 설정 파일 (git 미포함)

- **`.env`** — smmkings API 키, 시트 웹앱 URL/토큰 (`.env.example` 참고)
- **`campaigns.json`** — 캠페인별 시트·목표·서비스·해시태그·음원·모집시트

## 데이터 흐름

구글 마스터시트 ↔ Apps Script 브릿지 ↔ 로컬 서버. 팔로워/콘텐츠/검수/성과는 시트에 되쓰기, 주문·비용은 로컬(`data/`)에만 저장.

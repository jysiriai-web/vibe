# Routine — SIRIAI 업무 자동화 모듈 모음

내(SIRIAI)의 반복 업무를 자동화하는 **모듈들의 집**이다.
**각 모듈 = 폴더 1개**, 폴더들은 영업 사이클 순서로 이어진다. 출력은 전부 **구글시트** 하나.

> 📌 **폴더만 봐도 이해되게** 만드는 게 원칙이다. 모듈 폴더 안에는 항상 `README.md`가 있고,
> [1.목적·목표 / 2.구조 / 3.기술스택 / 4.기타] 네 칸으로 설명한다. 뭘 지워도 되는지는 각 README의 "기타"를 보면 된다.

---

## 모듈 사이클 (0→7 메인 + 8·9 사이드 · 정본=`_docs/_모듈_로드맵.md`)

| # | 폴더 | 하는 일 | 상태 |
|---|------|--------|------|
| 0 | **`0_intake/`** | 브랜드 소싱·입력 (프로필 기반 웹서치 → 중복제거 → 월 탭 추가) | ✅ 가동 |
| 1 | **`1_collector/`** | 회사/브랜드명 → 공식 이메일·구분·발송적합도·안전장치 | ✅ 가동 |
| 2 | **`2_compose/`** | 시트 행 → 완성 메일 (슬롯 치환) | ✅ 가동 |
| 3 | **`3_send/`** | 발송 + 시트에 발송 기록 · 중복 차단 | ✅ 가동·**하드락** |
| 4 | **`4_track/`** | 반송 수집(`collect_bounces.py`) · 회신 감지 | ✅ 가동 |

> 5_reply ~ 9_report(회신분류·제안·계약·리마인드·현황판)는 README만 있던 빈 껍데기라
> `_archive/2026-07_미착수단계/` 로 옮겼다. 착수할 때 꺼내 쓴다.

### 인터참 메일 보내는 전체 순서

```bash
cd Routine
# 1) 시트 최신본 받기 → intercharm/data/live_master_latest.csv
# 2) 반송 먼저 걸러내기
.venv/Scripts/python.exe 4_track/collect_bounces.py --days 7 --apply
# 3) 메일 만들기
.venv/Scripts/python.exe 2_compose/render_intercharm.py \
    --csv ../intercharm/data/live_master_latest.csv --official-only --intercharm2026
# 4) 확인(발송 안 함)  → 5) 발송
.venv/Scripts/python.exe 3_send/send_intercharm.py --all --skip-sent
touch secrets/SEND_UNLOCKED
.venv/Scripts/python.exe 3_send/send_intercharm.py --all --skip-sent --send
rm secrets/SEND_UNLOCKED          # ★끝나면 반드시 다시 잠근다
```
⚠️ 반드시 **`.venv/Scripts/python.exe`** 로 실행(시스템 파이썬엔 구글 라이브러리 없음).

### 토큰 만료 (7일마다 반복되는 이유)

OAuth 앱이 **테스트 모드**라 refresh 토큰이 7일 뒤 만료된다.
**영구 해결 = Google Cloud Console → OAuth 동의 화면 → 앱 게시(프로덕션).**
임시 재발급(브라우저 로그인 필요, 사람만 가능):
`Remove-Item secrets\gmail_token.json` 후 `.\.venv\Scripts\python.exe 3_send\gmail.py`

큰 그림: **소싱 → 이메일확보 → 작성 → 발송 → 추적 → 회신관리 → 제안 → 미팅·계약**, 매달 새 탭에서 반복. 8 후속·9 현황판은 옆에서 상시.
모든 모듈은 **같은 구글시트를 상태머신(`발송단계` 열)으로 공유**한다 — 코드 의존 0, 멱등. **작성↔발송 사이 사람 승인 게이트** + **발송 하드락**(`secrets/SEND_UNLOCKED` 없으면 어떤 경로로도 발송 차단).

## 공통 인프라 (모듈 아님)

| 폴더 | 내용 | 비고 |
|------|------|------|
| `_shared/` | 모든 모듈이 import하는 공유 코드 (시트접근·설정·정규화·백업) | 자체 README 있음 |
| `secrets/` | 구글 서비스계정 키 + Gmail OAuth 토큰(발송·읽기 별도) + `SEND_UNLOCKED`(발송 잠금해제 파일) | **git·배포 절대 금지**, 건드리지 말 것 |
| `.venv/` | 공유 파이썬 환경 | git 제외 |
| `requirements.txt` | 의존성 | |
| `_archive/` | 자동화와 무관한 보관물 (예: 영업자동화 워크샵 발표자료) | 사이클에서 빠진 자료 |

## 폴더 규칙

- **새 모듈 = `N_이름/` 폴더 1개.** 안에 `run.py`(진입점) + 로직 + `README.md`(4칸).
- **공유할 것은 `_shared/`에만** (키·시트설정·시트접근·정규화·백업). 모듈마다 복붙 금지.
- **산출물·백업·일회성 스크립트는 모듈 안 `archive/`로** 치운다. 평소엔 안 보이게 — 그래서 폴더가 깔끔.
- **탐색기엔 "내가 볼 것"만 보이게 — 잡다하거나 안 볼 폴더는 숨기고, 내용 적은 폴더는 뭐하는지 보이게.** Windows Hidden 대상: ①진짜 기계(코드 `.py`·`.js`·`.cmd`·설정·스크래치 `_*.json`·`secrets`·대시보드 서빙 HTML) ②root의 `_`-지원폴더(`_archive`·`_docs`·`_shared`·`_surfaces` — 평소 안 봄). **보이게: 모듈폴더 `0~9` + `README` + `대시보드.url`. 모듈 내부는 내용 적게 유지해 뭐하는지 파악되게**(README·결과 CSV·PRD·문서 + `archive`/`profiles`/`templates`). 숨김은 실행·git·경로·`_shared` import 전부 무관(코드 안 깨짐). 보려면 "숨김 항목 표시" ON / `ls -Force`, 해제 `attrib -h`.
- **git에 올리는 것:** 코드·문서·설정예시. **제외:** `secrets/`·`.venv/`·`archive/`·`_*.py`(스크래치).

## 안전 원칙 (모든 모듈 공통)

- 마스터 `브랜드 에셋` 탭은 **읽기 전용**.
- 모든 시트 쓰기 = **백업 → dry-run → `--apply --yes`**. 빈 셀에만 쓰고 기존값 무손상. 행 삭제는 사람 승인 후.
- 서비스계정 키는 **절대 커밋·배포 안 함**.
- **★토큰 헤비 작업(브랜드 소싱·이메일 검색 등)** — 사용자 명시 규칙: ①**한도 다 쓰면 거기서 STOP.** ②**리셋돼도 후속 지시로 "재개"라 명시 안 했으면 자동 재개 금지.** ③예외=진행 중 결과가 0될 상황 + 조금만 더 쓰면 건짐 → **소액 회수만 OK**(전체 재실행 ✗). ④**중단해도 작업물 안 날아가게**: 작은 청크·검색깊이 캡·청크끝마다 디스크 저장(상세 = `0_intake/README.md`).

## 로컬 폴더 ↔ 야간 자동화

- **이 폴더 = 코드.** 손으로 `run.cmd`로 돌려 테스트한다.
- **야간 자동화 = `/schedule`** 로 등록한 원격 cron. PC 꺼져도 돈다. 검증된 모듈만 올린다.

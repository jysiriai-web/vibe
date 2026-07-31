# SIRIAI 폴더 재구성 — 계획 & 진행상황

작성 2026-07-30 밤 (Claude). **밤새 준비 끝. 아침에 스크립트 1개만 실행하면 됨.**

## 목표 구조
```
SIRIAI/
├─ Sales/          Routine(엔진) · intercharm(박람회 세일즈)
├─ Campaign/       댄스캠페인(구 Garden) · US_seeding
└─ Company/        DECK(사업소개서) · _shared(브랜드 자산)      ※폴더명 변경가능
```

## ✅ 이미 끝난 것 (밤에 자동 처리함)
**경로 하드닝 — 하드코딩 절대경로 15개 파일 → 전부 상대경로화, 남은 하드코딩 0개.**
- 파이썬 12개: `sys.path.insert(0, r"C:\...\Routine")` → **상위폴더를 거슬러 올라가며 `Routine/_shared` 를 자동 탐색**
  → Routine 이 어디로 옮겨져도(어떤 깊이든) 스스로 찾음. 대상: `0_intake/_classify_new·_ingest_chunk`, `1_collector/apply_assets·extract_gaps·extract_unconfirmed`, `intercharm/data/_work/*.py`(7)
- 배치 3개: 절대경로 → `%~dp0` (자기 위치 기준). `4_track/daily_refresh.bat`, `_docs/start_server.bat`, `Garden/scripts/run-sync.bat`
- 문법검증 + 실제 import 스모크테스트 통과. Routine 위치·intercharm 위치 양쪽에서 해석 정상.

## 🔍 사전 조사 결과 (뭐가 깨지고 뭐가 안 깨지나)
| 항목 | 판정 |
|---|---|
| Routine 파이썬 모듈 | ✅ 안전 (대부분 원래 `Path(__file__)` 상대, 나머지는 하드닝 완료) |
| **Garden → 댄스캠페인 rename** | ✅ **안전** — `garden.js`는 *파일*명(상대import), `gardened` 등은 변수명, `package.json` name은 표시용. 폴더명 의존 없음 |
| Vercel 배포 | ✅ 안전 — `.vercel/project.json` 의 **projectId** 로 연결(폴더명 무관) |
| US_seeding → Garden 참조 3곳 | ✅ 안전 — **전부 주석**("[복사본] …에서 가져옴"), 기능 의존 없음 |
| Routine → `../intercharm` | ✅ 안전 — docstring 예시. **둘 다 Sales 로 같이 이동**하므로 상대경로 그대로 유효 |
| Windows 시작프로그램 | ✅ 해당 없음 — SIRIAI 항목 없음(확인함) |
| **Windows 작업 스케줄러 2개** | ⚠️ **절대경로 저장됨 → 스크립트가 자동 재등록**<br>`SIRIAI_daily_refresh`(가동중) · `SIRIAI_Garden_Sync`(비활성) |
| `.venv` (Routine) | ⚠️ 이동해도 `python.exe` 는 대개 정상. `pip.exe` 만 깨질 수 있음 → 그땐 `python -m pip` 쓰거나 venv 재생성 |
| `node_modules` (DECK·Garden·US_seeding) | ⚠️ 대개 정상. 이상하면 해당 폴더서 `npm rebuild` |
| Claude 세션 6개 | ⚠️ **수동 재연결 필요**(경로 기반 pin) |
| git | ✅ 루트가 VIBE 라 하위 이동 = rename 으로 인식. 스크립트가 이동 전 스냅샷 커밋 |

## 🚀 아침에 할 일 (10분)
1. **Claude Code·VSCode·탐색기·터미널 전부 닫기** (폴더 락 방지 — 예전에 락으로 폴더 쪼개진 사고 있었음)
2. 새 PowerShell 창:
   ```
   cd C:\Users\whwns\Desktop\VIBE\SIRIAI
   powershell -ExecutionPolicy Bypass -File .\_RESTRUCTURE.ps1
   ```
3. 스크립트가 자동으로: 잠김점검 → git 스냅샷 → 폴더생성 → 이동 → **스케줄러 재등록** → 검증(파이썬 import·node 실행) → git 커밋
4. 끝나면 화면에 뜨는 **세션 재연결 목록**대로 Claude 세션 6개 다시 열기

## 되돌리기
문제 생기면 이동 직전 커밋으로 복구:
```
cd C:\Users\whwns\Desktop\VIBE
git log --oneline -3        # "재구성 직전 스냅샷" 찾기
git reset --hard <해시>
```

## 메모
- `Company` 폴더명 마음에 안 들면 스크립트 상단 `$COMPANY` 만 고치면 됨 (예: Brand, Assets, 회사자산)
- 한글 폴더명(`댄스캠페인`)이 node 에서 문제되면 스크립트가 검증단계에서 잡아줌 → `$GARDEN_NEW="DanceCampaign"` 으로 바꿔 재실행
- 이 세션(Claude)은 Routine 안에서 돌고 있어서 **스스로 Routine 을 옮길 수 없음** → 그래서 스크립트로 넘김

# SIRIAI 콜드메일 — 이메일 확보 루틴 (V1)

구글시트 월별 탭의 회사/브랜드명을 읽어 ① 제조사·중복 정리 ② 구분 분류 ③ 이메일 확보를 자동화한다.
설계·결정 근거는 [`PRD.md`](PRD.md), 전체 폴더 규칙은 상위 [`../README.md`](../README.md) 참조.

> 공유 인프라(시트접근·인증·정규화·백업)는 `Routine/_shared/`, 이 루틴 고유 로직은 `coldmail/` 에 있다.

## 셋업

1. ✅ **Python 3.12 + 공유 venv** — `Routine/.venv/` 에 설치돼 있음 (모든 루틴 공용).
   재설치 시: `..\.venv\Scripts\python.exe -m pip install -r ..\requirements.txt`
2. ✅ **서비스 계정 키** — `Routine/secrets/service_account.json` (공유, git 제외).
3. (선택) `Routine/.env` 로 `SHEET_ID` 등 덮어쓰기.

## 사용 — `run.cmd` 래퍼 (공유 venv·UTF-8 자동)

모든 쓰기 명령은 **기본 dry-run**, 실제 반영은 `--apply --yes` (쓰기 전 자동 백업).

```powershell
.\run.cmd --inspect --tab 6월              # 연결·헤더·구분분포·행별 보기
.\run.cmd --list-todo --tab 6월            # 구분/이메일 빈 행 목록

.\run.cmd --only category --tab 6월        # 구분 채움 (보정사전→마스터)
.\run.cmd --only category --tab 6월 --recheck   # 채워진 구분 교정
.\run.cmd --only email --tab 6월           # 이메일 채움 (마스터→findings)
.\run.cmd --prune --tab 6월                # 중복 + 제조사 삭제 후보
.\run.cmd --renumber --tab 6월             # A열 # 재번호

.\run.cmd --delete-list --file reports/del.txt --tab 6월   # 행목록 삭제
.\run.cmd --fill-from --file reports/fills.tsv --tab 6월   # row<TAB>열<TAB>값 채움

# 실제 반영: 위 명령 끝에  --apply --yes
```

## 안전 원칙 (PRD §6)

- 마스터 `브랜드 에셋` 탭은 **읽기 전용** — 절대 쓰지 않음.
- 모든 쓰기 = **백업 → dry-run → --apply --yes**. 빈 셀에만 쓰고 기존값 무손상.
- 삭제는 백업 후 역순(아래→위) batch.

## 구조

```
Routine/
├── _shared/          공유: config·sheets·normalize·backup       (모든 루틴 import)
├── secrets/ .venv/   서비스계정 키 · 공유 파이썬 환경 (git 제외)
├── requirements.txt
└── siriai-coldmail/
    ├── run.cmd / run.py        실행 래퍼 / CLI 진입점
    ├── coldmail/               이 루틴 고유 로직
    │   ├── manufacturer.py     제조사 판별
    │   ├── category_overrides.py  구분 보정사전
    │   ├── email_find.py       이메일 탐색 헬퍼
    │   └── email_findings.py   이메일 검증 캐시
    ├── backups/ reports/       런타임 산출물 (git 제외)
    └── PRD.md / README.md
```

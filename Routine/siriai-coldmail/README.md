# SIRIAI 콜드메일 — 이메일 확보 도구 (V1)

구글시트 월별 탭의 회사/브랜드명을 읽어 ① 이메일 확보 ② 구분 분류 ③ 제조사 처리 ④ 중복 체크를 자동화한다.
설계·결정 근거는 [`PRD.md`](PRD.md) 참조.

## 셋업 (1회)

1. ✅ **Python 3.12 + 의존성 설치 완료** — `.venv/` 에 격리 설치돼 있음. (재설치 시: `.venv\Scripts\python.exe -m pip install -r requirements.txt`)
2. **서비스 계정 키** (PRD §5.2) — *남은 작업*
   - GCP 콘솔에서 서비스 계정 생성 → JSON 키 다운로드 → `secrets/service_account.json` 으로 저장.
   - 받은 봇 이메일(`...@....iam.gserviceaccount.com`)을 대상 구글시트에 **편집자**로 공유.
3. **(선택) `.env`** — `.env.example` 을 복사해 `.env` 로 저장하고 `SHEET_ID` 확인.

## 사용 — `run.cmd` 래퍼로 실행 (venv·UTF-8 자동 처리)

```powershell
# 1) 연결·시트 구조 확인 (지금 동작하는 유일한 명령)
.\run.cmd --inspect
.\run.cmd --inspect --tab 7월

# 이후 단계(아래)는 PRD 승인 후 단계적 구현
.\run.cmd --tab 7월 --dry-run           # 변경 미리보기
.\run.cmd --tab 7월 --apply --plan ...   # 백업→확인→실제 쓰기
.\run.cmd --tab 6월 --only category      # 6월: 구분만
```

## 안전 원칙 (PRD §6)

- 마스터 `브랜드 에셋` 탭은 **읽기 전용** — 절대 쓰지 않음.
- 모든 쓰기는 **백업 → dry-run → 사람 확인 → 실제 쓰기**.
- 자동 삭제 없음(삭제대상은 표시만, 사람이 확인 후 별도 명령).
- 기존 이메일은 덮어쓰지 않음. 보조열은 작업 후 자동 숨김.

## 구조

```
run.cmd           실행 래퍼 (venv python + UTF-8)
run.py            CLI 진입점 (현재 --inspect 동작)
requirements.txt
coldmail/
  config.py       탭명·열매핑·경로 (열매핑은 --inspect 후 확정)
  sheets.py       gspread 연결·읽기/배치쓰기 래퍼
  (예정) dedupe / manufacturer / classify / email_find / plan / apply
.venv/            가상환경 (git 제외)
secrets/          서비스 계정 키 (git 제외)
backups/ reports/ logs/ state/   런타임 산출물 (git 제외)
```

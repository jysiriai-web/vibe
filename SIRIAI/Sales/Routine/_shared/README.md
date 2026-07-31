# _shared — 공유 인프라 (모듈 아님)

## 1. 목적·목표
모든 자동화 모듈(`1_coldmail`, `2_auto-send`, …)이 **공통으로 쓰는 토대**.
구글시트 접근·설정·이름 정규화·백업을 **한 곳에 모아** 모듈마다 복붙하지 않게 한다.
여기엔 **브랜드/이메일 같은 도메인 로직을 두지 않는다** (그건 각 모듈 폴더로).

## 2. 구조
```
_shared/
├── config.py      시트 ID·탭이름·열매핑·경로 (.env로 덮어쓰기 가능)
├── sheets.py      서비스계정 인증 · 시트 열기 · 429 지수백오프 · (마스터 쓰기 금지 가드)
├── normalize.py   브랜드명 정규화 — keys()=매칭용 다중키 / one_key()=중복판정 단일키
└── backup.py      탭 → CSV 백업 (0행이면 SafetyAbort)
```

## 3. 기술 스택
- Python 3.12 (`Routine/.venv/` 공유 환경)
- `gspread` + 구글 **서비스계정**(`Routine/secrets/service_account.json`) — OAuth 동의 불필요 → cron 친화
- `open_by_key`로 Drive API 의존 없이 시트만 접근

## 4. 기타
- 새 모듈에서 쓰는 법: 진입점에서 `from _shared import sheets, config, normalize, backup`.
- 알려진 개선점(평가 2026-06-11): 시트를 행 dict로 읽는 `table` 계층과 `apply_updates()`(백업+dry-run 트랜잭션)를 여기로 올리면 모듈들의 `run.py`가 가벼워진다. `pyproject.toml` 도입 시 `sys.path` 주입도 제거 가능.

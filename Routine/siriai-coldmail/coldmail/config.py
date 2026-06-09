"""중앙 설정 — 탭명·열 매핑·경로·임계값을 한 곳에 모은다.

⚠ COL(열 매핑)은 PRD §3.2 '가정값'이다. 첫 `--inspect` 로 실제 헤더를 확인한 뒤
   여기 값을 확정한다. 확정 전에는 쓰기 단계가 헤더 검증에서 멈추도록 설계한다.
"""
from __future__ import annotations

import os
from pathlib import Path

# .env 가 있으면 로드 (없어도 동작)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent

# --- 시트 연결 ---
SHEET_ID = os.environ.get(
    "SHEET_ID", "1Op-L_x1IWMX77N11lLON9WcwMvZ9EWpt09tCq4r4FGM"
)
SERVICE_ACCOUNT_JSON = os.environ.get(
    "GOOGLE_SERVICE_ACCOUNT_JSON", str(ROOT / "secrets" / "service_account.json")
)

MASTER_TAB = "브랜드 에셋"  # 읽기 전용 마스터 (도구는 절대 쓰지 않음)

# --- 열 매핑 (1-based, PRD 가정값) ---
COL = {
    "category": 2,  # B 구분
    "brand": 3,     # C 브랜드명
    "email": 4,     # D 이메일
}

# 보조열 (열 계약 §3.3) — 작업 후 자동 숨김 대상
HELPER_COLS = {
    "confidence": 5,   # E 신뢰도
    "evidence": 6,     # F 근거·라벨
    "dup_status": 7,   # G 중복상태
    "history": 8,      # H 이력요약
    "proc_status": 9,  # I 제조사/처리상태
}

# --- 경로 ---
BACKUP_DIR = ROOT / "backups"
REPORT_DIR = ROOT / "reports"
LOG_DIR = ROOT / "logs"
STATE_DIR = ROOT / "state"

# --- 안전 기본값 ---
DRY_RUN_DEFAULT = True
HEADERS_VERIFIED = False  # --inspect 로 실제 헤더 확인 후 True 로 전환

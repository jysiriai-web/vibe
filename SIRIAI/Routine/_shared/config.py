"""공유 설정 — 모든 루틴이 쓰는 시트 연결·열 매핑.

⚠ COL(열 매핑)은 실측 확정값(B 구분 / C 브랜드명 / D 연락처). 시트가 바뀌면 여기만 고친다.
경로(backups/reports 등)는 루틴마다 다르므로 각 루틴 run.py 가 자기 폴더 기준으로 가진다.
"""
from __future__ import annotations

import os
from pathlib import Path

ROUTINE_DIR = Path(__file__).resolve().parent.parent  # Routine/

# Routine/.env 가 있으면 로드 (없어도 동작)
try:
    from dotenv import load_dotenv

    load_dotenv(ROUTINE_DIR / ".env")
except Exception:
    pass

# --- 시트 연결 (공유) ---
SHEET_ID = os.environ.get(
    "SHEET_ID", "1Op-L_x1IWMX77N11lLON9WcwMvZ9EWpt09tCq4r4FGM"
)
SERVICE_ACCOUNT_JSON = os.environ.get(
    "GOOGLE_SERVICE_ACCOUNT_JSON", str(ROUTINE_DIR / "secrets" / "service_account.json")
)

MASTER_TAB = "브랜드 에셋"  # 읽기 전용 마스터 (도구는 절대 쓰지 않음)

# --- 열 매핑 (1-based, 실측 확정) ---
COL = {
    "category": 2,  # B 구분
    "brand": 3,     # C 브랜드명
    "email": 4,     # D 연락처(이메일)
}

DRY_RUN_DEFAULT = True

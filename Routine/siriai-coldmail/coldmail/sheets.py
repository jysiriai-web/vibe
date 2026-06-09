"""gspread 연결·읽기 래퍼.

설계 원칙 (PRD §5.3 / §6):
- 읽기는 한 번에 (get_all_values / get_values), 행 단위 read 금지.
- 쓰기는 batch_update 만 (셀 단위 update 금지) + 지수 백오프.
- 마스터 탭에는 절대 쓰지 않는다 (호출부에서 가드).
"""
from __future__ import annotations

import time
from pathlib import Path

from . import config


def _require_gspread():
    try:
        import gspread  # type: ignore

        return gspread
    except ImportError as e:
        raise SystemExit(
            "gspread 가 설치돼 있지 않습니다. 먼저 의존성을 설치하세요:\n"
            "  python -m pip install -r requirements.txt"
        ) from e


def get_client():
    """서비스 계정으로 gspread 클라이언트 생성."""
    gspread = _require_gspread()
    key = Path(config.SERVICE_ACCOUNT_JSON)
    if not key.exists():
        raise SystemExit(
            f"서비스 계정 키가 없습니다: {key}\n"
            "PRD §5.2 의 1회성 셋업으로 JSON 키를 받아 secrets/service_account.json 에 두세요."
        )
    return gspread.service_account(filename=str(key))


def open_sheet():
    """대상 스프레드시트 열기 (ID/URL 고정 — Drive API 불필요)."""
    gc = get_client()
    try:
        return gc.open_by_key(config.SHEET_ID)
    except Exception as e:
        raise SystemExit(
            f"시트를 열 수 없습니다 (ID={config.SHEET_ID}).\n"
            "확인: ① 서비스 계정 이메일에 '편집자' 공유 했는지 "
            "② 시트 ID 오타 ③ Google Sheets API 활성화 여부.\n"
            f"세부: {e}"
        )


def with_backoff(fn, tries: int = 5):
    """429(쿼터 초과) 시 1·2·4·8초 지수 백오프 후 재시도."""
    gspread = _require_gspread()
    for n in range(tries):
        try:
            return fn()
        except gspread.exceptions.APIError as e:  # type: ignore
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code == 429 and n < tries - 1:
                time.sleep(2 ** n)
                continue
            raise

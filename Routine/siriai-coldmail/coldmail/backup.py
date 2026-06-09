"""쓰기 전 백업 (PRD §6.1). 탭 전체 값을 CSV 스냅샷으로 저장.

backups/{YYYY-MM}/{YYYYMMDD-HHMM}_{탭명}.csv (utf-8-sig, 엑셀 한글 호환)
0행이면 '빈 시트 의심'으로 중단(SafetyAbort).
"""
from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

from . import config


class SafetyAbort(Exception):
    pass


def backup_tab(ws, tab_name: str) -> tuple[Path, int]:
    rows = ws.get_all_values()
    if not rows:
        raise SafetyAbort(f"'{tab_name}' 백업 결과 0행 — 쓰기 중단")
    now = datetime.now()
    path = config.BACKUP_DIR / now.strftime("%Y-%m") / f"{now.strftime('%Y%m%d-%H%M')}_{tab_name}.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        csv.writer(f).writerows(rows)
    return path, len(rows)

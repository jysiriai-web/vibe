"""수신거부·발송실패 명단(suppression list) — 다시는 안 보내는 주소.

`_수신거부` 시트(영구 누적)를 로드해 발송 전 체크. 월이 바뀌어도 유지(재발송 방지 규칙).
열: 이메일 | 사유(수신거부/하드바운스/직접요청) | 원래월 | 일시
"""
from __future__ import annotations

SUPPRESS_TAB = "_수신거부"
HEADERS = ["이메일", "사유", "원래월", "일시"]


def load(sh) -> set[str]:
    """_수신거부 시트의 이메일 집합(소문자). 시트 없으면 빈 집합."""
    titles = [w.title for w in sh.worksheets()]
    if SUPPRESS_TAB not in titles:
        return set()
    ws = sh.worksheet(SUPPRESS_TAB)
    vals = ws.get_all_values()
    if not vals:
        return set()
    # 1행은 헤더로 가정
    ei = 0
    if "이메일" in vals[0]:
        ei = vals[0].index("이메일")
    out = set()
    for r in vals[1:]:
        if len(r) > ei and r[ei].strip():
            out.add(r[ei].strip().lower())
    return out


def is_suppressed(email: str, suppress: set[str]) -> bool:
    return bool(email) and email.strip().lower() in suppress


def add(sh, email: str, reason: str, month: str, when: str) -> None:
    """수신거부/바운스 발생 시 명단에 추가(중복이면 무시)."""
    titles = [w.title for w in sh.worksheets()]
    if SUPPRESS_TAB not in titles:
        ws = sh.add_worksheet(title=SUPPRESS_TAB, rows=200, cols=len(HEADERS))
        ws.update(range_name="A1", values=[HEADERS], value_input_option="RAW")
    else:
        ws = sh.worksheet(SUPPRESS_TAB)
    existing = load(sh)
    if email.strip().lower() in existing:
        return
    ws.append_row([email.strip(), reason, month, when], value_input_option="RAW")

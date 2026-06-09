"""제조사/원료/화학 OEM·ODM 판별 (PRD §4.3).

목적: '자체 소비자 브랜드 없는 순수 제조사'를 가려 삭제 후보로 표시.
방식: 사명 키워드(generic) + 알려진 제조사명(curated). 토큰 0(순수 규칙).
판별은 '후보 제시'이며, 실제 삭제는 사람이 목록 검토 후 승인한다(과삭제 방지).
"""
from __future__ import annotations

# 강한 제조사 신호 (정규화된 사명에 부분일치)
# 주의: '코퍼레이션/랩스'처럼 일반 사명(브랜드 운영사일 수 있음) 토큰은 제외 — 오삭제 방지.
KEYWORDS = [
    "화학", "케미칼", "chemical", "소재", "원료", "제조", "oem", "odm", "합성",
    "콜마", "kolmar", "케이씨아이", "kci",
    "코스메카", "인터코스", "코스맥스", "cosmax", "잉글우드", "메가코스",
    "크로다", "croda", "코스비전", "코스모코스",
]

# 키워드로 안 잡히는 알려진 순수 제조사 (사람이 보강하는 큐레이션 목록)
NAMES = {
    "씨앤씨인터내셔널", "한농화성", "동남합성", "한국화장품제조", "씨앤텍",
    "그린코스", "코바스", "씨엠에스랩", "에스에프시", "유한클로락스",
    "그린케미칼", "엔코스", "코스비전", "삼양케이씨아이",
    "화성코스메틱", "에버코스", "서울화장품", "코스모코스",
}


def _norm(name: str) -> str:
    from . import normalize

    return normalize.one_key(name)


_NAME_KEYS = {_norm(n) for n in NAMES}


def is_manufacturer(name: str) -> tuple[bool, str]:
    """(제조사 여부, 근거). 근거는 매칭된 키워드 또는 'curated'."""
    k = _norm(name)
    if not k:
        return False, ""
    if k in _NAME_KEYS:
        return True, "등록목록"
    for kw in KEYWORDS:
        if kw in k:
            return True, f"키워드:{kw}"
    return False, ""

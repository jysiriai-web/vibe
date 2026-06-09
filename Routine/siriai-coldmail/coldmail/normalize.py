"""브랜드/회사명 정규화 (PRD §4.1 / E-1).

normalize.keys("스킨이데아(메디필)") -> {"스킨이데아", "메디필"}
normalize.keys("오호라(ohora)")     -> {"오호라", "ohora"}

- 괄호 안 한·영 표기를 별도 키(variant)로 분리
- 안전한 법인격 접미만 제거(㈜/(주)/주식회사) — '코리아'·'글로벌'은
  '코리아나'처럼 단어 일부일 수 있어 제거하지 않는다(오매칭 방지).
- 공백·기호 제거, 소문자화, NFC 정규화
- 길이 1 키는 오탐 위험으로 버린다
"""
from __future__ import annotations

import re
import unicodedata

_SAFE_LEGAL = ["주식회사", "㈜", "(주)", "(유)"]


def variants(raw: str) -> list[str]:
    parts = re.split(r"[()（）/]", raw or "")
    return [p for p in (s.strip() for s in parts) if p]


def keys(raw: str) -> set[str]:
    out: set[str] = set()
    for v in variants(raw):
        s = v
        for w in _SAFE_LEGAL:
            s = s.replace(w, "")
        s = unicodedata.normalize("NFC", s).lower()
        s = re.sub(r"[\s\W_]+", "", s, flags=re.UNICODE)
        if len(s) >= 2:
            out.add(s)
    return out

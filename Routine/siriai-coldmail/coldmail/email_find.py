"""이메일 탐색 보조 헬퍼 (PRD §4.5).

V1 discovery 는 검증된 findings(email_findings)를 소비한다. 아래 헬퍼들은
자동 탐색(footer fetch / 패턴추정 / MX검증)을 붙일 때 그대로 재사용한다.
"""
from __future__ import annotations

import re

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

PERSONAL_DOMAINS = {
    "naver.com", "gmail.com", "daum.net", "hanmail.net", "kakao.com",
    "nate.com", "outlook.com", "hotmail.com", "icloud.com",
}

# 영업 적합도 순 — 마케팅·제휴 계열을 일반 CS보다 위에
PATTERNS = [
    "partnership", "business", "marketing", "collaboration", "pr", "sales",
    "global", "biz", "contact", "hello", "info", "help", "cs", "support",
    "admin", "online",
]


def extract(text: str) -> list[str]:
    """텍스트에서 이메일 후보를 등장 순서 유지하며 중복 제거해 추출."""
    return list(dict.fromkeys(EMAIL_RE.findall(text or "")))


def is_personal(email: str) -> bool:
    return "@" in email and email.rsplit("@", 1)[-1].lower() in PERSONAL_DOMAINS


def guess(domain: str) -> list[str]:
    """도메인 확정 후 패턴 추정 주소 생성(검증 전 — 신뢰도 '낮음' 고정 대상)."""
    return [f"{p}@{domain}" for p in PATTERNS]


def label(email: str, confidence: str) -> str:
    """특수 케이스 라벨(빈칸 금지 원칙). 정상 기업메일이면 빈 문자열."""
    if not email or confidence == "미확보":
        return "[미확보]"
    if is_personal(email):
        return "[개인메일]"
    return ""

"""마스터 템플릿(templates/cold_v1.html)에 brand·hook을 끼워 완성 메일(제목+HTML)을 만든다.

이 파일은 '도장에 잉크 끼우기' = 순수 문자열 치환. 검색·LLM·발송 없음(되돌릴 수 있음).
훅 생성은 hook.py, 시트 연동·미리보기는 run.py.
"""
from __future__ import annotations

import re
from pathlib import Path

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
SUBJECT_TMPL = "[SIRIAI] {brand}에 맞는 인플루언서 제안드립니다"


def render(brand: str, hook: str, template: str = "cold_v1.html") -> dict:
    """brand·hook을 템플릿에 끼워 {subject, html} 반환.

    템플릿의 {{brand}}·{{hook}} 슬롯만 치환하고, 나머지 포맷(볼드·이탤릭·밑줄·
    노란형광·블루링크·로고)은 그대로 보존한다. 상단 문서 주석(<!-- ... -->)은 제거.
    """
    if not brand.strip() or not hook.strip():
        raise ValueError("brand·hook 둘 다 필요")
    html = (TEMPLATE_DIR / template).read_text(encoding="utf-8")
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL).strip()  # 개발용 주석 제거
    html = html.replace("{{brand}}", brand).replace("{{hook}}", hook)
    if "{{" in html:  # 안 채워진 슬롯 남으면 사고 — 발송 전 차단
        leftover = re.findall(r"\{\{[^}]+\}\}", html)
        raise ValueError(f"치환 안 된 슬롯 남음: {leftover}")
    return {"subject": SUBJECT_TMPL.format(brand=brand), "html": html}


if __name__ == "__main__":
    # 스모크 테스트: 레이티드그린 (Sonnet 훅)
    out = render(
        "레이티드그린",
        "레이티드그린처럼 헤어·두피케어 제품은 머릿결을 잘 표현하는 인플루언서가 적합도가 높다고 봅니다.",
    )
    print("제목:", out["subject"])
    print("HTML 길이:", len(out["html"]), "자")
    print("슬롯 남음:", "{{" in out["html"])
    # 브라우저로 볼 수 있게 미리보기 저장
    prev = Path(__file__).resolve().parent / "_preview.html"
    prev.write_text(out["html"], encoding="utf-8")
    print("미리보기 →", prev)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deck SEO 패치 — 클디 export(deploy/index.html)에 siriai.co.kr 통합 SEO 태그를 넣는다.

배경:
  index.html 은 클로드 디자인이 zip 으로 내보내는 산출물이라,
  손으로 고쳐두면 다음 export 때 덮여서 SEO 태그가 조용히 사라진다.
  그래서 배포 직전에 이 스크립트를 한 번 돌려 항상 같은 상태를 보장한다.

하는 일 (siriai.co.kr 담당 팀장 요청 3건):
  1. <title> 추가            — 원래 아예 없었음
  2. <link rel="canonical">  — 중복 콘텐츠 정리의 핵심
  3. portfolio 링크 상대경로 — vercel.app 절대주소 → /portfolio

여러 번 돌려도 결과가 같다(멱등). 이미 있으면 건너뛰고 무엇을 했는지만 알린다.

사용:
  python seo_patch.py <deploy/index.html 경로>
"""

import io
import re
import sys

TITLE = "사업소개 | SIRIAI — 인플루언서 마케팅 · 셀러브리티 · 브랜딩"
CANONICAL = "https://siriai.co.kr/business"

# 형제 페이지(포트폴리오) 링크를 절대주소 → 상대경로로 바꾸는 기능.
#
# ⛔ 현재 꺼둠 (2026-08-04) — 포트폴리오 쪽이 롤백됐고 아직 준비 안 됨.
#    상대경로 /portfolio 는 siriai.co.kr 을 거쳐 들어올 때만 열리고,
#    siriai-business.vercel.app 으로 직접 들어오면 404 가 난다.
#    포트폴리오가 정식으로 준비되면 아래를 True 로 바꾸면 된다.
APPLY_LINK_REWRITE = False

LINK_MAP = {
    "https://siriai-portfolio.vercel.app/": "/portfolio",
    "https://siriai-portfolio.vercel.app": "/portfolio",
}


def _insert_after_charset(html, tag):
    """<meta charset> 바로 뒤에 tag 를 넣는다.

    한글 title 이 인코딩 선언보다 앞에 오면 파서가 글자를 깨뜨릴 수 있어서,
    charset 이 언제나 먼저 오도록 그 뒤에 붙인다. charset 이 없으면 <head> 뒤.
    """
    m = re.search(r"<meta[^>]*charset[^>]*>", html, re.I)
    if not m:
        m = re.search(r"<head[^>]*>", html, re.I)
    if not m:
        return html, False
    return html[: m.end()] + tag + html[m.end() :], True


def patch(html):
    """(patched_html, [한 일 목록]) 반환."""
    done = []

    # 1. <title> — 없을 때만 넣는다
    if re.search(r"<title[^>]*>", html, re.I):
        done.append("title: 이미 있음 — 건너뜀")
    else:
        html, ok = _insert_after_charset(html, "\n  <title>%s</title>" % TITLE)
        done.append(("title: 추가 — " + TITLE) if ok else "⚠ title: <head> 를 못 찾음")

    # 2. canonical — 없을 때만 넣는다
    if re.search(r'<link[^>]*rel=["\']?canonical', html, re.I):
        done.append("canonical: 이미 있음 — 건너뜀")
    else:
        tag = '\n  <link rel="canonical" href="%s">' % CANONICAL
        m = re.search(r"<title[^>]*>.*?</title>", html, re.I | re.S)
        if m:
            html = html[: m.end()] + tag + html[m.end() :]
            ok = True
        else:
            html, ok = _insert_after_charset(html, tag)
        done.append(
            ("canonical: 추가 — " + CANONICAL) if ok else "⚠ canonical: <head> 를 못 찾음"
        )

    # 3. 형제 페이지 링크 — 절대주소를 상대경로로 (현재 꺼져 있음)
    if not APPLY_LINK_REWRITE:
        done.append("링크 상대경로: 꺼짐 — 포트폴리오 준비 전이라 절대주소 그대로 둠")
    else:
        # 긴 것부터 바꿔야 끝의 슬래시 없는 형태가 앞의 것을 잘라먹지 않는다
        for src in sorted(LINK_MAP, key=len, reverse=True):
            n = html.count(src)
            if n:
                html = html.replace(src, LINK_MAP[src])
                done.append("링크: %s → %s (%d곳)" % (src, LINK_MAP[src], n))

        leftover = len(re.findall(r"siriai-portfolio\.vercel\.app", html))
        if leftover:
            done.append("⚠ 남은 vercel.app 절대주소 %d곳 — LINK_MAP 확인 필요" % leftover)

    return html, done


def main():
    if len(sys.argv) < 2:
        print("사용: python seo_patch.py <deploy/index.html 경로>")
        return 2

    path = sys.argv[1]
    html = io.open(path, encoding="utf-8").read()
    patched, done = patch(html)

    for line in done:
        print("  " + line)

    if patched == html:
        print("  → 바뀐 것 없음 (이미 패치됨)")
        return 0

    io.open(path, "w", encoding="utf-8", newline="").write(patched)
    print("  → 저장 완료: %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())

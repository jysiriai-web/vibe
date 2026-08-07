#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deck 이미지 최적화 — 화질은 그대로 두고 용량만 줄인다.

배경:
  클디가 내보내는 assets/ 안에는 2000~2750px 짜리 원본 PNG 가 그대로 들어 있다.
  다섯 장이 28MB 로 전체의 77%. 첫 화면에는 안 걸리지만 브랜딩·셀럽 카드를 열면
  그때부터 받기 시작해서 화면이 멈춘 것처럼 보인다.

방침 — 화질 저하 없이:
  · 해상도는 건드리지 않는다. 원본 크기 그대로 유지.
  · WebP 고품질(q94)로만 다시 인코딩한다. 투명영역(알파)도 보존.
  · 변환할 때마다 원본과 화질을 실제로 비교(PSNR)해서
    기준(38dB, 육안 구분 불가)에 못 미치면 **그 파일은 원본을 그대로 둔다.**
  · 이미 압축된 JPG 는 다시 인코딩하면 손해라 대부분 기준에서 자동 탈락한다.

WebP 는 크롬·사파리·파이어폭스·엣지 최신 버전 전부 지원한다(약 97%).

사용:
  python optimize_assets.py <deploy 폴더 경로>
"""

import io
import math
import os
import re
import sys

MIN_BYTES = 200 * 1024  # 이보다 작은 파일은 건드릴 가치가 없다
QUALITY = 94
MIN_PSNR = 38.0  # 이 아래면 육안 차이 가능 → 원본 유지
MIN_SAVING = 25  # % — 이만큼도 안 줄면 굳이 바꾸지 않는다
REWRITE_IN = ("index.html", "support.js", "image-slot.js")


def psnr(a, b):
    """알파를 고려한 화질 비교. 투명영역이 있는 이미지는 같은 배경에 합성해서 비교한다."""
    a, b = a.convert("RGBA"), b.convert("RGBA")
    if a.size != b.size:
        return 0.0
    bg = Image.new("RGBA", a.size, (128, 128, 128, 255))
    a = Image.alpha_composite(bg, a).convert("RGB")
    b = Image.alpha_composite(bg, b).convert("RGB")
    pa, pb = a.load(), b.load()
    se = n = 0
    step = max(1, a.width // 300)
    for y in range(0, a.height, step):
        for x in range(0, a.width, step):
            for c in range(3):
                d = pa[x, y][c] - pb[x, y][c]
                se += d * d
                n += 1
    return 99.0 if se == 0 else 10 * math.log10(255 * 255 / (se / n))


def main():
    if len(sys.argv) < 2:
        print("사용: python optimize_assets.py <deploy 폴더 경로>")
        return 2
    root = sys.argv[1]
    adir = os.path.join(root, "assets")
    if not os.path.isdir(adir):
        print("  assets 폴더가 없다: %s" % adir)
        return 1

    cands = []
    for dp, _, fs in os.walk(adir):
        for f in fs:
            if os.path.splitext(f)[1].lower() not in (".png", ".jpg", ".jpeg"):
                continue
            p = os.path.join(dp, f)
            if os.path.getsize(p) >= MIN_BYTES:
                cands.append(p)
    cands.sort(key=os.path.getsize, reverse=True)

    if not cands:
        print("  최적화할 만큼 큰 이미지가 없다.")
        return 0

    print("  대상 %d개 (%dKB 이상)" % (len(cands), MIN_BYTES // 1024))
    mapping, freed, kept = {}, 0, []

    for p in cands:
        rel = os.path.relpath(p, root).replace(os.sep, "/")
        orig = os.path.getsize(p)
        try:
            im = Image.open(p)
            im.load()
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=QUALITY, method=6)  # 해상도 그대로
            new = buf.tell()
            saving = 100 - 100 * new // orig
            buf.seek(0)
            d = psnr(im, Image.open(buf))
        except Exception as e:
            kept.append((rel, "변환 실패: %s" % e))
            continue

        if d < MIN_PSNR:
            kept.append((rel, "화질 %.1fdB — 기준 미달, 원본 유지" % d))
            continue
        if saving < MIN_SAVING:
            kept.append((rel, "절감 %d%% 뿐 — 원본 유지" % saving))
            continue

        wp = os.path.splitext(p)[0] + ".webp"
        with open(wp, "wb") as f:
            f.write(buf.getvalue())
        os.remove(p)
        mapping[rel] = os.path.relpath(wp, root).replace(os.sep, "/")
        freed += orig - new
        print(
            "    %-34s %6.2fM → %5.2fM  (%d%% ↓, 화질 %.1fdB)"
            % (rel[-34:], orig / 1048576, new / 1048576, saving, d)
        )

    for rel, why in kept:
        print("    — %-32s %s" % (rel[-32:], why))

    if not mapping:
        print("  → 바꾼 파일 없음")
        return 0

    # HTML/JS 안의 참조를 새 파일명으로. 긴 경로부터 바꿔 부분일치 사고를 막는다.
    for fn in REWRITE_IN:
        fp = os.path.join(root, fn)
        if not os.path.exists(fp):
            continue
        s = io.open(fp, encoding="utf-8").read()
        before = s
        for old in sorted(mapping, key=len, reverse=True):
            s = s.replace(old, mapping[old])
        if s != before:
            io.open(fp, "w", encoding="utf-8", newline="").write(s)
            n = sum(before.count(o) for o in mapping)
            print("  참조 수정: %s (%d곳)" % (fn, n))

    # 바꾼 파일을 아직도 옛 이름으로 부르는 곳이 없는지 확인
    leftover = []
    for fn in REWRITE_IN:
        fp = os.path.join(root, fn)
        if os.path.exists(fp):
            s = io.open(fp, encoding="utf-8").read()
            for old in mapping:
                if old in s:
                    leftover.append("%s → %s" % (fn, old))
    if leftover:
        print("  ⚠ 옛 파일명이 남아 있다 (이미지 깨짐 위험):")
        for x in leftover:
            print("     ", x)

    print("  → %d개 변환 · %.1f MB 절약" % (len(mapping), freed / 1048576))
    vendor_react(root)
    return 0


# ── React 자체 호스팅 ──────────────────────────────────────────────
# support.js 는 React 를 unpkg(외부 CDN)에서 받는다. 첫 렌더가 그 응답을 기다리므로
# 느릴 뿐 아니라, 회사망처럼 unpkg 가 막힌 곳에서는 페이지가 아예 뜨지 않는다.
# 같은 파일을 우리 서버에서 주면 둘 다 해결된다.
#
# support.js 는 SRI(무결성 해시)로 파일을 검증한다. 바이트가 1개라도 다르면
# 브라우저가 스크립트를 차단해 화면이 빈다. 그래서 넣기 전에 해시를 직접 확인하고,
# 안 맞으면 건드리지 않고 unpkg 를 그대로 쓴다.
VENDOR = {
    "https://unpkg.com/react@18.3.1/umd/react.production.min.js": (
        "react.production.min.js",
        "DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z",
    ),
    "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": (
        "react-dom.production.min.js",
        "gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1",
    ),
}


def vendor_react(root):
    import base64
    import hashlib
    import shutil

    src_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")
    sup = os.path.join(root, "support.js")
    if not os.path.exists(sup):
        return
    s = io.open(sup, encoding="utf-8").read()

    out_dir = os.path.join(root, "assets", "vendor")
    swapped = []
    for url, (fn, want) in VENDOR.items():
        if url not in s:
            continue
        src = os.path.join(src_dir, fn)
        if not os.path.exists(src):
            print("  — React 자체호스팅 건너뜀: %s 없음" % fn)
            continue
        got = base64.b64encode(hashlib.sha384(open(src, "rb").read()).digest()).decode()
        if got != want:
            print("  ⚠ %s 해시 불일치 — unpkg 그대로 둠 (화면 빈 화면 방지)" % fn)
            continue
        os.makedirs(out_dir, exist_ok=True)
        shutil.copy2(src, os.path.join(out_dir, fn))
        s = s.replace(url, "/assets/vendor/" + fn)
        swapped.append(fn)

    if swapped:
        io.open(sup, "w", encoding="utf-8", newline="").write(s)
        print("  React 자체 호스팅: %s (unpkg 의존 제거, SRI 검증 통과)" % ", ".join(swapped))


try:
    from PIL import Image
except ImportError:
    print("  Pillow 가 없다:  pip install Pillow")
    sys.exit(1)

if __name__ == "__main__":
    sys.exit(main())

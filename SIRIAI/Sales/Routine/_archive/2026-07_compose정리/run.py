"""2_compose 진입점 — 시트에서 브랜드 읽기 → 훅 끼워 완성 메일 렌더 → 미리보기.

발송 안 함(미리보기만). 한 번에 다 안 함 — --limit(기본 10).
B 모드(API키 없이): 훅은 archive/hooks.tsv(브랜드<TAB>훅)에서 읽음(세션이 생성해 채움).
훅 없는 브랜드는 archive/brands_todo.tsv 로 빼서 '훅 필요' 표시.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # _shared
sys.path.insert(0, str(Path(__file__).resolve().parent))          # compose
from _shared import sheets
import compose

HERE = Path(__file__).resolve().parent
ARCH = HERE / "archive"


def read_brands(tab: str, limit: int) -> list[tuple[str, str]]:
    """시트에서 (브랜드명, 이메일) — 이메일 있는 행만, 위에서 limit개."""
    sh = sheets.open_sheet()
    ws = sh.worksheet(tab)
    vals = sheets.with_backoff(lambda: ws.get_all_values())
    hi = 0
    for i, row in enumerate(vals[:8]):
        if "구분" in row and ("브랜드명" in row or "브랜드" in row):
            hi = i
            break
    H = vals[hi]
    ci, di = H.index("브랜드명"), H.index("연락처")
    out = []
    for row in vals[hi + 1:]:
        if len(row) <= max(ci, di):
            continue
        b, e = row[ci].strip(), row[di].strip()
        if b and e:  # 이메일 있는 행 = 발송 대상
            out.append((b, e))
        if len(out) >= limit:
            break
    return out


def load_hooks() -> dict:
    """archive/hooks.tsv: 시트명<TAB>실제브랜드명<TAB>훅 → {시트명: (브랜드, 훅)}.
    (업체명→실제 브랜드명 해결은 세션이 채움. 시트가 정리되면 브랜드=시트명.)"""
    f = ARCH / "hooks.tsv"
    h = {}
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            p = line.split("\t")
            if len(p) >= 3 and p[0].strip():
                h[p[0].strip()] = (p[1].strip(), p[2].strip())
    return h


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tab", default="6월")
    ap.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()

    brands = read_brands(args.tab, args.limit)
    hooks = load_hooks()
    (ARCH / "previews").mkdir(parents=True, exist_ok=True)

    done, need = [], []
    for b, e in brands:
        entry = hooks.get(b)
        if not entry:
            need.append(b)
            continue
        brand, hook = entry
        r = compose.render(brand, hook)
        (ARCH / "previews" / f"{brand}.html").write_text(r["html"], encoding="utf-8")
        done.append((b, brand, r["subject"]))

    print(f"[{args.tab}] 이메일 있는 브랜드 {len(brands)}개 (--limit {args.limit})")
    print(f"  완성 {len(done)} · 훅 필요 {len(need)}")
    for sheet_name, brand, s in done:
        tag = f"(시트:{sheet_name})" if brand != sheet_name else ""
        print(f"  [OK] {brand} {tag} -> {s}")
    if need:
        (ARCH / "brands_todo.tsv").write_text("\n".join(need) + "\n", encoding="utf-8")
        print(f"  [훅 필요] {', '.join(need)}")
        print(f"  -> archive/brands_todo.tsv (세션이 훅 채워 archive/hooks.tsv 로)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

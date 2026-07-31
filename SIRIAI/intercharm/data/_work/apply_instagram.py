"""find_instagram 결과 → 인터참_대상.csv + '인터참' 탭 인스타 컬럼 채움 + 기록.
  python apply_instagram.py --result ig_result.json
"""
from __future__ import annotations
import argparse, csv, json, sys
from collections import Counter
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

HERE = Path(__file__).resolve().parent
DATA = HERE.parent


def norm(s): return (s or "").strip().lower().replace(" ", "")
def a1(col, row): return f"{chr(ord('A') + col - 1)}{row}"


def main(args):
    res = json.loads((HERE / args.result).read_text(encoding="utf-8"))
    results = res.get("results", [])
    ig = {norm(r["company"]): r["instagram"].strip().lstrip("@") for r in results
          if r.get("status") == "found" and (r.get("instagram") or "").strip()}
    print(f"[읽음] {len(results)}건 · status {dict(Counter(r.get('status','') for r in results))} · 핸들확보 {len(ig)}")

    # 기록
    with (HERE / "ig_fixes.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh); w.writerow(["company", "instagram", "status", "source", "note"])
        for r in results:
            w.writerow([r.get("company",""), r.get("instagram",""), r.get("status",""), r.get("source",""), r.get("note","")])

    # 인터참_대상.csv 인스타 채움
    p = DATA / "인터참_대상.csv"
    rows = list(csv.DictReader(open(p, encoding="utf-8-sig", newline="")))
    flds = list(rows[0].keys()); n = 0
    for row in rows:
        h = ig.get(norm(row.get("회사명", "")))
        if h: row["인스타"] = h; n += 1
    with p.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=flds); w.writeheader(); w.writerows(rows)
    print(f"[인터참_대상.csv] 인스타 {n}건 채움")

    # '인터참' 탭 인스타 컬럼 채움
    ws = sheets.open_sheet().worksheet("인터참")
    vals = ws.get_all_values(); H = [c.strip() for c in vals[0]]
    ci_ig = H.index("인스타") + 1; bcol = H.index("브랜드명")
    batch = []
    for off, r in enumerate(vals[1:], start=2):
        comp = r[bcol].strip() if len(r) > bcol else ""
        h = ig.get(norm(comp))
        if h: batch.append({"range": a1(ci_ig, off), "values": [[f'=HYPERLINK("https://instagram.com/{h}","@{h}")']]})
    if batch:
        sheets.with_backoff(lambda: ws.batch_update(batch, value_input_option="USER_ENTERED"))
    print(f"['인터참' 탭] 인스타 {len(batch)}건 채움 (HYPERLINK)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--result", default="ig_result.json")
    raise SystemExit(main(ap.parse_args()))

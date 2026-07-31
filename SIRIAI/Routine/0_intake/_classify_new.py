"""소싱 결과(_chunk_result.json)를 6월 시트 + candidates CSV와 대조해 NEW/DUP 분류.
한·영 순서무관 키 매칭(hangul·latin). 6월 287개를 컨텍스트에 안 들이고 여기서 처리.
  python _classify_new.py
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets
import csv as _csv

HERE = Path(__file__).resolve().parent
def hangul(s): return re.sub(r"[^가-힣]", "", s or "")
def latin(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())
def keys(s):
    out = []
    h, l = hangul(s), latin(s)
    if len(h) >= 2: out.append("h:" + h)
    if len(l) >= 3: out.append("l:" + l)
    return out

ws = sheets.open_sheet().worksheet("6월")
vals = ws.get_all_values()
hi = next(i for i, r in enumerate(vals[:15]) if "브랜드명" in [c.strip() for c in r])
ci = [c.strip() for c in vals[hi]].index("브랜드명")
jun = set()
for r in vals[hi + 1:]:
    if len(r) > ci and r[ci].strip():
        for k in keys(r[ci].strip()): jun.add(k)

csvp = HERE / "신규브랜드_서치리스트.csv"
csvset = set()
if csvp.exists():
    rows = list(_csv.reader(csvp.read_text(encoding="utf-8-sig").splitlines()))
    if rows:
        bi = [c.strip() for c in rows[0]].index("브랜드명") if "브랜드명" in [c.strip() for c in rows[0]] else 0
        for r in rows[1:]:
            if len(r) > bi and r[bi].strip():
                for k in keys(r[bi].strip()): csvset.add(k)

# _working.json 의 전체 skipList(base 141 + CSV 누적)도 '이미 아는' 집합에 흡수 → base-only 知名 브랜드도 잡음
wp = HERE / "profiles" / "_working.json"
if wp.exists():
    for b in json.loads(wp.read_text(encoding="utf-8")).get("skipList", []):
        for k in keys(b): csvset.add(k)

res = json.loads((HERE / "_chunk_result.json").read_text(encoding="utf-8"))
cands = res.get("final", res.get("candidates", []))
new, dup_jun, dup_csv = [], [], []
for c in cands:
    ks = keys(c.get("brand", ""))
    if any(k in jun for k in ks): dup_jun.append(c.get("brand", ""))
    elif any(k in csvset for k in ks): dup_csv.append(c.get("brand", ""))
    else: new.append(c)

print(f"=== 소싱 {len(cands)}개 분류 ===  NEW {len(new)} · 6월중복 {len(dup_jun)} · CSV중복 {len(dup_csv)}\n")
print("[NEW — 검토 대상]")
for c in new:
    print(f"  · {c.get('brand')}  [{c.get('category','')}]  ig:{c.get('instagram','') or '-'}")
    print(f"      {c.get('rationale','')[:110]}")
if dup_jun: print(f"\n[6월 중복 제외] {', '.join(dup_jun)}")
if dup_csv: print(f"\n[CSV 중복 제외] {', '.join(dup_csv)}")

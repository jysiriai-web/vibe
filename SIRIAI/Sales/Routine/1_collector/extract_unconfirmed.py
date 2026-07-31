"""6월 탭에서 ⚠️확인불가 표시된 행만 추출 → 보강 재수집용 worklist.
  python extract_unconfirmed.py
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

HERE = Path(__file__).resolve().parent
ws = sheets.open_sheet().worksheet("6월")
vals = ws.get_all_values()
hi = next(i for i, r in enumerate(vals[:15]) if "브랜드명" in [c.strip() for c in r])
H = [c.strip() for c in vals[hi]]
cC, cE, cN, cM = H.index("브랜드명"), H.index("홈페이지"), H.index("인스타"), H.index("비고")
def g(r, i): return r[i].strip() if len(r) > i else ""
work = []
for r in vals[hi + 1:]:
    if "확인불가" in g(r, cM):
        ig = g(r, cN).rstrip("/").rsplit("/", 1)[-1].lstrip("@")
        work.append({"company": g(r, cC), "current_ig": ig, "current_homepage": g(r, cE)})
out = HERE / "_unconfirmed_worklist.json"
out.write_text(json.dumps(work, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"확인불가 {len(work)}개 → {out.name}")
for w in work:
    print("  -", w["company"], ("| hp:" + w["current_homepage"] if w["current_homepage"] else ""))

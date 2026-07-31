"""6월 탭에서 홈페이지(E) 빈칸 OR 인스타(N) 빈칸 행 추출 → 재수집 worklist.
플랫폼 fallback 룰 적용 위해(마켓플레이스-only 브랜드 홈피 채우기).
  python extract_gaps.py
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
cC, cE, cN = H.index("브랜드명"), H.index("홈페이지"), H.index("인스타")
def g(r, i): return r[i].strip() if len(r) > i else ""
work = []
for r in vals[hi + 1:]:
    comp = g(r, cC)
    if not comp: continue
    hp, ig = g(r, cE), g(r, cN)
    if not hp or not ig:  # 홈피 OR IG 빈칸
        work.append({"company": comp, "current_ig": ig.rstrip("/").rsplit("/", 1)[-1].lstrip("@"), "current_homepage": hp})
out = HERE / "_gaps_worklist.json"
out.write_text(json.dumps(work, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"갭 {len(work)}개 → {out.name} (홈피 또는 IG 빈칸)")
for w in work: print("  -", w["company"], "| hp:" + (w["current_homepage"] or "없음"), "| ig:" + (w["current_ig"] or "없음"))

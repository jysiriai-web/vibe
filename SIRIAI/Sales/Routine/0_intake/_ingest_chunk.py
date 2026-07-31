"""소싱 워크플로 .output 파일 → result.final 추출 → 6월/CSV/skipList 대조 → NEW만 _chunk_result.json.
이후 `python checkpoint.py append` 로 CSV·skipList 반영.
  python _ingest_chunk.py --out "<workflow .output 경로>"
"""
from __future__ import annotations
import argparse, csv as _csv, json, re, sys
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

HERE = Path(__file__).resolve().parent
def hangul(s): return re.sub(r"[^가-힣]", "", s or "")
def latin(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())
def keys(s):
    o = []; h, l = hangul(s), latin(s)
    if len(h) >= 2: o.append("h:" + h)
    if len(l) >= 3: o.append("l:" + l)
    return o

def known_keys():
    ks = set()
    v = sheets.open_sheet().worksheet("6월").get_all_values()
    hi = next(i for i, r in enumerate(v[:15]) if "브랜드명" in [c.strip() for c in r])
    ci = [c.strip() for c in v[hi]].index("브랜드명")
    for r in v[hi + 1:]:
        if len(r) > ci and r[ci].strip():
            for k in keys(r[ci]): ks.add(k)
    csvp = HERE / "신규브랜드_서치리스트.csv"
    if csvp.exists():
        rows = list(_csv.reader(csvp.read_text(encoding="utf-8-sig").splitlines()))
        bi = [c.strip() for c in rows[0]].index("브랜드명")
        for r in rows[1:]:
            if len(r) > bi and r[bi].strip():
                for k in keys(r[bi]): ks.add(k)
    wp = HERE / "profiles" / "_working.json"
    if wp.exists():
        for b in json.loads(wp.read_text(encoding="utf-8")).get("skipList", []):
            for k in keys(b): ks.add(k)
    # ★인터참 = 별도 트랙 → 소싱 NEW에서 제외 (6월로 새지 않게)
    sh = sheets.open_sheet()
    for tab, col in (("인터참", "브랜드명"), ("인터참_검토필요", "회사명")):
        try: vt = sh.worksheet(tab).get_all_values()
        except Exception: continue
        hh = next((i for i, r in enumerate(vt[:8]) if col in [c.strip() for c in r]), 0)
        if col not in [c.strip() for c in vt[hh]]: continue
        cti = [c.strip() for c in vt[hh]].index(col)
        for r in vt[hh + 1:]:
            if len(r) > cti and r[cti].strip():
                for k in keys(r[cti]): ks.add(k)
    return ks

def main(args):
    d = json.loads(Path(args.out).read_text(encoding="utf-8"))
    res = d.get("result", d)
    final = res.get("final", res.get("candidates", []))
    known = known_keys()
    new, dup = [], 0
    for c in final:
        if any(k in known for k in keys(c.get("brand", ""))): dup += 1
        else: new.append(c)
    (HERE / "_chunk_result.json").write_text(json.dumps({"final": new}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[ingest] raw {res.get('raw')} · 검증통과 {len(final)} → NEW {len(new)} · 기존중복 {dup}")
    for c in new:
        print(f"  + {c.get('brand')}  [{c.get('category','')}]  ig:{c.get('instagram') or '-'}")
    print(f"\n→ NEW {len(new)}개 _chunk_result.json 저장. 다음: python checkpoint.py append")
    return 0

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="워크플로 .output 파일 경로")
    raise SystemExit(main(ap.parse_args()))

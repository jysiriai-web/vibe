"""verify_emails 결과 → 지정 탭(+선택 CSV) 반영 + 기록. (탭 파라미터화)

  python apply_email_fixes.py --result recheck_result.json --tab 인터참 --csv target_list.csv --fixes recheck_fixes.csv
  python apply_email_fixes.py --result oem_result.json     --tab 인터참_OEM              --fixes oem_fixes.csv

동작:
  - confirmed/corrected/found → 연락처(D)·신뢰도(F)·비고(L, 메일검증+출처) 갱신 (+CSV 있으면 동기화)
  - uncertain/notfound/failed → 비고에 '확인필요' 표시 (추측 안 함)
  - 기록 → --fixes CSV (전체 status 감사)
안전: 회사명으로 행 매칭, 6월 등 타 탭 무관.
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
UPDATE = {"confirmed", "corrected", "found"}
WATCH = {"uncertain", "notfound", "failed"}


def norm(s): return (s or "").strip().lower().replace(" ", "")
def a1(col, row): return f"{chr(ord('A') + col - 1)}{row}"  # col<=26


def main(args):
    res = json.loads((HERE / args.result).read_text(encoding="utf-8"))
    results = res.get("results", [])
    by = {norm(r["company"]): r for r in results}
    print(f"[읽음] {args.result} · {len(results)}건 · status {dict(Counter(r.get('status','') for r in results))}")

    # 기록
    with (HERE / args.fixes).open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh); w.writerow(["company", "email", "status", "source", "note"])
        for r in results:
            w.writerow([r.get("company",""), r.get("email",""), r.get("status",""), r.get("source",""), r.get("note","")])
    print(f"[기록] {args.fixes}")

    # CSV 동기화(선택)
    if args.csv:
        p = DATA / args.csv
        rows = list(csv.DictReader(open(p, encoding="utf-8-sig", newline="")))
        flds = list(rows[0].keys()); upd = 0
        for row in rows:
            r = by.get(norm(row.get("회사명", "")))
            if not r: continue
            row["검증"] = r.get("status", "")
            if r.get("status") in UPDATE and r.get("email"):
                row["이메일"] = r["email"].strip(); row["신뢰도"] = "high"; upd += 1
        with p.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=flds); w.writeheader(); w.writerows(rows)
        print(f"[{args.csv}] 이메일 반영 {upd}건")

    # 시트 탭 갱신
    sh = sheets.open_sheet(); ws = sh.worksheet(args.tab)
    vals = ws.get_all_values(); H = [c.strip() for c in vals[0]]
    ci = {n: H.index(n) for n in H if n}
    cD, cF, cL, bcol = ci["연락처"] + 1, ci["신뢰도"] + 1, ci["비고"] + 1, ci["브랜드명"]
    batch = []; applied = watch = 0
    for off, r in enumerate(vals[1:], start=2):
        comp = r[bcol].strip() if len(r) > bcol else ""
        m = by.get(norm(comp))
        if not m: continue
        st = m.get("status", "")
        if st in UPDATE and m.get("email"):
            src = (m.get("source") or "").strip()
            batch += [{"range": a1(cD, off), "values": [[m["email"].strip()]]},
                      {"range": a1(cF, off), "values": [["high"]]},
                      {"range": a1(cL, off), "values": [[f"메일검증:{st}" + (f" · {src}" if src else "")]]}]
            applied += 1
        elif st in WATCH:
            batch.append({"range": a1(cL, off), "values": [[f"메일 확인필요({st}): {(m.get('note') or '')[:40]}"]]})
            watch += 1
    if batch:
        sheets.with_backoff(lambda: ws.batch_update(batch, value_input_option="USER_ENTERED"))
    print(f"[{args.tab}] 반영 {applied}건 · 확인필요 {watch}건")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--result", required=True)
    ap.add_argument("--tab", default="인터참")
    ap.add_argument("--csv", default="")
    ap.add_argument("--fixes", default="email_fixes.csv")
    raise SystemExit(main(ap.parse_args()))

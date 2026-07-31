"""collect_assets 결과 → 6월 탭 홈페이지(E)·인스타(N) 기입 (생짜 링크). 멱등.
  python apply_assets.py --result _assets_batch.json [--resolve]
- found/confirmed/corrected + 값 있으면 기입. uncertain/failed면 기존값 안 건드리고 비고에 '미확인' 표시.
- 홈페이지: 자사몰 없으면 플랫폼(올영·무신사 등) URL fallback 허용. 값이 개행 다중이면 한 셀에 줄바꿈으로 그대로 기입.
- 인스타: 개행 다중이면 한 셀에 링크 2개 줄바꿈으로.
"""
from __future__ import annotations
import argparse, json, sys
from collections import Counter
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

HERE = Path(__file__).resolve().parent
GOOD = {"found", "confirmed", "corrected"}


def norm(s): return (s or "").strip().lower().replace(" ", "")
def a1(col, row): return f"{chr(ord('A') + col - 1)}{row}"
def httpify(u):
    u = (u or "").strip()
    if not u: return ""
    return u if u.startswith("http") else "https://" + u.lstrip("@/")
def _lines(v): return [x.strip() for x in (v or "").replace("\r", "").split("\n") if x.strip()]
def hp_cell(v):   # 자사몰/플랫폼 URL — 다중이면 개행으로 한 셀에
    return "\n".join(httpify(x) for x in _lines(v))
def ig_cell(v):   # @핸들 → 생짜 인스타 링크 — 다중이면 개행으로 한 셀에
    out = []
    for x in _lines(v):
        h = x.lstrip("@")
        out.append(h if h.startswith("http") else f"https://www.instagram.com/{h}")
    return "\n".join(out)


def main(args):
    res = json.loads((HERE / args.result).read_text(encoding="utf-8"))
    results = res.get("results", [])
    by = {norm(r["company"]): r for r in results}
    print(f"[읽음] {args.result} · {len(results)}건 · {dict(Counter(r.get('status','') for r in results))}")

    ws = sheets.open_sheet().worksheet(args.tab)
    vals = ws.get_all_values()
    hi = next(i for i, r in enumerate(vals[:15]) if "브랜드명" in [c.strip() for c in r])
    H = [c.strip() for c in vals[hi]]
    cC, cE, cN, cM = H.index("브랜드명") + 1, H.index("홈페이지") + 1, H.index("인스타") + 1, H.index("비고") + 1
    bi = cC - 1
    batch = []; hp_n = ig_n = flag_n = resolved_n = 0
    for off, r in enumerate(vals[hi + 1:], start=hi + 2):
        comp = r[bi].strip() if len(r) > bi else ""
        m = by.get(norm(comp))
        if not m: continue
        st = m.get("status", "")
        hp = hp_cell(m.get("homepage"))    # 자사몰 없으면 플랫폼 URL fallback / 다중=개행
        ig = ig_cell(m.get("instagram"))   # 생짜 링크(다중=개행)
        cur_m = r[cM - 1].strip() if len(r) > cM - 1 else ""
        if hp:   # 홈페이지는 찾았으면 status 무관 기입 (uncertain이라도 손실 금지)
            batch.append({"range": a1(cE, off), "values": [[hp]]}); hp_n += 1
        if st in GOOD and ig:   # IG는 확인(GOOD)된 것만 — uncertain 핸들은 쓰지 않음
            batch.append({"range": a1(cN, off), "values": [[ig]]}); ig_n += 1
            if args.resolve and "확인불가" in cur_m:   # 보강 성공 → 기존 플래그 해제
                batch.append({"range": a1(cM, off), "values": [[""]]}); resolved_n += 1
        elif args.resolve and "확인불가" in cur_m:   # 보강 모드·여전히 미확인 → 이미 플래그됨, 그대로 둠
            pass
        else:    # 미확인 → 비고 표시(재추출에서 제외되는 마커 겸용)
            batch.append({"range": a1(cM, off), "values": [["⚠️IG 확인불가 - 검토"]]}); flag_n += 1
    if batch:
        sheets.with_backoff(lambda: ws.batch_update(batch, value_input_option="USER_ENTERED"))
    msg = f"[{args.tab}] 홈페이지 {hp_n} · 인스타 {ig_n} 기입 · 확인불가 {flag_n} 표시"
    if args.resolve: msg += f" · 플래그 해제 {resolved_n}"
    print(msg)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--result", default="_assets_batch.json")
    ap.add_argument("--tab", default="6월")
    ap.add_argument("--resolve", action="store_true", help="보강 모드: GOOD+IG면 기존 '확인불가' 플래그 해제")
    raise SystemExit(main(ap.parse_args()))

"""최종 구조: ①인터참_대상.csv(복붙용 깔끔데이터) ②인터참_검토필요 탭+csv ③인터참_OEM 탭 삭제.

- 대상 = target_list.csv 222곳, 이메일·인스타 위주 깔끔 컬럼 → 사용자가 '인터참 대상 리스트' 시트에 복붙.
- 검토필요 = full_classification '제외' 중 '확실히 아닌 것'(CLEAR_OUT: 패키징·전시·기관·기계·물류·광고)만 빼고 나머지(OEM·바이오·원료·애매) → 사용자 직접 검토. 검증된 이메일은 병합.
- 인터참_OEM 탭 삭제(사용자 불요 판정).
실행: Routine/.venv/Scripts/python.exe data/_work/finalize_lists.py
"""
from __future__ import annotations
import csv, sys
from collections import Counter
from pathlib import Path

from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

DATA = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent

# '확실히 아닌' = 소비자 뷰티 브랜드 가능성 0 (이름+근거+카테고리)
CLEAR_OUT = ["packaging","packing","plastic","container","tube","pump","bottle","용기","패키징","포장","부자재","유리병","스파우트",
             "exhibition","expo","박람회","주최","worldwide expo",
             "기술원","테크노파크","진흥원","재단","상공회의소","chamber","협회","조합","공단","institute","foundation","association",
             "기계","장비","설비","machinery","equipment","물류","logistics",
             "amazon","advertising","광고대행","대행사","미디어 대행"]


def rd(p): return list(csv.DictReader(open(p, encoding="utf-8-sig", newline="")))
def has(s): return bool((s or "").strip())
def norm(s): return (s or "").strip().lower().replace(" ", "")
def clear_out(r):
    t = ((r.get("회사명") or "") + " " + (r.get("판단근거") or "") + " " + (r.get("원본카테고리") or "")).lower()
    return any(k in t for k in CLEAR_OUT)


def best_emails():
    """검증 워크플로우들에서 confirmed/corrected/found 이메일 회사→메일 맵."""
    m = {}
    for f in ["oem_fixes.csv", "oem_verify_fixes.csv", "recheck_fixes.csv", "email_fixes.csv"]:
        p = HERE / f
        if not p.exists(): continue
        for r in rd(p):
            if r.get("status") in ("confirmed","corrected","found") and has(r.get("email")):
                m[norm(r["company"])] = (r["email"].strip(), r["status"])
    return m


def main():
    EM = best_emails()

    # ① 인터참_대상.csv (복붙용)
    tl = rd(DATA / "target_list.csv")
    cols = ["회사명","이메일","인스타","웹사이트","카테고리","Tier","홀","부스번호","전화","이메일상태"]
    with (DATA / "인터참_대상.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for r in tl:
            v = EM.get(norm(r.get("회사명","")))
            w.writerow({"회사명": r.get("회사명",""), "이메일": (v[0] if v else r.get("이메일","")),
                        "인스타": "", "웹사이트": r.get("웹사이트",""), "카테고리": r.get("ICP세부",""),
                        "Tier": r.get("구분",""), "홀": r.get("홀",""), "부스번호": r.get("부스번호",""),
                        "전화": r.get("전화",""), "이메일상태": (v[1] if v else (r.get("검증","") or "기존"))})
    print(f"① 인터참_대상.csv: {len(tl)}곳 (인스타 컬럼=빈칸, 미수집)")

    # ② 검토필요
    fc = rd(DATA / "full_classification.csv")
    excl = [r for r in fc if (r.get("구분") or "").strip() == "제외"]
    review = [r for r in excl if not clear_out(r)]
    dropped = [r for r in excl if clear_out(r)]
    print(f"② 검토필요: 제외 {len(excl)} → 확실히아님(제거) {len(dropped)} → 검토필요 {len(review)}")
    rcols = ["#","회사명","카테고리","이메일","웹사이트","부스번호","신뢰도","제외근거"]
    rrows = []
    for i, r in enumerate(review, 1):
        v = EM.get(norm(r.get("회사명","")))
        rrows.append({"#": i, "회사명": r.get("회사명",""), "카테고리": r.get("ICP세부",""),
                      "이메일": (v[0] if v else r.get("이메일","")), "웹사이트": r.get("웹사이트",""),
                      "부스번호": r.get("부스번호",""), "신뢰도": r.get("신뢰도",""),
                      "제외근거": (r.get("판단근거") or "")[:80]})
    with (DATA / "인터참_검토필요.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rcols); w.writeheader(); w.writerows(rrows)
    print(f"   → 인터참_검토필요.csv")

    # 검토필요 탭 생성(간단)
    sh = sheets.open_sheet()
    for t in ["인터참_검토필요", "인터참_OEM"]:
        try: sh.del_worksheet(sh.worksheet(t)); print(f"   기존 '{t}' 삭제")
        except Exception: pass
    ws = sh.add_worksheet(title="인터참_검토필요", rows=len(rrows)+10, cols=len(rcols)+1)
    sheets.with_backoff(lambda: ws.append_rows([rcols] + [[str(x[c]) for c in rcols] for x in rrows],
                                               value_input_option="USER_ENTERED"))
    print(f"③ '인터참_검토필요' 탭 생성 {len(rrows)}곳 · '인터참_OEM' 탭 삭제 완료")
    he = sum(1 for x in rrows if has(x["이메일"]))
    print(f"   검토필요 이메일 보유 {he}/{len(rrows)}")


if __name__ == "__main__":
    raise SystemExit(main())

"""인터참 전체 재점검 + OEM(제외)군 추출 + 이메일 더블체크 대상 추출. (읽기만, 토큰 0)

출력:
  1) target_list/인터참 탭 일관성 + 이메일 현황
  2) full_classification 제외군 분석 (PB가능=OEM/제조 vs 비대상=원료/기계/물류)
  3) 추출: _work/oem_worklist.json (PB가능 제외 → 이메일 워크플로우용)
            _work/recheck_worklist.json (타겟 중 uncertain/빈칸 → 더블체크용)
"""
from __future__ import annotations
import csv, json, sys
from collections import Counter
from pathlib import Path

from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
DATA = HERE.parent
from _shared import sheets


def rd(p):
    return list(csv.DictReader(open(p, encoding="utf-8-sig", newline="")))


def has(s): return bool((s or "").strip())


# PB가능(자체 브랜드 낼 수 있는 제조사) vs 비대상 키워드
PB_KW = ["oem", "odm", "제조", "수탁", "contract manufactur", "완제품", "private label", "pb", "주문자", "fillit", "필러", "vt", "코스메틱"]
NON_KW = ["원료", "소재", "ingredient", "raw material", "extract", "패키징", "packaging", "용기", "부자재",
          "포장", "기계", "장비", "설비", "machine", "equipment", "물류", "유통", "인증", "시험", "검사",
          "lab test", "b2b 서비스", "플랫폼", "미디어", "협회", "단체"]


def seg(r):
    t = ((r.get("판단근거") or "") + " " + (r.get("원본카테고리") or "")).lower()
    pb = any(k in t for k in PB_KW)
    non = any(k in t for k in NON_KW)
    if pb and not non: return "PB가능"
    if non and not pb: return "비대상"
    if pb and non: return "혼합(검토)"
    return "불명"


def main():
    print("="*60)
    print("[1] target_list.csv 현황")
    tl = rd(DATA / "target_list.csv")
    print(f"  총 {len(tl)}행 · 이메일 {sum(1 for r in tl if has(r.get('이메일')))} 채움 / {sum(1 for r in tl if not has(r.get('이메일')))} 빈칸")
    print("  검증 status:", dict(Counter((r.get('검증') or '미검증').strip() for r in tl)))
    print("  신뢰도:", dict(Counter((r.get('신뢰도') or '').strip() for r in tl)))

    print("="*60)
    print("[2] 인터참 탭 (구글시트) 교차 확인")
    sh = sheets.open_sheet()
    try:
        ws = sh.worksheet("인터참")
        v = ws.get_all_values()
        H = [c.strip() for c in v[0]]
        bi = H.index("브랜드명"); ei = H.index("연락처"); li = H.index("비고")
        data = [r for r in v[1:] if len(r) > bi and r[bi].strip()]
        filled = sum(1 for r in data if len(r) > ei and r[ei].strip())
        flagged = sum(1 for r in data if len(r) > li and "확인필요" in (r[li] if len(r) > li else ""))
        verified = sum(1 for r in data if len(r) > li and "메일검증" in (r[li] if len(r) > li else ""))
        print(f"  {len(data)}행 · 이메일 {filled} 채움 · 메일검증표시 {verified} · 확인필요 {flagged}")
    except Exception as e:
        print("  인터참 탭 읽기 실패:", e)

    print("="*60)
    print("[3] full_classification 제외군 분석")
    fc = rd(DATA / "full_classification.csv")
    print("  전체 구분:", dict(Counter((r.get('구분') or '').strip() for r in fc)))
    excl = [r for r in fc if (r.get("구분") or "").strip() in ("제외", "안전제외")]
    safe = [r for r in fc if (r.get("구분") or "").strip() == "안전제외"]
    nonsafe_excl = [r for r in excl if (r.get("구분") or "").strip() == "제외"]
    print(f"  제외 {len(nonsafe_excl)} + 안전제외 {len(safe)} = {len(excl)}")
    segs = Counter(seg(r) for r in nonsafe_excl)
    print("  제외 세그먼트:", dict(segs))
    for s in ["PB가능", "혼합(검토)", "불명", "비대상"]:
        rows = [r for r in nonsafe_excl if seg(r) == s]
        he = sum(1 for r in rows if has(r.get("이메일")))
        print(f"    - {s}: {len(rows)}곳 · 이메일 {he} 채움/{len(rows)-he} 빈칸")

    # 3-1. OEM 워크리스트 = PB가능 + 혼합 (보내볼 대상), 이메일 유무 표시
    oem_targets = [r for r in nonsafe_excl if seg(r) in ("PB가능", "혼합(검토)", "불명")]
    oem_wl = [{
        "company": (r.get("회사명") or "").strip(),
        "current_email": (r.get("이메일") or "").strip(),
        "website": (r.get("웹사이트") or "").strip(),
        "seg": seg(r),
        "reason": "빈칸" if not has(r.get("이메일")) else "보유(확인용)",
        "근거": (r.get("판단근거") or "").strip()[:60],
    } for r in oem_targets if (r.get("회사명") or "").strip()]
    (HERE / "oem_worklist.json").write_text(json.dumps(oem_wl, ensure_ascii=False, indent=2), encoding="utf-8")
    oem_blank = sum(1 for w in oem_wl if w["reason"] == "빈칸")
    print(f"  → oem_worklist.json: {len(oem_wl)}곳 (빈칸 {oem_blank} · 보유 {len(oem_wl)-oem_blank})")

    print("="*60)
    print("[4] 타겟 이메일 더블체크 대상 (uncertain/notfound/빈칸)")
    # email_fixes.csv 의 uncertain/notfound + target_list 빈칸
    recheck = []
    fixes_p = HERE / "email_fixes.csv"
    if fixes_p.exists():
        for r in rd(fixes_p):
            if r.get("status") in ("uncertain", "notfound", "failed"):
                # target_list 에서 website 보강
                tlrow = next((t for t in tl if (t.get("회사명") or "").strip() == r["company"].strip()), {})
                recheck.append({
                    "company": r["company"], "current_email": r.get("email", ""),
                    "website": (tlrow.get("웹사이트") or "").strip(),
                    "전화": (tlrow.get("전화") or "").strip(),
                    "prev_note": (r.get("note") or "")[:80], "reason": "더블체크",
                })
    (HERE / "recheck_worklist.json").write_text(json.dumps(recheck, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → recheck_worklist.json: {len(recheck)}곳")


if __name__ == "__main__":
    raise SystemExit(main())

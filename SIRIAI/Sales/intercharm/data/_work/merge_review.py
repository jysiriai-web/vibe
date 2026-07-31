"""검토필요 + 직접확인을 하나로 병합 → '인터참_검토필요' 탭/CSV (구분 컬럼). 직접확인 파일 삭제.
  - 타겟검토: 제외했지만 애매 → 영업대상인지 판단 (대상에 없음)
  - 이메일확인: 이미 대상인데 이메일만 못 찾음 → 직접 찾기 (대상에 있음, 이메일 빈칸)
실행: Routine/.venv/Scripts/python.exe data/_work/merge_review.py
"""
from __future__ import annotations
import csv, sys
from pathlib import Path
from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

DATA = Path(__file__).resolve().parents[1]
COLS = ["#", "구분", "회사명", "카테고리", "이메일", "웹사이트", "전화", "부스번호", "메모"]


def rd(p): return list(csv.DictReader(open(p, encoding="utf-8-sig", newline="")))


def main():
    merged = []
    # ① 타겟검토 (기존 검토필요 135)
    for r in rd(DATA / "인터참_검토필요.csv"):
        merged.append({"구분": "타겟검토", "회사명": r.get("회사명",""), "카테고리": r.get("카테고리",""),
                       "이메일": r.get("이메일",""), "웹사이트": r.get("웹사이트",""), "전화": "",
                       "부스번호": r.get("부스번호",""), "메모": r.get("제외근거","")})
    n_review = len(merged)
    # ② 이메일확인 (직접확인 24)
    dc = DATA / "직접확인_리스트.csv"
    n_email = 0
    if dc.exists():
        for r in rd(dc):
            merged.append({"구분": "이메일확인", "회사명": r.get("회사명",""),
                           "카테고리": f"대상({r.get('트랙','')})", "이메일": r.get("기존이메일(미확인)",""),
                           "웹사이트": r.get("웹사이트",""), "전화": r.get("전화",""), "부스번호": "",
                           "메모": r.get("왜못찾음","")})
            n_email += 1

    # CSV (구분=이메일확인 먼저 보이게 정렬: 대상인데 이메일만 = 우선순위 높음)
    merged.sort(key=lambda x: (x["구분"] != "이메일확인",))
    for i, r in enumerate(merged, 1): r["#"] = i
    with (DATA / "인터참_검토필요.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS); w.writeheader(); w.writerows(merged)
    print(f"병합: 타겟검토 {n_review} + 이메일확인 {n_email} = {len(merged)} → 인터참_검토필요.csv")

    # 탭 재생성
    sh = sheets.open_sheet()
    try: sh.del_worksheet(sh.worksheet("인터참_검토필요"))
    except Exception: pass
    ws = sh.add_worksheet(title="인터참_검토필요", rows=len(merged)+10, cols=len(COLS)+1)
    sheets.with_backoff(lambda: ws.append_rows([COLS] + [[str(x[c]) for c in COLS] for x in merged],
                                               value_input_option="USER_ENTERED"))
    print(f"'인터참_검토필요' 탭 재생성 {len(merged)}곳 (구분: 이메일확인 {n_email} 상단 + 타겟검토 {n_review})")

    # 직접확인 파일 삭제
    if dc.exists(): dc.unlink(); print("직접확인_리스트.csv 삭제 (검토필요로 병합됨)")


if __name__ == "__main__":
    raise SystemExit(main())

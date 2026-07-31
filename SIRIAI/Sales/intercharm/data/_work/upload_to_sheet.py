"""인터참 target_list.csv → 메인 스프레드시트 '인터참' 탭 업로드.

- 6월 탭과 동일 컬럼 템플릿(익숙하게 보이게) + 인터참 전용 컬럼(Tier·홀·부스·전화·웹·근거·현장관심도·후속약속…) append.
- 발송단계/발송적합도는 공란 → 일반 발송 파이프라인은 6월만 읽으므로 자동 격리(수작업 트랙).
- 멱등: '인터참' 탭 있으면 지우고 재생성. 6월 등 다른 탭은 안 건드림(안전).
실행: Routine/.venv/Scripts/python.exe data/_work/upload_to_sheet.py  (인터참 폴더에서)
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

CSV = Path(__file__).resolve().parents[1] / "target_list.csv"   # intercharm/data/target_list.csv
TAB = "인터참"

# 6월 템플릿 컬럼(동일 순서) + 인터참 전용 추가 컬럼
SIX = ["#","구분","브랜드명","연락처","업체명","신뢰도","메일유형","발송적합도","발송단계",
       "훅","메일주의","비고","인스타","감도","마케팅 경험","발송","열람","클릭","회신","미팅",
       "발송일자","회신일자","2차 메일","출처","성사여부"]
EXTRA = ["Tier","홀","부스번호","전화","웹사이트","플래그","판단근거",
         "부스우선순위","인터참단계","현장관심도","후속약속","진입경로"]
HEADER = SIX + EXTRA


def main():
    with CSV.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    print(f"[읽음] target_list {len(rows)}행")

    sh = sheets.open_sheet()
    # 기존 인터참 탭 있으면 제거(재생성)
    try:
        old = sh.worksheet(TAB)
        sh.del_worksheet(old)
        print(f"[재생성] 기존 '{TAB}' 탭 삭제")
    except Exception:
        pass
    ws = sh.add_worksheet(title=TAB, rows=len(rows) + 10, cols=len(HEADER) + 2)
    print(f"[생성] '{TAB}' 탭 ({len(rows)+10}행 x {len(HEADER)+2}열)")

    out = [HEADER]
    for i, r in enumerate(rows, 1):
        def g(k): return (r.get(k) or "").strip()
        row = [""] * len(HEADER)
        row[0] = str(i)               # #
        row[1] = g("ICP세부")          # 구분(카테고리)
        row[2] = g("회사명")           # 브랜드명
        row[3] = g("이메일")           # 연락처
        row[5] = g("신뢰도")           # 신뢰도
        row[23] = g("상세페이지")      # 출처(디렉터리 URL)
        # 인터참 전용
        ex = len(SIX)
        row[ex + 0] = g("구분")        # Tier (Tier A/B)
        row[ex + 1] = g("홀")
        row[ex + 2] = g("부스번호")
        row[ex + 3] = g("전화")
        row[ex + 4] = g("웹사이트")
        row[ex + 5] = g("플래그")
        row[ex + 6] = g("판단근거")
        out.append(row)

    sheets.with_backoff(lambda: ws.append_rows(out, value_input_option="USER_ENTERED"))
    he = sum(1 for r in rows if (r.get("이메일") or "").strip())
    print(f"[완료] '{TAB}' 탭에 {len(rows)}행 기록 (헤더 포함 {len(out)}행)")
    print(f"  이메일 채움 {he} / 빈칸 {len(rows)-he}")
    print(f"  Tier A {sum(1 for r in rows if r.get('구분','').strip()=='Tier A')} · "
          f"Tier B {sum(1 for r in rows if r.get('구분','').strip()=='Tier B')}")


if __name__ == "__main__":
    raise SystemExit(main())

"""프로모션 코드 재발급 — 브랜드를 바꾼 행의 코드를 새 이름에 맞게 다시 딴다.

브랜드를 갈아끼우면(같은 업체의 다른 브랜드로) 코드 앞 세 글자가 옛 이름을 가리킨 채 남는다.
발송 전이면 새로 따는 게 깔끔하고, 발송 후면 절대 건드리면 안 된다
— 이미 나간 메일의 링크·추적 픽셀이 그 코드를 쓰기 때문.

  python 3_send/reissue_code.py --row 9              # 미리보기
  python 3_send/reissue_code.py --row 9 --apply
  python 3_send/reissue_code.py --brand 원드배스 --apply
  python 3_send/reissue_code.py --scan               # 이름과 코드가 어긋난 행 찾기
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TAB = "26년 8월"
SKIP = {"com", "kr", "co", "net", "org", "www", "shop", "official", "http", "https"}


def letters3(brand: str, home: str, corp: str) -> str:
    for src in (brand, home, corp):
        s = re.sub(r"^https?://(www\.)?", "", (src or "").strip())
        for tok in re.findall(r"[A-Za-z]{3,}", s):
            if tok.lower() not in SKIP:
                return tok[:3].upper()
    return ""


def digits4(seed: str) -> int:
    h = 0
    for ch in seed:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return h % 9000 + 1000


def make_code(brand: str, home: str, corp: str, taken: set) -> str:
    pre = letters3(brand, home, corp)
    if not pre:
        v = digits4(brand)
        pre = "".join(chr(65 + (v // (26 ** i)) % 26) for i in range(3))
    n = digits4(brand + home + corp)
    for bump in range(9000):
        code = f"{pre}{(n + bump - 1000) % 9000 + 1000}"
        if code not in taken:
            return code
    raise RuntimeError("코드 발급 실패")


def main(a) -> int:
    import gspread
    from send_intercharm import _open_master

    sh, _ = _open_master()
    ws = sh.worksheet(TAB)
    grid = ws.get_all_values()
    head = [x.strip().replace("\n", "") for x in grid[7]]
    C = lambda n: head.index(n)

    def g(r, i):
        return r[i].strip() if 0 <= i < len(r) else ""

    cName, cCorp, cHome = C("브랜드명"), C("업체명"), C("홈페이지")
    cCode, cSend = C("프로모션 코드"), C("발송")

    # 전 시트의 코드를 모아 전역 유일 보장 (접속기록·열람기록이 공용이라 필수)
    taken = set()
    for w in sh.worksheets():
        try:
            gg = w.get_all_values()
        except Exception:
            continue
        hh = [x.strip().replace("\n", "") for x in gg[7]] if len(gg) > 7 else []
        if "프로모션 코드" not in hh:
            continue
        ic = hh.index("프로모션 코드")
        for r in gg[8:]:
            if len(r) > ic and r[ic].strip():
                taken.add(r[ic].strip().upper())

    rows = []
    for i, r in enumerate(grid[8:], 9):
        if not g(r, cName):
            continue
        if a.row and i != a.row:
            continue
        if a.brand and a.brand not in g(r, cName):
            continue
        cur = g(r, cCode)
        want_pre = letters3(g(r, cName), g(r, cHome), g(r, cCorp))
        mismatch = bool(cur) and bool(want_pre) and not cur.upper().startswith(want_pre)
        if a.scan and not mismatch:
            continue
        if not (a.row or a.brand or a.scan):
            continue
        rows.append((i, r, cur, mismatch))

    if not rows:
        print("대상 없음." if not a.scan else "이름과 코드가 어긋난 행 없음.")
        return 0

    cells = []
    for i, r, cur, mismatch in rows:
        sent = bool(g(r, cSend))
        new = make_code(g(r, cName), g(r, cHome), g(r, cCorp), taken)
        taken.add(new)
        flag = "  ⚠ 이미 발송됨 — 코드 유지" if sent else ("" if mismatch or a.row or a.brand else "")
        print(f"  {i:>4} {g(r,cName)[:20]:22} {cur or '(없음)':9} → {new:9}{flag}")
        if not sent:
            cells.append(gspread.Cell(i, cCode + 1, new))

    if not a.apply:
        print("\n  미리보기입니다. 반영하려면 --apply")
        return 0
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
        print(f"\n  {len(cells)}건 재발급 완료")
    else:
        print("\n  발송된 행뿐이라 아무것도 바꾸지 않았습니다.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--row", type=int, default=0, help="행 번호")
    ap.add_argument("--brand", default="", help="브랜드명(부분 일치)")
    ap.add_argument("--scan", action="store_true", help="이름과 코드가 어긋난 행 전체 찾기")
    ap.add_argument("--apply", action="store_true")
    raise SystemExit(main(ap.parse_args()))

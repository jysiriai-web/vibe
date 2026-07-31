"""오늘 발송 후보 준비 — 시트에 '발송 예정일'을 찍고 링크 생존을 점검한다.

발송은 하지 않는다. 사람이 훑어보고 문제 있는 것만 '부적합' 으로 바꾸면 끝.
그대로 둔 행이 곧 발송 대상이다(별도 승인 절차 없음).

  python 3_send/prepare_daily.py                 # 미리보기(무엇을 올릴지만)
  python 3_send/prepare_daily.py --apply         # 시트에 반영
  python 3_send/prepare_daily.py --apply -n 30   # 30개
  python 3_send/prepare_daily.py --recheck       # 이미 예정된 행의 링크만 다시 점검
  python 3_send/prepare_daily.py --clear --apply # 미발송 예정일 전부 해제(날짜 다시 잡을 때)
  python 3_send/prepare_daily.py --apply --date 2026-08-01   # 특정 날짜로 예약

고르는 기준(위에서부터):
  적합도=적합 · 제외 사유 없음 · 발송 안 됨 · 예정일 없음
링크가 죽어 있으면 후보에서 빼고 '링크 점검' 열에 남긴다.
정상인 경우엔 아무것도 쓰지 않는다 — 빈칸이 곧 '이상 없음'이다.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TAB = "26년 8월"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def L(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def check_url(url: str) -> str:
    """살아있는지만 본다. 내용 판단(품절 등)은 HTML 만으로 못 믿으므로 하지 않는다."""
    u = (url or "").strip()
    if not u:
        return "주소 없음"
    if not u.startswith("http"):
        u = "https://" + u
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10) as res:
            return "정상" if res.status < 400 else f"확인 필요 (HTTP {res.status})"
    except urllib.error.HTTPError as e:
        return "정상" if e.code in (401, 403, 405) else f"확인 필요 (HTTP {e.code})"
    except Exception as e:
        name = type(e).__name__
        return "응답없음 (도메인)" if "URLError" in name else f"확인 필요 ({name})"


def main(a) -> int:
    import gspread
    from send_intercharm import _open_master

    sh, _ = _open_master()
    ws = sh.worksheet(TAB)
    grid = ws.get_all_values()
    head = [x.strip().replace("\n", "") for x in grid[7]]

    def C(n):
        return head.index(n)

    def g(r, i):
        return r[i].strip() if 0 <= i < len(r) else ""

    today = a.date or f"{datetime.now():%Y-%m-%d}"
    cFit, cEx, cSend, cPlan, cChk = C("적합도"), C("제외 사유"), C("발송"), C("발송 예정일"), C("링크 점검")
    cName, cHome, cTrust, cHook = C("브랜드명"), C("홈페이지"), C("신뢰도"), C("개인화")

    if a.clear:
        tgt = [i for i, r in enumerate(grid[8:], 9) if g(r, cPlan) and not g(r, cSend)]
        print(f"■ 미발송 예정일 {len(tgt)}건 해제")
        if tgt and a.apply:
            ws.update_cells([gspread.Cell(i, cPlan + 1, "") for i in tgt],
                            value_input_option="USER_ENTERED")
            print("  해제 완료 — prepare_daily 로 다시 뽑으세요.")
        elif tgt:
            print("  미리보기입니다. 반영하려면 --apply")
        return 0

    # 지난 날짜로 잡혀 있는데 안 보낸 행은 예정 해제 — 하루 걸러도 후보 풀로 돌아오게
    if not a.recheck:
        stale = [i for i, r in enumerate(grid[8:], 9)
                 if g(r, cPlan) and g(r, cPlan) < today and not g(r, cSend)]
        if stale:
            print(f"  지난 예정일 {len(stale)}건 해제(미발송) — 다시 후보로")
            if a.apply:
                ws.update_cells([gspread.Cell(i, cPlan + 1, "") for i in stale],
                                value_input_option="USER_ENTERED")
                grid = ws.get_all_values()

    if a.recheck:
        pool = [(i, r) for i, r in enumerate(grid[8:], 9) if g(r, cPlan) == today]
        print(f"■ {today} 예정 {len(pool)}건 재점검")
    else:
        pool = [(i, r) for i, r in enumerate(grid[8:], 9)
                if g(r, cFit) == "적합" and not g(r, cEx) and g(r, C("이메일"))
                and not g(r, cSend) and not g(r, cPlan)][:a.n]
        print(f"■ 후보 {len(pool)}건 (적합 · 제외 없음 · 미발송 · 미예정)")
    if not pool:
        print("  대상 없음.")
        return 0

    with cf.ThreadPoolExecutor(8) as ex:
        checks = list(ex.map(lambda x: check_url(g(x[1], cHome)), pool))

    ok, dead = [], []
    for (i, r), st in zip(pool, checks):
        (dead if st.startswith("응답없음") else ok).append((i, r, st))

    odd = [x for x in ok if x[2] != "정상"]
    print(f"  링크 이상 {len(odd) + len(dead)}건" + (" (전부 정상)" if not odd and not dead else ""))
    print()
    for i, r, st in ok:
        mark = "  ※신뢰도확인" if g(r, cTrust) != "높음" else ""
        note = "" if st == "정상" else f"  ⚠{st}"
        print(f"  {i:>4} {g(r,cName)[:18]:20} {g(r,cTrust) or '(빈칸)':5}{note}{mark}")
        print(f"       개인화: {g(r,cHook)[:72]}")
    if dead:
        print()
        print("  ▼ 링크 죽음 — 예정에서 제외, 적합도 재판정 필요")
        for i, r, st in dead:
            print(f"  {i:>4} {g(r,cName)[:18]:20} {g(r,cHome)[:40]}")

    if not a.apply:
        print("\n  미리보기입니다. 반영하려면 --apply")
        return 0

    cells = []
    for i, r, st in ok:
        # 정상은 기록하지 않는다(빈칸 = 이상 없음). 이상할 때만 눈에 띄게.
        cells.append(gspread.Cell(i, cChk + 1,
                                    "" if st == "정상" else f"{st} {datetime.now():%m/%d}"))
        if not a.recheck:
            cells.append(gspread.Cell(i, cPlan + 1, today))
    for i, r, st in dead:
        cells.append(gspread.Cell(i, cChk + 1, f"{st} {datetime.now():%m/%d}"))
        if a.recheck:                       # 재점검에서 죽으면 예정 해제
            cells.append(gspread.Cell(i, cPlan + 1, ""))
    ws.update_cells(cells, value_input_option="USER_ENTERED")
    print(f"\n  시트 반영: 예정일 {len(ok) if not a.recheck else 0}건 · 링크 점검 {len(pool)}건")
    set_filter_view(sh, ws, cPlan, today, len(grid))
    # 그날 볼 행만 높이를 내용에 맞춘다 — 개인화 문장이 잘리지 않게(나머지 행은 26px 유지)
    if not a.recheck and ok:
        sh.batch_update({"requests": [
            {"autoResizeDimensions": {"dimensions": {"sheetId": ws.id, "dimension": "ROWS",
                "startIndex": i - 1, "endIndex": i}}} for i, _, _ in ok]})
    need = sum(1 for i, r, _ in ok if g(r, cTrust) != "높음")
    print()
    print(f"  시트 필터뷰 '오늘 발송' 이 {today} 로 맞춰졌습니다.")
    print("  → 시트 우상단 필터 아이콘 ▾ → '오늘 발송' 선택하면 그날 것만 보입니다.")
    print("  → 확인 후 문제 있으면 적합도를 '부적합' 으로 바꾸세요. 그대로 두면 발송 대상입니다.")
    if need:
        print(f"  → 신뢰도 '높음' 아님 {need}건 — 우선 확인")
    return 0


def set_filter_view(sh, ws, col: int, day: str, nrows: int):
    """기본 필터에 '발송 예정일 = 오늘' 을 걸어 둔다.

    필터뷰(Filter View)는 사람이 골라야 적용되므로 쓰지 않는다.
    기본 필터는 시트를 열면 바로 걸려 있어서 그날 것만 보인다.
    전체를 보려면 시트에서 필터 → '모두 선택' 하면 된다.
    """
    sid = ws.id
    reqs = []
    # 예전에 만든 필터뷰가 있으면 정리(두 가지가 공존하면 헷갈린다)
    meta = sh.fetch_sheet_metadata({"fields": "sheets(properties(sheetId),filterViews)"})
    for s_ in meta["sheets"]:
        if s_["properties"]["sheetId"] != sid:
            continue
        for v in s_.get("filterViews", []):
            if v.get("title") == "오늘 발송":
                reqs.append({"deleteFilterView": {"filterId": v["filterViewId"]}})
    # 날짜 셀은 숫자(serial)라서 TEXT_EQ 로는 하나도 안 걸린다 → DATE_EQ.
    # relativeDate=TODAY 면 날짜가 바뀌어도 필터가 알아서 따라간다.
    reqs.append({"setBasicFilter": {"filter": {
        "range": {"sheetId": sid, "startRowIndex": 7, "endRowIndex": nrows,
                    "startColumnIndex": 0, "endColumnIndex": ws.col_count},
        "filterSpecs": [{"columnIndex": col, "filterCriteria": {
            "condition": {"type": "DATE_EQ", "values": [{"relativeDate": "TODAY"}]}}}],
    }}})
    sh.batch_update({"requests": reqs})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=20, help="후보 개수 (기본 20)")
    ap.add_argument("--apply", action="store_true", help="시트에 반영")
    ap.add_argument("--recheck", action="store_true", help="이미 예정된 행의 링크만 재점검")
    ap.add_argument("--date", default="", help="예정일로 찍을 날짜 YYYY-MM-DD (기본 오늘)")
    ap.add_argument("--clear", action="store_true", help="미발송 행의 예정일을 모두 해제")
    raise SystemExit(main(ap.parse_args()))

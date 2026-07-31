"""회신 감지 — 인터참 마스터. 발송한 행의 주소에서 온 메일을 찾아 '회신' 열에 표시한다.

읽기 전용(gmail.readonly)이라 메일을 보내거나 지우지 않는다. 기본은 dry-run.
멱등: 이미 회신이 찍힌 행은 건드리지 않는다.

  python 4_track/sync_replies.py            # 미리보기 (시트 미변경)
  python 4_track/sync_replies.py --apply    # 실제 반영

브랜드 배치로 보낸 행은 '브랜드 회신', 담당자 배치로 보낸 행은 '담당자 회신'에 적는다.
(둘 다 보냈으면 담당자 쪽을 우선 — 나중에 보낸 것이 살아있는 대화다.)

주소는 공식·담당자 둘 다 확인한다. 담당자에게 보냈어도 대표 주소로 답이 오는 경우가 있다.
발송일 이후 메일만 보므로, 발송 전에 주고받은 과거 메일은 회신으로 잡히지 않는다.
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "3_send"))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import gmail_read  # noqa: E402


def addrs(cell: str) -> list[str]:
    """한 칸에 여러 주소가 들어있는 경우가 있다(a@x / b@y)."""
    return [t for t in re.split(r"[\s/;,]+", cell or "") if "@" in t]


def to_ymd(mmdd: str) -> str:
    """시트의 '7/21' 을 Gmail 검색용 'YYYY-MM-DD' 로. 비면 빈 문자열."""
    m = re.match(r"\s*(\d{1,2})\s*/\s*(\d{1,2})", mmdd or "")
    if not m:
        return ""
    return f"{datetime.now().year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"


def main(a) -> int:
    from send_intercharm import _open_master
    import gspread

    sh, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = [x.strip() for x in grid[hr]]

    def C(name):
        return head.index(name) if name in head else -1

    cCode, cName = C("프로모션 코드"), C("브랜드명")
    cOff, cPer = C("공식 이메일"), C("담당자 이메일")
    cBSend, cPSend = C("브랜드 발송"), C("담당자 발송")
    cBDate = C("브랜드 발송일")
    cPDate = next((i for i, x in enumerate(head) if x.startswith("담당자 발송일")), -1)
    cBRep, cPRep = C("브랜드 회신"), C("담당자 회신")
    if min(cCode, cBSend, cPSend, cBRep, cPRep) < 0:
        print("[중단] 필요한 열을 못 찾음 — 시트 구조 확인 필요.")
        return 1

    def g(row, i):
        return row[i].strip() if 0 <= i < len(row) else ""

    targets, all_sent = [], []
    for off, r in enumerate(grid[hr + 1:]):
        bsent, psent = "완료" in g(r, cBSend), "완료" in g(r, cPSend)
        if not (bsent or psent):
            continue
        person = psent                      # 담당자 배치로 보냈으면 담당자 쪽에 적는다
        col = cPRep if person else cBRep
        sent_on = to_ymd(g(r, cPDate if person else cBDate))
        cand = addrs(g(r, cPer)) + addrs(g(r, cOff)) if person else addrs(g(r, cOff)) + addrs(g(r, cPer))
        entry = {
            "row": hr + 2 + off, "code": g(r, cCode), "brand": g(r, cName),
            "col": col, "emails": cand, "since": sent_on,
            "batch": "담당자" if person else "브랜드",
            "marked": bool(g(r, col)),      # 이미 회신 표시됨 — 멱등
        }
        all_sent.append(entry)
        if entry["marked"] or not cand:
            continue
        targets.append(entry)

    print(f"  발송됨·회신 미표시: {len(targets)}건 조회")
    if not targets:
        print("  대상 0건.")
        return 0

    svc = gmail_read.get_service()
    found = []
    for t in targets:
        for e in t["emails"]:
            ok, when = gmail_read.has_reply(svc, e, t["since"] or None)
            if ok:
                found.append((t, e, when))
                print(f"  [회신] {t['code']:9} {t['brand'][:20]:22} ← {e}  ({when}, {t['batch']}배치)")
                break

    # ── 2차 패스: 제목 기반 — 시트에 없는 주소(같은 회사 다른 담당자)가 답한 경우
    #    답장 제목엔 "Re: [SIRIAI] 인사드린 시리아이..." 가 남는다. 보낸 주소와 무관하게 잡힌다.
    #    (0728 센티카/RAINT 사례: plan06 으로 보냈는데 plan11 이 회신 → 1차 패스가 놓침)
    FREE = {"gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
            "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"}
    by_email, by_dom = {}, {}
    for t in all_sent:
        for e in t["emails"]:
            by_email.setdefault(e.lower(), t)
            dom = e.lower().split("@")[-1]
            if dom not in FREE:             # 무료메일 도메인은 회사 매칭에 못 쓴다
                by_dom.setdefault(dom, t)
    seen_rows = {t["row"] for t, _, _ in found}
    resp = svc.users().messages().list(
        userId="me", q='subject:(인사드린 시리아이) -from:me newer_than:60d', maxResults=50).execute()
    for m in resp.get("messages", []):
        d = svc.users().messages().get(userId="me", id=m["id"], format="metadata",
                                       metadataHeaders=["From"]).execute()
        frm = next((x["value"] for x in d["payload"]["headers"] if x["name"] == "From"), "")
        mt = re.search(r"[\w.+-]+@[\w.-]+", frm)
        em = mt.group(0).lower() if mt else ""
        if not em:
            continue
        t = by_email.get(em) or by_dom.get(em.split("@")[-1])
        if not t:
            print(f"  [2차·미매칭] {frm[:60]} — 시트에서 행을 못 찾음, 수동 확인")
            continue
        if t["marked"] or t["row"] in seen_rows:
            continue
        seen_rows.add(t["row"])
        found.append((t, em, ""))
        print(f"  [회신·2차] {t['code']:9} {t['brand'][:20]:22} ← {em}  (제목 매칭, {t['batch']}배치)")

    print(f"\n  회신 {len(found)}건" + ("" if a.apply else "  · 미리보기입니다. 반영하려면 --apply"))
    if not found or not a.apply:
        return 0

    cells = [gspread.Cell(t["row"], t["col"] + 1, "O") for t, _, _ in found]
    ws.update_cells(cells, value_input_option="USER_ENTERED")
    print(f"  시트 반영 완료: {len(cells)}칸에 'O'")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 시트 갱신(기본 미리보기)")
    raise SystemExit(main(ap.parse_args()))

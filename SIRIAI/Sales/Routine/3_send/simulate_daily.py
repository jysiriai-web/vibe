"""발송 시뮬레이션 — 실제로 보내지 않고, 그날 무엇이 어떻게 나갈지만 보여준다.

  python 3_send/simulate_daily.py                    # 오늘 예정분
  python 3_send/simulate_daily.py --date 2026-08-01  # 특정 날짜
  python 3_send/simulate_daily.py --gap 60,180       # 간격 가정

실제 발송이 통과해야 하는 관문을 그대로 밟는다:
  발송 예정일 일치 → 적합도=적합 → 이미 발송됨 제외 → 수신거부 제외 → 쿨다운 제외
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TAB = "26년 8월"


def main(a) -> int:
    from send_intercharm import _open_master, suppressed_emails, recently_sent, _norm_brand

    day = a.date or f"{datetime.now():%Y-%m-%d}"
    sh, _ = _open_master()
    ws = sh.worksheet(TAB)
    grid = ws.get_all_values()
    head = [x.strip().replace("\n", "") for x in grid[7]]

    def C(n):
        return head.index(n)

    def g(r, i):
        return r[i].strip() if 0 <= i < len(r) else ""

    cPlan, cFit, cSend, cMail = C("발송 예정일"), C("적합도"), C("발송"), C("이메일")
    cName, cHook, cTrust, cChk = C("브랜드명"), C("개인화"), C("신뢰도"), C("링크 점검")
    cCode, cCat = C("프로모션 코드"), C("구분")

    rows = [(i, r) for i, r in enumerate(grid[8:], 9) if g(r, cPlan) == day]
    print(f"■ {day} 발송 예정 {len(rows)}건")
    if not rows:
        print("  없음. prepare_daily.py --apply 로 먼저 예정일을 찍으세요.")
        return 0

    dropped = []
    keep = []
    for i, r in rows:
        if g(r, cFit) != "적합":
            dropped.append((i, r, f"적합도={g(r, cFit) or '(빈칸)'}")); continue
        if g(r, cSend):
            dropped.append((i, r, "이미 발송됨")); continue
        keep.append((i, r))

    supp = suppressed_emails()
    k2 = []
    for i, r in keep:
        if g(r, cMail).lower() in supp:
            dropped.append((i, r, "수신거부 명단"))
        else:
            k2.append((i, r))
    keep = k2

    mails, brands = recently_sent(a.cooldown)
    k3 = []
    for i, r in keep:
        em, bn = g(r, cMail).lower(), _norm_brand(g(r, cName))
        if em in mails:
            dropped.append((i, r, f"쿨다운 · 이메일 {mails[em]}"))
        elif bn in brands:
            dropped.append((i, r, f"쿨다운 · 브랜드 {brands[bn]}"))
        else:
            k3.append((i, r))
    keep = k3

    lo, hi = (int(x) for x in a.gap.split(","))
    print(f"  관문 통과 {len(keep)}건 · 제외 {len(dropped)}건")
    print(f"  간격 {lo}~{hi}초 랜덤 · 보내는 사람 SIRIAI 조준용 <jysiriai@gmail.com>")
    print()

    t = datetime.strptime(f"{day} {a.start}", "%Y-%m-%d %H:%M")
    rnd = random.Random(day)
    print(f"{'예정시각':>8}  {'코드':9} {'브랜드':20} {'구분':7} {'신뢰도':5} 받는사람")
    for n, (i, r) in enumerate(keep):
        print(f"  {t:%H:%M}  {g(r,cCode):9} {g(r,cName)[:18]:20} {g(r,cCat)[:5]:7} "
              f"{g(r,cTrust) or '-':5} {g(r,cMail)[:34]}")
        if a.hook:
            print(f"            개인화: {g(r,cHook)[:86]}")
        if n < len(keep) - 1:
            t += timedelta(seconds=rnd.randint(lo, hi))
    if keep:
        start = datetime.strptime(f"{day} {a.start}", "%Y-%m-%d %H:%M")
        print()
        print(f"  → {start:%H:%M} 시작 · {t:%H:%M} 종료 (약 {int((t-start).total_seconds()//60)}분)")
    if dropped:
        print()
        print("  ▼ 제외")
        for i, r, why in dropped:
            print(f"  {i:>4} {g(r,cName)[:18]:20} {why}")

    print()
    print("  ※ 시뮬레이션입니다. 실제 발송은 8월 템플릿·렌더러가 준비된 뒤입니다.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="", help="YYYY-MM-DD (기본 오늘)")
    ap.add_argument("--gap", default="60,180", help="간격 초 (기본 60,180 = 1~3분)")
    ap.add_argument("--start", default="10:00", help="시작 시각 (기본 10:00)")
    ap.add_argument("--cooldown", type=int, default=60)
    ap.add_argument("--hook", action="store_true", help="개인화 문구도 같이 출력")
    raise SystemExit(main(ap.parse_args()))

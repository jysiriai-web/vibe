"""4_track 진입점 — 6월 '발송' 행의 회신을 Gmail(읽기 전용)으로 감지해 시트 갱신.

LLM 안 씀(토큰 0). 발송 안 함(gmail.readonly = 읽기 전용). 백업 → dry-run → --apply.
멱등: 이미 회신=Y인 행은 다시 안 건드림. 발송단계=발송 행만 대상.

  python run.py            # dry-run (기본, 시트 미변경)
  python run.py --apply    # 실제 갱신 (백업 후)

매칭(MVP): 발송 행의 '연락처' 주소에서 온 메일이 '발송일자' 이후 있으면 회신으로 본다.
  (정밀도 ↑ 하려면 향후 3_send가 발송 시 Gmail 스레드ID를 시트에 기록 → 스레드 기준 매칭.)
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # _shared
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:  # Windows cp949 콘솔에서 →·— 등 특수문자 출력 시 크래시 방지
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from _shared import backup as backup_mod  # noqa: E402
import gmail_read  # noqa: E402

TAB = "6월"
KST = timezone(timedelta(hours=9))
BACKUP_DIR = HERE / "backup"


def find_header_row(rows):
    for i, r in enumerate(rows[:15]):
        c = {x.strip() for x in r}
        if "구분" in c and "브랜드명" in c:
            return i
    return 0


def col_letter(i):
    s, n = "", i
    while True:
        s = chr(65 + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            break
    return s


def open_sheet():
    from _shared import sheets
    sh = sheets.open_sheet()
    return sh, sh.worksheet(TAB)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 시트 갱신(기본 dry-run)")
    args = ap.parse_args()

    sh, ws = open_sheet()
    vals = ws.get_all_values()
    hi = find_header_row(vals)
    H = [c.strip() for c in vals[hi]]

    def ci(name):
        return H.index(name) if name in H else None

    bi, di, st, rep, repd, sd = (ci(x) for x in ("브랜드명", "연락처", "발송단계", "회신", "회신일자", "발송일자"))
    if st is None:
        print("[중단] '발송단계' 열을 못 찾음 — 시트 구조 확인 필요.")
        return 1

    def g(r, i):
        return r[i].strip() if i is not None and len(r) > i else ""

    targets = []
    for off, r in enumerate(vals[hi + 1:]):
        if g(r, st) == "발송":
            targets.append({
                "row": hi + 2 + off,
                "brand": g(r, bi),
                "email": g(r, di),
                "send_date": g(r, sd),
                "already": g(r, rep),
            })

    print(f"[{TAB}] 발송단계=발송 {len(targets)}건 → 회신 감지 대상")
    if not targets:
        print("  대상 0건 — 아직 발송된 메일이 없습니다. (발송 시작 후 의미 생김) 종료.")
        return 0

    # 대상이 있을 때만 Gmail 인증(읽기 전용, 최초 1회 동의)
    svc = gmail_read.get_service()
    found = []
    for t in targets:
        if t["already"] == "Y":
            continue  # 멱등
        ok, rdate = gmail_read.has_reply(svc, t["email"], t["send_date"] or None)
        if ok:
            found.append((t, rdate))
            print(f"  [회신] {t['brand']} ← {t['email']} ({rdate})")

    print(f"\n회신 감지 {len(found)}건 ({'실제 갱신' if args.apply else 'DRY-RUN · 시트 미변경'})")
    if not found:
        return 0

    if not args.apply:
        for t, rdate in found:
            print(f"  [DRY] row{t['row']} {t['brand']}: 회신=Y · 회신일자={rdate} · 발송단계→회신")
        print("실제 반영하려면: python run.py --apply")
        return 0

    # --apply: 백업 후 갱신
    path, n = backup_mod.backup_tab(ws, TAB, BACKUP_DIR)
    print(f"  백업 {n}행 → {path}")
    from _shared import sheets
    today = datetime.now(KST).strftime("%Y-%m-%d")
    updates = []
    for t, rdate in found:
        if rep is not None:
            updates.append({"range": f"{col_letter(rep)}{t['row']}", "values": [["Y"]]})
        if repd is not None:
            updates.append({"range": f"{col_letter(repd)}{t['row']}", "values": [[rdate or today]]})
        updates.append({"range": f"{col_letter(st)}{t['row']}", "values": [["회신"]]})
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  갱신 {len(found)}건 완료 (회신·회신일자·발송단계).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

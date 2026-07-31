"""3_send 진입점 — 6월 탭에서 승인된 건을 안전하게 전송.

흐름: 사람이 검토화면에서 승인(6월 발송단계=승인) → `--send` 1회 →
  법적가드(야간/표기) → 워밍업 쿼터만큼 → 건별 전송 → 6월에 발송 기록 → 45~120초 스로틀.
기본 dry-run(미전송). 실제 전송은 --send --yes (Gmail OAuth 필요).

  python run.py --preview      # 오늘 승인분 보기
  python run.py --send         # dry-run (전송 시뮬레이션 — OAuth 없이 가능)
  python run.py --send --yes   # 실제 전송 (OAuth 필요)
옵션: --start-date YYYY-MM-DD(워밍업 기준일) · --ad-prefix(제목 (광고) 부착)
"""
from __future__ import annotations
import argparse, random, re, sys, time
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # _shared
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import compliance
import suppress

TAB = "6월"
PREVIEWS = HERE.parent / "2_compose" / "archive" / "previews"
SUBJECT = "[SIRIAI] {brand}에 맞는 인플루언서 제안드립니다"
SENDER = "SIRIAI <jysiriai@gmail.com>"           # 발신자 표기
WARMUP = [12, 12, 15, 15, 18, 18, 20, 22, 22, 25]  # 1~10일차, 이후 25 고정
THROTTLE = (45, 120)
KST = timezone(timedelta(hours=9))
FORB = re.compile(r'[\\/:*?"<>|]')


def safe(n): return FORB.sub("_", n).strip()
def col_letter(i):
    s, n = "", i
    while True:
        s = chr(65 + n % 26) + s; n = n // 26 - 1
        if n < 0: break
    return s
def find_header_row(rows):
    for i, r in enumerate(rows[:15]):
        c = {x.strip() for x in r}
        if "구분" in c and "브랜드명" in c: return i
    return 0
def warmup_quota(start, today):
    d = (today - start).days
    if d < 0: return 0
    return WARMUP[d] if d < len(WARMUP) else WARMUP[-1]


def open_sheet():
    from _shared import sheets
    sh = sheets.open_sheet()
    return sh, sh.worksheet(TAB)


def read_approved(ws):
    """6월에서 발송적합도=적합 & 발송단계=승인 행. 본문은 프리뷰 파일에서 도출."""
    vals = ws.get_all_values()
    hi = find_header_row(vals)
    H = [c.strip() for c in vals[hi]]
    def ci(n): return H.index(n) if n in H else None
    bi, di, hk, cau, fit, st = (ci(x) for x in ("브랜드명", "연락처", "훅", "메일주의", "발송적합도", "발송단계"))
    out, cols = [], {"발송단계": st}
    for off, r in enumerate(vals[hi + 1:]):
        def g(i): return r[i].strip() if i is not None and len(r) > i else ""
        if g(fit) != "적합" or g(st) != "승인":
            continue
        brand = g(bi)
        out.append({"row": hi + 2 + off, "brand": brand, "email": g(di),
                    "hook": g(hk), "warn": g(cau),
                    "subject": SUBJECT.format(brand=brand),
                    "body": PREVIEWS / f"{safe(brand)}.html"})
    return out, hi, st


def cmd_preview(args):
    sh, ws = open_sheet()
    items, *_ = read_approved(ws)
    quota = warmup_quota(args.start, date.today())
    print(f"[{TAB}] 승인 대기 {len(items)}건 · 오늘 쿼터 {quota} → {min(quota, len(items))}통 발송 예정")
    for it in items[:30]:
        warn = f"  ⚠️{it['warn'][:36]}" if it["warn"] else ""
        miss = "" if it["body"].exists() else "  [본문없음]"
        print(f"  {it['brand']:<14} {it['email']:<28}{warn}{miss}")
    return 0


def cmd_send(args):
    if not compliance.within_send_window():
        print(f"[중단] 야간 전송 금지(21~08시). 다음: {compliance.next_window_start():%Y-%m-%d %H:%M} KST")
        return 1
    sh, ws = open_sheet()
    items, hi, st_col = read_approved(ws)
    sup = suppress.load(sh)
    quota = warmup_quota(args.start, date.today())
    todo = items[:quota]
    print(f"[{TAB}] 승인 {len(items)} · 쿼터 {quota} → 대상 {len(todo)}건 ({'실제전송' if args.yes else 'DRY-RUN'})")

    svc = None
    if args.yes:
        import gmail
        svc = gmail.get_service()

    sent = fail = skip = 0
    updates = []
    today = datetime.now(KST).strftime("%Y-%m-%d")
    for i, it in enumerate(todo):
        if suppress.is_suppressed(it["email"], sup):
            skip += 1; print(f"  [제외] {it['brand']} — 수신거부/바운스"); continue
        if not it["body"].exists():
            fail += 1; print(f"  [실패] {it['brand']} — 본문파일 없음"); continue
        html = it["body"].read_text(encoding="utf-8")
        subject = compliance.apply_ad_prefix(it["subject"], args.ad_prefix)
        issues = compliance.check_template(html, subject, args.ad_prefix)
        if issues:
            fail += 1; print(f"  [실패] {it['brand']} — 표기위반: {issues[0]}"); continue
        if not args.yes:
            print(f"  [DRY] {it['brand']} → {it['email']} | {subject[:30]}"); sent += 1; continue
        try:
            import gmail
            mid = gmail.send(svc, it["email"], subject, html, SENDER)
            updates.append({"range": f"{col_letter(st_col)}{it['row']}", "values": [["발송"]]})
            print(f"  [발송] {it['brand']} → {it['email']} (id {mid})"); sent += 1
        except Exception as e:
            fail += 1; print(f"  [실패] {it['brand']} — {e}")
        if i != len(todo) - 1:
            time.sleep(random.randint(*THROTTLE))

    if updates:
        from _shared import sheets
        sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"\n  발송 {sent} · 실패 {fail} · 제외 {skip} · 남은 승인 {max(0, len(items) - len(todo))}")
    if not args.yes:
        print("  [DRY-RUN] 실제 전송: --send --yes (Gmail OAuth 필요)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--ad-prefix", action="store_true")
    ap.add_argument("--start-date", dest="start_s")
    args = ap.parse_args()
    args.start = (datetime.strptime(args.start_s, "%Y-%m-%d").date() if args.start_s else date.today())
    if args.preview: return cmd_preview(args)
    if args.send: return cmd_send(args)
    ap.print_help(); return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""인터참 사후 팔로업 발송 — 렌더된 미리보기를 그대로 보낸다.

슬롯 치환은 여기서 하지 않는다(2_compose/render_intercharm.py 담당).
여기는 "이미 완성된 HTML+텍스트를 multipart 로 싣고 보내는" 일만 한다.

  # 1) 나에게 테스트 1통 (실제 브랜드 데이터로)
  python 3_send/send_intercharm.py --code LAN4077 --to-me --send

  # 2) 실제 수신자에게 (manifest 의 받는사람 사용)
  python 3_send/send_intercharm.py --code LAN4077 --send
  python 3_send/send_intercharm.py --all --send        # manifest 전체

  --send 없으면 미리보기만. 실제 전송은 secrets/SEND_UNLOCKED 하드 락도 통과해야 한다.
"""
from __future__ import annotations
import argparse, base64, csv, random, re, sys, time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gmail  # noqa: E402

PREVIEW = HERE.parent / "2_compose" / "previews" / "intercharm"
MANIFEST = PREVIEW / "_manifest.csv"
ME = "jysiriai@gmail.com"
SENDER = "SIRIAI 조준용 <jysiriai@gmail.com>"

# 도달성: 연속 발송 시 45~120초 랜덤 간격 (3_send/README 조사값)
GAP = (10, 25)  # 9~10시 1시간 내 180건 (평균 17.5초 → 약 53분)


sys.path.insert(0, str(HERE.parent))                    # Routine/ (for _shared)
from _shared.config import MASTER_SHEET_ID as SHEET_ID  # noqa: E402  단일 출처(하드코딩 금지)
SA_JSON = HERE.parent / "secrets" / "service_account.json"


def sheet_writeback(results: list[tuple], column: str = "브랜드 발송",
                    date_column: str = "브랜드 발송일") -> str:
    """발송한 행을 시트에 기록. 상태는 '완료'(집계용), 날짜는 별도 열에 'M/D'.

    프로모션 코드로 행을 찾으므로 행 순서가 바뀌어도 안전하다.
    실패해도 발송은 이미 끝났으므로 예외를 던지지 않고 사유만 돌려준다.
    """
    from datetime import datetime
    ok = [c for c, good in results if good]
    if not ok:
        return "기록할 성공 건 없음"
    n = datetime.now()
    today = f"{n.month}/{n.day}"
    try:
        import gspread
        gc = gspread.service_account(filename=str(SA_JSON))
        _, ws = _open_master()
        grid = ws.get_all_values()
        hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
        head = [x.strip().replace(chr(10), "") for x in grid[hr]]
        c_code = head.index("프로모션 코드")
        c_col = head.index(column)
        c_date = head.index(date_column) if date_column in head else -1
        pos = {}
        for i in range(hr + 1, len(grid)):
            row = grid[i]
            if len(row) > c_code and row[c_code].strip():
                pos[row[c_code].strip().upper()] = i + 1
        cells, missing = [], []
        for code in ok:
            r = pos.get(code.upper())
            if not r:
                missing.append(code); continue
            cells.append(gspread.Cell(row=r, col=c_col + 1, value="완료"))
            if c_date >= 0:
                cells.append(gspread.Cell(row=r, col=c_date + 1, value=today))
        if cells:
            ws.update_cells(cells, value_input_option="USER_ENTERED")
        msg = f"'{column}'=완료 · '{date_column}'={today} 로 {len(ok) - len(missing)}건 기록"
        if missing:
            msg += f" · 코드 못 찾음 {len(missing)}건({', '.join(missing[:5])})"
        return msg
    except Exception as e:
        return f"시트 기록 실패({type(e).__name__}: {str(e)[:120]}) — 발송은 완료됨, 수동 확인 필요"


def _old_writeback_unused(results, column="브랜드 발송", value=""):
    """발송한 행의 상태 열을 시트에 기록. results = [(코드, 성공여부), ...]

    프로모션 코드로 행을 찾으므로 행 순서가 바뀌어도 안전하다.
    실패해도 발송 자체는 이미 끝났으므로 예외를 던지지 않고 사유만 돌려준다.
    """
    ok = [c for c, good in results if good]
    if not ok:
        return "기록할 성공 건 없음"
    if not value:
        from datetime import datetime
        n = datetime.now()
        value = f"완료 {n.month}/{n.day}"      # 예: 완료 7/20
    try:
        import gspread
        gc = gspread.service_account(filename=str(SA_JSON))
        _, ws = _open_master()
        grid = ws.get_all_values()
        # 헤더행 찾기(브랜드명 + 프로모션 코드가 있는 행)
        hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
        head = [x.strip().replace(chr(10), "") for x in grid[hr]]
        c_code = head.index("프로모션 코드")
        c_col = head.index(column)
        # 코드 → 시트 행번호
        pos = {}
        for i in range(hr + 1, len(grid)):
            row = grid[i]
            if len(row) > c_code and row[c_code].strip():
                pos[row[c_code].strip().upper()] = i + 1
        cells, missing = [], []
        for code in ok:
            r = pos.get(code.upper())
            if r:
                cells.append(gspread.Cell(row=r, col=c_col + 1, value=value))
            else:
                missing.append(code)
        if cells:
            ws.update_cells(cells, value_input_option="USER_ENTERED")   # batch 1회
        msg = f"'{column}' 열에 {len(cells)}건 '{value}' 기록"
        if missing:
            msg += f" · 시트에서 코드 못 찾음 {len(missing)}건({', '.join(missing[:5])})"
        return msg
    except Exception as e:
        return f"시트 기록 실패({type(e).__name__}: {str(e)[:120]}) — 발송은 완료됨, 수동 확인 필요"


def already_sent_codes(column: str = "브랜드 발송") -> set:
    """시트에서 이미 '완료'가 찍힌 프로모션 코드 집합. 중복 발송 방지용."""
    import gspread
    gc = gspread.service_account(filename=str(SA_JSON))
    _, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = [x.strip().replace(chr(10), "") for x in grid[hr]]
    c_code, c_col = head.index("프로모션 코드"), head.index(column)
    out = set()
    for row in grid[hr + 1:]:
        if len(row) > max(c_code, c_col) and row[c_code].strip() and "완료" in row[c_col]:
            out.add(row[c_code].strip().upper())
    return out


# ★발송·추적 대상 캠페인 탭. 월이 바뀌면 여기만 고친다.
#  이름으로 못 찾으면 헤더로 찾되 '담당자 이메일'까지 있어야 인터참 마스터로 인정한다.
#  (탭 순서/헤더만 보면 새 월 탭이 먼저 잡혀 엉뚱한 탭에 기록된다 — 0730 사고)
MASTER_TAB = "26년 7월 (인터참)"


def _open_master():
    """마스터 탭을 찾는다. MASTER_TAB 우선, 없으면 헤더로 판별."""
    import gspread
    gc = gspread.service_account(filename=str(SA_JSON))
    sh = gc.open_by_key(SHEET_ID)
    try:
        return sh, sh.worksheet(MASTER_TAB)
    except Exception:
        pass
    for ws in sh.worksheets():
        try:
            top = ws.get_values("A1:AZ20")
        except Exception:
            continue
        for r in top:
            if "브랜드명" in r and "프로모션 코드" in r and "담당자 이메일" in r:
                return sh, ws
    raise SystemExit(f"마스터 탭을 못 찾음 (MASTER_TAB='{MASTER_TAB}' 확인)")


def recently_sent(days: int = 60) -> tuple[dict, dict]:
    """최근 `days` 일 안에 보낸 (이메일, 브랜드) — 모든 캠페인 탭을 훑는다.

    리스트를 만든 시점이 아니라 '보내는 시점'에 판정해야 한다.
    시트에 박아둔 제외 문구는 그 사이에 낡을 수 있기 때문.
    돌려주는 값: ({이메일: 'M/D'}, {정규화브랜드: 'M/D'})
    """
    from datetime import datetime, timedelta
    sh, _ = _open_master()
    today = datetime.now()
    cutoff = today - timedelta(days=days)
    mails, brands = {}, {}

    def parse(md: str):
        """'7/20' → datetime. 미래로 나오면 작년 것으로 본다(연말·연초 대비)."""
        m = re.match(r"\s*(\d{1,2})\s*/\s*(\d{1,2})", md or "")
        if not m:
            return None
        try:
            d = datetime(today.year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            return None
        return d.replace(year=today.year - 1) if d > today + timedelta(days=1) else d

    for ws in sh.worksheets():
        try:
            grid = ws.get_all_values()
        except Exception:
            continue
        hr = next((i for i, r in enumerate(grid[:20])
                   if "브랜드명" in [x.strip() for x in r]), -1)
        if hr < 0:
            continue
        head = [x.strip().replace("\n", "") for x in grid[hr]]
        if "브랜드명" not in head:
            continue
        cb = head.index("브랜드명")
        # (발송 열, 발송일 열, 이메일 열) 짝 — 탭마다 이름이 다르다
        pairs = [("브랜드 발송", "브랜드 발송일", "공식 이메일"),
                 ("담당자 발송", "담당자 발송일", "담당자 이메일"),
                 ("발송", "발송일", "이메일")]
        for cs, cd, ce in pairs:
            if cs not in head or ce not in head:
                continue
            i_s, i_e = head.index(cs), head.index(ce)
            i_d = head.index(cd) if cd in head else -1
            for row in grid[hr + 1:]:
                row = row + [""] * (len(head) + 2)
                if "완료" not in row[i_s]:
                    continue
                when = parse(row[i_d]) if i_d >= 0 else None
                if when and when < cutoff:
                    continue                      # 쿨다운 지남 — 다시 보내도 된다
                tag = f"{when.month}/{when.day}" if when else "날짜없음"
                for t in re.split(r"[\s/;,]+", row[i_e]):
                    if "@" in t:
                        mails[t.strip().lower()] = tag
                if row[cb].strip():
                    brands[_norm_brand(row[cb])] = tag
    return mails, brands


_LEGAL_RE = re.compile(r"(주식회사|유한회사|\(주\)|\(유\)|㈜)", re.I)


def _norm_brand(v: str) -> str:
    """브랜드명 대조용 정규화 — (주)달바 / 달바 / DALBA 를 같게 본다."""
    s = _LEGAL_RE.sub("", v or "")
    s = re.sub(r"[\(\)（）\[\]{}]", " ", s)
    return re.sub(r"[\s·/\-_,.'\"]+", "", s).strip().lower()


def suppressed_emails() -> set:
    """_수신거부 탭의 주소들 — 월이 바뀌어도 영구히 제외한다."""
    sh, _ = _open_master()
    titles = [w.title for w in sh.worksheets()]
    if "_수신거부" not in titles:
        return set()
    vals = sh.worksheet("_수신거부").get_all_values()
    if not vals:
        return set()
    ei = vals[0].index("이메일") if "이메일" in vals[0] else 0
    return {r[ei].strip().lower() for r in vals[1:] if len(r) > ei and r[ei].strip()}


def sync_optouts_to_suppress() -> str:
    """시트 회신 열에 '수신거부'/'주소없음' 으로 표시된 주소를 _수신거부 탭에 영구 등록."""
    from datetime import datetime
    import gspread
    sh, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = [x.strip().replace(chr(10), "") for x in grid[hr]]
    pairs = [("공식 이메일", "브랜드 회신"), ("담당자 이메일", "담당자 회신")]
    found = []
    for mail_col, rep_col in pairs:
        if mail_col not in head or rep_col not in head:
            continue
        cm, cr = head.index(mail_col), head.index(rep_col)
        for row in grid[hr + 1:]:
            if len(row) <= max(cm, cr):
                continue
            state = row[cr].strip()
            if state in ("수신거부", "주소없음"):
                for t in re.split(r"[\s/;,]+", row[cm]):
                    if "@" in t:
                        found.append((t.strip(), state))
    if not found:
        return "등록할 수신거부/반송 없음"
    titles = [w.title for w in sh.worksheets()]
    if "_수신거부" not in titles:
        tab = sh.add_worksheet(title="_수신거부", rows=500, cols=4)
        tab.update(range_name="A1", values=[["이메일", "사유", "원래월", "일시"]], value_input_option="RAW")
    else:
        tab = sh.worksheet("_수신거부")
    have = suppressed_emails()
    now = datetime.now()
    rows = [[e, r, f"{now.year}-{now.month:02d}", now.strftime("%Y-%m-%d %H:%M")]
            for e, r in found if e.lower() not in have]
    if rows:
        tab.append_rows(rows, value_input_option="RAW")
    return f"_수신거부 탭에 {len(rows)}건 등록(중복 {len(found) - len(rows)}건 제외)"


def clear_sent(codes: list) -> str:
    """지정 코드의 '브랜드 발송'·'발송일'·'브랜드 회신'을 비워 재발송 대기로 되돌린다."""
    import gspread
    sh, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = [x.strip().replace(chr(10), "") for x in grid[hr]]
    cCode = head.index("프로모션 코드")
    targets = {c.strip().upper() for c in codes}
    cols = [head.index(x) for x in ("브랜드 발송", "브랜드 발송일", "브랜드 회신") if x in head]
    cells, hit = [], []
    for i in range(hr + 1, len(grid)):
        row = grid[i]
        if len(row) > cCode and row[cCode].strip().upper() in targets:
            for c in cols:
                cells.append(gspread.Cell(i + 1, c + 1, ""))
            hit.append(row[cCode].strip())
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
    return f"{len(hit)}건 재발송 대기로 되돌림: {', '.join(hit)}"


def load_manifest() -> list[dict]:
    if not MANIFEST.exists():
        raise SystemExit(f"명세가 없습니다: {MANIFEST}\n  먼저 2_compose/render_intercharm.py 를 돌리세요.")
    return list(csv.DictReader(MANIFEST.open(encoding="utf-8")))


def build(to: str, subject: str, html: str, plain: str) -> MIMEMultipart:
    """multipart/alternative = [text, html]. text 파트가 없으면 스팸 점수가 오른다."""
    msg = MIMEMultipart("alternative")
    msg["To"] = to
    msg["From"] = SENDER
    msg["Subject"] = subject
    msg.attach(MIMEText(plain, "plain", "utf-8"))   # 순서 중요: 뒤가 선호됨
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg


def main(a) -> int:
    rows = load_manifest()
    if a.code:
        want = {c.strip().upper() for c in a.code.split(",") if c.strip()}
        rows = [r for r in rows if r["코드"].upper() in want]
    elif not a.all:
        raise SystemExit("--code 또는 --all 중 하나가 필요합니다.")
    if not rows:
        raise SystemExit("대상 0건 — 코드를 확인하세요.")

    send_col = "담당자 발송" if a.person else "브랜드 발송"
    date_col = "담당자 발송일" if a.person else "브랜드 발송일"
    if a.skip_sent:
        try:
            done = already_sent_codes(send_col)
            before = len(rows)
            rows = [r for r in rows if r["코드"].upper() not in done]
            print(f"  이미 발송된 {before - len(rows)}건 제외(시트 '브랜드 발송'=완료)")
        except Exception as e:
            raise SystemExit(f"이미 발송분 조회 실패 — 중복 발송 위험이라 중단합니다: {e}")

    # 수신거부·반송 주소는 언제나 제외한다(--skip-sent 여부와 무관)
    try:
        supp = suppressed_emails()
        if supp:
            before = len(rows)
            rows = [r for r in rows if r["받는사람"].strip().lower() not in supp]
            if before != len(rows):
                print(f"  수신거부/반송 {before - len(rows)}건 제외(_수신거부 탭)")
    except Exception as e:
        raise SystemExit(f"수신거부 명단 조회 실패 — 안전상 중단합니다: {e}")

    # 쿨다운 — 최근 N일 안에 보낸 곳은 캠페인이 달라도 다시 보내지 않는다.
    # 발송 직전에 시트를 다시 읽어 판정하므로 리스트를 언제 만들었든 상관없다.
    if a.cooldown > 0:
        try:
            mails, brands = recently_sent(a.cooldown)
        except Exception as e:
            raise SystemExit(f"쿨다운 조회 실패 — 중복 발송 위험이라 중단합니다: {e}")
        keep, hit = [], []
        for r in rows:
            em = r["받는사람"].strip().lower()
            bn = _norm_brand(r.get("브랜드", ""))
            if em in mails:
                hit.append((r["코드"], r["브랜드"], f"이메일 {mails[em]}"))
            elif bn and bn in brands:
                hit.append((r["코드"], r["브랜드"], f"브랜드 {brands[bn]}"))
            else:
                keep.append(r)
        if hit:
            print(f"  쿨다운({a.cooldown}일) {len(hit)}건 제외 — 최근에 이미 보낸 곳")
            for c, b, why in hit[:10]:
                print(f"      · {c:9} {b[:22]:24} {why}")
            if len(hit) > 10:
                print(f"      … 외 {len(hit) - 10}건")
        rows = keep

    # --to / --to-me 는 테스트 발송 — 수신자를 갈아끼우고 시트에 기록하지 않는다
    to_override = [x.strip() for x in a.to.split(",") if x.strip()] if a.to else []
    test_mode = a.to_me or bool(to_override)
    note = "  · 수신자를 내 메일로 강제(--to-me)" if a.to_me else (
        f"  · 수신자를 {', '.join(to_override)} 로 강제(--to)" if to_override else "")
    print(f"■ 대상 {len(rows)}건" + note)
    print(f"  보내는 사람: {SENDER}")
    print()

    jobs = []
    for r in rows:
        h = PREVIEW / r["본문HTML"]
        t = PREVIEW / r["본문TXT"]
        if not h.exists() or not t.exists():
            print(f"  ✗ {r['코드']} {r['브랜드']} — 렌더 파일 없음(재렌더 필요)"); continue
        tos = to_override or ([ME] if a.to_me else [r["받는사람"]])
        html, plain = h.read_text(encoding="utf-8"), t.read_text(encoding="utf-8")
        mark = "⚠️ " + r["주의사항"][:40] if r.get("주의사항") else ""
        for to in tos:
            jobs.append((r, to, html, plain))
            print(f"  · {r['코드']:9} {r['브랜드'][:24]:26} → {to:34} {mark}")

    if not jobs:
        return 1
    if not a.send:
        print("\n미리보기만 했습니다. 실제로 보내려면 --send 를 붙이세요.")
        return 0

    # --spread 분 안에 고르게 흩뿌린다. 평균 간격 기준 ±60% 랜덤(패턴 티 안 나게)
    gap = GAP
    if a.gap:
        lo, hi = (int(x) for x in a.gap.split(","))
        gap = (lo, hi)
        exp = (lo + hi) / 2 * (len(jobs) - 1) / 60
        print(f"  발송 간격: {lo}~{hi}초 랜덤 · {len(jobs)}건 예상 소요 약 {exp:.0f}분")
        print()
    elif a.spread and len(jobs) > 1:
        avg = a.spread * 60 / (len(jobs) - 1)
        gap = (max(5, int(avg * 0.4)), max(6, int(avg * 1.6)))
        exp = (gap[0] + gap[1]) / 2 * (len(jobs) - 1) / 60
        print(f"  분산 발송: {a.spread}분 목표 · 간격 {gap[0]}~{gap[1]}초 랜덤 · 예상 소요 약 {exp:.0f}분")
        print()

    gmail._assert_send_unlocked()      # 하드 락 — SEND_UNLOCKED 없으면 여기서 차단
    svc = gmail.get_service()
    sent, results, flushed = 0, [], 0
    for i, (r, to, html, plain) in enumerate(jobs):
        msg = build(to, r["제목"], html, plain)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        try:
            res = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
            sent += 1
            results.append((r["코드"], True))
            print(f"  ✓ {r['코드']} {r['브랜드'][:20]} → {to}   id={res['id']}")
        except Exception as e:      # 한 건 실패가 배치 전체를 멈추지 않게
            results.append((r["코드"], False))
            print(f"  ✗ {r['코드']} {r['브랜드'][:20]} → {to}   실패: {type(e).__name__}: {str(e)[:90]}")
        # 20건마다 중간 저장 — 장시간 배치가 끊겨도 이미 보낸 건 기록이 남는다
        if not test_mode and len(results) % 20 == 0:
            pend = results[flushed:]
            print("    [중간저장]", sheet_writeback(pend, send_col, date_col))
            flushed = len(results)
            sys.stdout.flush()

        if i < len(jobs) - 1:
            w = random.randint(*gap)
            print(f"    … {w}초 대기", flush=True)
            time.sleep(w)

    failed = len(results) - sent
    print(f"\n전송 완료 {sent}건" + (f" · 실패 {failed}건" if failed else ""))
    if not test_mode:               # 테스트(--to-me/--to)는 시트에 기록하지 않는다
        print("  시트 기록:", sheet_writeback(results[flushed:], send_col, date_col))
    else:
        print("  시트 기록: 생략(테스트 발송)")
    print("  발송이 끝났으면 secrets/SEND_UNLOCKED 를 지워 다시 잠그세요.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", default="", help="프로모션 코드 (콤마구분)")
    ap.add_argument("--all", action="store_true", help="manifest 전체")
    ap.add_argument("--to-me", action="store_true", help="수신자를 내 메일로 강제(테스트용)")
    ap.add_argument("--to", default="", help="수신자를 지정 주소로 강제, 콤마구분(테스트용·시트 미기록)")
    ap.add_argument("--send", action="store_true", help="실제 전송 (없으면 미리보기)")
    ap.add_argument("--skip-sent", action="store_true", dest="skip_sent", help="시트에 이미 완료로 찍힌 행 제외")
    ap.add_argument("--person", action="store_true", help="담당자 배치 — 시트 기록을 담당자 발송 열에")
    ap.add_argument("--spread", type=int, default=0, help="전체를 N분에 걸쳐 랜덤 간격으로 분산 발송")
    ap.add_argument("--gap", default="", metavar="최소,최대",
                    help='발송 간격(초). 예: --gap 60,180 → 1~3분 랜덤')
    ap.add_argument("--cooldown", type=int, default=60,
                    help="최근 N일 안에 보낸 이메일·브랜드는 제외 (기본 60일 · 0이면 끔)")
    raise SystemExit(main(ap.parse_args()))

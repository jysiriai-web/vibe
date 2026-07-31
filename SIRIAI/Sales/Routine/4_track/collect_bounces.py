"""반송(bounce) 자동 수집 — 받은편지함의 '배달 실패' 메일을 읽어 마스터시트에 표시한다.

하는 일 (3줄)
  ① 받은편지함에서 mailer-daemon 이 보낸 배달실패 메일을 찾는다
  ② 그 안에서 실패한 주소를 뽑는다        (예: info@ssmb.vn)
  ③ 마스터시트에서 그 주소 행을 찾아 회신 열에 '주소없음' 이라 적는다

읽기 전용 토큰(gmail_token_readonly.json)만 쓴다 — 이 파일은 메일을 보낼 수 없다.

  python 4_track/collect_bounces.py            # 미리보기(시트 안 건드림)
  python 4_track/collect_bounces.py --apply    # 시트에 반영
  python 4_track/collect_bounces.py --days 3   # 최근 3일치만
"""
from __future__ import annotations
import argparse, base64, re, sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gmail_read  # noqa: E402  (읽기 전용)

sys.path.insert(0, str(HERE.parent))                    # Routine/ (for _shared)
from _shared.config import MASTER_SHEET_ID as SHEET_ID  # noqa: E402  단일 출처(하드코딩 금지)
SA_JSON = HERE.parent / "secrets" / "service_account.json"

# 하드 바운스(영구 실패) 신호. 5.x.x = 영구, 4.x.x = 일시라 제외한다.
HARD = re.compile(r"\b5\.[01]\.[0-9]\b|does not exist|no such user|user unknown|"
                  r"address (?:not found|rejected)|mailbox (?:unavailable|not found)", re.I)
ADDR = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
SKIP = re.compile(r"(mailer-daemon|postmaster|googlemail\.com|jysiriai@)", re.I)


def body_text(payload) -> str:
    """메일 본문을 평문으로 이어붙인다(중첩 파트 포함)."""
    out = []
    def walk(p):
        if p.get("body", {}).get("data"):
            try:
                out.append(base64.urlsafe_b64decode(p["body"]["data"]).decode("utf-8", "ignore"))
            except Exception:
                pass
        for sub in p.get("parts", []) or []:
            walk(sub)
    walk(payload)
    return "\n".join(out)


def find_bounces(days: int) -> dict[str, str]:
    """{실패주소: 사유요약}"""
    svc = gmail_read.get_service()
    q = f"from:mailer-daemon OR subject:(Delivery Status Notification) newer_than:{days}d"
    res = svc.users().messages().list(userId="me", q=q, maxResults=200).execute()
    ids = [m["id"] for m in res.get("messages", [])]
    found: dict[str, str] = {}
    for mid in ids:
        msg = svc.users().messages().get(userId="me", id=mid, format="full").execute()
        text = body_text(msg.get("payload", {})) + "\n" + msg.get("snippet", "")
        if not HARD.search(text):
            continue                      # 일시적 실패는 건너뛴다(나중에 재시도 가능)
        for a in ADDR.findall(text):
            if SKIP.search(a):
                continue
            reason = "주소없음"
            m = re.search(r"\b(5\.[01]\.[0-9])\b", text)
            found.setdefault(a.lower(), f"{reason}({m.group(1)})" if m else reason)
    return found


def main(a) -> int:
    import gspread
    print(f"■ 최근 {a.days}일 반송 메일 조회 중…")
    bounced = find_bounces(a.days)
    if not bounced:
        print("  반송 없음 ✅")
        return 0
    print(f"  하드바운스 주소 {len(bounced)}건 발견")

    gc = gspread.service_account(filename=str(SA_JSON))
    _, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = grid[hr]
    cB, cOff, cPer = head.index("브랜드명"), head.index("공식 이메일"), head.index("담당자 이메일")
    cRepB, cRepP = head.index("브랜드 회신"), head.index("담당자 회신")

    def mails(v):
        return {t.lower() for t in re.split(r"[\s/;,]+", v or "") if "@" in t}

    cells, hits, unmatched = [], [], dict(bounced)
    for i in range(hr + 1, len(grid)):
        row = grid[i]
        if len(row) <= cPer or not row[cB].strip():
            continue
        for addr, reason in bounced.items():
            tgt = None
            if addr in mails(row[cOff]):   tgt = (cRepB, "브랜드")
            elif addr in mails(row[cPer]): tgt = (cRepP, "담당자")
            if not tgt:
                continue
            col, which = tgt
            cur = row[col] if len(row) > col else ""
            unmatched.pop(addr, None)
            if "주소없음" in cur:
                continue                   # 이미 표시됨
            cells.append(gspread.Cell(row=i + 1, col=col + 1, value="주소없음"))
            hits.append((row[cB][:26], addr, which, reason))

    print()
    for b, addr, which, reason in hits:
        print(f"  · {b:28} {addr:34} [{which} 회신] {reason}")
    if unmatched:
        print(f"\n  시트에서 못 찾은 주소 {len(unmatched)}건: {', '.join(list(unmatched)[:5])}")

    if not a.apply:
        print(f"\n  미리보기입니다. 반영하려면 --apply ({len(cells)}칸 예정)")
        return 0
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
    print(f"\n  시트 반영 완료: {len(cells)}칸에 '주소없음' 기록")
    print("  → 다음 발송에서 자동 제외됩니다.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7, help="최근 N일치 조회 (기본 7)")
    ap.add_argument("--apply", action="store_true", help="시트에 실제 반영")
    raise SystemExit(main(ap.parse_args()))

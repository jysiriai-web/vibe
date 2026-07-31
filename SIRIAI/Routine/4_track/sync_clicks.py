"""⚠️ 은퇴(0728) — 더 이상 돌리지 말 것.

마스터의 '브랜드 클릭'·'담당자 클릭' 열이 접속기록을 직접 읽는 실시간 수식으로
교체되었다(동기화 불필요). 이 스크립트를 --apply 로 돌리면 수식 칸을
정적 '완료' 텍스트로 덮어써 실시간 갱신이 다시 죽는다. 기록용으로만 남긴다.

클릭 동기화 — 대시보드가 남긴 '접속기록' 탭 → 마스터의 클릭 열.

대시보드는 브랜드가 프로모션 코드를 입력할 때마다 '접속기록' 탭에 한 줄 남긴다.
이 스크립트는 그걸 읽어, 코드로 마스터 행을 찾아 '브랜드 클릭'을 '완료'로 표시한다.
(담당자 발송분은 '담당자 클릭' 열에 — 발송 여부로 구분.)

빈 칸만 채운다. 사람이 손으로 넣은 값은 덮어쓰지 않는다.

  python 4_track/sync_clicks.py            # 미리보기
  python 4_track/sync_clicks.py --apply    # 시트 반영
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "3_send"))
from send_intercharm import _open_master  # noqa: E402

LOG_TAB = "접속기록"


def main(a) -> int:
    import gspread
    sh, ws = _open_master()
    titles = [w.title for w in sh.worksheets()]
    if LOG_TAB not in titles:
        raise SystemExit(f"'{LOG_TAB}' 탭이 없습니다 — 대시보드 로그를 확인하세요.")

    log = sh.worksheet(LOG_TAB).get_all_values()
    if len(log) < 2:
        print("  접속기록 없음"); return 0
    lh = log[0]
    li_code = lh.index("코드") if "코드" in lh else 1
    # 코드별 클릭 횟수
    from collections import Counter
    clicks = Counter(r[li_code].strip().upper() for r in log[1:]
                     if len(r) > li_code and r[li_code].strip())
    print(f"  접속기록: {sum(clicks.values())}회 클릭 · 고유 코드 {len(clicks)}개")

    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = grid[hr]
    C = lambda n: head.index(n) if n in head else -1
    cCode, cB = C("프로모션 코드"), C("브랜드명")
    cBClick, cPClick = C("브랜드 클릭"), C("담당자 클릭")
    cBSend, cPSend = C("브랜드 발송"), C("담당자 발송")

    cells, hit, unmatched = [], [], []
    pos = {}
    for i in range(hr + 1, len(grid)):
        row = grid[i]
        if len(row) > cCode and row[cCode].strip():
            pos[row[cCode].strip().upper()] = i

    for code, n in clicks.items():
        idx = pos.get(code)
        if idx is None:
            unmatched.append(code); continue
        row = grid[idx]
        def sent(c):
            return c >= 0 and len(row) > c and "완료" in row[c]
        def clicked(c):
            return c >= 0 and len(row) > c and row[c].strip()
        # 담당자 발송분이면 담당자 클릭, 아니면 브랜드 클릭
        target = cPClick if (sent(cPSend) and not sent(cBSend)) else cBClick
        which = "담당자" if target == cPClick else "브랜드"
        if target >= 0 and not clicked(target):
            cells.append(gspread.Cell(idx + 1, target + 1, "완료"))
            hit.append((row[cB][:22], code, which, n))

    print()
    for brand, code, which, n in hit:
        print(f"  · {brand:24} {code}  [{which} 클릭] {n}회")
    if unmatched:
        print(f"  시트에 없는 코드 {len(unmatched)}개: {', '.join(unmatched[:8])}")
    already = len(clicks) - len(hit) - len(unmatched)
    if already:
        print(f"  이미 표시돼 건너뜀: {already}개")

    if not a.apply:
        print(f"\n  미리보기입니다. 반영하려면 --apply ({len(cells)}칸 예정)")
        return 0
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
    print(f"\n  시트 반영 완료: {len(cells)}칸에 '완료'")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="시트에 실제 반영")
    raise SystemExit(main(ap.parse_args()))

"""매일 아침 자동 확인 — 윈도우 작업 스케줄러가 10:00에 실행한다.

하는 일(전부 기존 도구 재사용, LLM 토큰 0):
  1. sync_replies --apply    Gmail 읽기전용으로 회신 감지 → 회신 열 'O'
  2. collect_bounces --apply 반송 수집 → 회신 열 '주소없음'
  3. 시트 N2 에 확인시각 스탬프 (돌았는지 눈으로 확인용)

클릭·재방문·오늘 반응은 시트 수식이 실시간이라 여기서 할 일 없음.
수동 실행:  python 4_track/daily_refresh.py
해제:       schtasks /Delete /TN SIRIAI_daily_refresh /F
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent          # 4_track/
ROOT = HERE.parent                               # Routine/
PY = ROOT / ".venv" / "Scripts" / "python.exe"
DAILY_N = 10          # 하루에 준비할 발송 후보 수

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def run(module: str, **opts) -> bool:
    """같은 프로세스 안에서 실행한다. 예전엔 subprocess 로 띄웠는데,
    작업 스케줄러가 부모를 죽이면 자식만 좀비로 남았다(0730)."""
    import argparse as _ap
    import importlib

    try:
        m = importlib.import_module(module)
        a = _ap.Namespace(apply=True, **opts)
        rc = m.main(a)
        print(f"[{module}] exit={rc}")
        return rc == 0
    except Exception:
        import traceback
        print(f"[{module}] 실패")
        traceback.print_exc()
        return False


def digest(ws, sh) -> str:
    """오늘 하루 무슨 일이 있었는지 한 줄로. 매일 보고용."""
    from collections import Counter
    today = f"{datetime.now():%Y-%m-%d}"
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = [x.strip() for x in grid[hr]]

    def C(n):
        return head.index(n) if n in head else -1

    def g(r, i):
        return r[i].strip() if 0 <= i < len(r) else ""

    log = sh.worksheet("접속기록").get_all_values()[1:]
    seen_before = {r[1].strip() for r in log if len(r) > 1 and not r[0].startswith(today)}
    today_rows = [r for r in log if r and r[0].startswith(today)]
    fresh = sorted({r[1].strip() for r in today_rows} - seen_before)
    name = {r[1].strip(): r[2] for r in log if len(r) > 2}

    cBR, cPR = C("브랜드 회신"), C("담당자 회신")
    reply = sum(1 for r in grid[hr + 1:] if g(r, cBR) == "O" or g(r, cPR) == "O")
    codes = Counter(r[1].strip() for r in log if len(r) > 1)

    parts = [f"입장 {len(today_rows)}회"]
    if fresh:
        parts.append("신규 " + ", ".join(name.get(c, c)[:14] for c in fresh[:4]))
    parts.append(f"누적 {len(codes)}곳")
    parts.append(f"회신 {reply}")
    return " · ".join(parts)


def main() -> int:
    print(f"\n=== daily_refresh {datetime.now():%Y-%m-%d %H:%M} ===")
    ok1 = run("sync_replies")
    ok2 = run("collect_bounces", days=7)

    # 평일이면 오늘 발송 후보도 미리 뽑아 둔다(주말은 건너뜀).
    # 사람이 아침에 시트를 열면 그날 것만 필터돼 보이는 상태가 되어 있다.
    if datetime.now().weekday() < 5:
        sys.path.insert(0, str(ROOT / "3_send"))
        ok3 = run("prepare_daily", n=DAILY_N, recheck=False, date="", clear=False)
    else:
        print("[prepare_daily] 주말 — 건너뜀")
        ok3 = True

    # 확인시각 스탬프 + 오늘 요약 — 시트 우상단(N2) / 메모(D2)
    try:
        sys.path.insert(0, str(ROOT / "3_send"))
        from send_intercharm import _open_master
        sh, ws = _open_master()
        mark = "" if (ok1 and ok2) else " ⚠"
        ws.update_acell("N2", f"✓ {datetime.now():%m/%d %H:%M}{mark}")
        try:
            line = digest(ws, sh)
            ws.update_acell("E2", f"{datetime.now():%m/%d} · {line}")
            print("오늘:", line)
        except Exception as e:
            print("요약 실패:", e)
        print("스탬프 완료")
    except Exception as e:
        print("스탬프 실패:", e)
    return 0 if (ok1 and ok2 and ok3) else 1


class _Tee:
    """화면과 로그 파일에 동시에 쓴다. 셸 리다이렉션(>>)에 의존하지 않기 위해
    — 배치파일을 거치면 콘솔이 닫힐 때 프로세스가 통째로 죽는다(0730)."""

    def __init__(self, *streams):
        self._s = streams

    def write(self, x):
        for s in self._s:
            try:
                s.write(x)
                s.flush()
            except Exception:
                pass

    def flush(self):
        for s in self._s:
            try:
                s.flush()
            except Exception:
                pass


if __name__ == "__main__":
    logdir = HERE / "logs"
    logdir.mkdir(exist_ok=True)
    with (logdir / "daily_refresh.log").open("a", encoding="utf-8") as lf:
        sys.stdout = sys.stderr = _Tee(sys.__stdout__, lf)
        try:
            rc = main()
        except Exception:
            import traceback
            traceback.print_exc()
            rc = 1
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] exit={rc}\n")
    raise SystemExit(rc)

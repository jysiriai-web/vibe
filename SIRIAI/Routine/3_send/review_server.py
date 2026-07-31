"""검토 서버 — _발송검토.html 서빙 + 승인/보류를 6월 탭 '발송단계'에 즉시 기록.

정적 파일(대시보드·검토화면·프리뷰)도 그대로 서빙하고, 추가로:
  GET  /          → 대시보드로 리다이렉트
  GET  /api/queue → 6월의 검토 대상(발송적합도=적합 & 발송단계 초안/승인/보류) 라이브 목록
  POST /api/stage {brand,email,stage} → 그 행 발송단계를 6월에 기록(승인/보류/초안)
실행: python 3_send/review_server.py  (포트 8000, Routine 루트 서빙)
※ 발송/회신 등은 검토 대상 아님(이미 처리). 이중발송 방지.
"""
from __future__ import annotations
import http.server, json, re, sys, threading
from pathlib import Path
from urllib.parse import urlparse, quote

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

ROOT = Path(__file__).resolve().parents[1]      # Routine
sys.path.insert(0, str(ROOT))
TAB = "6월"
PORT = 8000
REVIEWABLE = {"초안", "승인", "보류"}
FORB = re.compile(r'[\\/:*?"<>|]')

_ws = None
_meta: dict = {}          # {(brand,email): rownum}
_stage_letter = "X"
_lock = threading.Lock()


def safe(n): return FORB.sub("_", n).strip()
def col_letter(i):
    s, n = "", i
    while True:
        s = chr(ord("A") + n % 26) + s; n = n // 26 - 1
        if n < 0: break
    return s


def ws():
    global _ws
    if _ws is None:
        from _shared import sheets
        _ws = sheets.open_sheet().worksheet(TAB)
    return _ws


def fhr(rows):
    for i, r in enumerate(rows[:15]):
        c = {x.strip() for x in r}
        if "구분" in c and "브랜드명" in c: return i
    return 0


def load_queue():
    global _stage_letter
    vals = ws().get_all_values()
    hi = fhr(vals)
    H = [c.strip() for c in vals[hi]]
    col = {n: H.index(n) for n in H if n}
    si, fi = col.get("발송단계"), col["발송적합도"]
    bi, ei, hk, cau, ig = col["브랜드명"], col["연락처"], col.get("훅"), col.get("메일주의"), col.get("인스타")
    _stage_letter = col_letter(si) if si is not None else "X"
    rows, meta = [], {}
    for off, r in enumerate(vals[hi + 1:]):
        rn = hi + 2 + off
        def g(i): return r[i].strip() if i is not None and len(r) > i else ""
        if not g(bi) or g(fi) != "적합":
            continue
        meta[(g(bi), g(ei))] = rn
        stage = g(si)                      # 빈칸=아직 미작성(M2 전) → 검토 큐 제외
        if stage not in REVIEWABLE:
            continue
        rows.append({"brand": g(bi), "email": g(ei), "hook": g(hk), "warn": g(cau),
                     "insta": g(ig),
                     "file": f"2_compose/archive/previews/{safe(g(bi))}.html", "stage": stage})
    return rows, meta


# 발송 이후 누적 퍼널 단계 (앞일수록 이전 단계)
STAGE_ORDER = ["발송", "회신", "리드", "미팅", "계약", "성사"]


def load_stats():
    vals = ws().get_all_values()
    hi = fhr(vals); H = [c.strip() for c in vals[hi]]
    fi, si = H.index("발송적합도"), H.index("발송단계")
    gi = H.index("구분") if "구분" in H else None
    적합 = 보류 = 0
    cur = {}          # 현재 발송단계별 건수 (적합만)
    cats = {}         # 구분(카테고리) 분포 (적합만)
    for r in vals[hi + 1:]:
        if not any(c.strip() for c in r):
            continue
        f = r[fi].strip() if len(r) > fi else ""
        st = r[si].strip() if len(r) > si else ""
        if f == "보류":
            보류 += 1
        elif f == "적합":
            적합 += 1
            cur[st] = cur.get(st, 0) + 1
            if gi is not None and len(r) > gi and r[gi].strip():
                c = r[gi].strip(); cats[c] = cats.get(c, 0) + 1

    def reached(stage):  # 그 단계 이상 도달한 누적 건수
        idx = STAGE_ORDER.index(stage)
        return sum(n for s, n in cur.items()
                   if s in STAGE_ORDER and STAGE_ORDER.index(s) >= idx)

    발송 = reached("발송")
    s = {"적합": 적합, "보류": 보류,
         "대기": cur.get("초안", 0) + cur.get("승인", 0),   # 작성완료·검토대기(검토 큐와 일치)
         "수집후작성대기": sum(n for st, n in cur.items()    # M1 완료·M2(작성) 전
                              if st not in STAGE_ORDER and st not in ("초안", "승인")),
         "발송": 발송, "회신": reached("회신"),
         "미팅": reached("미팅"), "계약": reached("계약"), "성사": reached("성사"),
         "카테고리": cats}
    return s


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass

    def _json(self, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/" + quote("대시보드.html")); self.end_headers(); return
        if path == "/api/queue":
            with _lock:
                rows, meta = load_queue(); _meta.clear(); _meta.update(meta)
            return self._json(rows)
        if path == "/api/stats":
            with _lock:
                return self._json(load_stats())
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/stage":
            return self.send_error(404)
        n = int(self.headers.get("Content-Length", 0) or 0)
        d = json.loads(self.rfile.read(n) or b"{}")
        brand, email, stage = d.get("brand"), d.get("email"), d.get("stage")
        ok = False
        with _lock:
            if not _meta:
                _, meta = load_queue(); _meta.update(meta)
            rn = _meta.get((brand, email))
            if rn and stage in ("승인", "보류", "초안"):
                ws().update_acell(f"{_stage_letter}{rn}", stage); ok = True
        self._json({"ok": ok, "stage": stage})


if __name__ == "__main__":
    print(f"[검토 서버] http://localhost:{PORT}/  - 승인/보류가 6월 탭 발송단계에 바로 기록됨 (Ctrl+C 종료)")
    http.server.ThreadingHTTPServer(("", PORT), H).serve_forever()

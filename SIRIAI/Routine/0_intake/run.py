"""M0 · 0_intake — 브랜드 소싱·입력 모듈. 신규 브랜드를 6월 탭에 추가 (중복·이력 제외).

소스 2채널:
  1) --file CSV : 소싱 산출물 (헤더: 브랜드명, 카테고리/구분, 인스타, 근거 …)
                  = source_brands 워크플로우 결과(candidates_*.csv)
  2) 인자       : 브랜드명 직접 나열

처리: 정규화 → 6월·마스터(브랜드 에셋)·_보류·기존DB와 대조 → 신규만 → 6월 append
      (브랜드명·구분·인스타[클릭링크]. 발송적합도는 빈칸 → 다음 단계 M1이 검증)
안전: 기본 dry-run, --apply 시 백업 후 추가. --limit N 으로 배치 크기 제한(기본 전체).

  python run.py --file candidates_0613.csv --limit 30          # dry-run (앞 30개)
  python run.py --file candidates_0613.csv --limit 30 --apply  # 실제 추가
  python run.py 조선미녀 새브랜드 --apply                        # 인자로도
"""
from __future__ import annotations
import argparse, csv, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # _shared
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

DEFAULT_TAB = "6월"
# 중복·이력 대조 기본셋 (활성 6월 + 마스터 + 보류 + 발송완료 DB). 대상 탭은 런타임에 합쳐짐.
BASE_DEDUP_TABS = ["6월", "브랜드 에셋", "_보류", "기존 DB", "인터참", "인터참_검토필요"]  # ★인터참=별도 트랙, 6월 승격서 제외
SUFFIX = re.compile(r"(주식회사|\(주\)|㈜|co\.?,?\s*ltd\.?|inc\.?|corp\.?|코스메틱스|코스메틱|컴퍼니|코퍼레이션)", re.I)
NONWORD = re.compile(r"[\s\-_.,'\"()]+")
SENSITIVE = ("생리대", "탐폰", "페미닌", "여성청결", "성인", "의약품", "전문의약", "다이어트", "체중감량")


def norm(b: str) -> str:
    return NONWORD.sub("", SUFFIX.sub("", b)).lower().strip()


def keys(b: str):
    """한·영 순서무관 키('오드타입 (Oddtype)' ↔ '오드타입' 매칭). 한글파트·영문파트 각각."""
    b = SUFFIX.sub("", b or "")
    h = re.sub(r"[^가-힣]", "", b)
    l = re.sub(r"[^a-z0-9]", "", b.lower())
    out = []
    if len(h) >= 2: out.append("h:" + h)
    if len(l) >= 3: out.append("l:" + l)
    return out


def find_header_row(rows):
    for i, r in enumerate(rows[:15]):
        if "브랜드명" in [c.strip() for c in r]:
            return i
    return 0


def read_input(args) -> list[dict]:
    """CSV(헤더 기반) 또는 인자에서 {brand, cat, insta} 추출 + 입력 자체 중복제거."""
    rows = []
    if args.file:
        text = Path(args.file).read_text(encoding="utf-8-sig").splitlines()
        all_rows = [r for r in csv.reader(text) if any(c.strip() for c in r)]
        head = [c.strip() for c in all_rows[0]]
        def ci(*names):
            for n in names:
                if n in head: return head.index(n)
            return None
        bi, gi, ii = ci("브랜드명", "brand"), ci("카테고리", "구분", "category"), ci("인스타", "instagram")
        if bi is None:  # 헤더 없으면 위치 기반(브랜드,도메인,카테고리)
            for r in all_rows:
                if r and r[0].strip():
                    rows.append({"brand": r[0].strip(), "cat": r[2].strip() if len(r) > 2 else "", "insta": ""})
        else:
            for r in all_rows[1:]:
                if len(r) > bi and r[bi].strip():
                    rows.append({"brand": r[bi].strip(),
                                 "cat": r[gi].strip() if gi is not None and len(r) > gi else "",
                                 "insta": (r[ii].strip().lstrip("@") if ii is not None and len(r) > ii else "")})
    for b in args.brands:
        rows.append({"brand": b, "cat": "", "insta": ""})
    seen, out = set(), []
    for r in rows:
        k = norm(r["brand"])
        if k and k not in seen:
            seen.add(k); out.append(r)
    return out


def load_existing(sh, dedup_tabs) -> set:
    """대조 대상 탭들의 브랜드명 정규화 집합 (중복·이력 제외용)."""
    existing = set()
    for t in dedup_tabs:
        try:
            v = sh.worksheet(t).get_all_values()
        except Exception:
            continue
        hi = find_header_row(v)
        H = [c.strip() for c in v[hi]]
        if "브랜드명" not in H:
            continue
        bi = H.index("브랜드명")
        for r in v[hi + 1:]:
            if len(r) > bi and r[bi].strip():
                for k in keys(r[bi].strip()): existing.add(k)
    # 협업/클라이언트 제외 (드라이브 캠페인 시트 기반 수동 리스트 — 새 협업 시 추가)
    ex = Path(__file__).resolve().parent / "_exclude_collab.txt"
    if ex.exists():
        for line in ex.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                for k in keys(line): existing.add(k)
    return existing


def main(args):
    from _shared import sheets
    TAB = args.tab
    dedup_tabs = list(dict.fromkeys([TAB] + BASE_DEDUP_TABS))  # 대상 탭 + 기본셋(중복 제거)
    sh = sheets.open_sheet()
    ws = sh.worksheet(TAB)
    vals = ws.get_all_values()
    hi = find_header_row(vals)
    H = [c.strip() for c in vals[hi]]
    idx = {n: H.index(n) for n in H if n}

    existing = load_existing(sh, dedup_tabs)
    items = read_input(args)
    new, dup = [], []
    for it in items:
        (dup if any(k in existing for k in keys(it["brand"])) else new).append(it)
    held = []
    if args.limit:
        held = new[args.limit:]; new = new[:args.limit]

    print(f"[M0·intake] 입력 {len(items)} → 신규 {len(new) + len(held)} · 중복/이력제외 {len(dup)}"
          + (f" · 이번 배치 {len(new)} (limit {args.limit}, 대기 {len(held)})" if args.limit else ""))
    if dup: print(f"  중복(기존 보유): {', '.join(d['brand'] for d in dup[:12])}{' …' if len(dup) > 12 else ''}")
    print(f"  추가 예정: {', '.join(x['brand'] for x in new[:25])}{' …' if len(new) > 25 else ''}")
    for x in new:
        if any(s in (x["cat"] or "") + x["brand"] for s in SENSITIVE):
            print(f"    ⚠️ {x['brand']} — 민감({x['cat']}) → 메일주의 태깅")

    if not args.apply:
        print("\n  [DRY-RUN] 실제 추가: --apply"); return 0
    if not new:
        print("  추가할 신규 없음."); return 0

    from _shared import backup
    bdir = Path(__file__).resolve().parent / "archive" / "backups"
    bpath, _ = backup.backup_tab(ws, TAB, bdir)
    print(f"  백업: {bpath}")
    maxnum = max([int(r[idx["#"]]) for r in vals[hi + 1:]
                  if len(r) > idx["#"] and r[idx["#"]].strip().isdigit()] or [0])
    ncol = len(H)
    rows_out = []
    for j, x in enumerate(new, 1):
        row = [""] * ncol
        row[idx["#"]] = str(maxnum + j)
        row[idx["브랜드명"]] = x["brand"]
        if x["cat"] and "구분" in idx:
            row[idx["구분"]] = x["cat"]
        if x["insta"] and "인스타" in idx:
            h = x["insta"]
            row[idx["인스타"]] = f"https://www.instagram.com/{h}"   # 생짜 링크(사용자 선호)
        if "출처" in idx:
            row[idx["출처"]] = "클로드"   # 0_intake 자동소싱분 = 클로드 (사용자 규칙)
        if "메일주의" in idx and any(s in (x["cat"] or "") + x["brand"] for s in SENSITIVE):
            row[idx["메일주의"]] = f"민감({x['cat']}) — 발송 전 확인"
        rows_out.append(row)
    sheets.with_backoff(lambda: ws.append_rows(rows_out, value_input_option="USER_ENTERED"))
    print(f"  {TAB} +{len(rows_out)}행 추가 (발송적합도 빈칸 → 1_collector 수집/검증 차례).")
    if held:
        print(f"  ※ limit 초과 {len(held)}개는 다음 배치용으로 CSV에 남아있음.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tab", default=DEFAULT_TAB, help="대상 탭 (기본 6월; 예: 인터참)")
    ap.add_argument("--file", help="소싱 CSV (헤더: 브랜드명,카테고리,인스타…)")
    ap.add_argument("--limit", type=int, default=0, help="이번 배치 최대 개수 (0=전체)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("brands", nargs="*", help="브랜드명 직접 나열")
    raise SystemExit(main(ap.parse_args()))

"""0_intake · 체크포인트 청크 소싱 헬퍼.

source_brands 워크플로우를 "여러 청크로 끊어 돌려도 안 날아가게" 하는 장치.
결과물은 컨텍스트가 아니라 디스크(running CSV)에 쌓고, 찾은 건 working 프로필
skipList에 먹여 다음 청크가 안 겹치게 한다. 청크 하나 죽어도 CSV·skipList는 보존.

흐름:
  1) init  : base 프로필 + 기존 CSV → working 프로필(skipList 누적) 생성
             python checkpoint.py init --base profiles/siriai_kbeauty.json \\
                 --csv 신규브랜드_서치리스트.csv --perNiche "5~9" [--out profiles/_working.json]
     → 출력된 working 프로필을 Read 해서 Workflow args 로 넘긴다.
  2) (Workflow 실행 → 결과 JSON 을 파일로 저장)
  3) append: 워크플로우 결과 → CSV append + working 프로필 skipList 갱신
             python checkpoint.py append --result _chunk_result.json \\
                 --csv 신규브랜드_서치리스트.csv --working profiles/_working.json
  2~3 을 청크마다 반복. CSV 가 누적 산출물, working.skipList 가 불어나는 제외목록.

산출물 CSV 헤더: 브랜드명,카테고리,인스타,근거  (run.py --file 이 그대로 먹는다)
working 프로필(_*.json)은 재생성물이라 .gitignore 스크래치. base 프로필이 정본.
"""
from __future__ import annotations
import argparse, csv, json, re, sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
HEADER = ["브랜드명", "6월반영", "카테고리", "인스타", "근거"]
_NON = re.compile(r"[\s\-_.,'\"()@]+")


def norm(s: str) -> str:
    return _NON.sub("", (s or "")).lower().strip()


def rel(p: Path) -> str:
    try: return str(p.relative_to(HERE))
    except ValueError: return str(p)


def read_csv_brands(csv_path: Path) -> list[str]:
    """running CSV 의 브랜드명 컬럼 → 리스트(원문 그대로)."""
    if not csv_path.exists():
        return []
    text = csv_path.read_text(encoding="utf-8-sig").splitlines()
    rows = [r for r in csv.reader(text) if any(c.strip() for c in r)]
    if not rows:
        return []
    head = [c.strip() for c in rows[0]]
    bi = head.index("브랜드명") if "브랜드명" in head else 0
    return [r[bi].strip() for r in rows[1:] if len(r) > bi and r[bi].strip()]


def merge_skip(base_skip: list[str], extra: list[str]) -> list[str]:
    """순서 보존 + 정규화 기준 중복 제거 (base 먼저)."""
    out, seen = [], set()
    for b in list(base_skip) + list(extra):
        k = norm(b)
        if k and k not in seen:
            seen.add(k); out.append(b)
    return out


def cmd_init(args):
    base_path = (HERE / args.base) if not Path(args.base).is_absolute() else Path(args.base)
    csv_path = (HERE / args.csv) if not Path(args.csv).is_absolute() else Path(args.csv)
    out_path = (HERE / args.out) if not Path(args.out).is_absolute() else Path(args.out)

    base = json.loads(base_path.read_text(encoding="utf-8"))
    csv_brands = read_csv_brands(csv_path)
    working = dict(base)
    working["name"] = base.get("name", "") + " · working"
    working["skipList"] = merge_skip(base.get("skipList", []), csv_brands)
    if args.perNiche:
        working["perNiche"] = args.perNiche
    if args.workerModel:
        working["workerModel"] = args.workerModel

    out_path.write_text(json.dumps(working, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[init] working 프로필 생성 → {rel(out_path)}")
    print(f"  base={rel(base_path)} · CSV기존 {len(csv_brands)}개 흡수")
    print(f"  skipList {len(base.get('skipList', []))} + {len(csv_brands)} → {len(working['skipList'])}개 (중복제거)")
    print(f"  niches {len(working.get('niches', []))} · perNiche {working.get('perNiche')} · worker {working.get('workerModel', 'sonnet')}")
    print(f"  → 이 파일을 Read 해서 Workflow args 로 넘겨라.")
    return 0


def cmd_append(args):
    res_path = (HERE / args.result) if not Path(args.result).is_absolute() else Path(args.result)
    csv_path = (HERE / args.csv) if not Path(args.csv).is_absolute() else Path(args.csv)
    work_path = (HERE / args.working) if not Path(args.working).is_absolute() else Path(args.working)

    res = json.loads(res_path.read_text(encoding="utf-8"))
    new = res.get("final", res.get("candidates", []))
    dropped = res.get("dropped", [])

    existing = set(norm(b) for b in read_csv_brands(csv_path))
    fresh, dup = [], 0
    for c in new:
        k = norm(c.get("brand", ""))
        if not k:
            continue
        if k in existing:
            dup += 1; continue
        existing.add(k); fresh.append(c)

    # CSV append (없으면 헤더부터)
    write_header = not csv_path.exists() or not csv_path.read_text(encoding="utf-8-sig").strip()
    with csv_path.open("a", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(HEADER)
        for c in fresh:
            w.writerow([c.get("brand", ""), "", c.get("category", ""),
                        (c.get("instagram", "") or "").lstrip("@"), c.get("rationale", "")])

    total = len(read_csv_brands(csv_path))

    # working 프로필 skipList 갱신 (다음 청크가 안 겹치게)
    skip_after = "(working 프로필 없음 — skip 갱신 생략)"
    if work_path.exists():
        working = json.loads(work_path.read_text(encoding="utf-8"))
        working["skipList"] = merge_skip(working.get("skipList", []), [c.get("brand", "") for c in fresh])
        work_path.write_text(json.dumps(working, ensure_ascii=False, indent=2), encoding="utf-8")
        skip_after = f"{len(working['skipList'])}개"

    print(f"[append] 결과 {len(new)} → 신규 {len(fresh)} · CSV중복 {dup} · 검증탈락(워크플로우) {len(dropped)}")
    print(f"  CSV: {rel(csv_path)} → 누적 {total}개")
    print(f"  working.skipList → {skip_after}")
    if dropped:
        show = ", ".join(f"{d.get('brand','')}({d.get('reason','')[:18]})" for d in dropped[:6])
        print(f"  탈락 예시: {show}{' …' if len(dropped) > 6 else ''}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="체크포인트 청크 소싱 헬퍼")
    sub = ap.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("init", help="base+CSV → working 프로필 생성")
    pi.add_argument("--base", default="profiles/siriai_kbeauty.json")
    pi.add_argument("--csv", default="신규브랜드_서치리스트.csv")
    pi.add_argument("--out", default="profiles/_working.json")
    pi.add_argument("--perNiche", default="")
    pi.add_argument("--workerModel", default="")
    pi.set_defaults(func=cmd_init)

    pa = sub.add_parser("append", help="워크플로우 결과 → CSV append + skipList 갱신")
    pa.add_argument("--result", default="_chunk_result.json")
    pa.add_argument("--csv", default="신규브랜드_서치리스트.csv")
    pa.add_argument("--working", default="profiles/_working.json")
    pa.set_defaults(func=cmd_append)

    a = ap.parse_args()
    raise SystemExit(a.func(a))

"""분류 결과(_classify/batch_*.json) → 마스터시트 반영.

배치 파일이 몇 개든, 있는 것만 읽어서 반영한다. 워크플로가 중간에 끊겨도
이미 저장된 배치는 그대로 살아있으므로 이 스크립트만 다시 돌리면 된다.

빈 칸만 채운다 — 사람이 손으로 넣은 값은 절대 덮어쓰지 않는다.

  python 4_track/apply_classification.py            # 미리보기
  python 4_track/apply_classification.py --apply    # 시트 반영
"""
from __future__ import annotations
import argparse, glob, json, sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "3_send"))
from send_intercharm import _open_master  # noqa: E402

CLASSDIR = HERE.parent.parent / "intercharm" / "data" / "_classify"
VALID = {"스킨케어", "색조", "헤어바디", "향수", "이너뷰티", "홈디바이스", "기타"}


def load_results() -> dict[str, dict]:
    """batch_*.json 전부 읽어 {코드: 결과}. 나중 파일이 앞을 덮는다."""
    out: dict[str, dict] = {}
    files = sorted(glob.glob(str(CLASSDIR / "batch_*.json")))
    bad = 0
    for f in files:
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception:
            bad += 1
            continue
        if isinstance(data, dict):                 # {items:[...]} 형태도 허용
            data = data.get("items", [])
        for x in data:
            code = str(x.get("code", "")).strip().upper()
            if code:
                out[code] = x
    print(f"  배치 파일 {len(files)}개 · 읽기 실패 {bad}개 · 코드 {len(out)}건")
    return out


def main(a) -> int:
    res = load_results()
    if not res:
        print("  분류 결과 없음 — 워크플로가 아직 저장 전이거나 경로 확인 필요")
        return 1

    import gspread
    sh, ws = _open_master()
    grid = ws.get_all_values()
    hr = next(i for i, r in enumerate(grid[:20]) if "브랜드명" in r and "프로모션 코드" in r)
    head = grid[hr]

    def C(n):
        return head.index(n) if n in head else -1

    cCode, cCat, cIntro, cHome, cBrand = C("프로모션 코드"), C("구분"), C("브랜드 소개"), C("홈페이지"), C("브랜드명")
    cCau = C("발송 시 주의사항")
    if cCode < 0 or cCat < 0:
        raise SystemExit("필수 열(프로모션 코드·구분)을 못 찾음")

    cells, stat, skipped, odd = [], {}, 0, []
    for i in range(hr + 1, len(grid)):
        row = grid[i]
        if len(row) <= cCode or not row[cCode].strip():
            continue
        r = res.get(row[cCode].strip().upper())
        if not r:
            continue
        cat = str(r.get("cat", "")).strip()
        if cat and cat not in VALID:
            odd.append((row[cBrand][:20], cat))
            cat = "기타"
        # 빈 칸만 채운다
        if cat and not row[cCat].strip():
            cells.append(gspread.Cell(i + 1, cCat + 1, cat))
            stat[cat] = stat.get(cat, 0) + 1
        else:
            skipped += 1
        intro = str(r.get("intro", "")).strip()
        if intro and cIntro >= 0 and (len(row) <= cIntro or not row[cIntro].strip()):
            cells.append(gspread.Cell(i + 1, cIntro + 1, intro[:120]))
        hp = str(r.get("homepage", "")).strip()
        if hp.startswith("http") and cHome >= 0 and (len(row) <= cHome or not row[cHome].strip()):
            cells.append(gspread.Cell(i + 1, cHome + 1, hp))
        # 타겟이 아닌 곳은 '발송 시 주의사항'에 사유를 남겨, 보내기 전에 눈에 띄게 한다
        verdict = str(r.get("verdict", "")).strip()
        if verdict in ("제외", "불명") and cCau >= 0:
            cur = row[cCau] if len(row) > cCau else ""
            note = f"{verdict}: {str(r.get('basis','')).strip()[:40]}"
            if "제외:" not in cur and "불명:" not in cur:
                cells.append(gspread.Cell(i + 1, cCau + 1, (cur + " / " + note) if cur else note))
                stat["_주의사항"] = stat.get("_주의사항", 0) + 1

    print()
    print("  채울 구분:", " · ".join(f"{k} {v}" for k, v in sorted(stat.items(), key=lambda x: -x[1])) or "없음")
    print(f"  이미 값이 있어 건너뜀: {skipped}건 · 총 {len(cells)}칸 예정")
    if odd:
        print(f"  ⚠️ 정의 밖 카테고리 → '기타' 로 교정 {len(odd)}건: {odd[:5]}")

    if not a.apply:
        print("\n  미리보기입니다. 반영하려면 --apply")
        return 0
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
    print(f"\n  시트 반영 완료: {len(cells)}칸")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="시트에 실제 반영")
    raise SystemExit(main(ap.parse_args()))

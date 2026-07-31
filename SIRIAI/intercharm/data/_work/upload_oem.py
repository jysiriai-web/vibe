"""제외군 중 '진짜 PB 가능 화장품 제조사'만 → 메인 시트 '인터참_OEM' 탭.

전 버전 키워드가 패키징/전시/기관/기계 등을 못 걸러 247곳이 오염됨(InterCHARM Korea 본체,
중국 패키징공장, 부산테크노파크 등 포함). → JUNK 키워드(이름+근거+카테고리)로 비대상 강하게 제거,
남은 곳을 제조사/기타로 라벨. 화장품 자체 PB 낼 만한 제조사만 남긴다.
실행: Routine/.venv/Scripts/python.exe data/_work/upload_oem.py
"""
from __future__ import annotations
import csv, json, sys
from collections import Counter
from pathlib import Path

from pathlib import Path as _P
sys.path.insert(0, str(next(q / "Routine" for q in _P(__file__).resolve().parents if (q / "Routine" / "_shared").is_dir())))
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass
from _shared import sheets

DATA = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
TAB = "인터참_OEM"

# PB 불가(비대상): 패키징·용기·전시·기관·기계·물류·원료·대행 등
JUNK = ["packaging","packing","plastic","container","tube","pump","bottle","cap ","어플리케이터","applicator",
        "패키징","포장","용기","부자재","튜브","펌프","유리병","인쇄","라벨","박스","스파우트",
        "exhibition","expo","박람회","전시","주최","worldwide expo",
        "institute","foundation","association","기술원","테크노파크","진흥원","재단","협회","조합","공단","연구원","산업진흥",
        "machinery","equipment","기계","장비","설비","자동화","물류","유통","logistics",
        "raw material","ingredient supplier","원료","소재","향료","extract co","대행","에이전시","agency",
        "커뮤니케이션","communication","컨설팅","consulting","인증원","시험","검사","마케팅 대행","미디어",
        "사단법인","상공회의소","chamber of commerce","amazon","advertising","광고 솔루션","광고대행","광고 플랫폼"]
# 제조사(PB 유력) 신호
MFR = ["oem","odm","제조","수탁","contract manufactur","완제품","화장품 제조","코스메틱","cosmetic",
       "바이오","bio","랩","lab","화장품"]


def txt(r): return ((r.get("회사명") or "") + " " + (r.get("판단근거") or "") + " " + (r.get("원본카테고리") or "")).lower()
def is_junk(r): return any(k in txt(r) for k in JUNK)
def label(r): return "제조사" if any(k in txt(r) for k in MFR) else "기타"
def has(s): return bool((s or "").strip())

SIX = ["#","구분","브랜드명","연락처","업체명","신뢰도","메일유형","발송적합도","발송단계",
       "훅","메일주의","비고","인스타","감도","마케팅 경험","발송","열람","클릭","회신","미팅",
       "발송일자","회신일자","2차 메일","출처","성사여부"]
EXTRA = ["PB라벨","원본카테고리","판단근거","인터참단계","현장관심도","후속약속"]
HEADER = SIX + EXTRA


def main():
    fc = list(csv.DictReader(open(DATA / "full_classification.csv", encoding="utf-8-sig", newline="")))
    excl = [r for r in fc if (r.get("구분") or "").strip() == "제외"]
    junk = [r for r in excl if is_junk(r)]
    cand = [r for r in excl if not is_junk(r)]
    print(f"[필터] 제외 {len(excl)} → JUNK 제거 {len(junk)} → PB후보 {len(cand)}")
    print("  PB후보 라벨:", dict(Counter(label(r) for r in cand)))
    print("  버린 예시:", ", ".join((r.get("회사명") or "")[:18] for r in junk[:8]))
    print("  남긴 예시:", ", ".join((r.get("회사명") or "")[:14] for r in cand[:10]))
    he = sum(1 for r in cand if has(r.get("이메일")))
    print(f"  PB후보 이메일: {he} 채움 / {len(cand)-he} 빈칸")

    sh = sheets.open_sheet()
    try:
        sh.del_worksheet(sh.worksheet(TAB)); print(f"[재생성] 기존 '{TAB}' 삭제")
    except Exception:
        pass
    ws = sh.add_worksheet(title=TAB, rows=len(cand) + 10, cols=len(HEADER) + 2)
    out = [HEADER]
    for i, r in enumerate(cand, 1):
        def g(k): return (r.get(k) or "").strip()
        row = [""] * len(HEADER)
        row[0] = str(i); row[1] = g("ICP세부"); row[2] = g("회사명"); row[3] = g("이메일"); row[5] = g("신뢰도")
        ex = len(SIX); row[ex+0] = label(r); row[ex+1] = g("원본카테고리"); row[ex+2] = g("판단근거")
        out.append(row)
    sheets.with_backoff(lambda: ws.append_rows(out, value_input_option="USER_ENTERED"))
    print(f"[완료] '{TAB}' {len(cand)}곳 업로드")

    # 깨끗한 PB후보 중 이메일 빈칸 → 이메일 워크플로우용
    blanks = [{"company": (r.get("회사명") or "").strip(), "current_email": "",
               "website": (r.get("웹사이트") or "").strip(), "track": "oem",
               "label": label(r), "근거": (r.get("판단근거") or "").strip()[:60]}
              for r in cand if not has(r.get("이메일")) and (r.get("회사명") or "").strip()]
    (HERE / "oem_clean_blanks.json").write_text(json.dumps(blanks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → oem_clean_blanks.json: 빈칸 {len(blanks)}곳 (이메일 더블체크 대상)")


if __name__ == "__main__":
    raise SystemExit(main())

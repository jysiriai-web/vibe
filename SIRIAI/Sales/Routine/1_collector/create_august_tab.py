"""8월 아웃바운드 탭 생성 — august_seed.csv → 세일즈 마스터시트.

열을 세 묶음으로 나누고 묶음마다 색을 달리한다(LUN8 대시보드 방식).
  ① 브랜드 정보   누구인가          — 슬레이트
  ② 사전 조사     보낼 만한가·뭐라고 — 웜 브라운
  ③ 영업 활동     보낸 뒤 무슨 일이  — 딥 그린
각 묶음 끝에는 비고 칸이 하나씩 있다.

  python 1_collector/create_august_tab.py            # 미리보기
  python 1_collector/create_august_tab.py --apply    # 실제 생성(기존 탭 있으면 중단)
  python 1_collector/create_august_tab.py --apply --replace   # 기존 탭 지우고 다시
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "3_send"))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SEED = ROOT.parent / "intercharm" / "data" / "august_seed.csv"
TAB = "26년 8월"
HR = 8              # 헤더 행 · 7행은 묶음 밴드

# (묶음명, 밴드색, 헤더색, [(열이름, 폭, 시드CSV 키), ...])
GROUPS = [
    ("브랜드 정보", "3F4A5C", "E9EBF0", [
        ("#", 44, "#"), ("구분", 76, "구분"), ("브랜드명", 160, "브랜드명"),
        ("업체명", 140, "업체명"), ("홈페이지", 145, "홈페이지"), ("인스타", 110, "인스타"),
        ("이메일", 195, "이메일"), ("담당자", 70, None), ("담당자 연락처", 104, None),
        ("브랜드 비고", 108, "비고"),
    ]),
    ("사전 조사", "8A5A2B", "F4EDE2", [
        ("신뢰도", 58, "신뢰도"), ("적합도", 58, "적합도"), ("메일유형", 84, "메일유형"),
        ("감도", 54, None), ("마케팅 경험", 80, None),
        ("관계", 96, "관계"), ("제외 사유", 118, "제외 사유"), ("제외 근거", 130, "제외 근거"),
        ("훅", 290, "훅"), ("발송 시 주의사항", 180, "주의사항"), ("조사 비고", 108, None),
    ]),
    ("영업 활동", "1E4D3A", "E3EFE7", [
        ("프로모션 코드", 88, "프로모션 코드"), ("발송일", 58, None), ("발송", 60, None),
        ("메일 열람", 64, "__OPEN__"), ("입장", 54, "__ENTER__"), ("입장 횟수", 62, "__COUNT__"),
        ("회신", 64, None), ("회신일", 58, None), ("2차 메일", 66, None),
        ("관심도", 58, None), ("미팅", 50, None), ("성사", 50, None),
        ("활동 비고", 108, None),
    ]),
]
HEAD = [c for _, _, _, cols in GROUPS for c, _, _ in cols]
SPEC = [(c, w, k) for _, _, _, cols in GROUPS for c, w, k in cols]


def rgb(x):
    return {"red": int(x[0:2], 16) / 255, "green": int(x[2:4], 16) / 255, "blue": int(x[4:6], 16) / 255}


INK, PAPER = rgb("211A33"), rgb("F3EEE2")       # SIRIAI 브랜드 토큰
WHITE, TXT, MUTED = rgb("FFFFFF"), rgb("2B2F3A"), rgb("B0A894")
LBL_BG, LBL_FG = rgb("EEF1F6"), rgb("5B6B8C")
OPEN_BG, OPEN_FG = rgb("DCEBFA"), rgb("1B5E9E")
AMBER_BG, AMBER_FG = rgb("FBF3E6"), rgb("8A4B1A")
GREEN_BG, GREEN_FG = rgb("CFE7CE"), rgb("1E6B2E")
RED_BG, RED_FG = rgb("FDECEC"), rgb("C1272D")
RED, ZEBRA = rgb("CC0000"), rgb("F7F7F5")
# 등급 3단계 공통 색 — 나쁨/보통/좋음 순서로 노랑 → 연두 → 초록
TIER = [("FDF3D0", "8A6A16"), ("E9F2D9", "5C7A2B"), ("D5EEDA", "1E7A48")]
GRADES = {                       # 열이름: [낮은값, 중간값, 높은값]
    "신뢰도": ["낮음", "중간", "높음"],
    "적합도": ["부적합", "보류", "적합"],
    "감도": ["하", "중", "상"],
    "관심도": ["하", "중", "상"],
    "마케팅 경험": ["없음", "불명", "있음"],
}

CAT = {"스킨케어": ("E5EFE0", "3C6B3A"), "색조": ("F6C9B4", "8A2D0A"),
       "헤어바디": ("DCEBFA", "1B5E9E"), "향수": ("ECE9FB", "5B47E0"),
       "이너뷰티": ("FBF3E6", "8A4B1A")}


def L(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def exclude_reasons(sh) -> list:
    """제외 사유 드롭다운 값. 'N월 중복'은 시트에 실제로 있는 캠페인 탭에서 만든다
    — 달이 늘어나도 손대지 않게."""
    import re as _re
    months = []
    for w in sh.worksheets():
        m = _re.search(r"(\d{1,2})월", w.title)
        if m and w.title != TAB:
            months.append(int(m.group(1)))
    dup = [f"{m}월 중복" for m in sorted(set(months))]
    # 보낼 수 있는데 안 보내는 이유만. 못 보내는 건 행을 안 만들고,
    # 판단(타겟 아님·활동 중단)은 적합도=부적합 으로 표현한다.
    return dup + ["수신거부"]


def main(a) -> int:
    from send_intercharm import _open_master

    rows = list(csv.DictReader(SEED.open(encoding="utf-8-sig")))
    ncols, nrows = len(HEAD), HR + len(rows)
    print(f"■ {TAB} — {len(rows)}행 · {ncols}열")
    for name, band, _, cols in GROUPS:
        print(f"   [{name}] {len(cols)}열  #{band}  {' · '.join(c for c, _, _ in cols)}")
    if not a.apply:
        print("\n   미리보기입니다. 만들려면 --apply")
        return 0

    sh, _ = _open_master()
    for w in sh.worksheets():
        if w.title == TAB:
            if not a.replace:
                raise SystemExit(f"'{TAB}' 이미 있음 — 다시 만들려면 --replace")
            sh.del_worksheet(w)
            print("   기존 탭 삭제")
    global EXCLUDE_REASONS
    EXCLUDE_REASONS = exclude_reasons(sh)
    print("   제외 사유 드롭다운:", " / ".join(EXCLUDE_REASONS))
    ws = sh.add_worksheet(TAB, rows=nrows + 40, cols=ncols)
    sid = ws.id

    # ── 값 ───────────────────────────────────────────────────
    idx = {c: i for i, c in enumerate(HEAD)}
    cCode = L(idx["프로모션 코드"] + 1)
    body = []
    for i, r in enumerate(rows):
        rn = HR + 1 + i
        line = []
        for c, _, key in SPEC:
            if key == "__OPEN__":
                line.append(f'=IF(AND(${cCode}{rn}<>"",COUNTIF(INDIRECT("열람기록!B2:B"),${cCode}{rn})>0),"완료","")')
            elif key == "__ENTER__":
                line.append(f'=IF(AND(${cCode}{rn}<>"",COUNTIF(INDIRECT("접속기록!B2:B"),${cCode}{rn})>0),"완료","")')
            elif key == "__COUNT__":
                line.append(f'=IF(${cCode}{rn}="","",COUNTIF(INDIRECT("접속기록!B2:B"),${cCode}{rn}))')
            elif key is None:
                line.append("")
            else:
                line.append(r.get(key, ""))
        body.append(line)
    ws.update(values=[HEAD], range_name=f"A{HR}:{L(ncols)}{HR}", value_input_option="USER_ENTERED")
    ws.update(values=body, range_name=f"A{HR+1}:{L(ncols)}{nrows}", value_input_option="USER_ENTERED")
    # 묶음 밴드(7행)
    band_vals = [""] * ncols
    at = 0
    for name, _, _, cols in GROUPS:
        band_vals[at] = name
        at += len(cols)
    ws.update(values=[band_vals], range_name=f"A7:{L(ncols)}7", value_input_option="USER_ENTERED")
    print(f"   묶음 밴드 + 헤더 + 데이터 {len(body)}행 기입")

    # ── 요약 ─────────────────────────────────────────────────
    C = lambda n: L(idx[n] + 1)
    S, cO, cI = C("발송"), C("메일 열람"), C("입장")
    cRep, cMt, cCl, cN, cQ = C("회신"), C("미팅"), C("성사"), C("브랜드명"), C("제외 사유")
    AA, AB, AC2 = 'INDIRECT("접속기록!A2:A")', 'INDIRECT("접속기록!B2:B")', 'INDIRECT("접속기록!C2:C")'
    MINE = f'(COUNTIF(${cCode}${HR+1}:${cCode},{AB})>0)'
    sent = f'COUNTIF({S}{HR+1}:{S},"완료")'
    rep = f'COUNTIF({cRep}{HR+1}:{cRep},"O")'
    ent = f'COUNTIF({cI}{HR+1}:{cI},"완료")'
    summary = [
        ("A1", "SIRIAI 8월 아웃바운드  ·  일반 세일즈"),
        ("A2", "📌 월"), ("B2", "8월"), ("D2", "메모"),
        ("A3", "요약"), ("B3", "대상"), ("C3", "발송"), ("D3", "열람"), ("E3", "열람율"),
        ("F3", "입장"), ("G3", "입장률"), ("H3", "회신 · 미팅 · 성사"), ("K3", "반응 활동"),
        ("B4", f"=COUNTA({cN}{HR+1}:{cN})"), ("C4", f"={sent}"),
        ("D4", f'=COUNTIF({cO}{HR+1}:{cO},"완료")'),
        ("E4", '=IFERROR(TEXT(D4/C4,"0.0%"),"–")'),
        ("F4", f"={ent}"), ("G4", '=IFERROR(TEXT(F4/C4,"0.0%"),"–")'),
        ("H4", "회신"), ("I4", f"={rep}"),
        ("K4", "오늘"), ("L4", f'=SUMPRODUCT((TEXT({AA},"yyyy-mm-dd")>=TEXT(TODAY(),"yyyy-mm-dd"))*({AA}<>"")*{MINE})'),
        ("M4", "최근 7일"), ("N4", f'=SUMPRODUCT((TEXT({AA},"yyyy-mm-dd")>=TEXT(TODAY()-6,"yyyy-mm-dd"))*({AA}<>"")*{MINE})'),
        ("B5", "발송 가능"), ("C5", "보류"), ("D5", "코드 발급"),
        ("H5", "미팅"), ("I5", f'=COUNTIF({cMt}{HR+1}:{cMt},"O")'),
        ("K5", "재방문"), ("L5", f'=ROUND(SUMPRODUCT(((COUNTIF({AB},{AB}&"")>1)*({AB}<>"")*{MINE})/COUNTIF({AB},{AB}&"")),0)'),
        ("M5", "회신 대기"), ("N5", f"=MAX(0,{ent}-{rep})"),
        ("B6", "=B4-C6"), ("C6", f'=COUNTA({cQ}{HR+1}:{cQ})'),
        ("D6", f"=COUNTA({cCode}{HR+1}:{cCode})"),
        ("H6", "성사"), ("I6", f'=COUNTIF({cCl}{HR+1}:{cCl},"O")'),
        ("K6", f'=IFERROR(LET(m,FILTER(INDIRECT("접속기록!A2:C"),{MINE}),"마지막 반응 · "&INDEX(m,ROWS(m),1)&" · "&INDEX(m,ROWS(m),3)),"아직 반응 없음")'),
    ]
    ws.batch_update([{"range": k, "values": [[v]]} for k, v in summary], value_input_option="USER_ENTERED")

    # ── 서식 ─────────────────────────────────────────────────
    def R(r1, r2, c1, c2):
        return {"sheetId": sid, "startRowIndex": r1, "endRowIndex": r2, "startColumnIndex": c1, "endColumnIndex": c2}

    def F(rng, bg=None, fg=None, size=None, bold=True, halign="CENTER", wrap=None):
        f = {"verticalAlignment": "MIDDLE", "horizontalAlignment": halign}
        fl = ["horizontalAlignment", "verticalAlignment"]
        if bg:
            f["backgroundColor"] = bg; fl.append("backgroundColor")
        if wrap:
            f["wrapStrategy"] = wrap; fl.append("wrapStrategy")
        tf = {"bold": bold}
        if fg: tf["foregroundColor"] = fg
        if size: tf["fontSize"] = size
        f["textFormat"] = tf; fl.append("textFormat")
        return {"repeatCell": {"range": rng, "cell": {"userEnteredFormat": f},
                                 "fields": "userEnteredFormat(" + ",".join(fl) + ")"}}

    q = [F(R(0, 1, 0, ncols), INK, PAPER, 13, halign="LEFT"),
         F(R(1, 2, 0, ncols), rgb("F4F1EA"), rgb("6B5B3E"), 10, halign="LEFT"),
         F(R(2, 6, 0, 14), WHITE, TXT, 10),
         F(R(2, 6, 0, 1), INK, PAPER, 11),
         F(R(2, 3, 1, 7), LBL_BG, LBL_FG, 9),
         F(R(2, 3, 7, 14), INK, PAPER, 10),
         F(R(3, 4, 1, 2), rgb("ECEFF1"), rgb("374151"), 13),
         F(R(3, 4, 2, 3), None, RED, 15),
         F(R(3, 4, 3, 4), None, TXT, 13),
         F(R(3, 4, 4, 5), OPEN_BG, OPEN_FG, 12),
         F(R(3, 4, 5, 6), None, TXT, 13),
         F(R(3, 4, 6, 7), AMBER_BG, AMBER_FG, 12),
         F(R(4, 5, 1, 7), LBL_BG, LBL_FG, 9),
         F(R(5, 6, 1, 4), None, TXT, 12),
         F(R(3, 6, 7, 8), LBL_BG, LBL_FG, 9),
         F(R(3, 6, 8, 10), None, TXT, 16),
         F(R(3, 5, 10, 11), LBL_BG, LBL_FG, 9),
         F(R(3, 5, 12, 13), LBL_BG, LBL_FG, 9),
         F(R(3, 4, 11, 12), AMBER_BG, AMBER_FG, 13),
         F(R(4, 5, 11, 12), AMBER_BG, AMBER_FG, 13),
         F(R(3, 4, 13, 14), None, TXT, 13),
         F(R(4, 5, 13, 14), AMBER_BG, AMBER_FG, 13),
         F(R(5, 6, 10, 14), None, TXT, 11)]
    # 묶음별 밴드(7행) + 헤더(8행)
    at = 0
    for name, band, hdr, cols in GROUPS:
        n = len(cols)
        q.append(F(R(6, 7, at, at + n), rgb(band), WHITE, 11))
        q.append(F(R(7, 8, at, at + n), rgb(hdr), TXT, 10, wrap="WRAP"))
        q.append({"mergeCells": {"range": R(6, 7, at, at + n), "mergeType": "MERGE_ALL"}})
        at += n
    # 데이터
    q.append({"repeatCell": {"range": R(HR, nrows, 0, ncols),
        "cell": {"userEnteredFormat": {"wrapStrategy": "CLIP", "verticalAlignment": "MIDDLE",
                                          "textFormat": {"fontSize": 10}}},
        "fields": "userEnteredFormat(wrapStrategy,verticalAlignment,textFormat.fontSize)"}})
    q.append(F(R(HR, nrows, 0, 1), None, MUTED, 10, bold=False, halign="RIGHT"))
    q.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "ROWS",
        "startIndex": HR, "endIndex": nrows}, "properties": {"pixelSize": 26}, "fields": "pixelSize"}})
    for r, px in ((0, 30), (1, 22), (2, 20), (3, 30), (4, 20), (5, 28), (6, 24), (7, 38)):
        q.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "ROWS",
            "startIndex": r, "endIndex": r + 1}, "properties": {"pixelSize": px}, "fields": "pixelSize"}})
    for i, (_, px, _) in enumerate(SPEC):
        q.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS",
            "startIndex": i, "endIndex": i + 1}, "properties": {"pixelSize": px}, "fields": "pixelSize"}})
    for m in [R(0, 1, 0, ncols), R(2, 6, 0, 1), R(2, 3, 7, 10), R(2, 3, 10, 14),
              R(3, 4, 8, 10), R(4, 5, 8, 10), R(5, 6, 8, 10), R(5, 6, 10, 14), R(1, 2, 3, 8)]:
        q.append({"mergeCells": {"range": m, "mergeType": "MERGE_ALL"}})
    q.append({"updateSheetProperties": {"properties": {"sheetId": sid,
        "gridProperties": {"frozenRowCount": HR}}, "fields": "gridProperties.frozenRowCount"}})
    q.append({"addBanding": {"bandedRange": {"range": R(HR, nrows, 0, ncols),
        "rowProperties": {"firstBandColor": WHITE, "secondBandColor": ZEBRA}}}})
    sh.batch_update({"requests": q})
    print("   묶음 밴드·색·폭·틀고정 적용")

    # ── 드롭다운 · 조건부서식 · 필터 ──────────────────────────
    def dv(name, vals):
        c = idx[name]
        return {"setDataValidation": {"range": R(HR, nrows, c, c + 1), "rule": {
            "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": v} for v in vals]},
            "showCustomUi": True, "strict": False}}}

    def cf(name, val, bg, fg):
        c = idx[name]
        return {"addConditionalFormatRule": {"rule": {"ranges": [R(HR, nrows, c, c + 1)],
            "booleanRule": {"condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": val}]},
                "format": {"backgroundColor": bg, "textFormat": {"foregroundColor": fg, "bold": True}}}},
            "index": 0}}

    q2 = [dv("발송", ["완료", "예정", "보류", "-"]),
          dv("회신", ["O", "X", "주소없음", "수신거부"]),
          dv("2차 메일", ["완료", "예정", "-"]),
          dv("관심도", ["상", "중", "하"]), dv("미팅", ["O", "X"]), dv("성사", ["O", "X"]),
          dv("적합도", ["적합", "보류", "부적합"]), dv("신뢰도", ["높음", "중간", "낮음"]),
          dv("관계", ["기존 클라이언트", "미팅 이력", "제안 이력", "신규"]),
          dv("제외 사유", EXCLUDE_REASONS),
          dv("감도", ["상", "중", "하"]), dv("마케팅 경험", ["있음", "불명", "없음"]),
          cf("발송", "완료", GREEN_BG, GREEN_FG),
          cf("메일 열람", "완료", OPEN_BG, OPEN_FG),
          cf("입장", "완료", AMBER_BG, AMBER_FG),
          cf("회신", "O", GREEN_BG, GREEN_FG), cf("회신", "주소없음", AMBER_BG, AMBER_FG),
          cf("회신", "수신거부", RED_BG, RED_FG),
          cf("미팅", "O", GREEN_BG, GREEN_FG), cf("성사", "O", GREEN_BG, GREEN_FG),
          ]
    # 등급 열 — 값이 좋아질수록 노랑→초록
    for col, vals in GRADES.items():
        if col not in idx:
            continue
        for v, (bg, fg) in zip(vals, TIER):
            q2.append(cf(col, v, rgb(bg), rgb(fg)))
    for name, (bg, fg) in CAT.items():
        q2.append(cf("구분", name, rgb(bg), rgb(fg)))
    # 관계 = 기존 클라이언트 → 보라(콜드 대상 아님), 제외 사유 있으면 앰버로 눈에 띄게
    q2.append(cf("관계", "기존 클라이언트", rgb("ECE9FB"), rgb("5B47E0")))
    ci_ex = idx["제외 사유"]
    q2.append({"addConditionalFormatRule": {"rule": {"ranges": [R(HR, nrows, ci_ex, ci_ex + 1)],
        "booleanRule": {"condition": {"type": "NOT_BLANK"},
            "format": {"backgroundColor": rgb("FBF3E6"),
                         "textFormat": {"foregroundColor": rgb("8A4B1A"), "bold": True}}}}, "index": 0}})
    q2.append({"addConditionalFormatRule": {"rule": {"ranges": [R(HR, nrows, 0, ncols)],
        "booleanRule": {"condition": {"type": "CUSTOM_FORMULA",
            "values": [{"userEnteredValue": f'=${cQ}{HR+1}<>""'}]},
            "format": {"textFormat": {"foregroundColor": rgb("A8A8A0"), "italic": True}}}}, "index": 0}})
    q2.append({"setBasicFilter": {"filter": {"range": R(HR - 1, nrows, 0, ncols)}}})
    sh.batch_update({"requests": q2})
    print("   드롭다운·상태색·필터 적용")

    time.sleep(3)
    v = ws.get("A3:N7")
    for i, r in enumerate(v, 3):
        line = [f"{chr(65+j)}={str(c)[:14]}" for j, c in enumerate(r) if str(c).strip()]
        if line:
            print("   " + " | ".join(line))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--replace", action="store_true", help="기존 탭 삭제 후 재생성")
    raise SystemExit(main(ap.parse_args()))

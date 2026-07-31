"""인터참 사후 팔로업 메일 렌더러 — 마스터시트 행 → 완성 HTML.

발송은 하지 않는다(그건 3_send). 여기서는 미리보기 HTML만 만든다.

슬롯 4종 (템플릿 실측)
  {{brand}} ×5   브랜드명
  {{name}}  ×1   담당자명   — 없으면 "브랜드 담당자님"으로 문장 자동 정리
  {{code}}  ×2   프로모션 코드(코드박스 + CTA URL ?code=)
  {{month}} ×1   CTA 버튼의 기간 표기  ← 주석에 누락돼 있던 슬롯

  python render_intercharm.py --csv ../../intercharm/data/live_master_20260720.csv --only-ready
  python render_intercharm.py --csv ... --pick LAN4077,BAT1764 --month "7-8월"
"""
from __future__ import annotations
import argparse, csv, html as ihtml, os, re, sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

HERE = Path(__file__).resolve().parent
TPLROOT = HERE / "templates"
PREVROOT = HERE / "previews"


def find_template(folder: str) -> tuple[Path, Path]:
    """템플릿 폴더에서 html·txt 를 자동으로 찾는다.

    폴더에 html 1개 + txt 1개만 두면 되고, 파일명을 바꿔도 그대로 동작한다.
    (여러 개면 가장 최근 수정본을 쓰고 경고한다 — 헷갈릴 일을 만들지 않기 위해.)
    """
    d = TPLROOT / folder
    if not d.is_dir():
        avail = ", ".join(x.name for x in TPLROOT.iterdir() if x.is_dir())
        raise SystemExit(f"템플릿 폴더가 없습니다: {d}\n  사용 가능: {avail}")
    html = sorted(d.glob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    txt = sorted(d.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not html:
        raise SystemExit(f"템플릿 html 이 없습니다: {d}")
    if not txt:
        raise SystemExit(f"플레인텍스트 txt 가 없습니다: {d}")
    if len(html) > 1:
        print(f"  ⚠️ html 이 {len(html)}개 — 가장 최근 것 사용: {html[0].name}")
    if len(txt) > 1:
        print(f"  ⚠️ txt 가 {len(txt)}개 — 가장 최근 것 사용: {txt[0].name}")
    return html[0], txt[0]


def strip_note(text: str) -> str:
    """플레인텍스트 상단의 작업 메모(구분선 위)를 잘라낸다."""
    mark = "─" * 10
    i = text.find(mark)
    return text[text.index("\n", i) + 1:].lstrip("\n") if i != -1 else text

# 제목: 템플릿에 없어 여기서 정한다. (광고 표기 없음 — 명함교환 기반, 준용 확정)
# 브랜드/담당자 배치 공용 — 갈라두면 한쪽만 고쳐지고 옛 제목이 나간다(0721 사고)
SUBJECT = "[SIRIAI] 인터참에서 인사드린 시리아이입니다. 여름 무료 프로모션 리스트 전달드립니다."
SUBJECT_PERSON = SUBJECT

# 오픈 추적 픽셀이 부를 주소. SIRIAI_OPEN_PIXEL="" 로 두면 픽셀 없이 발송된다.
# 소스: intercharm/opentracker (Vercel) · 시트 '열람기록' 탭에 한 줄씩 쌓인다.
OPEN_PIXEL_URL = os.environ.get(
    "SIRIAI_OPEN_PIXEL", "https://siriai-open-tracker.vercel.app/api/o").strip()


def auto_month() -> str:
    """CTA 기간 표기 — 발송 시점 기준으로 자동. 7월에 렌더하면 '7월', 8월이면 '8월'."""
    from datetime import datetime
    return f"{datetime.now().month}월"


def norm_header(s: str) -> str:
    return re.sub(r"\s+", "", str(s or ""))


def load_rows(path: Path) -> tuple[list[str], list[dict]]:
    raw = list(csv.reader(path.open(encoding="utf-8")))
    hr = -1
    for i, r in enumerate(raw[:20]):
        n = [norm_header(c) for c in r]
        if "브랜드명" in n and ("담당자이메일" in n or "추가담당자" in n):
            hr = i
            break
    if hr < 0:
        raise SystemExit("헤더행을 못 찾음 (브랜드명 + 담당자이메일 필요)")
    head = [norm_header(c) for c in raw[hr]]
    rows = []
    for r in raw[hr + 1:]:
        if not any(str(c).strip() for c in r):
            continue
        d = {head[i]: (r[i].strip() if i < len(r) and r[i] is not None else "") for i in range(len(head))}
        if d.get("브랜드명"):
            rows.append(d)
    return head, rows


def pick_email(d: dict, official_only: bool = False) -> str:
    """받는 주소. official_only 면 공식 이메일만(역할 주소)."""
    keys = ("공식이메일",) if official_only else ("담당자이메일", "공식이메일")
    for key in keys:
        for tok in re.split(r"[\s/;,]+", d.get(key, "")):
            if "@" in tok:
                return tok
    return ""


# 법인격·괄호를 떼고 "메일에서 부를 이름"으로. (주식회사 랑벨 → 랑벨)
_LEGAL = re.compile(r"(주식회사|유한회사|\(주\)|\(유\)|㈜)|(\bco\.?\s*,?\s*ltd\.?|\binc\.?|\bcorp(oration)?\.?|\bcompany\b|\bltd\.?)", re.I)

def disp_brand(b: str) -> str:
    s = _LEGAL.sub(" ", (b or "").strip())
    s = re.sub(r"\s*[\(（][^)）]*[\)）]", "", s)     # 괄호 블록 제거
    s = re.sub(r"\s*[·/].*$", "", s)                # 슬래시 이후 별칭 제거
    s = re.sub(r"\s{2,}", " ", s).strip(" ,.")
    m = re.match(r"^([A-Za-z0-9&'.\- ]{3,})\s+([가-힣][가-힣\s]*)$", s)   # 영문+한글 중복 → 한글
    if m:
        s = m.group(2).strip()
    return s or (b or "").strip()


def disp_name(n: str) -> str:
    s = (n or "").strip()
    if re.fullmatch(r"[가-힣](\s+[가-힣])+", s):     # '정 다 움' → '정다움'
        s = s.replace(" ", "")
    return s


def is_2026(d: dict) -> bool:
    """2026 인터참 참가 = 사전조사(2026 디렉터리 출신) 또는 명함 연도 2026."""
    return d.get("접점", "") == "사전조사" or "2026" in d.get("연도", "")


def official_overlaps_person(d: dict) -> bool:
    """공식 이메일이 담당자 이메일과 겹치면 True.
    겹치면 담당자 앞으로 1회만 보내기로 했으므로 '공식 발송' 배치에서는 제외한다."""
    def ms(v):
        return {t.lower() for t in re.split(r"[\s/;,]+", v or "") if "@" in t}
    return bool(ms(d.get("공식이메일", "")) & ms(d.get("담당자이메일", "")))


_FREE_DOM = re.compile(r"@(gmail|naver|daum|hanmail|nate|kakao|outlook|hotmail|yahoo|163|qq)\.", re.I)

def pick_person_email(d: dict) -> str:
    """담당자 이메일. 여러 개면 회사 도메인(개인메일 아님)을 우선, 없으면 첫 번째."""
    addrs = [t for t in re.split(r"[\s/;,]+", d.get("담당자이메일", "")) if "@" in t]
    if not addrs:
        return ""
    for a in addrs:
        if not _FREE_DOM.search(a):     # 회사 도메인 우선
            return a
    return addrs[0]


def has_name(d: dict) -> bool:
    return bool(re.search(r"[가-힣A-Za-z]", d.get("담당자", "")))


def render(tpl: str, brand: str, name: str, code: str, month: str, *, esc: bool = True) -> str:
    """슬롯 치환. 이름이 없으면 인사 문장을 자연스럽게 정리한다.
    esc=False 는 플레인텍스트용(HTML 이스케이프하면 &amp; 가 그대로 보임)."""
    out = tpl
    # 이름 없음 → "{{name}} 담당자님" 의 이중 공백 제거 (HTML/텍스트 양쪽)
    if not name.strip():
        out = out.replace("</span> {{name}} 담당자님", "</span> 담당자님")
        out = out.replace("{{name}} 담당자님", "담당자님")
    e = (lambda s: ihtml.escape(s, quote=False)) if esc else (lambda s: s)
    # 오픈 추적 픽셀 — HTML 본문에만. URL 이 비면 슬롯을 빈 문자열로 지운다(추적 없이 정상 발송).
    pixel = ""
    if esc and OPEN_PIXEL_URL:
        pixel = (f'<img src="{OPEN_PIXEL_URL}?c={code}" width="1" height="1" alt="" '
                 'style="display:block;width:1px;height:1px;border:0;opacity:0">')
    out = (out.replace("{{brand}}", e(brand))
              .replace("{{name}}", e(name))
              .replace("{{code}}", code)
              .replace("{{month}}", month)
              .replace("{{pixel}}", pixel))
    # ★안전장치: 안 채워진 슬롯이 하나라도 남으면 발송 사고 → 즉시 중단
    left = re.findall(r"\{\{(\w+)\}\}", out)
    if left:
        raise ValueError(f"미치환 슬롯 남음: {sorted(set(left))} (brand={brand})")
    return out


def main(a) -> int:
    global OUTDIR
    OUTDIR = PREVROOT / a.template
    tpl_html_path, tpl_txt_path = find_template(a.template)
    print(f"  템플릿: [{a.template}] {tpl_html_path.name}  +  {tpl_txt_path.name}")
    tpl = tpl_html_path.read_text(encoding="utf-8")
    tpl_txt = strip_note(tpl_txt_path.read_text(encoding="utf-8"))
    _, rows = load_rows(Path(a.csv))
    month = a.month or auto_month()   # 지정 없으면 오늘 기준 자동

    picks = {p.strip().upper() for p in a.pick.split(",") if p.strip()} if a.pick else None
    sel = []
    for d in rows:
        code = d.get("프로모션코드", "").strip()
        if picks is not None:
            if code.upper() in picks:
                sel.append(d)
            continue
        if a.intercharm2026 and not is_2026(d):
            continue
        # 주의사항에 '제외'가 적힌 행은 무조건 뺀다 — 원료·OEM·의료기기 등 타겟 아님(0721)
        if "제외" in d.get("발송시주의사항", ""):
            continue
        if a.from_no or a.to_no:                       # 마스터시트 # 범위
            try: no = int(re.sub(r"[^0-9]", "", d.get("#", "")) or 0)
            except ValueError: no = 0
            if a.from_no and no < a.from_no: continue
            if a.to_no and no > a.to_no: continue
        if a.cat and a.cat not in d.get("구분", ""):    # 구분(카테고리)
            continue
        if a.track and d.get("접점", "") != a.track:    # 접점(명함/사전조사)
            continue
        if not pick_email(d, a.official_only):
            continue
        if a.only_ready and not (has_name(d) and d.get("구분")):
            continue
        if a.official_only and official_overlaps_person(d):
            continue          # 공식==담당자 → 담당자 배치에서 1회만
        if a.person_only and not (pick_person_email(d) and has_name(d)):
            continue          # 담당자 배치 = 담당자 이메일 + 담당자명 있는 곳만
        if a.require_cat and not d.get("구분"):
            continue          # --require-cat 일 때만 카테고리 필수
        sel.append(d)

    if a.limit:
        sel = sel[:a.limit]
    if not sel:
        print("대상 0건 — 조건/코드를 확인하세요."); return 1

    OUTDIR.mkdir(parents=True, exist_ok=True)
    made, skipped = [], []
    for d in sel:
        brand = disp_brand(d.get("브랜드명", ""))          # 법인격 제거한 호칭
        if a.person_only:
            name = disp_name(d.get("담당자", ""))          # 담당자 실명
            email = pick_person_email(d)
        else:
            # 공식(역할) 주소로 보낼 땐 특정인 이름을 쓰지 않는다 → "브랜드 담당자님"
            name = "" if a.official_only else disp_name(d.get("담당자", ""))
            email = pick_email(d, a.official_only)
        code = d.get("프로모션코드", "")
        if not code:
            skipped.append((brand, "프로모션 코드 없음")); continue
        if not email:
            skipped.append((brand, "이메일 없음")); continue
        if not re.match(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$", email):
            skipped.append((brand, f"이메일 형식 이상({email}) — 바운스 위험")); continue
        try:
            out = render(tpl, brand, name, code, month)
            out_txt = render(tpl_txt, brand, name, code, month, esc=False)
        except ValueError as e:
            skipped.append((brand, str(e))); continue
        safe = re.sub(r"[^\w가-힣.-]+", "_", brand)[:40]
        p = OUTDIR / f"{code}_{safe}.html"
        p.write_text(out, encoding="utf-8")
        (OUTDIR / f"{code}_{safe}.txt").write_text(out_txt, encoding="utf-8")   # multipart 의 text 파트
        made.append((code, brand, name, d.get("구분", ""), email, d.get("발송시주의사항", ""), p))

    # 3_send 가 그대로 읽어갈 발송 명세
    man = OUTDIR / "_manifest.csv"
    with man.open("w", encoding="utf-8", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["코드", "브랜드", "담당자", "구분", "받는사람", "제목", "본문HTML", "본문TXT", "주의사항"])
        for code, brand, name, cat, email, cau, p in made:
            subj = SUBJECT
            wr.writerow([code, brand, name, cat, email, subj, p.name, p.with_suffix(".txt").name, cau])

    w = max((len(b) for _, b, _, _, _, _, _ in made), default=10)
    print(f"■ 미리보기 {len(made)}건 생성 → {OUTDIR}")
    print(f"  제목: {SUBJECT}")
    print(f"  CTA 기간 표기(month): {month}{'  (오늘 기준 자동)' if not a.month else '  (수동 지정)'}")
    print(f"  발송 명세: {man.name}")
    print()
    print(f"  {'코드':9} {'브랜드':{w}} {'담당자':12} {'구분':10} 이메일")
    print("  " + "-" * (w + 62))
    for code, brand, name, cat, email, cau, _p in made:
        print(f"  {code:9} {brand:{w}} {(name or '-'):12} {(cat or '-'):10} {email}")
        if cau:
            print(f"  {'':9} {'':{w}} ⚠️ {cau[:70]}")
    if skipped:
        print("\n  건너뜀:")
        for b, why in skipped:
            print(f"   · {b} — {why}")
    print("\n  ※ 발송 안 함. 브라우저로 열어 확인 후 3_send 로 넘길 것.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="마스터시트 CSV 내보내기")
    ap.add_argument("--template", default="intercharm", help="templates/ 아래 폴더명 (기본 intercharm)")
    ap.add_argument("--month", default="", help="CTA 기간 표기. 비우면 오늘 날짜 기준 자동(7월/8월)")
    ap.add_argument("--pick", default="", help="프로모션 코드 콤마구분 (예: LAN4077,BAT1764)")
    ap.add_argument("--only-ready", action="store_true", help="브랜드+담당자+구분+이메일 4조건 충족 행만")
    ap.add_argument("--official-only", action="store_true", help="공식 이메일로만 발송(담당자 이름 미사용)")
    ap.add_argument("--person-only", action="store_true", dest="person_only", help="담당자 배치: 담당자 이메일 + 실명")
    ap.add_argument("--intercharm2026", action="store_true", help="2026 인터참 참가 브랜드만")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N건만 (테스트용)")
    ap.add_argument("--from-no", type=int, default=0, dest="from_no", help="마스터시트 # 시작")
    ap.add_argument("--to-no", type=int, default=0, dest="to_no", help="마스터시트 # 끝")
    ap.add_argument("--cat", default="", help="구분 필터 (예: 스킨케어)")
    ap.add_argument("--require-cat", action="store_true", dest="require_cat", help="구분(카테고리) 있는 행만")
    ap.add_argument("--track", default="", help="접점 필터 (명함 | 사전조사)")
    raise SystemExit(main(ap.parse_args()))

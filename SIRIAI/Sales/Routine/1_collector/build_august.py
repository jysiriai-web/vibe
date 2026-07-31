"""8월 아웃바운드 시트 데이터 생성 — '브랜드 에셋 리스트' 6월 탭 → 세일즈 마스터 8월 탭용 CSV.

시트에 쓰지 않는다(그건 --apply 를 가진 별도 단계). 여기서는 검증 가능한 CSV 만 만든다.

  python 1_collector/build_august.py            # 미리보기 + CSV 저장
"""
from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "3_send"))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ASSET_ID = "1Op-L_x1IWMX77N11lLON9WcwMvZ9EWpt09tCq4r4FGM"
OUT = ROOT.parent / "intercharm" / "data" / "august_seed.csv"

# 8월 탭 스키마 — 앞쪽은 작업용(보임), 뒤쪽은 6월 원천 데이터(숨김)
SCHEMA = ["#", "구분", "브랜드명", "업체명", "홈페이지", "인스타", "이메일",
          "신뢰도", "적합도", "메일유형", "관계", "제외 사유", "제외 근거", "훅", "주의사항",
          "프로모션 코드", "발송단계", "비고", "출처"]

PREV_LABEL = "7월"                 # 직전 캠페인 — 중복 사유가 "7월 중복" 으로 적힌다

# 제외 사유 = "보낼 수 있는데 안 보내는 이유"만. 애초에 못 보내는 건 행을 안 만든다.
#   못 보냄 → 행 삭제:  이메일 없음 · 적합도 미판정 · 기존 클라이언트 · 리스트 내 중복
#   판단 표현 → 적합도 열:  부적합(타겟 아님·활동 중단 등) · 보류
REASONS = ["{PREV} 중복", "수신거부"]
# 기존 클라이언트 — 콜드메일 대상이 아니라 리스트에서 아예 뺀다(행 생성 안 함).
CLIENTS = {"야다", "오드타입", "위찌", "남유네", "남유에프엔씨",
           "oddtype", "whizzy", "yadah", "naaamyuuu",
           "29apostrophe", "이니스프리", "innisfree", "토코보", "tocobo", "moev"}

# 정렬 우선순위 — 보낼 수 있는 것부터 위로, 되살릴 가능성이 높은 순으로 아래.
# 다 보내고 나면 아래에서 순서대로 꺼내 쓰면 된다.
ORDER = ["", "{PREV} 중복", "수신거부"]        # 발송 가능 → 중복 → 수신거부 순

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_LEGAL = re.compile(r"(주식회사|유한회사|\(주\)|\(유\)|㈜)", re.I)


def addrs(v: str) -> list[str]:
    return [t for t in re.split(r"[\s/;,]+", v or "") if "@" in t]


def pick_email(v: str) -> str:
    """여러 개면 회사 도메인 우선 — 인터참 발송 로직과 같은 기준."""
    free = re.compile(r"@(gmail|naver|daum|hanmail|nate|kakao|outlook|hotmail|yahoo)\.", re.I)
    a = [x for x in addrs(v) if EMAIL_RE.match(x)]
    if not a:
        return ""
    for x in a:
        if not free.search(x):
            return x
    return a[0]


def norm_brand(v: str) -> str:
    """브랜드명 대조용 정규화 — 법인격·괄호·공백·기호를 떼고 소문자로.
    (주)달바 / 달바 / DALBA 를 같은 브랜드로 보기 위한 최소 처리."""
    s = _LEGAL.sub("", v or "")
    s = re.sub(r"[\(\)（）\[\]{}]", " ", s)
    s = re.sub(r"[\s·/\-_,.'\"]+", "", s)
    return s.strip().lower()


def letters3(brand: str, home: str, corp: str) -> str:
    """코드 앞 3글자. 영문 브랜드명 → 홈페이지 도메인 → 업체명 순으로 찾는다."""
    for src in (brand, home, corp):
        s = re.sub(r"^https?://(www\.)?", "", (src or "").strip())
        m = re.findall(r"[A-Za-z]{3,}", s)
        # 도메인 흔한 토큰은 건너뛴다
        for tok in m:
            if tok.lower() in ("com", "kr", "co", "net", "org", "www", "shop", "official", "http", "https"):
                continue
            return tok[:3].upper()
    return ""


def digits4(seed: str) -> int:
    h = 0
    for ch in seed:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return h % 9000 + 1000          # 1000~9999


def make_code(brand: str, home: str, corp: str, taken: set[str]) -> str:
    pre = letters3(brand, home, corp)
    if not pre:                      # 한글만 있는 경우 — 이름 해시로 3글자
        h = digits4(brand)
        pre = "".join(chr(65 + (h // (26 ** i)) % 26) for i in range(3))
    n = digits4(brand + home + corp)
    for bump in range(9000):
        code = f"{pre}{(n + bump - 1000) % 9000 + 1000}"
        if code not in taken:
            taken.add(code)
            return code
    raise RuntimeError("코드 발급 실패")


def main() -> int:
    from send_intercharm import SA_JSON, _open_master
    import gspread

    gc = gspread.service_account(filename=str(SA_JSON))

    # ── 이미 쓰인 코드·발송 이력 (접속기록/열람기록이 공용이라 코드는 전역 유일해야 한다)
    _, wm = _open_master()
    gm = wm.get_all_values()
    hm = [x.strip().replace("\n", "") for x in gm[7]]

    def CM(n):
        return hm.index(n) if n in hm else -1

    taken = set()
    sent_mails, sent_brands = set(), set()
    ic, io, ip = CM("프로모션 코드"), CM("공식 이메일"), CM("담당자 이메일")
    ibs, ips, ibn = CM("브랜드 발송"), CM("담당자 발송"), CM("브랜드명")
    for r in gm[8:]:
        r = r + [""] * 40
        if r[ic].strip():
            taken.add(r[ic].strip().upper())
        # 직전 캠페인에서 '실제로 보낸' 브랜드만 제외 대상 — 리스트에만 있고 안 보낸 건 다시 써도 된다
        if "완료" in r[ibs] or "완료" in r[ips]:
            for e in addrs(r[io]) + addrs(r[ip]):
                sent_mails.add(e.lower())
            if r[ibn].strip():
                sent_brands.add(norm_brand(r[ibn]))
    print(f"■ 기존 코드 {len(taken)}개")
    print(f"   직전 캠페인 발송분 — 이메일 {len(sent_mails)} · 브랜드 {len(sent_brands)}")

    # ── 6월 탭 읽기
    sh6 = gc.open_by_key(ASSET_ID)
    g6 = sh6.worksheet("6월").get_all_values()
    h6 = [x.strip() for x in g6[5]]

    def C6(n):
        return h6.index(n) if n in h6 else -1

    def g(r, i):
        return r[i].strip() if 0 <= i < len(r) else ""

    src = [r for r in g6[6:] if any(x.strip() for x in r)]
    print(f"■ 6월 원본 {len(src)}행")

    cols = {k: C6(k) for k in ("구분", "브랜드명", "연락처", "홈페이지", "업체명", "신뢰도",
                                "메일유형", "발송적합도", "발송단계", "훅", "메일주의", "비고", "인스타")}

    out, skipped, stats = [], [], Counter()
    seen_brands = set()      # 리스트 안에서의 중복도 잡는다
    dropped = []             # 클라이언트라 아예 뺀 브랜드
    for r in src:
        brand = g(r, cols["브랜드명"])
        if not brand:
            skipped.append(("브랜드명 없음", "")); continue
        email = pick_email(g(r, cols["연락처"]))
        home, corp = g(r, cols["홈페이지"]), g(r, cols["업체명"])
        caution = g(r, cols["메일주의"])
        fit = g(r, cols["발송적합도"])

        # 기존 거래 관계 — 콜드메일 대상이 아니다
        nb = norm_brand(brand)
        nc = norm_brand(corp)
        rel = "기존 클라이언트" if any(c in nb or (nc and c in nc) for c in CLIENTS) else ""

        # 제외 사유 — 우선순위대로 하나만 적는다(왜 안 보내는지 한눈에)
        # ── 애초에 보낼 수 없는 행은 만들지 않는다(원본은 6월 탭에 그대로 있다)
        if rel:
            stats["클라이언트"] += 1; dropped.append(brand); continue
        if nb in seen_brands:
            stats["리스트 내 중복"] += 1; continue

        why, detail = "", ""
        if email.lower() in sent_mails:
            why, detail = f"{PREV_LABEL} 중복", "이메일 일치"
        elif nb in sent_brands:
            why, detail = f"{PREV_LABEL} 중복", "브랜드명 일치"
        seen_brands.add(nb)

        # 원본에 '제외' 표기가 있으면 타겟이 아니라는 뜻 → 적합도로 표현
        if "제외" in caution:
            fit, detail = "부적합", (detail or "원본 주의사항에 제외 표기")

        stats["발송가능" if (not why and fit == "적합") else "보류·제외"] += 1

        code = make_code(brand, home, corp, taken) if email else ""
        out.append({
            "#": len(out) + 1,
            "구분": g(r, cols["구분"]),
            "브랜드명": brand,
            "업체명": corp,
            "홈페이지": home,
            "인스타": g(r, cols["인스타"]),
            "이메일": email,
            "신뢰도": g(r, cols["신뢰도"]),
            "적합도": fit,
            "메일유형": g(r, cols["메일유형"]),
            "관계": rel,
            "제외 사유": why,
            "제외 근거": detail,
            "훅": g(r, cols["훅"]),
            "주의사항": caution,
            "프로모션 코드": code,
            "발송단계": g(r, cols["발송단계"]),
            "비고": g(r, cols["비고"]),
            "출처": "8월 아웃바운드",
        })

    order = [x.replace("{PREV}", PREV_LABEL) for x in ORDER]
    out.sort(key=lambda x: (order.index(x["제외 사유"]) if x["제외 사유"] in order else 99,
                              x["브랜드명"]))
    for i, x in enumerate(out, 1):
        x["#"] = i

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=SCHEMA)
        w.writeheader()
        w.writerows(out)

    print(f"■ 생성 {len(out)}행 → {OUT.name}")
    print(f"   발송 가능 {stats['발송가능']} · 보류·제외 {stats['보류·제외']}")
    print(f"   행 미생성: " + " · ".join(f"{k} {stats[k]}" for k in
          ("이메일 없음", "적합도 미판정", "클라이언트", "리스트 내 중복") if stats[k]))
    print(f"   제외 사유: {dict(Counter(x['제외 사유'] for x in out if x['제외 사유']).most_common())}")
    print(f"   기존 클라이언트 제외(행 삭제): {dropped}")
    print(f"   정렬: 발송 가능 → 적합도 미판정 → 보류 → {PREV_LABEL} 중복 → 이메일 없음")
    print(f"   구분: {dict(Counter(x['구분'] for x in out).most_common())}")
    print(f"   코드 발급 {sum(1 for x in out if x['프로모션 코드'])} · 중복 0 "
          f"(전역 유일 {len(taken)}개 대조)")
    if skipped:
        print(f"   건너뜀 {len(skipped)}행")
    print()
    print("■ 샘플 5행")
    for x in out[:5]:
        print(f"   {x['프로모션 코드']:9} {x['브랜드명'][:14]:16} {x['구분'][:5]:7} "
              f"{x['이메일'][:30]:32} {x['훅'][:34]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

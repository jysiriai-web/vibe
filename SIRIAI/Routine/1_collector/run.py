#!/usr/bin/env python
"""SIRIAI 콜드메일 — 이메일 확보 도구 (V1) CLI 진입점.

현재 동작: `--inspect` (연결 + 실제 시트 구조 확인).
나머지 단계(이메일 탐색·중복·제조사·구분·쓰기)는 PRD 승인 후 단계적 구현.

사용 예:
  python run.py --inspect                # 연결 확인 + 마스터 탭 미리보기
  python run.py --inspect --tab 7월      # 특정 월별 탭 헤더/샘플 미리보기
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Windows 콘솔(cp949)에서도 한글이 깨지지 않도록 stdout/stderr 를 UTF-8 로 강제
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

# _shared 패키지를 import 하려면 Routine/ 를 sys.path 에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# 이 루틴(1_collector)의 백업 폴더 — 잡동사니 안 보이게 archive/ 아래에 쌓음
BACKUP_DIR = Path(__file__).resolve().parent / "archive" / "backups"


def _col_letter(idx0: int) -> str:
    """0-based 열 인덱스 → A1 표기 열 문자 (0→A, 26→AA)."""
    s, n = "", idx0
    while True:
        s = chr(ord("A") + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            break
    return s


def _find_header_row(rows: list) -> int:
    """헤더 행(= '구분' 과 '브랜드'류를 동시에 가진 첫 행) 인덱스. 못 찾으면 0."""
    for i, r in enumerate(rows[:15]):
        cells = {c.strip() for c in r}
        if "구분" in cells and ("브랜드명" in cells or "브랜드" in cells):
            return i
    return 0


def cmd_inspect(args) -> int:
    from collections import Counter

    from _shared import config, sheets

    sh = sheets.open_sheet()
    print(f"[OK] 연결 성공: '{sh.title}'  (ID={config.SHEET_ID})\n")

    print("탭 목록:")
    titles = []
    for ws in sh.worksheets():
        titles.append(ws.title)
        print(f"  - {ws.title}   ({ws.row_count}행 x {ws.col_count}열)")
    print()

    target = args.tab or config.MASTER_TAB
    if target not in titles:
        print(f"(탭 '{target}' 없음 — --tab 으로 지정하거나 위 목록에서 고르세요)")
        return 0

    ws = sh.worksheet(target)
    values = ws.get_all_values()
    hdr_i = _find_header_row(values)
    header = [c.strip() for c in values[hdr_i]]
    data = [r for r in values[hdr_i + 1 :] if any(c.strip() for c in r)]

    print(f"[{target}] 헤더 행 = {hdr_i + 1}행, 데이터 ≈ {len(data)}건\n")
    print("열 매핑 (열문자 : 헤더):")
    for j, name in enumerate(header):
        if name:
            print(f"   {_col_letter(j):>2} : {name}")

    # 구분/브랜드명/연락처 행별 보기 (최대 30행, 빈 구분은 ▆ 로 표시)
    def _idx(name):
        return header.index(name) if name in header else None

    gi, bi, di = _idx("구분"), _idx("브랜드명"), _idx("연락처")
    if bi is not None:
        show = data[:30]
        print(f"\n행별 보기 (상위 {len(show)}/{len(data)}건)   [구분 | 브랜드명 | 연락처]:")
        for k, r in enumerate(show, start=hdr_i + 2):  # 실제 시트 행번호
            g = (r[gi].strip() if gi is not None and len(r) > gi else "")
            b = (r[bi].strip() if len(r) > bi else "")
            d = (r[di].strip() if di is not None and len(r) > di else "")
            gmark = g if g else "▆빈"
            print(f"   {k:>3}행 | {gmark:<6} | {b:<16} | {d}")

    # 구분 분포 (canonical 사전 미리보기)
    if "구분" in header:
        gi = header.index("구분")
        counts = Counter(r[gi].strip() for r in data if len(r) > gi and r[gi].strip())
        print(f"\n구분 분포 (고유 {len(counts)}종, 상위 30):")
        for label, c in counts.most_common(30):
            print(f"   {c:>4}  {label}")
    return 0


def _load_tab(sh, title: str):
    ws = sh.worksheet(title)
    vals = ws.get_all_values()
    hi = _find_header_row(vals)
    hdr = [c.strip() for c in vals[hi]]
    return ws, vals, hi, hdr


def _build_category_index(sh) -> dict:
    """마스터 브랜드명 → 구분 역색인 (정규화 키 기준, 첫 등장 우선)."""
    from _shared import config, normalize

    _, vals, hi, hdr = _load_tab(sh, config.MASTER_TAB)
    gi, bi = hdr.index("구분"), hdr.index("브랜드명")
    idx: dict = {}
    for r in vals[hi + 1 :]:
        if len(r) <= max(gi, bi):
            continue
        g, b = r[gi].strip(), r[bi].strip()
        if not g or not b or g == "??":
            continue
        for k in normalize.keys(b):
            idx.setdefault(k, g)
    return idx


def _build_override_index():
    """보정 사전 → 정규화 키 → 구분."""
    from logic import category_overrides
    from _shared import normalize

    idx = {}
    for raw, cat in category_overrides.OVERRIDES.items():
        for k in normalize.keys(raw):
            idx[k] = cat
    return idx


def _build_master_email_index(sh) -> dict:
    """마스터 브랜드명 → 이메일(연락처) 역색인. 기존 DB 재활용(토큰 0)."""
    from logic import email_find
    from _shared import config, normalize

    _, vals, hi, hdr = _load_tab(sh, config.MASTER_TAB)
    bi, di = hdr.index("브랜드명"), hdr.index("연락처")
    idx: dict = {}
    for r in vals[hi + 1 :]:
        if len(r) <= max(bi, di):
            continue
        b, raw = r[bi].strip(), r[di].strip()
        if not b or "@" not in raw:
            continue
        ems = email_find.extract(raw)  # "a@x / b@x" → 첫 후보
        if not ems:
            continue
        for k in normalize.keys(b):
            idx.setdefault(k, ems[0])
    return idx


def cmd_renumber(args) -> int:
    """A열 '#' 을 데이터 순서대로 1..N 재번호. 기본 dry-run."""
    from _shared import sheets

    if not args.tab:
        print("--tab 을 지정하세요 (예: --renumber --tab 6월)")
        return 2
    sh = sheets.open_sheet()
    ws, vals, hi, hdr = _load_tab(sh, args.tab)
    ai = hdr.index("#") if "#" in hdr else 0

    updates, changed = [], 0
    n = 0
    for off, r in enumerate(vals[hi + 1 :]):
        if not any(c.strip() for c in r):
            continue
        n += 1
        row = hi + 2 + off
        cur = r[ai].strip() if len(r) > ai else ""
        if cur != str(n):
            changed += 1
            updates.append({"range": f"{_col_letter(ai)}{row}", "values": [[n]]})

    print(f"[{args.tab}] 데이터 {n}행, # 불일치 {changed}건 (dry-run)")
    for u in updates[:5]:
        print(f"   {u['range']} → {u['values'][0][0]}")
    if len(updates) > 5:
        print(f"   … 외 {len(updates) - 5}건")

    if not args.apply:
        print("  [DRY-RUN] 쓰기 없음. 실제 반영: --renumber --tab "
              f"{args.tab} --apply --yes")
        return 0
    if not updates:
        print("  이미 번호가 맞습니다.")
        return 0
    if not args.yes:
        print("  [중단] 실제 쓰기는 --yes 동반 필요.")
        return 0

    from _shared import backup

    bpath, cnt = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"\n  백업 완료: {bpath}  ({cnt}행)")
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  기록 완료: {_col_letter(ai)}열 {len(updates)}개 셀 (#).")
    return 0


def cmd_delete_list(args) -> int:
    """파일의 행 번호 목록을 삭제(백업 후 역순). 파일 각 줄 첫 탭 컬럼=행번호. 기본 dry-run."""
    from _shared import backup, sheets

    if not args.tab or not args.file:
        print("--tab 과 --file 둘 다 필요")
        return 2
    rows = []
    for line in Path(args.file).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        tok = line.split("\t")[0].strip()
        if tok.isdigit():
            rows.append(int(tok))
    rows = sorted(set(rows))
    sh = sheets.open_sheet()
    ws = sh.worksheet(args.tab)
    print(f"[{args.tab}] 삭제 대상 {len(rows)}행 (dry-run). 예: {rows[:8]}…")

    if not args.apply:
        print(f"  실제 삭제: --delete-list --file {args.file} --tab {args.tab} --apply --yes")
        return 0
    if not rows:
        return 0
    if not args.yes:
        print("  [중단] --yes 필요")
        return 0
    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"  백업: {bpath} ({n}행)")
    reqs = [{"deleteDimension": {"range": {"sheetId": ws.id, "dimension": "ROWS",
            "startIndex": r - 1, "endIndex": r}}} for r in sorted(rows, reverse=True)]
    sheets.with_backoff(lambda: ws.spreadsheet.batch_update({"requests": reqs}))
    print(f"  삭제 완료: {len(rows)}행. → --renumber 권장")
    return 0


def cmd_fill_from(args) -> int:
    """파일에서 셀 채움. 각 줄 'row<TAB>열헤더<TAB>값'. 빈 셀에만 쓴다. 기본 dry-run."""
    from _shared import backup, sheets

    if not args.tab or not args.file:
        print("--tab 과 --file 둘 다 필요")
        return 2
    sh = sheets.open_sheet()
    ws, vals, hi, hdr = _load_tab(sh, args.tab)
    cur = {hi + 2 + off: r for off, r in enumerate(vals[hi + 1 :])}

    updates, skipped = [], 0
    for line in Path(args.file).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        row, col, val = int(parts[0]), parts[1].strip(), parts[2].strip()
        if col not in hdr or not val:
            continue
        ci = hdr.index(col)
        r = cur.get(row, [])
        if len(r) > ci and r[ci].strip():  # 기존값 보존
            skipped += 1
            continue
        updates.append({"range": f"{_col_letter(ci)}{row}", "values": [[val]]})

    print(f"[{args.tab}] 채울 셀 {len(updates)}개 (기존값 {skipped}개 보존). dry-run")
    for u in updates[:6]:
        print(f"   {u['range']} = {u['values'][0][0]}")
    if len(updates) > 6:
        print(f"   … 외 {len(updates) - 6}개")

    if not args.apply:
        print(f"  실제 반영: --fill-from --file {args.file} --tab {args.tab} --apply --yes")
        return 0
    if not updates or not args.yes:
        print("  [중단/없음] --yes 필요" if updates else "  채울 것 없음")
        return 0
    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"  백업: {bpath} ({n}행)")
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  기록 완료: {len(updates)}개 셀")
    return 0


def cmd_resolve(args) -> int:
    """업체명 → 브랜드명 해결(규칙 #2). --file TSV 한 줄:
        row <TAB> 브랜드명 [<TAB> 카테고리 <TAB> 인스타 <TAB> 출처URL]
    - 브랜드명(C): 현재값과 다르면 **덮어씀**(회사명→브랜드명). 이게 이 명령의 핵심.
    - 인스타(F)/비고(E,카테고리)/출처(Q): 빈 셀에만 채움(기존 보존).
    기본 dry-run. 실제 반영은 --apply --yes. 다중브랜드(별도 이메일) 분리는 --append-file 로 따로.
    """
    from _shared import backup, sheets

    if not args.tab or not args.file:
        print("--tab 과 --file 둘 다 필요 (예: --resolve --file brands.tsv --tab 6월)")
        return 2
    sh = sheets.open_sheet()
    ws, vals, hi, hdr = _load_tab(sh, args.tab)

    def col(name):
        return hdr.index(name) if name in hdr else None

    bi = col("브랜드명")
    if bi is None:
        print("브랜드명 열을 찾지 못했습니다.")
        return 2
    fi, ei, qi = col("인스타"), col("비고"), col("출처")
    cur = {hi + 2 + off: r for off, r in enumerate(vals[hi + 1 :])}

    renames, fills, same, bad = [], [], 0, []
    for line in Path(args.file).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        p = (line.split("\t") + ["", "", "", ""])[:5]
        rtok, brand, cat, insta, src = (x.strip() for x in p)
        if not rtok.isdigit() or not brand:
            bad.append(line)
            continue
        row = int(rtok)
        r = cur.get(row, [])
        old = r[bi].strip() if len(r) > bi else ""
        if brand != old:  # C열 덮어쓰기 (회사→브랜드)
            renames.append((row, old, brand))
        else:
            same += 1
        # 부가열은 빈 셀에만
        for ci, val, label in ((fi, insta, "인스타"), (ei, cat, "비고"), (qi, src, "출처")):
            if ci is None or not val:
                continue
            if len(r) > ci and r[ci].strip():
                continue
            fills.append((row, ci, val, label))

    print(f"[{args.tab}] 해결 입력 {len(renames)+same}건 — "
          f"브랜드명 변경 {len(renames)} · 변경없음(이미 일치) {same} · 부가채움 {len(fills)}")
    if bad:
        print(f"  [경고] 형식오류 {len(bad)}줄 무시")
    print("\n  【브랜드명 덮어쓰기 (회사→브랜드)】")
    for row, old, new in renames[:40]:
        print(f"   {row:>3}행  {old:<18} → {new}")
    if len(renames) > 40:
        print(f"   … 외 {len(renames) - 40}건")

    updates = []
    for row, _old, new in renames:
        updates.append({"range": f"{_col_letter(bi)}{row}", "values": [[new]]})
    for row, ci, val, _lbl in fills:
        updates.append({"range": f"{_col_letter(ci)}{row}", "values": [[val]]})

    if not args.apply:
        print(f"\n  [DRY-RUN] 쓰기 없음. 실제 반영: --resolve --file {args.file} "
              f"--tab {args.tab} --apply --yes")
        return 0
    if not updates:
        print("  쓸 것이 없습니다.")
        return 0
    if not args.yes:
        print("  [중단] 실제 쓰기는 --yes 동반 필요(검토 확인용).")
        return 0

    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"\n  백업 완료: {bpath}  ({n}행)")
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  기록 완료: {len(updates)}개 셀 "
          f"(브랜드명 {len(renames)} 덮어씀 + 부가 {len(fills)}).")
    return 0


def cmd_list_todo(args) -> int:
    """구분 또는 이메일이 빈 행을 전부 출력 (row<TAB>brand<TAB>결손). 처리 대상 목록."""
    from _shared import sheets

    if not args.tab:
        print("--tab 을 지정하세요")
        return 2
    sh = sheets.open_sheet()
    _, vals, hi, hdr = _load_tab(sh, args.tab)
    gi, bi, di = hdr.index("구분"), hdr.index("브랜드명"), hdr.index("연락처")
    out = []
    for off, r in enumerate(vals[hi + 1 :]):
        if not any(c.strip() for c in r):
            continue
        row = hi + 2 + off
        g = r[gi].strip() if len(r) > gi else ""
        b = r[bi].strip() if len(r) > bi else ""
        e = r[di].strip() if len(r) > di else ""
        if b and (not g or not e):
            miss = ("구분" if not g else "") + ("이메일" if not e else "")
            out.append(f"{row}\t{b}\t{miss}")
    print(f"### 미해결 {len(out)}건 ###")
    for line in out:
        print(line)
    return 0


def cmd_prune(args) -> int:
    """중복 제거 + 순수 제조사 삭제 후보 산출. 기본 dry-run. 삭제는 백업 후 역순."""
    from collections import defaultdict

    from logic import manufacturer
    from _shared import normalize, sheets

    if not args.tab:
        print("--tab 을 지정하세요 (예: --prune --tab 6월)")
        return 2
    sh = sheets.open_sheet()
    ws, vals, hi, hdr = _load_tab(sh, args.tab)
    bi = hdr.index("브랜드명")
    di = hdr.index("연락처") if "연락처" in hdr else None

    rows = []  # (row, brand, has_email)
    for off, r in enumerate(vals[hi + 1 :]):
        if not any(c.strip() for c in r):
            continue
        row = hi + 2 + off
        brand = r[bi].strip() if len(r) > bi else ""
        if not brand:
            continue
        has_email = bool(di is not None and len(r) > di and r[di].strip())
        rows.append((row, brand, has_email))

    # 1) 중복: one_key 그룹 — 이메일 있는 행 우선·낮은 행 유지, 나머지 삭제
    groups = defaultdict(list)
    for row, brand, has_email in rows:
        groups[normalize.one_key(brand)].append((row, brand, has_email))
    dup_del = []  # (row, brand, keep_row)
    for members in groups.values():
        if len(members) < 2:
            continue
        keep, *rest = sorted(members, key=lambda m: (not m[2], m[0]))
        for row, brand, _e in rest:
            dup_del.append((row, brand, keep[0]))
    dup_rows = {r for r, _b, _k in dup_del}

    # 2) 제조사: 중복으로 이미 빠질 행 제외
    manuf_del = []  # (row, brand, reason)
    for row, brand, _e in rows:
        if row in dup_rows:
            continue
        is_m, reason = manufacturer.is_manufacturer(brand)
        if is_m:
            manuf_del.append((row, brand, reason))

    print(f"[{args.tab}] 삭제 후보 — 중복 {len(dup_del)} + 제조사 {len(manuf_del)}\n")
    print("【중복】 유지행 남기고 제거:")
    for row, brand, keep in dup_del[:30]:
        print(f"   {row:>3}행 {brand}  (유지 {keep}행)")
    if len(dup_del) > 30:
        print(f"   … 외 {len(dup_del) - 30}건")
    print("\n【제조사 의심】 자체브랜드 있으면 제외 요청하세요:")
    for row, brand, reason in manuf_del:
        print(f"   {row:>3}행 {brand}  [{reason}]")

    all_del = sorted(dup_rows | {r for r, _b, _r in manuf_del})
    print(f"\n  → 삭제 예정 총 {len(all_del)}행 (중복 {len(dup_del)} + 제조사 {len(manuf_del)})")

    if not args.apply:
        print(f"  [DRY-RUN] 삭제 없음. 실제 삭제: --prune --tab {args.tab} --apply --yes")
        return 0
    if not all_del:
        print("  삭제할 행이 없습니다.")
        return 0
    if not args.yes:
        print("  [중단] 실제 삭제는 --yes 동반 필요.")
        return 0

    from _shared import backup

    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"\n  백업 완료: {bpath}  ({n}행)")
    requests = [
        {"deleteDimension": {"range": {
            "sheetId": ws.id, "dimension": "ROWS",
            "startIndex": row - 1, "endIndex": row}}}
        for row in sorted(all_del, reverse=True)  # 역순(아래→위)
    ]
    sheets.with_backoff(lambda: ws.spreadsheet.batch_update({"requests": requests}))
    print(f"  삭제 완료: {len(all_del)}행. → 이어서 `--renumber` 권장.")
    return 0


def cmd_category(args) -> int:
    """월별 탭의 빈 구분(B열)을 보정 사전 → 마스터 라벨 순으로 채운다. 기본 dry-run."""
    from _shared import normalize, sheets

    if not args.tab:
        print("--tab 을 지정하세요 (예: --only category --tab 6월)")
        return 2

    sh = sheets.open_sheet()
    m_idx = _build_category_index(sh)
    o_idx = _build_override_index()
    print(f"마스터 구분 인덱스: {len(m_idx)} 키 / 보정 사전: {len(o_idx)} 키\n")

    ws, vals, hi, hdr = _load_tab(sh, args.tab)
    gi, bi = hdr.index("구분"), hdr.index("브랜드명")

    def _resolve(ks):
        for k in ks:  # 보정 우선
            if k in o_idx:
                return o_idx[k], "보정"
        for k in ks:  # 다음 마스터
            if k in m_idx:
                return m_idx[k], "마스터"
        return None, None

    plan = []         # 빈 구분 채우기: (row, brand, sug, src)
    corrections = []  # --recheck 교정:  (row, brand, cur, new)
    for off, r in enumerate(vals[hi + 1 :]):
        row = hi + 2 + off
        if not any(c.strip() for c in r):
            continue
        cur = r[gi].strip() if len(r) > gi else ""
        brand = r[bi].strip() if len(r) > bi else ""
        if not brand:
            continue
        ks = normalize.keys(brand)
        if not cur:
            sug, src = _resolve(ks)
            plan.append((row, brand, sug, src))
        elif args.recheck:
            ov = next((o_idx[k] for k in ks if k in o_idx), None)
            if ov and ov != cur:
                corrections.append((row, brand, cur, ov))

    head = f"[{args.tab}] 구분 빈 행: {len(plan)}건"
    if args.recheck:
        head += f", 교정 후보: {len(corrections)}건"
    print(head + "\n")
    print("   행 | 브랜드             | 제안구분        | 근거")
    print("  ----+--------------------+----------------+--------------")
    for row, brand, sug, src in plan:
        print(f"  {row:>3} | {brand:<18} | {sug or '—확인필요':<14} | {src or '마스터 미존재'}")
    for row, brand, cur, new in corrections:
        print(f"  {row:>3} | {brand:<18} | {cur} → {new:<10} | 교정(보정사전)")

    writable = [(row, sug) for (row, _b, sug, _s) in plan if sug]
    writable += [(row, new) for (row, _b, _c, new) in corrections]
    fill_n = sum(1 for (_r, _b, sug, _s) in plan if sug)
    msg = f"\n  → 채울 수 있음 {fill_n}/{len(plan)}건"
    if args.recheck:
        msg += f", 교정 {len(corrections)}건"
    print(msg + f", 확인필요 {len(plan) - fill_n}건")

    if not args.apply:
        print("  [DRY-RUN] 쓰기 없음. 실제 반영: --apply --yes")
        return 0
    if not writable:
        print("  쓸 값이 없습니다.")
        return 0
    if not args.yes:
        print("  [중단] 실제 쓰기는 --yes 동반 필요(검토 확인용).")
        return 0

    from _shared import backup

    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"\n  백업 완료: {bpath}  ({n}행)")
    col_letter = _col_letter(gi)  # 구분 열 (6월=B)
    updates = [{"range": f"{col_letter}{row}", "values": [[val]]} for row, val in writable]
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  기록 완료: {col_letter}열 {len(updates)}개 셀 (구분).")
    return 0


def cmd_email(args) -> int:
    """월별 탭의 빈 이메일(D열)을 findings 기준으로 채운다. 기본 dry-run.
    기존 값 무손상: 비어 있는 셀에만 쓴다. D6 원칙(미확보·추정은 D에 안 씀)."""
    from logic import email_find, email_findings
    from _shared import normalize, sheets

    if not args.tab:
        print("--tab 을 지정하세요 (예: --only email --tab 6월)")
        return 2

    f_idx = {}
    for raw, info in email_findings.FINDINGS.items():
        for k in normalize.keys(raw):
            f_idx[k] = info

    sh = sheets.open_sheet()
    ws, vals, hi, hdr = _load_tab(sh, args.tab)

    def col(name):
        return hdr.index(name) if name in hdr else None

    di, ei, qi, bi = col("연락처"), col("비고"), col("출처"), col("브랜드명")
    if di is None or bi is None:
        print("연락처/브랜드명 열을 찾지 못했습니다.")
        return 2

    from collections import Counter

    m_email = _build_master_email_index(sh)  # 기존 DB 이메일 (토큰 0)
    print(f"마스터 이메일 인덱스: {len(m_email)} 키 / findings: {len(f_idx)} 키\n")

    plan = []  # (row, brand, action, email, source, note, conf)
    for off, r in enumerate(vals[hi + 1 :]):
        row = hi + 2 + off
        if not any(c.strip() for c in r):
            continue
        brand = r[bi].strip() if len(r) > bi else ""
        cur = r[di].strip() if len(r) > di else ""
        if not brand or cur:  # 브랜드 없거나 이미 이메일 있음 → 건너뜀
            continue
        keys = normalize.keys(brand)
        mem = next((m_email[k] for k in keys if k in m_email), None)
        if mem:  # 1) 마스터(브랜드에셋) — 토큰 0
            plan.append((row, brand, "FILL", mem, "기존DB", "브랜드에셋 매칭", "높음"))
            continue
        info = next((f_idx[k] for k in keys if k in f_idx), None)  # 2) findings 캐시
        if not info:
            plan.append((row, brand, "확인필요", "", "", "탐색결과 없음", ""))
            continue
        em, conf = info.get("email", ""), info.get("confidence", "")
        lbl = email_find.label(em, conf)
        base = info.get("note", "")
        note = base if (not lbl or base.startswith(lbl)) else f"{lbl} {base}".strip()
        if em and conf != "미확보":
            plan.append((row, brand, "FILL", em, info.get("source", ""), note, conf))
        else:
            plan.append((row, brand, "미확보", "", info.get("source", ""), note, conf))

    fills = [(row, em, src, note) for (row, _b, act, em, src, note, _c) in plan if act == "FILL"]
    needs = [brand for (_r, brand, act, *_x) in plan if act == "확인필요"]
    by_src = Counter(src for (_r, _b, act, _e, src, _n, _c) in plan if act == "FILL")

    print(f"[{args.tab}] 이메일 빈 행: {len(plan)}건")
    print(f"  채움 가능 {len(fills)}건 (출처별 {dict(by_src)}), 미확보/확인필요 {len(plan) - len(fills)}건\n")
    if len(plan) <= 40:
        print("   행 | 브랜드        | 동작     | 이메일                       | 신뢰")
        print("  ----+---------------+---------+------------------------------+------")
        for row, brand, act, em, src, note, conf in plan:
            print(f"  {row:>3} | {brand:<13} | {act:<7} | {em or '—':<28} | {conf or '—'}")
    elif needs:
        print(f"  확인필요(마스터·findings 미존재 → 웹조사 필요) {len(needs)}건:")
        print("   " + ", ".join(needs[:50]) + (f"  … 외 {len(needs) - 50}건" if len(needs) > 50 else ""))

    if not args.apply:
        print("  [DRY-RUN] 쓰기 없음. 실제 반영: --only email --tab "
              f"{args.tab} --apply --yes")
        return 0
    if not fills:
        print("  쓸 이메일이 없습니다.")
        return 0
    if not args.yes:
        print("  [중단] 실제 쓰기는 --yes 동반 필요(검토 확인용).")
        return 0

    from _shared import backup

    bpath, n = backup.backup_tab(ws, args.tab, BACKUP_DIR)
    print(f"\n  백업 완료: {bpath}  ({n}행)")

    updates = []
    cur_rows = {hi + 2 + off: r for off, r in enumerate(vals[hi + 1 :])}
    for row, em, src, note in fills:
        r = cur_rows.get(row, [])
        updates.append({"range": f"{_col_letter(di)}{row}", "values": [[em]]})
        if qi is not None and not (r[qi].strip() if len(r) > qi else ""):
            updates.append({"range": f"{_col_letter(qi)}{row}", "values": [[src]]})
        if ei is not None and note and not (r[ei].strip() if len(r) > ei else ""):
            updates.append({"range": f"{_col_letter(ei)}{row}", "values": [[note]]})
    sheets.with_backoff(lambda: ws.batch_update(updates, value_input_option="RAW"))
    print(f"  기록 완료: {len(updates)}개 셀 (이메일 D / 출처 Q / 비고 E, 빈 셀만).")
    return 0


def _todo(name: str):
    def f(args) -> int:
        print(
            f"[미구현] '{name}' 단계는 PRD 승인 후 구현됩니다.\n"
            "지금은 `python run.py --inspect` 로 연결·구조 확인만 가능합니다."
        )
        return 0

    return f


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run.py", description="SIRIAI 콜드메일 이메일 확보 도구 V1"
    )
    p.add_argument("--tab", help="대상 월별 탭 (예: 7월). --inspect 시 미리볼 탭")

    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--inspect", action="store_true", help="연결·시트 구조 확인 (지금 동작)")
    mode.add_argument("--dry-run", action="store_true", help="변경 미리보기 (기본 동작 예정)")
    mode.add_argument("--apply", action="store_true", help="실제 쓰기 (백업·확인 강제)")
    mode.add_argument("--backup-only", action="store_true", help="스냅샷만 뜨고 종료")

    p.add_argument("--only", help="특정 단계만 실행 (예: category = 구분만)")
    p.add_argument("--renumber", action="store_true", help="A열 # 을 데이터 순서대로 재번호")
    p.add_argument("--prune", action="store_true", help="중복 행 제거 + 순수 제조사 삭제 후보")
    p.add_argument("--list-todo", action="store_true", help="구분/이메일 빈 행 전체 출력")
    p.add_argument("--delete-list", action="store_true", help="--file 의 행번호 목록 삭제")
    p.add_argument("--fill-from", action="store_true", help="--file(row,열,값)에서 빈 셀 채움")
    p.add_argument("--resolve", action="store_true", help="--file(row,브랜드,…)로 업체명→브랜드명 덮어쓰기(규칙#2)")
    p.add_argument("--file", help="--delete-list/--fill-from/--resolve 입력 파일")
    p.add_argument("--recheck", action="store_true", help="채워진 구분을 보정사전과 대조해 불일치 교정")
    p.add_argument("--clean", action="store_true", help="메모 분리·빈행 정리")
    p.add_argument("--purge-confirmed", action="store_true", help="삭제대상 실삭제")
    p.add_argument("--show-cols", action="store_true", help="자동 숨긴 보조열 다시 펼침")
    p.add_argument("--yes", action="store_true", help="무인 실행 (--plan 필수)")
    p.add_argument("--plan", help="검토한 계획 파일 경로")
    p.add_argument("--limit", type=int, help="상위 N행만 (테스트)")
    p.add_argument("--gc", action="store_true", help="오래된 산출물 정리")
    p.add_argument("--older-than", type=int, default=90, help="--gc 보관 기준(일)")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if args.inspect:
        return cmd_inspect(args)
    if args.list_todo:
        return cmd_list_todo(args)
    if args.delete_list:
        return cmd_delete_list(args)
    if args.fill_from:
        return cmd_fill_from(args)
    if args.resolve:
        return cmd_resolve(args)
    if args.prune:
        return cmd_prune(args)
    if args.renumber:
        return cmd_renumber(args)
    if args.only == "category":
        return cmd_category(args)
    if args.only == "email":
        return cmd_email(args)
    if any([args.apply, args.dry_run, args.backup_only, args.clean,
            args.purge_confirmed, args.gc, args.show_cols, args.only]):
        return _todo("처리/쓰기")(args)

    build_parser().print_help()
    print("\n1단계: `python run.py --inspect` 로 연결을 확인하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

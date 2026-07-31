# 분류결과(classified.json) ↔ master.json(연락처) 조인 → 타겟 리스트 CSV
# 사용: python data/_work/join.py   (cwd = intercharm/)
import csv, json, os, sys

WORK = os.path.join('data', '_work')
OUT = 'data'

master = {m['idx']: m for m in json.load(open(os.path.join(WORK, 'master.json'), encoding='utf-8'))}
cj = json.load(open(os.path.join(WORK, 'classified.json'), encoding='utf-8'))
cls = cj['classifications'] if isinstance(cj, dict) and 'classifications' in cj else cj

def hall(booth):
    b = (booth or '').strip()
    return b.split('-')[0] if '-' in b else b

# idx 기준 조인
rows = []
for c in cls:
    m = master.get(c['idx'], {})
    rows.append({
        'tier': c['tier'],
        'tier_kr': {'A': 'Tier A', 'B': 'Tier B', 'exclude': '제외', 'safe_exclude': '안전제외'}.get(c['tier'], c['tier']),
        'name': c.get('name') or m.get('name', ''),
        'icp_category': c.get('icp_category', ''),
        'hall': hall(m.get('booth', m.get('booth', ''))) or hall(m.get('부스번호', '')),
        'booth': m.get('booth', ''),
        'email': m.get('email', ''),
        'phone': m.get('phone', ''),
        'website': m.get('website', ''),
        'confidence': c.get('confidence', ''),
        'flags': '|'.join(c.get('flags', [])),
        'verified': 'Y' if c.get('verified') else '',
        'reason': c.get('reason', ''),
        'category_raw': m.get('category', ''),
        'detail': m.get('detail', ''),
        'idx': c['idx'],
    })

# master에 booth 키가 없으므로 보정 (master는 부스번호를 'booth'로 저장 안했을 수 있음)
# master.json 구조 확인: idx,name,category,website,email,phone,desc,detail — booth 없음!
# → 부스번호는 원본 CSV에서 다시 가져와야 함. 아래에서 처리.

# 원본 CSV에서 부스번호 보강 (master에 booth 미포함 대비)
SRC = r'C:\Users\whwns\Downloads\intercharm_korea_2026_출품사.csv'
src_rows = list(csv.DictReader(open(SRC, encoding='utf-8-sig')))
booth_by_idx = {i: r['부스번호'].strip() for i, r in enumerate(src_rows)}
for row in rows:
    b = booth_by_idx.get(row['idx'], '')
    row['booth'] = b
    row['hall'] = hall(b)

tier_order = {'A': 0, 'B': 1, 'exclude': 2, 'safe_exclude': 3}
rows.sort(key=lambda r: (tier_order.get(r['tier'], 9), r['hall'], r['booth']))

# 1) 타겟 리스트 (A+B만, 영업 실행용)
targets = [r for r in rows if r['tier'] in ('A', 'B')]
cols_t = ['tier_kr', 'name', 'icp_category', 'hall', 'booth', 'email', 'phone', 'website', 'confidence', 'flags', 'verified', 'reason', 'detail']
hdr_t = ['구분', '회사명', 'ICP세부', '홀', '부스번호', '이메일', '전화', '웹사이트', '신뢰도', '플래그', '검증', '판단근거', '상세페이지']
with open(os.path.join(OUT, 'target_list.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(hdr_t)
    for r in targets:
        w.writerow([r[c] for c in cols_t])

# 2) 전수 분류 (513 전부, 감사·재검토용)
cols_a = ['idx', 'tier_kr', 'name', 'icp_category', 'confidence', 'flags', 'verified', 'hall', 'booth', 'email', 'website', 'category_raw', 'reason']
hdr_a = ['idx', '구분', '회사명', 'ICP세부', '신뢰도', '플래그', '검증', '홀', '부스번호', '이메일', '웹사이트', '원본카테고리', '판단근거']
with open(os.path.join(OUT, 'full_classification.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(hdr_a)
    for r in rows:
        w.writerow([r[c] for c in cols_a])

# 3) 요약
from collections import Counter
tc = Counter(r['tier'] for r in rows)
print('=== 분류 결과 ===')
print(f"총 {len(rows)}개사")
print(f"Tier A: {tc['A']}  Tier B: {tc['B']}  제외: {tc['exclude']}  안전제외: {tc['safe_exclude']}")
print(f"→ 타겟(A+B): {len(targets)}개사")
verified = sum(1 for r in rows if r['verified'] == 'Y')
print(f"검증 재판독: {verified}건")
# 이메일 보유율 (타겟 중)
em = sum(1 for r in targets if r['email'])
print(f"타겟 중 이메일 보유: {em}/{len(targets)} ({em*100//max(len(targets),1)}%)")
# ICP 세부 분포 (타겟)
print('\n=== 타겟 ICP 세부 분포 ===')
for cat, n in Counter(r['icp_category'] for r in targets).most_common():
    print(f"  {n:3d}  {cat}")
# 저신뢰/플래그 (재검토 필요)
lowconf = [r for r in targets if r['confidence'] == 'low']
print(f"\n저신뢰 타겟(준용 확인 권장): {len(lowconf)}건")
print('\n출력: data/target_list.csv (A+B), data/full_classification.csv (전수)')

// 마스터시트 F열(가드닝 대상여부) 기록 복원 — 일회성.
//
// 왜: 예전 브릿지는 팔로워를 되쓸 때마다 F열을 다시 계산해 덮어썼다.
//     그래서 1명 → (가드닝으로) 1,001명이 된 계정은 '가드닝 대상'이 '가드닝 불필요'로 바뀌어
//     "원래 대상이었다"는 기록이 사라졌다. (브릿지는 이제 비어있을 때만 쓰도록 고쳐짐)
//
// 복원 근거: 주문(가드닝 집행) 기록이 있는 계정 = 그때 분명히 '가드닝 대상'이었다.
//
// 안전장치
//  · 기본은 미리보기(--dry 기본). 실제 쓰기는 --apply 를 줘야 한다.
//  · '가드닝 대상' 으로 적힌 칸은 절대 건드리지 않는다(사람이 손으로 쓴 것 포함).
//  · 바꾸는 방향은 오직 (빈칸 → 계산값) 과 ('가드닝 불필요' + 주문이력 있음 → '가드닝 대상') 뿐.
//
//   node scripts/backfill-gardening.js           (미리보기)
//   node scripts/backfill-gardening.js --apply    (실제 적용)
import { loadEnv } from '../src/env.js';
import { listCampaigns, getCampaign } from '../src/campaigns.js';
import { getAccountsFromSheet, pushCellsToSheet } from '../src/sheet.js';
import { readOrders, localOrders } from '../src/store.js';

loadEnv();
const APPLY = process.argv.includes('--apply');
const GARDENING_COL = 6;
const TARGET = '가드닝 대상';
const NOT_TARGET = '가드닝 불필요';

const id = process.env.CAMPAIGN;
const campaign = id ? getCampaign(id) : listCampaigns()[0];
if (!campaign) { console.error('캠페인 없음'); process.exit(1); }
const MIN = Number(campaign.min) || 1000;

const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; };

const accounts = await getAccountsFromSheet(campaign.sheet);
if (accounts.length && accounts[0].gardening === undefined) {
  console.error('❌ 브릿지(Code.gs)가 F열을 안 돌려줘요. 최신본으로 재배포한 뒤 다시 실행하세요.');
  console.error('   (배포 관리 → 기존 배포 편집 → 새 버전 → 배포)');
  process.exit(1);
}

let orders = [];
try { orders = await readOrders(campaign); } catch { orders = localOrders(campaign); }
const everOrdered = new Set(orders.map((o) => o.handle)); // 주문 이력 = 그때 가드닝 대상이었음

console.log(`캠페인: ${campaign.name} · 계정 ${accounts.length}개 · 주문 이력 있는 계정 ${everOrdered.size}개 · 기준 ${MIN.toLocaleString()}명\n`);

const fixes = [];
for (const a of accounts) {
  const cur = String(a.gardening || '').trim();
  const followers = num(a.sheetFollowers);
  const ordered = everOrdered.has(a.handle);

  if (cur === TARGET) continue; // 이미 대상 — 절대 안 건드림

  if (!cur) {
    // 빈칸 → 판단 근거가 있을 때만 기록한다.
    // 팔로워를 아직 모르는 계정(스캔 전)을 '가드닝 불필요'로 단정하면 안 된다.
    // 그런 칸은 그대로 비워두면 다음 스캔이 팔로워와 함께 올바르게 채운다(브릿지가 빈칸일 때만 씀).
    if (!ordered && followers == null) continue;
    const v = ordered || followers < MIN ? TARGET : NOT_TARGET;
    fixes.push({ row: a.row, handle: a.handle, from: '(빈칸)', to: v, why: ordered ? '주문 이력 있음' : `팔로워 ${followers}` });
  } else if (cur === NOT_TARGET && ordered) {
    // 덮어써진 기록 복원 — 주문했다면 그때 분명 대상이었다
    fixes.push({ row: a.row, handle: a.handle, from: NOT_TARGET, to: TARGET, why: `주문 이력 있음 (현재 팔로워 ${followers ?? '?'})` });
  }
}

if (!fixes.length) {
  console.log('✅ 고칠 게 없어요. 모든 기록이 온전합니다.');
  process.exit(0);
}

console.log(`${APPLY ? '적용할' : '바꿀 예정인'} 칸 ${fixes.length}개:\n`);
for (const f of fixes) {
  console.log(`  ${f.row}행 @${f.handle.padEnd(16)} ${f.from} → ${f.to}   (${f.why})`);
}

if (!APPLY) {
  console.log('\n미리보기입니다. 아무것도 안 바꿨어요.');
  console.log('실제로 적용하려면:  node scripts/backfill-gardening.js --apply');
  process.exit(0);
}

const cells = fixes.map((f) => ({ row: f.row, col: GARDENING_COL, value: f.to }));
const n = await pushCellsToSheet(campaign.sheet, cells);
console.log(`\n✅ ${n}칸 기록 복원 완료. 앞으로는 스캔해도 이 값이 안 바뀝니다.`);

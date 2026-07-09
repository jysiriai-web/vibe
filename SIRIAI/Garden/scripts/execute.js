// 집행(CLI) — 캠페인의 가드닝 필요 계정에 팔로워 주문. 중복방지 + 'yes' 확인.
//   node scripts/execute.js                    (기본 캠페인, 필요 계정 전부)
//   node scripts/execute.js @ruto__39          (특정 계정만)
//   CAMPAIGN=beiyon node scripts/execute.js     (캠페인 지정)
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';
import { getAccountsFromSheet } from '../src/sheet.js';
import { toHandle } from '../src/tiktok.js';
import { loadOrders, saveOrders, refreshOrders } from '../src/orders.js';
import { scanAccounts, buildPlan, placeOrders, findService } from '../src/execute-core.js';
import { defaultCampaign, getCampaign } from '../src/campaigns.js';

loadEnv();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = process.env.CAMPAIGN ? getCampaign(process.env.CAMPAIGN) : defaultCampaign();
if (!campaign) { console.error('\n❌ 캠페인 없음 (campaigns.json)\n'); process.exit(1); }

const key = process.env.SMMKINGS_API_KEY;
if (!key) { console.error('\n❌ SMMKINGS_API_KEY 없음\n'); process.exit(1); }
const smm = createSmm(key);

const catPath = join(root, 'data', 'smm-services.json');
if (!existsSync(catPath)) { console.error(`\n❌ 서비스 카탈로그 없음 — 'node scripts/verify-smm.js' 먼저\n`); process.exit(1); }
const svc = findService(JSON.parse(readFileSync(catPath, 'utf8')), campaign.serviceId);
if (!svc) { console.error(`\n❌ 서비스 #${campaign.serviceId} 정보 없음\n`); process.exit(1); }

const only = process.argv.slice(2).map(toHandle).filter(Boolean);
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}

console.log(`\n[캠페인: ${campaign.name}]`);
let orders = loadOrders(campaign.dataDir);
console.log('▶ 기존 주문 상태 갱신...');
orders = await refreshOrders(smm, orders);
saveOrders(campaign.dataDir, orders);
console.log(`  진행중 주문 ${orders.filter((o) => !o.done).length}건`);

console.log('\n▶ 시트 계정 읽고 현재 팔로워 확인 중...');
let accounts = await getAccountsFromSheet(campaign.sheet);
if (only.length) accounts = accounts.filter((a) => only.includes(a.handle));
const scanned = await scanAccounts(accounts, {
  onProgress: (a) => console.log(`  @${a.handle.padEnd(20)} ${a.current == null ? '❌' : a.current.toLocaleString()}`),
});

const balance = Number((await smm.balance()).balance);
const { toOrder, filling, errored, totalQty, totalCost } = buildPlan(scanned, orders, { target: campaign.target, min: campaign.min, service: svc });

console.log('\n════════ 집행 계획 ════════');
console.log(`서비스: #${campaign.serviceId}  ${svc.name}`);
console.log(`단가: $${svc.rate}/1k   |   잔액: $${balance}\n`);
if (filling.length) {
  console.log('⏳ 채워지는 중 (재주문 안 함):');
  filling.forEach((f) => console.log(`   @${f.handle}  현재 ${f.current} + 진행중 ${f.inFlight} = ${f.projected}  → 스킵`));
  console.log('');
}
if (errored.length) console.log(`❓ 팔로워 확인 실패(스킵): ${errored.map((e) => '@' + e.handle).join(', ')}\n`);
if (!toOrder.length) { console.log('✅ 지금 집행할 게 없어.\n'); process.exit(0); }

console.log('🛒 주문 예정:');
toOrder.forEach((o) => console.log(`   @${o.handle.padEnd(18)} 현재 ${String(o.current).padStart(5)}  →  ${o.qty}명 충전  ($${o.cost.toFixed(2)})`));
console.log(`\n   총 ${toOrder.length}개 계정 · ${totalQty}명 · 예상 $${totalCost.toFixed(2)}`);
if (totalCost > balance) { console.log(`\n❌ 잔액 부족.\n`); process.exit(1); }

const ans = await ask(`\n⚠️  실제로 주문 넣고 돈이 나가. 진행하려면 'yes' 입력: `);
if (ans.toLowerCase() !== 'yes') { console.log('\n취소했어.\n'); process.exit(0); }

console.log('\n▶ 주문 전송 중...');
await placeOrders(smm, orders, toOrder, svc, {
  persist: () => saveOrders(campaign.dataDir, orders), // 과금 직후 즉시 저장(중단 시 유실 방지)
  onEach: (r) => console.log(r.ok ? `  ✅ @${r.handle}  주문 #${r.id} (${r.qty}명)` : `  ❌ @${r.handle}  실패: ${r.error}`),
});
saveOrders(campaign.dataDir, orders);
console.log(`\n완료. 다음 집행 땐 채워지는 중이면 자동 스킵.\n`);

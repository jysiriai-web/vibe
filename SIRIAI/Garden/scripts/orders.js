// 주문 현황 보기(CLI) — SMM 상태 갱신 후 출력. 돈 안 나감.
//   node scripts/orders.js            (기본 캠페인)
//   CAMPAIGN=bayonn node scripts/orders.js
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';
import { loadOrders, saveOrders, refreshOrders } from '../src/orders.js';
import { defaultCampaign, getCampaign } from '../src/campaigns.js';

loadEnv();
const campaign = process.env.CAMPAIGN ? getCampaign(process.env.CAMPAIGN) : defaultCampaign();
if (!campaign) { console.error('\n❌ 캠페인 없음\n'); process.exit(1); }
const key = process.env.SMMKINGS_API_KEY;
if (!key) { console.error('\n❌ SMMKINGS_API_KEY 없음\n'); process.exit(1); }
const smm = createSmm(key);

let orders = loadOrders(campaign.dataDir);
if (!orders.length) { console.log(`\n[${campaign.name}] 주문 기록 없음.\n`); process.exit(0); }

console.log(`\n[${campaign.name}] ▶ 주문 상태 갱신 중...`);
orders = await refreshOrders(smm, orders);
saveOrders(campaign.dataDir, orders);

console.log('\n주문 현황:');
for (const o of orders) {
  const mark = o.done ? '✅ 완료' : '⏳ 진행중';
  const delivered = o.quantity - (Number(o.remains) || 0);
  console.log(`  #${o.id}  @${(o.handle || '').padEnd(18)} ${String(o.quantity).padStart(5)}명  |  배송 ${delivered}/${o.quantity} (잔여 ${o.remains})  |  ${o.status || '?'}  ${mark}`);
}
console.log(`\n총 ${orders.length}건 · 진행중 ${orders.filter((o) => !o.done).length}건\n`);

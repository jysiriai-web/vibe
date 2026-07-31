// 주문 현황 보기(CLI) — SMM 상태 갱신 후 출력. 돈 안 나감.
//   node scripts/orders.js            (기본 캠페인)
//   CAMPAIGN=bayonn node scripts/orders.js
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';
import { refreshOrders } from '../src/orders.js';
// 로컬 파일만 보면 시트에 있는 주문이 현황에서 통째로 빠진다 — 서버와 같은 원장을 본다.
import { readOrders, writeOrders } from '../src/store.js';
import { defaultCampaign, getCampaign } from '../src/campaigns.js';

loadEnv();
const campaign = process.env.CAMPAIGN ? getCampaign(process.env.CAMPAIGN) : defaultCampaign();
if (!campaign) { console.error('\n❌ 캠페인 없음\n'); process.exit(1); }
const key = process.env.SMMKINGS_API_KEY;
if (!key) { console.error('\n❌ SMMKINGS_API_KEY 없음\n'); process.exit(1); }
const smm = createSmm(key);

// 못 읽었는데 '기록 없음'으로 찍으면 진짜 없는 것과 구분이 안 된다 → 정직하게 실패로 끝낸다.
let orders;
try {
  orders = await readOrders(campaign);
} catch (e) {
  console.error(`\n❌ 주문 기록을 읽지 못했어(${e.message}). 아래 현황은 믿을 수 없어서 출력하지 않아.\n`);
  process.exit(1);
}
if (!orders.length) { console.log(`\n[${campaign.name}] 주문 기록 없음.\n`); process.exit(0); }

console.log(`\n[${campaign.name}] ▶ 주문 상태 갱신 중...`);
orders = await refreshOrders(smm, orders);
{
  const w = await writeOrders(campaign, orders);
  if (!w.durable) console.error(`  ⚠️ 갱신한 상태를 저장하지 못했어: ${w.localError || ''} ${w.sheetError || ''}`);
  else if (w.sheet === 'fail') console.error(`  ⚠️ 시트 기록 실패(로컬엔 저장됨): ${w.sheetError}`);
}

console.log('\n주문 현황:');
for (const o of orders) {
  const mark = o.done ? '✅ 완료' : '⏳ 진행중';
  const delivered = o.quantity - (Number(o.remains) || 0);
  console.log(`  #${o.id}  @${(o.handle || '').padEnd(18)} ${String(o.quantity).padStart(5)}명  |  배송 ${delivered}/${o.quantity} (잔여 ${o.remains})  |  ${o.status || '?'}  ${mark}`);
}
console.log(`\n총 ${orders.length}건 · 진행중 ${orders.filter((o) => !o.done).length}건\n`);

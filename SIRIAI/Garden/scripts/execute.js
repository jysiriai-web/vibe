// 집행(CLI) — 캠페인의 가드닝 필요 계정에 팔로워 주문. 중복방지 + 'yes' 확인.
//   node scripts/execute.js                    (기본 캠페인, 필요 계정 전부)
//   node scripts/execute.js @ruto__39          (특정 계정만)
//   CAMPAIGN=bayonn node scripts/execute.js     (캠페인 지정)
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';
import { getAccountsFromSheet } from '../src/sheet.js';
import { toHandle } from '../src/tiktok.js';
import { refreshOrders } from '../src/orders.js';
// 주문(돈) 원장은 서버와 같은 상태 계층을 타야 한다. 로컬 파일만 보면 시트에 있는
// 진행중 주문을 못 봐서 같은 계정에 또 과금된다.
import { readOrders, writeOrders } from '../src/store.js';
import { scanAccounts, buildPlan, placeOrders, findService, tiktokOnly } from '../src/execute-core.js';
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
/* 어떤 서비스로 살지는 대시보드에서 고른 값(_state.svcPick)이 먼저다.
   ⚠️ 예전엔 campaigns.json 의 옛 serviceId 만 봤다. 대시보드에서 #3697($3.352)로 바꿔도
   이 스크립트는 #3776($11.50)으로 주문했다 — 3.4배다. 서버의 svcSig 409 가드는
   /api/execute 전용이라 이 경로를 전혀 막지 못한다.
   시트를 못 읽으면 '설정값으로 진행' 하지 않는다. 과금 직전이고, 조용한 폴백이 바로 그 사고다. */
let serviceId = campaign.serviceId;
try {
  const { readStateFromSheet } = await import('../src/sheet.js');
  const st = await readStateFromSheet(campaign.sheet);
  const pick = st && st.svcPick && st.svcPick.tk;
  if (pick && pick.id != null) serviceId = Number(pick.id);
  else if (campaign.serviceIds && campaign.serviceIds.tk != null) serviceId = Number(campaign.serviceIds.tk);
} catch (e) {
  console.error(`\n❌ 서비스 선택을 시트에서 못 읽었어요 — 옛 번호로 주문하지 않습니다.\n   ${(e && e.message) || e}\n`);
  process.exit(1);
}
const svc = findService(JSON.parse(readFileSync(catPath, 'utf8')), serviceId);
if (!svc) { console.error(`\n❌ 서비스 #${serviceId} 정보 없음\n`); process.exit(1); }

const only = process.argv.slice(2).map(toHandle).filter(Boolean);
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}

console.log(`\n[캠페인: ${campaign.name}]`);
// 원장을 못 읽으면 진행중 주문이 0건으로 보여 이미 채워지는 계정에 또 주문한다 → 집행 자체를 시작하지 않는다.
let orders;
try {
  orders = await readOrders(campaign);
} catch (e) {
  console.error(`\n❌ 주문 기록을 읽지 못했어(${e.message}). 낡은 데이터로 집행하면 이중지출이라 멈춰.\n`);
  process.exit(1);
}
console.log('▶ 기존 주문 상태 갱신...');
orders = await refreshOrders(smm, orders);
{
  // 아직 과금 전이라 저장 실패로 멈추진 않지만, 조용히 넘기지도 않는다.
  const w = await writeOrders(campaign, orders);
  if (!w.durable) console.error(`  ⚠️ 갱신한 주문 상태를 어디에도 저장 못 했어: ${w.localError || ''} ${w.sheetError || ''}`);
  else if (w.sheet === 'fail') console.error(`  ⚠️ 시트 기록 실패(로컬엔 저장됨): ${w.sheetError}`);
}
console.log(`  진행중 주문 ${orders.filter((o) => !o.done).length}건`);

console.log('\n▶ 시트 계정 읽고 현재 팔로워 확인 중...');
let accounts = await getAccountsFromSheet(campaign.sheet);
// 서버 /api/execute 와 같은 규칙. 없으면 인스타 핸들로 틱톡을 긁어 남의 계정에 돈이 나간다.
const _igOnly = accounts.length - tiktokOnly(accounts).length;
accounts = tiktokOnly(accounts);
if (_igOnly) console.log(`  (인스타 전용 행 ${_igOnly}건 제외)`);
if (only.length) accounts = accounts.filter((a) => only.includes(a.handle));
const scanned = await scanAccounts(accounts, {
  onProgress: (a) => console.log(`  @${a.handle.padEnd(20)} ${a.current == null ? '❌' : a.current.toLocaleString()}`),
});

const balance = Number((await smm.balance()).balance);
const { toOrder, filling, errored, totalQty, totalCost } = buildPlan(scanned, orders, { target: campaign.target, min: campaign.min, service: svc });

console.log('\n════════ 집행 계획 ════════');
console.log(`서비스: #${serviceId}  ${svc.name}`);
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
try {
  await placeOrders(smm, orders, toOrder, svc, {
    // writeOrders 는 {durable} 을 돌려준다 — execute-core 의 '기록 실패 시 배치 중단' 가드가
    // 여기서도 살아나려면 반드시 반환값이 있어야 한다(saveOrders 는 undefined 라 죽어 있었다).
    persist: () => writeOrders(campaign, orders), // 과금 직후 즉시 저장(중단 시 유실 방지)
    onEach: (r) => console.log(r.ok ? `  ✅ @${r.handle}  주문 #${r.id} (${r.qty}명)` : `  ❌ @${r.handle}  실패: ${r.error}`),
  });
} catch (e) {
  console.error(`\n❌ ${e.message}\n   이미 나간 주문: ${(e.placed || []).map((p) => '#' + p.id + ' @' + p.handle).join(', ') || '없음'}\n`);
  const w = await writeOrders(campaign, orders);
  if (!w.durable) console.error('⚠️ 그 주문 기록도 저장하지 못했어. smmkings 패널에서 직접 확인해.\n');
  process.exit(1);
}
{
  const w = await writeOrders(campaign, orders);
  if (!w.durable) console.error('\n⚠️ 주문은 나갔는데 기록에 실패했어. smmkings 패널에서 직접 확인해.\n');
  else if (w.sheet === 'fail') console.error(`\n⚠️ 로컬엔 저장됐지만 시트 기록 실패: ${w.sheetError} — 대시보드를 한 번 열어 동기화해.\n`);
}
console.log(`\n완료. 다음 집행 땐 채워지는 중이면 자동 스킵.\n`);

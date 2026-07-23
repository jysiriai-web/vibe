// 수기 집행 기록 — 대시보드 밖(다른 패널·직접 주문)에서 넣은 주문을 원장에 남긴다.
//
// 왜 필요한가: 기록이 없으면 대시보드는 그 계정을 '아직 충전 안 됨'으로 보고
// 다음 집행에서 또 산다(이중지출). 반대로 아무렇게나 넣으면 상태 폴링이 남의
// 패널 주문번호를 우리 패널에 물어보게 된다.
//
// 그래서 이 기록은 id 를 비운다:
//   · id:null  → refreshOrders(orders.js:30 `o.id &&`)가 건드리지 않는다 = 엉뚱한 패널에 안 묻는다
//   · remains  → inFlightFor 가 진행중으로 세서 재주문을 막는다
//   · extIds   → 사람이 나중에 그 패널에서 직접 조회할 주문번호
//
//   node scripts/add-manual-order.js --campaign lun8 --handle zn09_k2 --plat ig \
//        --qty 600 --krw 9000 --panel realsite --ids 77202568,77202595 [--note "..."]
import { loadEnv } from '../src/env.js';
import { getCampaign } from '../src/campaigns.js';
import { readOrders, writeOrders } from '../src/store.js';

loadEnv();

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const campaignId = arg('campaign', 'lun8');
const handle = String(arg('handle', '')).replace(/^@/, '');
const plat = arg('plat', 'ig');
const qty = Number(arg('qty', 0));
const krw = Number(arg('krw', 0));
const panel = arg('panel', '수기');
const ids = String(arg('ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
const note = arg('note', '');

if (!handle || !qty) {
  console.error('\n❌ --handle 과 --qty 는 필수입니다.');
  console.error('   예: node scripts/add-manual-order.js --handle zn09_k2 --plat ig --qty 600 --krw 9000 --panel realsite --ids 77202568,77202595\n');
  process.exit(1);
}

const campaign = getCampaign(campaignId);
if (!campaign) { console.error(`\n❌ 캠페인 '${campaignId}' 을 못 찾았어요.\n`); process.exit(1); }

let orders;
try { orders = await readOrders(campaign); }
catch (e) { console.error(`\n❌ 주문 기록을 못 읽었어요(${e.message}). 낡은 기록 위에 쓰면 위험해서 멈춥니다.\n`); process.exit(1); }

// 같은 계정·같은 플랫폼에 이미 진행중인 게 있으면 알린다 — 두 번 적어 두 배로 세면 그것도 사고다.
const dup = orders.filter((o) => o.handle === handle && !o.done && !o.abandoned && (!o.plat || o.plat === plat));
if (dup.length) {
  console.error(`\n⚠️ 이미 진행중으로 기록된 주문이 있어요 (${dup.length}건):`);
  dup.forEach((o) => console.error(`   ${o.id ? '#' + o.id : (o.extIds || []).join(',') || o.uid} · ${o.quantity}명 · remains ${o.remains}`));
  console.error('   그래도 넣으려면 --force 를 붙이세요.\n');
  if (!argv.includes('--force')) process.exit(1);
}

const rec = {
  id: null,                       // 우리 패널 주문이 아니다 — 상태 조회 대상에서 뺀다
  uid: `manual-${plat}-${handle}-${qty}-${orders.length}`,
  manual: true,
  panel,                          // 어디서 샀는지(사람이 읽는 값)
  extIds: ids,                    // 그 패널에서 조회할 주문번호
  handle,
  plat,
  quantity: qty,
  remains: qty,                   // 진행중으로 세어 재주문을 막는다
  costKrw: krw || undefined,      // 수기 집행은 원화로 적는다(패널마다 통화가 다르다)
  status: 'manual',
  done: false,
  note: note || undefined,
  placedAt: new Date().toISOString(),
};
orders.push(rec);

const w = await writeOrders(campaign, orders);
if (!w.durable) { console.error('\n❌ 기록에 실패했어요. 다시 시도해 주세요.\n'); process.exit(1); }
if (w.sheet === 'fail') console.error('⚠️ 시트에는 아직 안 올라갔어요(로컬엔 저장됨):', w.sheetError);

console.log(`\n✅ 수기 집행 기록 완료`);
console.log(`   @${handle} · ${plat === 'ig' ? '인스타' : '틱톡'} · ${qty.toLocaleString()}명 · ${panel}`);
if (ids.length) console.log(`   주문번호: ${ids.join(', ')}`);
if (krw) console.log(`   금액: ${krw.toLocaleString()}원`);
console.log(`   → 이 계정은 다음 집행에서 자동으로 빠집니다(진행중으로 셈).`);
console.log(`   → 채워진 걸 확인하면 대시보드 가드닝 → 집행 내역에서 '완료 처리' 해주세요.\n`);

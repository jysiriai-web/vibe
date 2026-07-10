// 상태 시드 + 검증 (호스팅 1단계, 일회성) — 로컬 data/c/<id>/ 의 주문·검수잠금·베스트를
// 시트 _orders/_state 탭으로 밀어넣고, 곧바로 되읽어 로컬과 1:1 일치하는지 대조한다.
// 읽기만 하고 로컬 파일은 절대 건드리지 않는다. 브릿지 upsert 는 행을 지우지 않는다.
//
//   node scripts/seed-state.js            (기본 캠페인)
//   CAMPAIGN=bayonn node scripts/seed-state.js
//   node scripts/seed-state.js --dry      (밀어넣지 않고 현재 시트 상태만 대조)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { listCampaigns, getCampaign } from '../src/campaigns.js';
import { getOrders, putOrders, getState, putOverrides, putBest } from '../src/state.js';
import { eq, diffOrders } from '../src/state-diff.js';

loadEnv();
const DRY = process.argv.includes('--dry');
const id = process.env.CAMPAIGN;
const campaign = id ? getCampaign(id) : listCampaigns()[0];
if (!campaign) { console.error('캠페인 없음'); process.exit(1); }

const readJson = (f, dflt) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : dflt);

const dir = campaign.dataDir;
const localOrders = readJson(join(dir, 'orders.json'), []);
const localOverrides = readJson(join(dir, 'overrides.json'), {});
const localBest = readJson(join(dir, 'best.json'), []);

console.log(`캠페인: ${campaign.name} (${campaign.id})`);
console.log(`로컬: 주문 ${localOrders.length}건 · overrides ${Object.keys(localOverrides).length}행 · best ${localBest.length}개`);
console.log(DRY ? '모드: --dry (밀어넣지 않고 대조만)\n' : '');

let fail = false;
let ordersVerified = false; // 주문(돈) 왕복이 실제로 검증됐는가
try {
  if (!DRY) {
    console.log('── 시드(밀어넣기) ──');
    // state 를 먼저, 주문(돈)을 나중에 — 중간 실패 시 돈 로그가 안 써진 상태로 남아 재실행이 깔끔하다.
    // upsert 는 id 유일키라 재실행해도 중복되지 않는다(멱등).
    console.log('  overrides 쓰기:', await putOverrides(campaign.sheet, localOverrides));
    console.log('  best 쓰기:', await putBest(campaign.sheet, localBest));
    console.log('  주문 upsert:', await putOrders(campaign.sheet, localOrders), '건');
  }

  console.log('\n── 되읽어 대조 ──');
  const remoteOrders = await getOrders(campaign.sheet);
  const remoteState = await getState(campaign.sheet);

  // 1) 주문: 유실·유령·타입 변환 검사 (charge 문자열, remains 빈값이 0 으로 바뀌지 않아야 함)
  const problems = diffOrders(localOrders, remoteOrders);
  if (problems.length) { fail = true; console.log('  ✗ 주문 불일치:'); problems.forEach((p) => console.log('     -', p)); }
  else if (!localOrders.length && !remoteOrders.length) {
    // 주문이 0건이면 돈 왕복 경로(upsert→_json→되읽기)가 한 번도 실행되지 않는다 → 통과로 간주 금지
    console.log('  ⚠ 주문 0건 — 돈 왕복 경로가 검증되지 않았습니다(공허한 통과).');
  } else {
    ordersVerified = true;
    console.log(`  ✓ 주문 ${localOrders.length}건 양방향 일치 (유실·유령 없음, charge 문자열·remains 빈값 보존)`);
  }

  // 2) overrides / best
  if (!eq(localOverrides, remoteState.overrides)) { fail = true; console.log('  ✗ overrides 불일치'); }
  else console.log('  ✓ overrides 일치');
  if (!eq(localBest, remoteState.best)) { fail = true; console.log('  ✗ best 불일치'); }
  else console.log('  ✓ best 일치');

  // 3) 멱등성: 같은 주문을 한 번 더 upsert 해도 행이 늘지 않아야 함(append-only upsert)
  if (!DRY && localOrders.length) {
    console.log('\n── 멱등성(같은 id 재-upsert → 행 안 늘어남) ──');
    await putOrders(campaign.sheet, localOrders);
    const again = await getOrders(campaign.sheet);
    if (again.length !== remoteOrders.length) {
      fail = true;
      console.log(`  ✗ 행 수 변함: ${remoteOrders.length} → ${again.length} (중복 append!)`);
    } else {
      console.log(`  ✓ 재실행해도 ${again.length}건 유지 (중복 없음, 기존 돈 기록 보존)`);
    }
  }
} catch (err) {
  fail = true;
  console.error('\n오류:', err.message);
  console.error('→ 브릿지(Code.gs)를 최신본으로 재배포했는지 확인하세요 (배포 관리 → 편집 → 새 버전).');
  console.error('→ 로컬 파일은 읽기만 했으므로 안전합니다. upsert 는 멱등이라 이 스크립트를 그대로 다시 실행해도 됩니다.');
}

if (fail) console.log('\n❌ 검증 실패 — 2단계로 넘어가지 마세요.');
else if (!ordersVerified) console.log('\n⚠️ 부분 통과 — overrides/best 는 일치하나 주문(돈) 왕복이 미검증입니다. 주문이 생긴 뒤 다시 실행하세요.');
else console.log('\n✅ 검증 통과 — 시트가 로컬과 양방향 1:1. 로컬 대시보드는 그대로 동작합니다.');
process.exit(fail || !ordersVerified ? 1 : 0);

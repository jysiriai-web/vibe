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

loadEnv();
const DRY = process.argv.includes('--dry');
const id = process.env.CAMPAIGN;
const campaign = id ? getCampaign(id) : listCampaigns()[0];
if (!campaign) { console.error('캠페인 없음'); process.exit(1); }

const readJson = (f, dflt) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : dflt);

// 키 순서·타입까지 비교하기 위한 정규화(재귀적 키 정렬). undefined 는 JSON 에 없는 것과 동일 취급.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) { if (v[k] !== undefined) out[k] = canon(v[k]); }
    return out;
  }
  return v;
}
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// 주문 배열을 id 기준 맵으로 (순서 무관 비교)
const byId = (arr) => Object.fromEntries((arr || []).map((o) => [String(o.id), o]));

function diffOrders(local, remote) {
  const L = byId(local), R = byId(remote);
  const problems = [];
  for (const k of Object.keys(L)) {
    if (!(k in R)) { problems.push(`#${k} 시트에 없음(유실!)`); continue; }
    if (!eq(L[k], R[k])) {
      const fields = new Set([...Object.keys(L[k]), ...Object.keys(R[k])]);
      for (const f of fields) {
        if (!eq(L[k][f], R[k][f])) {
          problems.push(`#${k}.${f}: 로컬=${JSON.stringify(L[k][f])}(${typeof L[k][f]}) ≠ 시트=${JSON.stringify(R[k][f])}(${typeof R[k][f]})`);
        }
      }
    }
  }
  return problems;
}

const dir = campaign.dataDir;
const localOrders = readJson(join(dir, 'orders.json'), []);
const localOverrides = readJson(join(dir, 'overrides.json'), {});
const localBest = readJson(join(dir, 'best.json'), []);

console.log(`캠페인: ${campaign.name} (${campaign.id})`);
console.log(`로컬: 주문 ${localOrders.length}건 · overrides ${Object.keys(localOverrides).length}행 · best ${localBest.length}개`);
console.log(DRY ? '모드: --dry (밀어넣지 않고 대조만)\n' : '');

let fail = false;
try {
  if (!DRY) {
    console.log('── 시드(밀어넣기) ──');
    console.log('  주문 upsert:', await putOrders(campaign.sheet, localOrders), '건');
    console.log('  overrides 쓰기:', await putOverrides(campaign.sheet, localOverrides));
    console.log('  best 쓰기:', await putBest(campaign.sheet, localBest));
  }

  console.log('\n── 되읽어 대조 ──');
  const remoteOrders = await getOrders(campaign.sheet);
  const remoteState = await getState(campaign.sheet);

  // 1) 주문: 유실·타입 변환 검사 (charge 문자열, remains 빈값이 0 으로 바뀌지 않아야 함)
  const problems = diffOrders(localOrders, remoteOrders);
  if (problems.length) { fail = true; console.log('  ✗ 주문 불일치:'); problems.forEach((p) => console.log('     -', p)); }
  else console.log(`  ✓ 주문 ${localOrders.length}건 전부 글자단위 일치 (charge 문자열·remains 빈값 보존)`);

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
}

console.log('\n' + (fail ? '❌ 검증 실패 — 2단계로 넘어가지 마세요.' : '✅ 검증 통과 — 시트가 로컬과 1:1. 로컬 대시보드는 그대로 동작합니다.'));
process.exit(fail ? 1 : 0);

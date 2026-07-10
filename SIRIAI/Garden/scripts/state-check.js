// 상태 패리티 게이트 (호스팅 2단계) — 로컬 파일과 시트를 각각 읽어,
// '돈 로직'이 양쪽에서 완전히 똑같은 답을 내는지 증명한다. 읽기만 하고 아무것도 안 쓴다.
//
// 검사 항목
//  1) 주문 목록이 양방향 1:1 (유실·유령 없음, 타입 보존)
//  2) 계정별 '진행중 수량'(inFlightFor)이 로컬 == 시트   ← 틀리면 이중지출
//  3) '무엇을 얼마나 살지'(buildPlan)가 로컬 == 시트       ← 틀리면 과주문/미주문
//  4) remains 불명(빈값)이면 0 이 아니라 주문수량 전체를 진행중으로 보수처리하는지
//  5) overrides / best 일치
//
//   node scripts/state-check.js
//   CAMPAIGN=bayonn node scripts/state-check.js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { listCampaigns, getCampaign } from '../src/campaigns.js';
import { localOrders, localOverrides, localBest } from '../src/store.js';
import { getOrders, getState } from '../src/state.js';
import { inFlightFor } from '../src/orders.js';
import { buildPlan, findService } from '../src/execute-core.js';
import { diffOrders, eq } from '../src/state-diff.js';

loadEnv();
const id = process.env.CAMPAIGN;
const campaign = id ? getCampaign(id) : listCampaigns()[0];
if (!campaign) { console.error('캠페인 없음'); process.exit(1); }

let fail = false;
const t = (name, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail = true; };

const catalog = () => { const p = join(process.cwd(), 'data', 'smm-services.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []; };
const scanned = () => { const p = join(campaign.dataDir, 'scan-latest.json'); if (!existsSync(p)) return []; const d = JSON.parse(readFileSync(p, 'utf8')); return d.accounts || d.results || []; };

console.log(`캠페인: ${campaign.name} (${campaign.id})\n`);

try {
  const L = localOrders(campaign);
  const R = await getOrders(campaign.sheet);
  const lState = { overrides: localOverrides(campaign), best: localBest(campaign) };
  const rState = await getState(campaign.sheet);

  console.log(`── 1) 주문 목록 (로컬 ${L.length}건 / 시트 ${R.length}건) ──`);
  const problems = diffOrders(L, R);
  t('양방향 1:1 (유실·유령·타입변환 없음)', problems.length === 0);
  problems.forEach((p) => console.log('     -', p));

  console.log('\n── 2) 계정별 진행중 수량 (inFlightFor) ──');
  const handles = [...new Set([...L, ...R].map((o) => o.handle))];
  let mismatch = 0;
  for (const h of handles) {
    const a = inFlightFor(L, h), b = inFlightFor(R, h);
    if (a !== b) { mismatch++; console.log(`     ✗ @${h}: 로컬=${a} ≠ 시트=${b}`); }
  }
  t(`${handles.length}개 계정 전부 동일`, mismatch === 0);

  console.log('\n── 3) 집행 계획 (buildPlan) ──');
  const svc = findService(catalog(), campaign.serviceId);
  const acc = scanned();
  if (!svc || !acc.length) {
    console.log('     (스캔값 또는 서비스 정보 없음 — 계획 비교 생략)');
  } else {
    const opt = { target: campaign.target, min: campaign.min, service: svc };
    const pl = buildPlan(acc, L, opt), pr = buildPlan(acc, R, opt);
    const norm = (p) => JSON.stringify((p.toOrder || []).map((o) => [o.handle, o.qty]).sort());
    t('주문 대상·수량 동일', norm(pl) === norm(pr), `${(pl.toOrder || []).length}건`);
    t('총 비용 동일', Math.abs((pl.totalCost || 0) - (pr.totalCost || 0)) < 1e-9);
    t('채워지는중(재주문 제외) 동일', eq((pl.filling || []).map((f) => f.handle).sort(), (pr.filling || []).map((f) => f.handle).sort()));
  }

  console.log('\n── 4) remains 불명 시 보수처리 (0 이 아니라 주문수량 전체) ──');
  const blank = [{ handle: 'x', quantity: 700, done: false }]; // remains 키 없음
  t('remains 없음 → 진행중 700 (0 아님)', inFlightFor(blank, 'x') === 700);
  const blank2 = [{ handle: 'x', quantity: 700, remains: null, done: false }];
  t('remains null → 진행중 700 (0 아님)', inFlightFor(blank2, 'x') === 700);

  console.log('\n── 5) overrides / best ──');
  t('overrides 일치', eq(lState.overrides, rState.overrides), `${Object.keys(lState.overrides).length}행`);
  t('best 일치', eq(lState.best, rState.best));
} catch (err) {
  fail = true;
  console.error('\n오류:', err.message);
}

console.log('\n' + (fail
  ? '❌ 패리티 실패 — GARDEN_STATE=sheet 로 전환하지 마세요.'
  : '✅ 패리티 통과 — 저장 위치를 시트로 바꿔도 돈 계산이 동일합니다.'));
process.exit(fail ? 1 : 0);

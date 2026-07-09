// 라이브 동기화(CLI) — 모든 캠페인 순회: 시트 읽고 스캔 → 되쓰기 → scan-latest.json.
// 3시간 자동 스케줄(run-sync.bat)이 이걸 실행.
//   node scripts/sync.js
import { loadEnv } from '../src/env.js';
import { runSync } from '../src/sync-core.js';
import { classify } from '../src/garden.js';
import { listCampaigns } from '../src/campaigns.js';

loadEnv();
const full = process.argv.includes('--full');
const campaigns = listCampaigns();
if (!campaigns.length) { console.error('\ncampaigns.json 에 캠페인이 없습니다.\n'); process.exit(1); }

for (const campaign of campaigns) {
  console.log(`\n▶ [${campaign.name}] 시트 읽고 팔로워 확인 → 되쓰기${full ? ' (전체)' : ' (미완료만)'}...\n`);
  const res = await runSync(campaign, {
    full,
    onProgress: (a) =>
      console.log(`  ${String(a.company || '').padEnd(6)} @${a.handle.padEnd(20)} ${a.current == null ? '❌' : a.current.toLocaleString().padStart(8)}`),
  });
  console.log(`  ✅ 시트 ${res.written}개 갱신${res.nicksWritten ? ` · 닉네임 ${res.nicksWritten}개 자동채움` : ''}`);
  const needs = res.accounts
    .filter((a) => a.current != null)
    .map((a) => ({ handle: a.handle, current: a.current, ...classify(a.current, { target: campaign.target, min: campaign.min }) }))
    .filter((x) => x.status === 'needs');
  console.log(`  총 ${res.accounts.length}개  |  ⚠️ 가드닝 필요 ${needs.length}`);
  needs.forEach((n) => console.log(`     @${n.handle.padEnd(20)} 현재 ${String(n.current).padStart(6)} → ${n.order} 충전`));
}
console.log('');

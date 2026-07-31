// 콘텐츠·성과 스캔(CLI) — content-scan.bat 이 이걸 실행. (대시보드 '콘텐츠 스캔' 버튼과 동일 로직)
//   node scripts/scan-content.js
import { loadEnv } from '../src/env.js';
import { defaultCampaign, getCampaign } from '../src/campaigns.js';
import { runContentScan } from '../src/content-core.js';

loadEnv();
const full = process.argv.includes('--full');
const campaign = process.env.CAMPAIGN ? getCampaign(process.env.CAMPAIGN) : defaultCampaign();
if (!campaign) { console.error('\n❌ 캠페인 없음\n'); process.exit(1); }

console.log(`\n[${campaign.name}] 콘텐츠·성과 스캔`);
console.log(`  캠페인 음원 id ${campaign.campaignSoundId || '(없음)'} / 해시태그 ${(campaign.campaignHashtags || []).join(', ')}\n`);

let res;
try {
  res = await runContentScan(campaign, {
    full,
    onProgress: (p) => console.log(`  [${p.done}/${p.total}] @${p.handle} ${p.uploaded ? '✅ 업로드' : '⬜'}`),
  });
} catch (e) {
  console.error(`\n❌ 실패 (Playwright 미설치?): ${e.message}\n   install-playwright.bat 먼저 실행하세요.\n`);
  process.exit(1);
}
console.log(`\n완료 — 업로드 ${res.up}/${res.total} · 시트 ${res.written}칸 기록.`);
console.log('대시보드 새로고침하면 ②업로드·④납품에 반영됨.\n');

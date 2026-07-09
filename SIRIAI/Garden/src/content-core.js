// 콘텐츠·성과 스캔 공용 로직 — CLI(scan-content.js)와 대시보드 버튼(server.js)이 공유.
// 최적화(#7): 아직 업로드 안 감지된 계정만 긁음. 이미 업로드된 건 이전 결과 유지. full=true면 전체 재스캔.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushCellsToSheet } from './sheet.js';
import { detectCampaign } from './content-detect.js';
import { launchBrowser, fetchVideos } from './tiktok-videos.js';
import { loadOverrides, isLocked } from './overrides.js';

function prevDetected(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
}

export async function runContentScan(campaign, { onProgress, full = false } = {}) {
  const cfg = { hashtags: campaign.campaignHashtags || [], soundId: campaign.campaignSoundId || '' };
  const accounts = await getAccountsFromSheet(campaign.sheet);
  const prev = prevDetected(campaign);

  // 스캔 대상: 아직 업로드 감지 안 된 계정만. full이면 전체.
  const targets = full ? accounts : accounts.filter((a) => !(prev[a.handle] && prev[a.handle].uploaded));

  const { browser, ctx } = await launchBrowser(); // Playwright 미설치면 throw
  const detected = { ...prev }; // 이미 업로드된 건 이전 결과 유지
  let done = 0;
  let newUp = 0;
  try {
    for (const a of targets) {
      let videos = [];
      try { videos = await fetchVideos(ctx, a.handle); } catch {}
      const d = detectCampaign(videos, cfg);
      detected[a.handle] = d;
      if (d.uploaded && !(prev[a.handle] && prev[a.handle].uploaded)) newUp++;
      done++;
      if (onProgress) onProgress({ done, total: targets.length, handle: a.handle, uploaded: !!d.uploaded });
    }
  } finally {
    try { await browser.close(); } catch {}
  }

  const totalUp = Object.values(detected).filter((d) => d && d.uploaded).length;

  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, 'detected.json'), JSON.stringify({ ranAt: new Date().toISOString(), detected }, null, 2));

  // 감지 결과 → 시트 되쓰기: 이번에 스캔한 대상 중 업로드된 것만 (17콘텐츠·19음원·21해시태그·27~30성과)
  // 수동 잠금(overrides)된 검수/콘텐츠 셀(17·19·20·21)은 덮어쓰지 않음 = '수동 우선'.
  const overrides = loadOverrides(campaign.dataDir);
  const cells = [];
  const putIf = (r, col, value) => { if (!isLocked(overrides, r, col)) cells.push({ row: r, col, value }); };
  for (const a of targets) {
    const d = detected[a.handle];
    if (!d || !d.uploaded || !a.row) continue;
    const r = a.row;
    putIf(r, 17, d.contentLink);
    putIf(r, 19, d.soundOk ? '사용 확인' : '음원 다름');
    putIf(r, 21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
    // 성과 수치(27~30)는 잠금 대상 아님 — 항상 최신으로 갱신.
    cells.push({ row: r, col: 27, value: d.views });
    cells.push({ row: r, col: 28, value: d.likes });
    cells.push({ row: r, col: 29, value: d.comments });
    cells.push({ row: r, col: 30, value: d.shares });
  }
  let written = 0;
  if (cells.length) {
    try { written = await pushCellsToSheet(campaign.sheet, cells); } catch {}
  }
  return { total: targets.length, scanned: targets.length, up: totalUp, newUp, written };
}

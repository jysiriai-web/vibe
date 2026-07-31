// 작업 실행기 — 버스에서 꺼낸 job 을 기존 '스캔 두뇌'로 넘긴다. 스캔 로직은 한 줄도 새로 안 짠다.
// 재사용 함수(전부 src/content-core.js):
//   runContentScan  — 업로드/전체/조회수(perf) 스캔. 결과를 pushCellsToSheet 로 마스터 시트에 되쓴다.
//   scanOneProfile  — 계정 1개 프로필만 확인(빠른 개별 스캔).
//   judgeOneLink    — 영상 링크 1장만 열어 판정(프로필이 막힐 때 수기 대체).
// 캠페인은 기존 campaigns.js(campaigns.json) 그대로. 워커는 CLOUD 아님 → 로컬 모드로 동작.
import { getCampaign, listCampaigns } from '../../src/campaigns.js';
import { runContentScan, scanOneProfile, judgeOneLink } from '../../src/content-core.js';

export function resolveCampaign(id) {
  const c = id ? getCampaign(id) : listCampaigns()[0];
  if (!c) throw new Error(`캠페인을 못 찾았어요: ${id || '(기본)'} — campaigns.json 확인.`);
  return c;
}

// hooks = { onWarmup, waitForGo, onProgress, shouldPause, onBlocked } — server.js 의 상태기계와 동일 계약.
export async function runJob(job, hooks) {
  const campaign = resolveCampaign(job.campaign);
  const type = job.type || 'content-scan';

  if (type === 'content-scan') {
    const full = job.mode === 'full';
    const perf = job.mode === 'perf';
    // 기존 server.js /api/content-scan 이 넘기던 콜백을 그대로 전달 → 진행/인증/막힘 게이트가 시트/화면으로 미러됨.
    return await runContentScan(campaign, {
      full, perf,
      onWarmup: hooks.onWarmup,
      waitForGo: hooks.waitForGo,
      onProgress: hooks.onProgress,
      shouldPause: hooks.shouldPause,
      onBlocked: hooks.onBlocked,
    });
  }
  if (type === 'scan-one') {
    if (!job.row || !job.handle) throw new Error('scan-one 에는 row·handle 이 필요해요.');
    return await scanOneProfile(campaign, { row: job.row, handle: job.handle });
  }
  if (type === 'judge-link') {
    if (!job.row || !job.link) throw new Error('judge-link 에는 row·link 가 필요해요.');
    return await judgeOneLink(campaign, { row: job.row, handle: job.handle, link: job.link });
  }
  throw new Error('알 수 없는 작업 유형: ' + type);
}

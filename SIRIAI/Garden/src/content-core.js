// 콘텐츠·성과 스캔 공용 로직 — CLI(scan-content.js)와 대시보드 버튼(server.js)이 공유.
// 최적화(#7): 아직 업로드 안 감지된 계정만 긁음. 이미 업로드된 건 이전 결과 유지. full=true면 전체 재스캔.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushCellsToSheet } from './sheet.js';
import { detectCampaign, videoIdFromLink } from './content-detect.js';
import { launchBrowser, fetchVideos, fetchVideoByLink } from './tiktok-videos.js';
import { isLocked } from './overrides.js';
import { readOverrides } from './store.js';

function prevDetected(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
}

// onWait: 로봇 인증을 사람이 끝낼 때까지 기다리는 동안 호출됨(초 단위). 스캔은 그 뒤에 시작한다.
export async function runContentScan(campaign, { onProgress, onWait, full = false, concurrency = 5 } = {}) {
  const cfg = { hashtags: campaign.campaignHashtags || [], soundId: campaign.campaignSoundId || '' };
  const accounts = await getAccountsFromSheet(campaign.sheet);
  const prev = prevDetected(campaign);

  // 스캔 대상: 전체. 이미 업로드된 계정도 성과(조회수 등)가 계속 자라니 다시 긁어야 함(납품 숫자 최신화).
  // 단, 이미 업로드된 계정은 검수열(17/19/21)은 안 건드리고 성과(27~30)만 갱신(아래 write 루프). full이면 검수도 재판정.
  const targets = accounts;

  // 창 하나를 먼저 띄워 사람이 로봇 인증을 끝낼 때까지 기다린다(인증 실패면 여기서 throw).
  const { browser, ctx } = await launchBrowser({ onWait }); // Playwright 미설치면 throw
  const detected = { ...prev }; // 이미 업로드된 건 이전 결과 유지
  let done = 0;
  let newUp = 0;
  const failedHandles = new Set(); // 틱톡이 막아서 '못 본' 계정 — '영상 없음'과 절대 섞지 않는다
  // 동시성 풀 — 한 브라우저 창에 여러 탭을 병렬로 열어 스캔 (300건 대비 5배↑ 속도)
  let idx = 0;
  const worker = async () => {
    while (idx < targets.length) {
      const a = targets[idx++];
      let r = { videos: [], ok: false, error: '' };
      try { r = await fetchVideos(ctx, a.handle); } catch (e) { r.error = String((e && e.message) || e); }

      // 시트에 사람이 찍어준 링크가 있는데 그 영상이 목록에 없으면, 영상 페이지를 직접 연다.
      // 게시물이 아주 많은 계정은 프로필 목록이 안 오는 경우가 있다(@mnrdance: 1,597개).
      const wantId = videoIdFromLink(a.contentLink);
      if (wantId && !r.videos.some((v) => String(v.id || '') === wantId)) {
        try {
          const one = await fetchVideoByLink(ctx, a.contentLink);
          if (one.ok) { r = { ...r, videos: [one.video, ...r.videos], ok: true, error: '' }; }
        } catch {}
      }

      if (!r.ok) {
        // 못 봤다 ≠ 안 올렸다.
        // 예전엔 여기서 {uploaded:false} 로 덮어써서, 봇월 한 번에 이미 감지된 기록이 통째로 날아갔다.
        // 이제는 이전 판정을 그대로 두고 실패로만 센다. 시트에도 아무것도 안 쓴다(아래 write 루프).
        failedHandles.add(a.handle);
        detected[a.handle] = prev[a.handle] || { uploaded: false, scanFailed: true, error: r.error };
        done++;
        if (onProgress) onProgress({ done, total: targets.length, handle: a.handle, uploaded: false, failed: true });
        continue;
      }

      // 시트 17열에 사람이 적어둔 링크가 있으면 그 영상을 우선 판정한다.
      const d = detectCampaign(r.videos, cfg, { knownLink: a.contentLink });
      detected[a.handle] = d;
      if (d.uploaded && !(prev[a.handle] && prev[a.handle].uploaded)) newUp++;
      done++;
      if (onProgress) onProgress({ done, total: targets.length, handle: a.handle, uploaded: !!d.uploaded });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) || 1 }, worker));
  } finally {
    try { await browser.close(); } catch {}
  }

  const totalUp = Object.values(detected).filter((d) => d && d.uploaded).length;

  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, 'detected.json'), JSON.stringify({ ranAt: new Date().toISOString(), detected }, null, 2));

  // 감지 결과 → 시트 되쓰기: 이번에 스캔한 대상 중 업로드된 것만 (17콘텐츠·19음원·21해시태그·27~30성과)
  // 수동 잠금(overrides)된 검수/콘텐츠 셀(17·19·20·21)은 덮어쓰지 않음 = '수동 우선'.
  const overrides = await readOverrides(campaign); // 시트 모드면 브릿지에서 — 팀이 잠근 셀을 워커가 덮어쓰지 않게
  const cells = [];
  const putIf = (r, col, value) => { if (!isLocked(overrides, r, col)) cells.push({ row: r, col, value }); };
  for (const a of targets) {
    const d = detected[a.handle];
    if (!d || !d.uploaded || !a.row) continue;
    if (failedHandles.has(a.handle)) continue; // 이번에 못 본 계정 — 옛 수치를 다시 쓰지 않는다
    const r = a.row;
    // 검수열(17콘텐츠·19음원·21해시태그)은 '시트가 빈칸일 때만' 채운다. 값이 있으면 사람 것으로 보고 건드리지 않는다.
    // (예전 기준이던 '이번에 새로 감지된 것'은 detected.json 이 스캔 실패로 초기화되면 곧장 덮어쓰기로 변했다.
    //  full=true 면 사람이 명시적으로 재판정을 요청한 것이므로 그때만 덮어쓴다.)
    const blank = (v) => !(v != null && String(v).trim());
    if (full || blank(a.contentLink)) putIf(r, 17, d.contentLink);
    if (full || blank(a.soundOk)) putIf(r, 19, d.soundOk ? '사용 확인' : '음원 다름');
    if (full || blank(a.hashtagOk)) putIf(r, 21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
    // 성과 수치(27~30)는 항상 최신으로 갱신(이미 업로드된 계정도 조회수 증가 반영).
    cells.push({ row: r, col: 27, value: d.views });
    cells.push({ row: r, col: 28, value: d.likes });
    cells.push({ row: r, col: 29, value: d.comments });
    cells.push({ row: r, col: 30, value: d.shares });
  }
  let written = 0;
  if (cells.length) {
    try { written = await pushCellsToSheet(campaign.sheet, cells); } catch {}
  }
  // failed = 틱톡이 막아서 못 본 계정. 0이 아니면 그 결과는 '완전'하지 않다 — 화면에 그대로 알린다.
  return {
    total: targets.length,
    scanned: targets.length - failedHandles.size,
    up: totalUp,
    newUp,
    written,
    failed: failedHandles.size,
    failedHandles: [...failedHandles].slice(0, 8),
  };
}

// 콘텐츠·성과 스캔 공용 로직 — CLI(scan-content.js)와 대시보드 버튼(server.js)이 공유.
// 최적화(#7): 아직 업로드 안 감지된 계정만 긁음. 이미 업로드된 건 이전 결과 유지. full=true면 전체 재스캔.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushCellsToSheet } from './sheet.js';
import { detectCampaign, videoIdFromLink } from './content-detect.js';
import { launchBrowser, fetchVideos, fetchVideoByLink, warmContext, closeWarm } from './tiktok-videos.js';
import { isLocked } from './overrides.js';
import { readOverrides } from './store.js';

function prevDetected(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
}

// 수기 대체 — 틱톡이 프로필 목록을 막을 때, 사람이 붙여넣은 '영상 링크 한 장'만 열어 판정한다.
// 프로필 그리드(잘 막힘) 대신 영상 페이지 한 장이라 훨씬 안 막힌다. 저장된 세션으로 인증 게이트 없이 시도.
export async function judgeOneLink(campaign, { row, handle, link }) {
  if (!videoIdFromLink(link)) throw new Error('틱톡 영상 링크가 아니에요 (…/video/숫자 형태여야 해요).');
  const cfg = { hashtags: campaign.campaignHashtags || [], soundId: campaign.campaignSoundId || '' };
  const { browser, ctx } = await launchBrowser({ warmup: false }); // 영상 한 장 → 인증 게이트 생략
  let one;
  try { one = await fetchVideoByLink(ctx, link); }
  finally { try { await browser.close(); } catch {} }
  if (!one || !one.ok) throw new Error((one && one.error) || '영상을 못 열었어요 (틱톡이 막았을 수 있어요). 잠시 후 다시 해주세요.');

  const d = detectCampaign([one.video], cfg, { knownLink: link, handle });
  // 시트 되쓰기 — 수동 잠금(overrides)된 칸은 안 건드림. 캠페인 기준 없으면 음원/해시태그는 안 씀.
  const overrides = await readOverrides(campaign);
  const cells = [];
  const putIf = (col, value) => { if (!isLocked(overrides, row, col)) cells.push({ row, col, value }); };
  putIf(17, d.contentLink || link);
  if (cfg.soundId) putIf(19, d.soundOk ? '사용 확인' : '음원 다름');
  if (cfg.hashtags.length) putIf(21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
  cells.push({ row, col: 27, value: d.views }, { row, col: 28, value: d.likes }, { row, col: 29, value: d.comments }, { row, col: 30, value: d.shares });
  let written = 0;
  try { written = await pushCellsToSheet(campaign.sheet, cells); } catch {}

  // detected.json 갱신 → 다음 업로드 스캔이 이 계정을 '미업로드'로 다시 안 봄.
  try {
    const p = join(campaign.dataDir, 'detected.json');
    const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { detected: {} };
    cur.detected = cur.detected || {};
    cur.detected[handle] = d;
    cur.ranAt = new Date().toISOString();
    mkdirSync(campaign.dataDir, { recursive: true });
    writeFileSync(p, JSON.stringify(cur, null, 2));
  } catch {}

  return { uploaded: d.uploaded, soundOk: d.soundOk, hashtagOk: d.hashtagOk, views: d.views, written };
}

// 미업로드 계정 하나만 확인 — 전체 스캔 대신 이 프로필 한 장만 열어 업로드/검수/성과 판정.
// (전체 스캔보다 훨씬 빠르고, 탭 하나만 여니 덜 막힌다. 작성자 가드는 detectCampaign 이 알아서.)
export async function scanOneProfile(campaign, { row, handle }) {
  if (!handle) throw new Error('계정 핸들이 없어요.');
  const cfg = { hashtags: campaign.campaignHashtags || [], soundId: campaign.campaignSoundId || '' };
  let r = { videos: [], ok: false, error: '' };
  let ctx = await warmContext(); // 워밍 브라우저 재사용(연속 확인 빠름). 브라우저는 안 닫고 page만 닫힌다.
  try { r = await fetchVideos(ctx, handle, { quick: true }); }
  catch (e) {
    const msg = String((e && e.message) || e);
    if (/closed|crash|Target|Browser|context|disconnect/i.test(msg)) { // 워밍 브라우저가 죽었으면 새로 띄워 1회 재시도
      await closeWarm(); ctx = await warmContext();
      try { r = await fetchVideos(ctx, handle, { quick: true }); } catch (e2) { r = { videos: [], ok: false, error: String((e2 && e2.message) || e2) }; }
    } else r = { videos: [], ok: false, error: msg };
  }
  if (!r.ok) throw new Error(r.error || '프로필을 못 봤어요 (틱톡이 막았을 수 있어요). VPN 바꾸고 다시, 또는 링크 달고 🔍 판정을 써보세요.');
  const d = detectCampaign(r.videos, cfg, { handle });

  // detected.json 갱신 (다음 증분 스캔이 이 계정 상태를 알게)
  try {
    const p = join(campaign.dataDir, 'detected.json');
    const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { detected: {} };
    cur.detected = cur.detected || {};
    cur.detected[handle] = d;
    cur.ranAt = new Date().toISOString();
    mkdirSync(campaign.dataDir, { recursive: true });
    writeFileSync(p, JSON.stringify(cur, null, 2));
  } catch {}

  // 업로드 감지된 경우만 시트 되쓰기(콘텐츠·검수·성과). 수동잠금·미설정 캠페인 존중.
  let written = 0;
  if (d.uploaded && row) {
    const overrides = await readOverrides(campaign);
    const cells = [];
    const putIf = (col, value) => { if (!isLocked(overrides, row, col)) cells.push({ row, col, value }); };
    putIf(17, d.contentLink);
    if (cfg.soundId) putIf(19, d.soundOk ? '사용 확인' : '음원 다름');
    if (cfg.hashtags.length) putIf(21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
    cells.push({ row, col: 27, value: d.views }, { row, col: 28, value: d.likes }, { row, col: 29, value: d.comments }, { row, col: 30, value: d.shares });
    try { written = await pushCellsToSheet(campaign.sheet, cells); } catch {}
  }
  return { uploaded: !!d.uploaded, contentLink: d.contentLink || '', soundOk: !!d.soundOk, hashtagOk: !!d.hashtagOk, views: d.views || 0, written };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// onWarmup: 인증 창이 떠서 '스캔 시작' 대기 중일 때 1회 호출. waitForGo: 사람이 '스캔 시작' 누르면 resolve.
// concurrency=1(순차)이 기본 — 탭을 여럿 열면 틱톡이 봇으로 보고 콘텐츠를 잠근다(사용자 반복 지적).
//   느리지만(업로드 스캔은 미업로드 계정만 = 소량) 훨씬 안 막힌다. 아래 jitter+백오프와 함께.
const jitter = () => 900 + Math.floor(Math.random() * 1700); // 계정 간 0.9~2.6초 랜덤(사람처럼)
// onBlocked({reason,done,total,failed}) → 'resume'|'stop' : 막혔을 때 멈추고 사용자를 기다림(VPN 바꾸고 재개).
// shouldPause() → boolean : 사용자가 '중지'를 눌렀는지(수동). 계정 사이에서 멈춘다.
export async function runContentScan(campaign, { onProgress, onWarmup, waitForGo, onBlocked, shouldPause, full = false, perf = false, concurrency = 1 } = {}) {
  const cfg = { hashtags: campaign.campaignHashtags || [], soundId: campaign.campaignSoundId || '' };
  const accounts = await getAccountsFromSheet(campaign.sheet);
  const prev = prevDetected(campaign);

  // 대상 선택:
  //  · 기본(업로드 스캔): 아직 업로드 안 된 계정만 — 탭 수를 줄여 차단 회피.
  //  · perf(조회수 스캔, 납품 탭): 업로드된 계정만(링크 있음 or 감지됨) — 조회수 갱신용.
  //    링크가 있는데 목록에 영상이 안 뜨던 계정도 여기서 영상 페이지 직접 열어(fetchVideoByLink) 채운다.
  //  · full(Shift+클릭): 전체 재스캔.
  const isUploaded = (a) => (prev[a.handle] && prev[a.handle].uploaded) || !!(a.contentLink && String(a.contentLink).trim());
  const targets = full ? accounts : perf ? accounts.filter(isUploaded) : accounts.filter((a) => !isUploaded(a));

  // 인증 창 하나 먼저 띄우고 '스캔 시작'을 기다린다(대기 초과면 여기서 throw).
  const { browser, ctx } = await launchBrowser({ onWarmup, waitForGo }); // Playwright 미설치면 throw
  const detected = { ...prev }; // 이미 업로드된 건 이전 결과 유지
  let done = 0;
  let newUp = 0;
  let stopped = false; // 사용자가 '중지'로 스캔을 접었는지
  const failedHandles = new Set(); // 틱톡이 막아서 '못 본' 계정 — '영상 없음'과 절대 섞지 않는다
  const BLOCK_STREAK = 3; // 연속 이만큼 막히면 = 틱톡 차단 → 멈추고 사용자에게 넘긴다(VPN 바꾸게)

  // 한 계정 처리 — 성공하면 true. 링크 폴백·판정·기록까지. (실패해도 이전 판정은 안 지운다)
  const processOne = async (a) => {
    let r = { videos: [], ok: false, error: '' };
    try { r = await fetchVideos(ctx, a.handle); } catch (e) { r.error = String((e && e.message) || e); }
    // 시트에 사람이 찍어준 링크가 있는데 목록에 없으면 영상 페이지를 직접 연다(@mnrdance: 게시물 1,597개).
    const wantId = videoIdFromLink(a.contentLink);
    if (wantId && !r.videos.some((v) => String(v.id || '') === wantId)) {
      try { const one = await fetchVideoByLink(ctx, a.contentLink); if (one.ok) r = { ...r, videos: [one.video, ...r.videos], ok: true, error: '' }; } catch {}
    }
    if (!r.ok) {
      // 못 봤다 ≠ 안 올렸다. 이전 판정 유지하고 실패로만 센다(봇월 한 번에 기록 날아가는 것 방지).
      failedHandles.add(a.handle);
      detected[a.handle] = prev[a.handle] || { uploaded: false, scanFailed: true, error: r.error };
      return false;
    }
    const d = detectCampaign(r.videos, cfg, { knownLink: a.contentLink, handle: a.handle });
    detected[a.handle] = d;
    failedHandles.delete(a.handle); // 재시도 성공 시 실패목록에서 뺀다
    if (d.uploaded && !(prev[a.handle] && prev[a.handle].uploaded)) newUp++;
    return true;
  };

  // 막혔을 때: 멈추고 사용자를 기다린다(VPN 바꾸고 재개). onBlocked 없으면(CLI) 30초 쉬고 자동 재개.
  const pauseForUser = async (reason) => {
    if (onBlocked) { try { return (await onBlocked({ reason, done, total: targets.length, failed: failedHandles.size })) || 'resume'; } catch { return 'resume'; } }
    await sleep(30000); return 'resume';
  };

  try {
    let consecFail = 0;
    for (let i = 0; i < targets.length; i++) {
      // 사용자가 '중지'를 눌렀으면(수동) 계정 사이에서 멈춘다.
      if (shouldPause && shouldPause()) { if ((await pauseForUser('manual')) === 'stop') { stopped = true; break; } consecFail = 0; }
      const a = targets[i];
      await sleep(jitter()); // 사람처럼 뜸 들이기
      const ok = await processOne(a);
      done++;
      if (onProgress) onProgress({ done, total: targets.length, handle: a.handle, uploaded: ok ? !!detected[a.handle].uploaded : false, failed: !ok });
      if (ok) { consecFail = 0; continue; }
      consecFail++;
      // 연속으로 막히면 = 틱톡이 잠갔다. 멈추고 사용자에게 넘긴다(VPN 바꾸고 [재개]하면 여기서 이어감).
      if (consecFail >= BLOCK_STREAK) { if ((await pauseForUser('blocked')) === 'stop') { stopped = true; break; } consecFail = 0; }
    }

    // 실패한 계정 순차 재시도 (중지 안 했을 때만). 여기서도 연속으로 막히면 다시 멈춘다.
    if (!stopped) {
      let rFail = 0;
      for (const a of targets.filter((t) => failedHandles.has(t.handle))) {
        if (shouldPause && shouldPause()) { if ((await pauseForUser('manual')) === 'stop') break; rFail = 0; }
        await sleep(1500);
        const ok = await processOne(a);
        if (ok) { rFail = 0; if (onProgress) onProgress({ done, total: targets.length, handle: a.handle, uploaded: !!detected[a.handle].uploaded, retried: true }); }
        else { rFail++; if (rFail >= BLOCK_STREAK) { if ((await pauseForUser('blocked')) === 'stop') break; rFail = 0; } }
      }
    }
  } finally {
    try { await browser.close(); } catch {}
  }

  // 실제 업로드 수 = 스캔이 감지한 것 + 시트에 링크가 있는 것(수기 입력 포함). 계정 단위로 중복 없이 센다.
  // (예전엔 detected 만 세서, 사람이 손으로 링크 넣은 계정이 스캔 요약 카운트에서 빠졌다 — @asumin0318 사례)
  const upHandles = new Set();
  for (const a of accounts) {
    if ((detected[a.handle] && detected[a.handle].uploaded) || (a.contentLink && String(a.contentLink).trim())) upHandles.add(a.handle);
  }
  const totalUp = upHandles.size;

  // 이번 스캔에서 끝까지 못 본 계정 = 업로드 탭에서 하이라이트할 '실패 지점'. 매 스캔마다 덮어쓴다(성공하면 빈 목록).
  try {
    const failRows = targets.filter((t) => failedHandles.has(t.handle)).map((t) => ({ handle: t.handle, row: t.row }));
    writeFileSync(join(campaign.dataDir, 'scan-failures.json'), JSON.stringify({ ranAt: new Date().toISOString(), handles: failRows }, null, 2));
  } catch {}

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
    // 캠페인에 음원/해시태그 기준이 설정된 경우에만 판정을 쓴다.
    // (기준이 없으면 d.soundOk/hashtagOk 가 무조건 false → '음원 다름'·'해시태그 누락'을 잘못 기록하게 됨)
    if (cfg.soundId && (full || blank(a.soundOk))) putIf(r, 19, d.soundOk ? '사용 확인' : '음원 다름');
    if (cfg.hashtags.length && (full || blank(a.hashtagOk))) putIf(r, 21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
    // 성과 수치(27~30)는 항상 최신으로 갱신(이미 업로드된 계정도 조회수 증가 반영).
    cells.push({ row: r, col: 27, value: d.views });
    cells.push({ row: r, col: 28, value: d.likes });
    cells.push({ row: r, col: 29, value: d.comments });
    cells.push({ row: r, col: 30, value: d.shares });
  }

  // 재조정: 예전 스캔이 '업로드'로 감지했는데(detected) 시트 되쓰기가 실패해 링크가 빈 계정을 메운다.
  // 한 번 detected 에 박히면 증분 스캔이 그 계정을 건너뛰어(위 targets 제외) 시트에 영영 안 써졌다
  //  → 대시보드는 detected 에서 채워 30, 시트는 29 로 갈라졌다(@ae_yyee 사례). 매 스캔 이걸 맞춘다.
  const blankV = (v) => !(v != null && String(v).trim());
  const scanned = new Set(targets.map((t) => t.handle));
  for (const a of accounts) {
    if (scanned.has(a.handle) || !a.row) continue; // 이번에 스캔한 건 위에서 처리됨
    const d = detected[a.handle];
    if (!d || !d.uploaded) continue;
    if (blankV(a.contentLink)) putIf(a.row, 17, d.contentLink);
    if (cfg.soundId && blankV(a.soundOk)) putIf(a.row, 19, d.soundOk ? '사용 확인' : '음원 다름');
    if (cfg.hashtags.length && blankV(a.hashtagOk)) putIf(a.row, 21, d.hashtagOk ? '확인 완료' : '해시태그 누락');
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
    stopped,
  };
}

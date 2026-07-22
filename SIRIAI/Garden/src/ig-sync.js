// 인스타 모집 스캔 — 팔로워·닉네임을 긁어 마스터시트 인스타 열에 되쓴다.
// 틱톡 쪽 runSync 와 같은 자리의 일을 하지만 파일을 나눈 이유:
//   틱톡은 fetch 로 프로필 HTML 을 긁고, 인스타는 로그인된 브라우저 안에서 API 를 부른다.
//   실패 모드도 다르다(틱톡=로봇인증, 인스타=로그인 만료). 한 파일에 섞으면 둘 다 읽기 어려워진다.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushCellsToSheet } from './sheet.js';
import { launchIgBrowser, openIgFetcher, fetchIgProfileRetry, fetchIgProfileViaPage, toIgHandle, sleep } from './instagram.js';

const LATEST = 'ig-scan-latest.json';

function prevCurrents(campaign) {
  const p = join(campaign.dataDir, LATEST);
  if (!existsSync(p)) return {};
  try {
    const m = {};
    (JSON.parse(readFileSync(p, 'utf8')).accounts || []).forEach((a) => { m[a.handle] = a.current; });
    return m;
  } catch { return {}; }
}

// 시트 한 행에서 인스타 핸들을 뽑는다. 브릿지가 ig 블록과 igLink 를 둘 다 줄 수 있어 순서대로 본다.
export function igHandleOf(a) {
  const raw = (a.ig && (a.ig.link || a.ig.nick)) || a.igLink || a.igNick || '';
  const h = toIgHandle(raw);
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
}

export async function runIgSync(campaign, { onProgress, onWarmup, waitForGo, full = false, delayMs = 2500, limit = 0, shouldStop } = {}) {
  const all = await getAccountsFromSheet(campaign.sheet);
  // 인스타 링크가 있는 행만. 틱톡 전용은 긁을 게 없다.
  const accounts = all.map((a) => ({ ...a, igHandle: igHandleOf(a) })).filter((a) => a.igHandle && a.row);
  const skipped = all.length - accounts.length;

  const prev = prevCurrents(campaign);
  // 기본은 증분: 팔로워를 아직 못 받은 계정 + 인스타 닉이 빈 계정. full 이면 전부 다시.
  const _targets = full
    ? accounts
    : accounts.filter((a) => prev[a.igHandle] == null || !String((a.ig && a.ig.nick) || '').trim());
  // limit — 첫 실측·막힘 대비용. 46명 돌렸다가 열을 잘못 짚으면 46칸을 되돌려야 한다.
  const targets = limit > 0 ? _targets.slice(0, limit) : _targets;

  const results = [];
  let apiDead = false;   // API 가 한 번 막히면 그 판 내내 페이지 방식으로 간다
  let stopped = '';     // 사람이 중단했을 때의 설명. 빈 문자열이면 끝까지 돈 것이다.
  let browser = null;
  if (targets.length) {
    const b = await launchIgBrowser({ onWarmup, waitForGo });
    browser = b.browser;
    try {
      const page = await openIgFetcher(b.ctx);
      for (let i = 0; i < targets.length; i++) {
        // 계정 하나가 끝날 때마다 확인한다. 중간에 끊으면 브라우저가 열린 채 남는다.
        if (shouldStop && shouldStop()) { stopped = '중단했어요 — 여기까지는 시트에 저장됐습니다.'; break; }
        const a = targets[i];
        let p = null, via = 'api', err = null;
        // ① API 먼저 — 팔로워뿐 아니라 게시물·캡션까지 한 번에 온다(업로드 감지에 쓴다).
        //    apiDead 면 건너뛴다: 한 번 막힌 엔드포인트를 계속 두드리면 제한만 길어진다.
        if (!apiDead) {
          try { p = await fetchIgProfileRetry(page, a.igHandle); }
          catch (e) {
            err = e;
            // 401/403/429 = 속도 제한. 이 판은 API 를 접고 남은 계정은 전부 페이지로 간다.
            if (e.code === 'LOGGEDOUT' || e.code === 'BLOCKED') {
              apiDead = true;
              if (onProgress) onProgress({ note: 'API 가 막혀 프로필 페이지 방식으로 전환합니다' });
            }
          }
        }
        // ② 페이지 직접 열기 — 사람이 프로필을 넘겨보는 것과 같은 경로라 훨씬 덜 막힌다.
        //    팔로워·이름만 얻고 게시물은 못 얻지만, 모집 스캔엔 그걸로 충분하다.
        if (!p) {
          try { p = await fetchIgProfileViaPage(b.ctx, a.igHandle); via = 'page'; }
          catch (e2) { err = err && e2.code === 'NOTFOUND' ? err : e2; }
        }
        if (p) {
          results.push({ row: a.row, handle: a.igHandle, followers: p.followers, name: p.name, isPrivate: !!p.isPrivate, posts: p.posts || [], via });
          if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, followers: p.followers, via });
        } else {
          results.push({ row: a.row, handle: a.igHandle, followers: null, error: err ? err.message : '실패', code: (err && err.code) || '' });
          if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, failed: true, error: err ? err.message : '실패' });
        }
        if (i < targets.length - 1) await sleep(delayMs);
      }
    } finally {
      try { await browser.close(); } catch {}
    }
  }

  // ── 시트 되쓰기 ──────────────────────────────────────────────────────────
  // ⚠️ 반드시 'ig.' 접두어. 안 붙이면 틱톡 팔로워 열에 인스타 숫자가 써진다.
  const cells = [];
  results.forEach((r) => {
    if (r.followers != null) cells.push({ row: r.row, field: 'ig.followers', value: r.followers });
  });
  // 인스타 닉네임 자동채움 — 시트가 비어 있을 때만. 사람이 적어둔 걸 덮지 않는다.
  const bySheetRow = new Map(accounts.map((a) => [a.row, a]));
  results.forEach((r) => {
    const a = bySheetRow.get(r.row);
    if (!a || !r.handle) return;
    if (!String((a.ig && a.ig.nick) || '').trim()) cells.push({ row: r.row, field: 'ig.nick', value: r.handle });
  });

  let written = 0, writeError = '';
  if (cells.length) {
    try { written = await pushCellsToSheet(campaign.sheet, cells); }
    catch (e) { writeError = e.message; }
  }

  // 병합: 이번에 숫자를 받았으면 그 값, 아니면 이전 값 유지.
  // (스캔 실패는 null 로 온다 — 그 null 로 기존 기록을 덮으면 팔로워가 사라진다)
  const got = {};
  results.forEach((r) => { if (r.followers != null) got[r.handle] = r.followers; });
  const merged = accounts.map((a) => ({
    row: a.row,
    handle: a.igHandle,
    company: a.company,
    current: got[a.igHandle] != null ? got[a.igHandle] : (a.igHandle in prev ? prev[a.igHandle] : null),
  }));

  const out = {
    ranAt: new Date().toISOString(),
    scannedCount: targets.length,
    total: accounts.length,
    skipped,
    written,
    writeError,
    stopped,
    failures: results.filter((r) => r.followers == null).map((r) => ({ handle: r.handle, error: r.error, code: r.code })),
    accounts: merged,
  };
  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, LATEST), JSON.stringify(out, null, 2));
  return out;
}

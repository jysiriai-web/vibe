// 인스타 업로드 스캔 — 최근 게시물 캡션에서 캠페인 해시태그를 찾아 콘텐츠 링크·해시태그 검수를 채운다.
//
// 틱톡(content-core)과 다른 점:
//   · 게시물 목록이 프로필 API 한 번에 딸려 온다 — 계정마다 영상 페이지를 열 필요가 없다.
//   · 작성자 가드가 필요 없다. 이 API 는 '그 계정이 올린 것'만 준다(틱톡은 리포스트가 섞여 왔다).
//   · 음원은 자동 판정이 안 된다 — 릴스는 지정 음원을 써도 표기가 '오리지널 오디오'로 바뀐다. 사람이 본다.
//   · 조회수도 안 온다(instagram.js 주석 참고) — 좋아요·댓글만 쓴다.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushCellsToSheet } from './sheet.js';
import { launchIgBrowser, openIgFetcher, fetchIgProfileRetry, fetchIgPostsViaPage, sleep } from './instagram.js';
import { igHandleOf } from './ig-sync.js';

const LATEST = 'ig-detected.json';

// 캡션에서 해시태그만 뽑는다. 인스타는 한글·일본어 태그가 그대로 들어간다.
export function tagsOfCaption(caption) {
  const out = new Set();
  String(caption || '').replace(/#([^\s#@.,!?()[\]{}"'…]+)/g, (_, t) => { out.add(t.toLowerCase()); return ''; });
  return out;
}

// 이 게시물이 캠페인 콘텐츠인가. 태그가 2개 이상 설정돼 있으면 2개 이상 맞아야 한다 —
// #SNEAKERS 같은 흔한 단일 태그 하나로 무관한 게시물을 캠페인 콘텐츠로 오인하지 않게.
export function matchPost(post, hashtags) {
  const wanted = (hashtags || []).map((h) => String(h).toLowerCase().replace(/^#/, ''));
  if (!wanted.length) return { hit: false, matched: [] };
  const tags = tagsOfCaption(post.caption);
  const matched = wanted.filter((w) => tags.has(w));
  const need = wanted.length >= 2 ? 2 : 1;
  return { hit: matched.length >= need, matched, all: matched.length === wanted.length };
}

// 캠페인 기간 안의 게시물만 본다. 예전 게시물에 우연히 태그가 있어도 이번 콘텐츠가 아니다.
function inWindow(post, since) {
  if (!since || !post.takenAt) return true;
  return new Date(post.takenAt).getTime() >= new Date(since).getTime();
}

// delayMs 2000: 인스타는 프로필을 여는 속도로는 잘 안 막힌다(실측). 3초는 과했다.
// only: 특정 계정만 — '내일 올리는 8명만' 같은 부분 스캔에 쓴다. 전체를 30분 돌 이유가 없다.
export async function runIgContentScan(campaign, { onProgress, onWarmup, waitForGo, since = '', delayMs = 2000, limit = 0, shouldStop, only } = {}) {
  const hashtags = campaign.campaignHashtags || [];
  const all = await getAccountsFromSheet(campaign.sheet);
  const accounts = all.map((a) => ({ ...a, igHandle: igHandleOf(a) })).filter((a) => a.igHandle && a.row);

  const prev = (() => {
    const p = join(campaign.dataDir, LATEST);
    if (!existsSync(p)) return {};
    try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
  })();

  // 이미 올린 게 확인된 계정은 다시 안 본다. 인스타 제한을 아끼고, 확정된 링크를 흔들지 않는다.
  let _targets = accounts.filter((a) => !(prev[a.igHandle] && prev[a.igHandle].uploaded));
  // 특정 계정만 보라고 지정되면 그것만. 행 번호로도 핸들로도 지정할 수 있게 한다.
  if (Array.isArray(only) && only.length) {
    const want = new Set(only.map((v) => String(v).replace(/^@/, '').toLowerCase()));
    _targets = _targets.filter((a) => want.has(String(a.igHandle).toLowerCase()) || want.has(String(a.row)));
  }
  // limit — 시험용. 프로필을 직접 여는 경로는 계정당 40초쯤 걸려서 전체를 돌면 30분이다.
  const targets = limit > 0 ? _targets.slice(0, limit) : _targets;

  const detected = { ...prev };
  const cells = [];
  let apiDead = false, stopped = '';

  if (targets.length) {
    const b = await launchIgBrowser({ onWarmup, waitForGo });
    try {
      const page = await openIgFetcher(b.ctx);
      for (let i = 0; i < targets.length; i++) {
        // 계정 하나가 끝날 때마다 확인. 중간에 끊으면 브라우저가 열린 채 남는다.
        if (shouldStop && shouldStop()) { stopped = '중단했어요 — 여기까지는 시트에 저장됐습니다.'; break; }
        const a = targets[i];
        let p = null, via = 'api';
        // ① API — 게시물 목록이 한 번에 온다. 막혔으면(apiDead) 건너뛰고 바로 페이지로.
        if (!apiDead) {
          try { p = await fetchIgProfileRetry(page, a.igHandle); }
          catch (e) {
            if (e.code === 'LOGGEDOUT' || e.code === 'BLOCKED') {
              apiDead = true;
              if (onProgress) onProgress({ note: 'API 가 막혀 프로필을 직접 열어 확인합니다 (느려요)' });
            } else if (e.code === 'NOTFOUND') {
              detected[a.igHandle] = { uploaded: false, scanFailed: true, error: e.message };
              if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, failed: true, error: e.message });
              await sleep(delayMs); continue;
            }
          }
        }
        // ⚠️ '막힘'만 폴백 조건으로 두면 안 된다. 인스타는 200 을 주면서 게시물 목록만
        //    비워 보낸다(게시물 962개인데 edges 0). 그러면 스캔은 '정상 완료 · 감지 0건'
        //    이라고 보고하면서 실제로는 아무것도 안 본 상태가 된다 — 가장 나쁜 실패다.
        //    게시물이 있는 계정인데 목록이 비었으면 못 본 것으로 치고 직접 열어 확인한다.
        if (p && (!p.posts || !p.posts.length) && (p.postCount == null || p.postCount > 0)) {
          if (!apiDead) {
            apiDead = true;
            if (onProgress) onProgress({ note: 'API 가 게시물 목록을 비워 보냅니다 — 프로필을 직접 열어 확인합니다 (느려요)' });
          }
          p = null;
        }
        // ② 프로필을 직접 열어 최근 게시물을 하나씩 확인한다 — 사람이 하는 것과 같은 경로.
        //    느리지만 막혔을 때 스캔 전체가 멈추는 것보다 낫다.
        if (!p) {
          try { p = await fetchIgPostsViaPage(b.ctx, a.igHandle); via = 'page'; }
          catch (e) {
            detected[a.igHandle] = { uploaded: false, scanFailed: true, error: e.message };
            if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, failed: true, error: e.message });
            await sleep(delayMs); continue;
          }
        }

        const hits = (p.posts || []).filter((x) => inWindow(x, since)).map((x) => ({ post: x, m: matchPost(x, hashtags) })).filter((x) => x.m.hit);
        // 여러 개면 가장 오래된 것이 ①, 그다음이 ② — 올린 순서가 곧 콘텐츠 번호다.
        hits.sort((x, y) => new Date(x.post.takenAt || 0) - new Date(y.post.takenAt || 0));

        if (hits.length) {
          const first = hits[0];
          detected[a.igHandle] = {
            uploaded: true,
            link: first.post.link,
            link2: hits[1] ? hits[1].post.link : '',
            hashtagOk: first.m.all,
            matched: first.m.matched,
            via,
            likes: first.post.likes,
            comments: first.post.comments,
            takenAt: first.post.takenAt,
          };
          cells.push({ row: a.row, field: 'ig.contentA', value: first.post.link });
          if (hits[1]) cells.push({ row: a.row, field: 'ig.contentB', value: hits[1].post.link });
          // 해시태그는 '전부 들어갔나'로 판정한다. 일부만 맞으면 미준수 — 사람이 보고 요청해야 한다.
          cells.push({ row: a.row, field: 'ig.hashtagOk', value: first.m.all ? '준수' : '미준수' });
          if (first.post.likes != null) cells.push({ row: a.row, field: 'ig.likes', value: first.post.likes });
          if (first.post.comments != null) cells.push({ row: a.row, field: 'ig.comments', value: first.post.comments });
        } else {
          detected[a.igHandle] = { uploaded: false, checkedAt: new Date().toISOString(), postsSeen: (p.posts || []).length };
        }
        if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, uploaded: hits.length > 0 });
        if (i < targets.length - 1) await sleep(delayMs);
      }
    } finally { try { await b.browser.close(); } catch {} }
  }

  let written = 0, writeError = '';
  if (cells.length) {
    try { written = await pushCellsToSheet(campaign.sheet, cells); }
    catch (e) { writeError = e.message; }
  }

  const uploadedN = Object.values(detected).filter((d) => d && d.uploaded).length;
  const out = {
    ranAt: new Date().toISOString(),
    total: accounts.length,
    scannedCount: targets.length,
    uploaded: uploadedN,
    written,
    writeError,
    stopped,
    hashtags,
    detected,
  };
  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, LATEST), JSON.stringify(out, null, 2));
  return out;
}

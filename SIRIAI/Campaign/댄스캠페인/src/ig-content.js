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
import { readOverrides } from './store.js';
import { isLockedField } from './overrides.js';

const LATEST = 'ig-detected.json';

// 캡션에서 해시태그만 뽑는다. 인스타는 한글·일본어 태그가 그대로 들어간다.
export function tagsOfCaption(caption) {
  const out = new Set();
  // 전각 ＃(일본어·한국어 IME 기본 입력)를 반각으로 먼저 맞추고, 태그는 글자·숫자·밑줄까지만 본다 —
  // 인스타 자신도 이모지·기호에서 태그를 끊는다. 이걸 안 하면 '#LUN8✨' 이 'lun8✨' 로 잡혀
  // 태그를 다 넣은 정상 게시물이 '미업로드·해시태그 미준수'가 되고, 크리에이터에게 잘못된 수정요청이 나간다.
  String(caption || '').replace(/[＃♯]/g, '#').replace(/#([\p{L}\p{N}_]+)/gu, (_, t) => { out.add(t.toLowerCase()); return ''; });
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
/* deep(정밀) 모드 — 시간을 더 쓰고 대신 덜 놓친다.
 *
 * 왜 필요한가: 기본은 동시 5개·간격 2초로 돈다. 인스타는 이 속도에서 200 을 주면서
 * 게시물 목록만 비워 보내거나 로그인 월을 띄운다. 그러면 올린 사람이 '미업로드' 로 남고
 * 리마인드가 잘못 나간다 — 실제로 30개 계정이 그 상태였다.
 *
 * 정밀 모드가 바꾸는 것
 *   · 동시 5 → 2, 간격 2초 → 4.5초 (사람이 보는 속도에 가깝게)
 *   · 프로필에서 훑는 게시물 12 → 24개
 *   · 못 본 계정은 끝나고 한 번 더 — 그 사이 차단이 풀리는 경우가 많다
 * 45명 기준 10분 → 20분쯤. 놓치는 것보다 낫다. */
export async function runIgContentScan(campaign, { onProgress, onWarmup, waitForGo, onBlocked, since = '', delayMs = 2000, limit = 0, shouldStop, only, concurrency = 5, deep = false, perf = false } = {}) {
  if (deep) { concurrency = 2; delayMs = Math.max(delayMs, 4500); }
  const pageMax = deep ? 24 : 12;
  // 캠페인 시작일이 있으면 그 전 게시물은 볼 이유가 없다 — 프로필을 직접 여는 경로에서
  // '어디까지 거슬러 올라갈지'를 정해 준다. 없으면 21일 전까지만(캠페인 콘텐츠는 늘 최근이다).
  if (!since) {
    const st = campaign.campaignStart ? new Date(campaign.campaignStart) : new Date(Date.now() - 21 * 86400000);
    if (!isNaN(st)) since = st.toISOString();
  }
  const hashtags = campaign.campaignHashtags || [];
  const all = await getAccountsFromSheet(campaign.sheet);
  const accounts = all.map((a) => ({ ...a, igHandle: igHandleOf(a) })).filter((a) => a.igHandle && a.row);

  const prev = (() => {
    const p = join(campaign.dataDir, LATEST);
    if (!existsSync(p)) return {};
    try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
  })();

  /* 기본(업로드 찾기): 이미 올린 게 확인된 계정은 다시 안 본다. 인스타 제한을 아끼고 확정된 링크를 안 흔든다.
     단 시트에 못 쓴 건(pendingWrite)은 아직 안 끝난 것이라 남긴다.

     perf(성과 갱신): 정확히 반대다 — **이미 올린 계정만** 다시 열어 좋아요·댓글을 새로 읽는다.
     ⚠️ 이게 없어서 인스타 성과가 첫 발견 시점 값에 얼어 있었다(실측: 시트 3·1 인데 실제 24·38).
     인스타는 조회수를 아예 안 준다 — 프로필 API 의 video_view_count 는 늘 0 이고, 릴스 페이지에도
     재생수 표기가 없다(로그인 상태에서도 확인). 그래서 여기서 갱신하는 건 좋아요·댓글뿐이다. */
  let _targets = perf
    ? accounts.filter((a) => prev[a.igHandle] && prev[a.igHandle].uploaded)
    : accounts.filter((a) => !(prev[a.igHandle] && prev[a.igHandle].uploaded && !prev[a.igHandle].pendingWrite));
  // 특정 계정만 보라고 지정되면 그것만. 행 번호로도 핸들로도 지정할 수 있게 한다.
  if (Array.isArray(only) && only.length) {
    const want = new Set(only.map((v) => String(v).replace(/^@/, '').toLowerCase()));
    _targets = _targets.filter((a) => want.has(String(a.igHandle).toLowerCase()) || want.has(String(a.row)));
  }
  // limit — 시험용. 프로필을 직접 여는 경로는 계정당 40초쯤 걸려서 전체를 돌면 30분이다.
  const targets = limit > 0 ? _targets.slice(0, limit) : _targets;

  // 사람이 고친 칸은 안 덮는다. 틱톡(content-core)은 하던 걸 인스타만 안 하고 있었다 —
  // 검수를 고쳐도 다음 스캔이 자동값으로 되돌렸다.
  const overrides = await readOverrides(campaign);
  const locked = (row, field) => isLockedField(overrides, row, field, 'ig');
  const detected = { ...prev };
  const cells = [];
  const wroteHandles = new Set();   // 이번 판에 시트 쓰기를 시도한 핸들 — 쓰기가 깨지면 이들만 되돌린다
  const failedHandles = new Set();  // 이번 판에 '못 본' 계정. 지난 판 기록과 섞이면 실패 건수가 거짓이 된다
  let apiDead = false, stopped = '', emptyStreak = 0;
  /* 연속 실패 = 막힌 것이다. 인스타는 틱톡과 달리 이 판단을 아예 안 하고 있었다 —
     58계정 중 27건이 '게시물을 못 열었어요' 로 끝났는데(계정당 4건씩 일정) 스캔은 끝까지
     달린 뒤에야 실패 목록을 보여줬다. 그때는 이미 VPN 을 바꿀 시점이 지난 뒤다.
     이제 연속 IG_BLOCK_STREAK 건이면 멈추고 사람을 부른다. */
  const IG_BLOCK_STREAK = Number(process.env.IG_BLOCK_STREAK || 4);
  let consecFail = 0, blocked = false;
  /* 이번 실행에서 '결론이 난' 계정. detected 는 지난 기록(prev)을 깔고 시작하므로
     그걸로 재개 큐를 만들면, 이번에 아직 안 본 계정이 '이미 봤다' 로 빠진다. */
  const settled = new Set();
  // 진행 수는 라운드를 넘겨 이어진다 — 재개했다고 0 부터 세면 화면이 뒤로 간다.
  let done = 0;
  let newUploaded = 0;   // 이번 판에 '새로' 찾은 업로드. 누적(uploadedN)과 섞으면 안 된다.

  if (targets.length) {
    /* 라운드 하나 = 브라우저 한 벌.
       ⚠️ 막힌 뒤 VPN 을 바꿔도 같은 브라우저를 계속 쓰면 소용이 없다 — 열려 있던 연결과
       세션이 옛 경로를 그대로 탄다. 재개할 때는 반드시 새로 띄운다. */
    let queue = targets.slice();
    let round = 0;
    while (queue.length && !stopped) {
      round++;
      blocked = false; consecFail = 0;
      const b = await launchIgBrowser(round === 1 ? { onWarmup, waitForGo } : {});
      // 이번 라운드가 어디로 나가는지 남긴다 — VPN 을 바꿨는데 안 바뀌었으면 여기서 드러난다.
      if (onProgress) {
        try {
          const pg = await b.ctx.newPage();
          await pg.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 15000 });
          const w = JSON.parse(await pg.evaluate(() => document.body.innerText));
          onProgress({ note: round + '회차 — ' + [w.country, w.city].filter(Boolean).join(' ') + ' (' + w.ip + ') 로 나가요' });
          await pg.close();
        } catch {}
      }
    try {
      /* 인스타는 틱톡처럼 탭 몇 개 열었다고 막지 않는다(대표님이 수기로 확인한 사실).
         순차로 돌면 계정당 10여 초 × 48명이라 10분 가까이 걸려서 여러 개를 동시에 연다.
         ⚠️ 작업자마다 자기 페이지를 하나씩 갖는다 — 한 페이지를 나눠 쓰면 evaluate 가 서로 섞인다. */
      let qi = 0;
      const runOne = async (page) => {
        while (qi < queue.length) {
          const i = qi++;
          // 계정 하나가 끝날 때마다 확인. 중간에 끊으면 브라우저가 열린 채 남는다.
          if (shouldStop && shouldStop()) { stopped = '중단했어요 — 여기까지는 시트에 저장됐습니다.'; break; }
          // 막혔으면 이 라운드는 접는다. 계속 긁어봐야 실패만 쌓이고 차단만 굳는다.
          if (blocked) break;
          if (consecFail >= IG_BLOCK_STREAK) { blocked = true; break; }
          const a = queue[i];
          let p = null, via = 'api';
          // ① API — 게시물 목록이 한 번에 온다. 막혔으면(apiDead) 건너뛰고 바로 페이지로.
          if (!apiDead) {
            try { p = await fetchIgProfileRetry(page, a.igHandle); }
            catch (e) {
              if (e.code === 'LOGGEDOUT' || e.code === 'BLOCKED') {
                consecFail++;
                apiDead = true;
                if (onProgress) onProgress({ note: 'API 가 막혀 프로필을 직접 열어 확인합니다 (느려요)' });
              } else if (e.code === 'NOTFOUND') {
                failedHandles.add(a.igHandle);
                detected[a.igHandle] = { uploaded: false, scanFailed: true, error: e.message };
                if (onProgress) onProgress({ done: ++done, total: targets.length, handle: a.igHandle, failed: true, error: e.message });
                await sleep(delayMs); continue;
              }
            }
          }
          // 비공개(비팔로우) 계정은 200 에 is_private=true + edges:[] 를 준다 — API 가 막힌 게 아니다.
          // 여기서 안 걸러내면 아래 조건에 걸려 apiDead 가 켜지고 남은 계정 전부가 느린 페이지 경로로 내려간다.
          // 게다가 이 계정 자신도 페이지에서 게시물이 안 보여 '미업로드'로 확정된다 — 안 올린 사람과 섞이면 안 된다.
          if (p && p.isPrivate && (!p.posts || !p.posts.length)) {
            const msg = '비공개 계정 — 사람이 직접 확인해주세요';
            failedHandles.add(a.igHandle);   // 막힘 카운트에는 안 넣는다 — 비공개는 정상적인 '못 봄' 이다
            settled.add(a.igHandle);         // 다시 봐도 결과가 같다
            detected[a.igHandle] = { uploaded: false, scanFailed: true, isPrivate: true, error: msg, checkedAt: new Date().toISOString() };
            if (onProgress) onProgress({ done: ++done, total: targets.length, handle: a.igHandle, failed: true, error: msg });
            await sleep(delayMs); continue;
          }
          // ⚠️ '막힘'만 폴백 조건으로 두면 안 된다. 인스타는 200 을 주면서 게시물 목록만
          //    비워 보낸다(게시물 962개인데 edges 0). 그러면 스캔은 '정상 완료 · 감지 0건'
          //    이라고 보고하면서 실제로는 아무것도 안 본 상태가 된다 — 가장 나쁜 실패다.
          //    게시물이 있는 계정인데 목록이 비었으면 못 본 것으로 치고 직접 열어 확인한다.
          if (p && (!p.posts || !p.posts.length) && (p.postCount == null || p.postCount > 0)) {
            emptyStreak++;
            // 한 계정만 비어 온 건 그 계정 사정일 수 있다. 연속 2회여야 API 가 죽었다고 본다.
            if (!apiDead && emptyStreak >= 2) {
              apiDead = true;
              if (onProgress) onProgress({ note: 'API 가 게시물 목록을 비워 보냅니다 — 프로필을 직접 열어 확인합니다 (느려요)' });
            }
            p = null;   // 이 계정 자체는 어차피 페이지로 한 번 더 본다
          } else if (p) {
            emptyStreak = 0;
          }
          // ② 프로필을 직접 열어 최근 게시물을 하나씩 확인한다 — 사람이 하는 것과 같은 경로.
          //    느리지만 막혔을 때 스캔 전체가 멈추는 것보다 낫다.
          if (!p) {
            // 캠페인 해시태그가 붙은 게시물 2개(콘텐츠①②)를 찾으면 거기서 멈춘다 — 계정당 1분이 십몇 초로 준다.
            try { p = await fetchIgPostsViaPage(b.ctx, a.igHandle, { isMatch: (post) => matchPost(post, hashtags).hit, since, max: pageMax }); via = 'page'; }
            catch (e) {
              failedHandles.add(a.igHandle); consecFail++;
              detected[a.igHandle] = { uploaded: false, scanFailed: true, error: e.message };
              if (onProgress) onProgress({ done: ++done, total: targets.length, handle: a.igHandle, failed: true, error: e.message });
              await sleep(delayMs); continue;
            }
          }
          // 폴백이 예외 없이 빈 목록을 돌려준 경우까지 막는다 — 0개는 판정 근거가 아니다.
          // (로그인 월·차단·화면 변경이면 링크가 0개로 '정상' 반환된다) '미업로드'로 확정하지 않는다.
          if (via === 'page' && !(p.posts || []).length) {
            const msg = '게시물 목록을 못 읽음(페이지 폴백) — 사람이 직접 확인해주세요';
            failedHandles.add(a.igHandle); consecFail++;
            detected[a.igHandle] = { uploaded: false, scanFailed: true, error: msg, checkedAt: new Date().toISOString() };
            if (onProgress) onProgress({ done: ++done, total: targets.length, handle: a.igHandle, failed: true, error: msg });
            await sleep(delayMs); continue;
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
            if (!(prev[a.igHandle] && prev[a.igHandle].uploaded)) newUploaded++;
            wroteHandles.add(a.igHandle);
            if (!locked(a.row, 'contentA')) cells.push({ row: a.row, field: 'ig.contentA', value: first.post.link });
            if (hits[1] && !locked(a.row, 'contentB')) cells.push({ row: a.row, field: 'ig.contentB', value: hits[1].post.link });
            // 해시태그는 '전부 들어갔나'로 판정한다. 일부만 맞으면 미준수 — 사람이 보고 요청해야 한다.
            if (!locked(a.row, 'hashtagOk')) cells.push({ row: a.row, field: 'ig.hashtagOk', value: first.m.all ? '준수' : '미준수' });
            if (first.post.likes != null) cells.push({ row: a.row, field: 'ig.likes', value: first.post.likes });
            if (first.post.comments != null) cells.push({ row: a.row, field: 'ig.comments', value: first.post.comments });
          } else {
            detected[a.igHandle] = { uploaded: false, checkedAt: new Date().toISOString(), postsSeen: (p.posts || []).length, via };
          }
          consecFail = 0;   // 봤다 = 안 막혔다
          settled.add(a.igHandle);
          if (onProgress) onProgress({ done: ++done, total: targets.length, handle: a.igHandle, uploaded: hits.length > 0 });
          await sleep(delayMs);
        }
      };
      const workers = Math.max(1, Math.min(concurrency, queue.length));
      await Promise.all(Array.from({ length: workers }, async () => {
        const page = await openIgFetcher(b.ctx);
        try { await runOne(page); } finally { try { await page.close(); } catch {} }
      }));
      /* 정밀 모드: 못 본 계정을 한 번 더 본다. 인스타 차단은 몇 분이면 풀리는 경우가 많아
         끝나고 다시 걸면 상당수가 살아난다. 여기서 성공하면 실패 목록에서 뺀다. */
      if (deep && !stopped && failedHandles.size) {
        const again = targets.filter((t) => failedHandles.has(t.igHandle));
        let rd = 0;
        if (onProgress) onProgress({ note: '못 본 ' + again.length + '개를 다시 확인합니다', retryTotal: again.length, retryDone: 0 });
        for (const a of again) {
          if (shouldStop && shouldStop()) break;
          await sleep(delayMs * 2);
          try {
            const p2 = await fetchIgPostsViaPage(b.ctx, a.igHandle, { isMatch: (post) => matchPost(post, hashtags).hit, since, max: pageMax });
            const seen2 = (p2.posts || []).length;
            const hits2 = (p2.posts || []).filter((x) => inWindow(x, since))
              .map((x) => ({ post: x, m: matchPost(x, hashtags) })).filter((x) => x.m.hit);
            hits2.sort((x, y) => new Date(x.post.takenAt || 0) - new Date(y.post.takenAt || 0));
            if (hits2.length) {
              const f = hits2[0];
              detected[a.igHandle] = { uploaded: true, link: f.post.link, link2: hits2[1] ? hits2[1].post.link : '',
                hashtagOk: f.m.all, matched: f.m.matched, via: 'page(재시도)',
                likes: f.post.likes, comments: f.post.comments, takenAt: f.post.takenAt };
              failedHandles.delete(a.igHandle);
              if (!(prev[a.igHandle] && prev[a.igHandle].uploaded)) newUploaded++;
              wroteHandles.add(a.igHandle);
              if (!locked(a.row, 'contentA')) cells.push({ row: a.row, field: 'ig.contentA', value: f.post.link });
              if (hits2[1] && !locked(a.row, 'contentB')) cells.push({ row: a.row, field: 'ig.contentB', value: hits2[1].post.link });
              if (!locked(a.row, 'hashtagOk')) cells.push({ row: a.row, field: 'ig.hashtagOk', value: f.m.all ? '준수' : '미준수' });
              if (f.post.likes != null) cells.push({ row: a.row, field: 'ig.likes', value: f.post.likes });
              if (f.post.comments != null) cells.push({ row: a.row, field: 'ig.comments', value: f.post.comments });
            } else if (seen2) {
              // 봤는데 없는 것 — 실패가 아니다. 근거를 남기고 실패 목록에서 뺀다.
              detected[a.igHandle] = { uploaded: false, checkedAt: new Date().toISOString(), postsSeen: seen2, via: 'page(재시도)' };
              failedHandles.delete(a.igHandle);
            }
          } catch (e) { /* 두 번째도 실패면 그대로 실패로 남긴다 */ }
          if (onProgress) onProgress({ retryTotal: again.length, retryDone: ++rd });
        }
      }
    } finally { try { await b.browser.close(); } catch {} }

      if (!blocked || stopped) break;
      /* 막혔다. 여기까지 본 것은 이미 detected 에 있다 — 사람이 VPN 을 바꾸고 재개하면
         못 본 것만 새 브라우저로 다시 본다. 볼 사람이 없으면(CLI) 그냥 접는다. */
      const act = onBlocked
        ? await onBlocked({ reason: 'blocked', done, total: targets.length, failed: failedHandles.size, round })
        : 'stop';
      if (act === 'stop') { stopped = '중지했어요 — 여기까지는 시트에 저장됐습니다.'; break; }
      queue = targets.filter((t) => !settled.has(t.igHandle));
      queue.forEach((t) => failedHandles.delete(t.igHandle));   // 다시 볼 것이니 실패 목록에서 뺀다
      if (!queue.length) break;
    }
  }

  let written = 0, writeError = '';
  if (cells.length) {
    try { written = await pushCellsToSheet(campaign.sheet, cells); }
    catch (e) {
      writeError = e.message;
      // 시트에 못 썼다 = 아직 안 끝난 것. uploaded:true 로 확정하면 위 필터가 이 계정을 영영 건너뛴다.
      wroteHandles.forEach((h) => { if (detected[h]) detected[h].pendingWrite = true; });
    }
  }

  const uploadedN = Object.values(detected).filter((d) => d && d.uploaded).length;
  // 못 본 계정은 '안 올린 사람'과 반드시 갈라 보여야 한다 — 여기서 묻히면 잘못된 수정요청이 나간다.
  const failures = [...failedHandles].map((h) => ({
    handle: h,
    error: (detected[h] && detected[h].error) || '',
    isPrivate: !!(detected[h] && detected[h].isPrivate),
  }));
  const out = {
    ranAt: new Date().toISOString(),
    total: accounts.length,
    scannedCount: targets.length,
    uploaded: uploadedN,
    newUploaded,
    written,
    writeError,
    pendingWrite: Object.values(detected).filter((d) => d && d.pendingWrite).length,
    failed: failures.length,
    failures,
    stopped,
    hashtags,
    detected,
  };
  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, LATEST), JSON.stringify(out, null, 2));
  return out;
}

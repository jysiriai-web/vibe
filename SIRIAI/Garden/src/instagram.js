// 인스타 수집 (Playwright, 창 보이게 = 로그인 세션 그대로 사용).
//
// 왜 브라우저인가: 로그인 없이는 아무것도 안 나온다. 실측 결과 —
//   내부 API 직접 호출 → HTTP 429 (전부 차단)
//   프로필 HTML     → 200 이지만 625KB 빈 껍데기(클라이언트 렌더 + 로그인 월), 데이터 0
// 그래서 '로그인된 페이지 안에서' 내부 API 를 부른다. 쿠키·앱ID·서명이 전부 자동으로 붙는다.
//
// 한 번 부르면 팔로워·이름·최근 게시물(캡션·조회수·좋아요·댓글)이 같이 온다 —
// 틱톡처럼 프로필 스캔과 업로드 스캔을 따로 돌 필요가 없다.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// 로그인 쿠키를 여기 저장한다. 다음부턴 로그인 창이 안 뜬다. (data/ 는 gitignore)
const SESSION_PATH = fileURLToPath(new URL('../data/ig-session.json', import.meta.url));
const HOME = 'https://www.instagram.com/';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 인스타 자신의 예약 경로. 릴스·게시물 링크를 인스타 칸에 붙여넣으면 여기가 핸들처럼 잡힌다
// (실측: '/reel/C8xYzAbc/' → 'reel'). 그대로 두면 남의 계정을 긁어 그 행에 써버린다.
// Code.gs 의 igHandleFrom_ 도 같은 걸 거른다 — 두 쪽 규칙을 맞춰둔다(+ 브릿지에 빠진 share 포함).
const IG_RESERVED = /^(p|reel|reels|stories|story|tv|explore|s|accounts|share|direct|challenge)$/i;

// 'https://instagram.com/@abc/?x=1' · '@abc' · 'abc' → 'abc'   (예약 경로면 '')
export function toIgHandle(s) {
  s = String(s || '').trim();
  // '@' 를 붙여 복사해 오는 사람이 있다(instagram.com/@abc) — 이걸 안 받으면 'https:' 가 나와 행이 조용히 버려진다.
  const m = s.match(/instagram\.com\/@?([A-Za-z0-9._]+)/i);
  const h = m ? m[1] : s.replace(/^@/, '').replace(/\/.*$/, '');
  return IG_RESERVED.test(h) ? '' : h;
}

export function igProxyFromEnv() {
  const raw = (process.env.IG_PROXY || process.env.TIKTOK_PROXY || '').trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const proxy = { server: `${u.protocol}//${u.host}` };
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
    return proxy;
  } catch { return undefined; }
}

// 준비됐는가 = '우리가 실제로 쓸 그 API'가 데이터를 내려주는가.
//
// 쿠키를 보는 방식은 못 쓴다: 핵심 쿠키(sessionid)가 HttpOnly 라 document.cookie 에 안 잡히고,
// ds_user_id 만 보면 로그아웃 잔여 쿠키에 속는다. DOM 모양은 인스타가 수시로 바꾼다.
// 그래서 목적 그 자체를 신호로 삼는다 — 되면 되는 거고, 안 되면 아직인 거다.
const PROBE = 'instagram';   // 항상 존재하는 공식 계정
async function igReady(page) {
  try {
    return await page.evaluate(async (h) => {
      try {
        const r = await fetch(`/api/v1/users/web_profile_info/?username=${h}`, {
          headers: { 'X-IG-App-ID': '936619743392459' },
        });
        if (!r.ok) return false;
        const j = await r.json();
        return !!(j && j.data && j.data.user && j.data.user.edge_followed_by);
      } catch { return false; }
    }, PROBE);
  } catch { return false; }
}

// 창 하나 띄우고 사람이 로그인을 끝낼 때까지 기다린다.
// 이미 쿠키가 살아있으면 즉시 통과 — 그래서 평소엔 창만 잠깐 떴다 사라진다.
async function igWarmUp(ctx, { onWarmup, waitForGo, timeout = 15 * 60 * 1000 } = {}) {
  const page = await ctx.newPage();
  const start = Date.now();
  let ok = false, confirmed = false;
  if (waitForGo) { try { Promise.resolve(waitForGo()).then(() => { confirmed = true; }).catch(() => {}); } catch {} }
  try {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    if (await igReady(page)) { try { await page.close(); } catch {} return true; }   // 세션 살아있음
    if (onWarmup) { try { onWarmup(); } catch {} }  // 로그인 대기 — 대시보드에 '스캔 시작' 띄우라는 신호
    while (Date.now() - start < timeout) {
      // 사람이 '시작'을 눌렀어도 API 가 되는지는 확인한다 — 안 되면 스캔 전체가 헛돈다.
      if (await igReady(page)) { ok = true; break; }
      if (confirmed && !ok) confirmed = false;   // 아직이면 한 번 더 기다린다(다시 누를 수 있게)
      await page.waitForTimeout(2000);
    }
  } catch {}
  try { await page.close(); } catch {}
  return ok;
}

export async function launchIgBrowser({ warmup = true, onWarmup, waitForGo } = {}) {
  const { chromium } = await import('playwright');
  const proxy = igProxyFromEnv();
  const browser = await chromium.launch({ headless: false, ...(proxy ? { proxy } : {}) });
    // 한국어. 틱톡 스캐너는 일본 크리에이터 콘텐츠를 받으려고 ja-JP 를 쓰지만,
  // 인스타는 받는 데이터가 언어와 무관하다 — 대표님이 직접 조작하는 창이니 한국어가 맞다.
  const base = { userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'ko-KR' };
  let ctx;
  try {
    ctx = await browser.newContext(existsSync(SESSION_PATH) ? { ...base, storageState: SESSION_PATH } : base);
  } catch {
    ctx = await browser.newContext(base);   // 저장된 세션이 깨졌으면 새로 시작
  }
  if (warmup) {
    const ok = await igWarmUp(ctx, { onWarmup, waitForGo });
    if (!ok) {
      try { await browser.close(); } catch {}
      throw new Error('인스타 로그인 대기가 끝났어요(시간 초과). 크롬 창에서 로그인한 뒤 다시 눌러주세요.');
    }
    try { mkdirSync(dirname(SESSION_PATH), { recursive: true }); await ctx.storageState({ path: SESSION_PATH }); } catch {}
  }
  return { browser, ctx };
}

// ── 수집 페이지 ────────────────────────────────────────────────────────────
// 계정마다 프로필로 이동하면 느리고 눈에 띈다. 인스타 홈에 한 번만 머무르며
// 그 페이지 안에서 내부 API 만 부른다(쿠키·앱ID 가 자동으로 붙는다).
export async function openIgFetcher(ctx) {
  const page = await ctx.newPage();
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  return page;
}

// 성공: { handle, followers, name, isPrivate, posts:[...] }
// 실패: throw (err.code = 'NOTFOUND' | 'BLOCKED' | 'LOGGEDOUT' | 기타)
export async function fetchIgProfile(page, handleRaw, { timeout = 25000 } = {}) {
  const handle = toIgHandle(handleRaw);
  const out = await page.evaluate(async ({ h, ms }) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(h)}`, {
        headers: { 'X-IG-App-ID': '936619743392459' },
        signal: ctrl.signal,
      });
      if (r.status === 404) return { err: 'NOTFOUND', status: 404 };
      if (r.status === 401 || r.status === 403) return { err: 'LOGGEDOUT', status: r.status };
      if (r.status === 429) return { err: 'BLOCKED', status: 429 };
      if (!r.ok) return { err: 'HTTP', status: r.status };
      const j = await r.json();
      const u = j && j.data && j.data.user;
      if (!u) return { err: 'NOTFOUND', status: r.status };
      return { u };
    } catch (e) {
      return { err: e.name === 'AbortError' ? 'TIMEOUT' : 'FETCH', msg: String(e && e.message) };
    } finally { clearTimeout(t); }
  }, { h: handle, ms: timeout });

  if (out.err) {
    const e = new Error({
      NOTFOUND: '계정 없음(또는 이름 바뀜)',
      LOGGEDOUT: '로그인이 풀렸어요 — 크롬 창에서 다시 로그인해주세요',
      BLOCKED: '인스타가 잠시 막았어요 — 조금 뒤에 다시',
      TIMEOUT: `타임아웃(${timeout}ms)`,
    }[out.err] || `실패(HTTP ${out.status || '?'}${out.msg ? ' · ' + out.msg : ''})`);
    e.code = out.err;
    throw e;
  }

  const u = out.u;
  const edges = (u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.edges) || [];
  const posts = edges.map((x) => x.node).filter(Boolean).map((n) => ({
    shortcode: n.shortcode,
    link: `https://www.instagram.com/${n.is_video ? 'reel' : 'p'}/${n.shortcode}/`,
    isVideo: !!n.is_video,
    // 캡션은 해시태그 검수의 근거다. 없을 수 있으니 빈 문자열로 떨어뜨린다.
    caption: (((n.edge_media_to_caption || {}).edges || [])[0] || {}).node?.text || '',
    // ⚠️ 인스타 조회수는 안 온다. 실측: 이 API 는 video_view_count 를 늘 0 으로 주고,
    //    media/{id}/info/ 는 HTML 을 돌려주고, 릴스 페이지에도 숫자가 없다(남의 릴스라).
    //    0 을 그대로 두면 '조회수 0인 릴스'로 보여 납품 집계가 틀어진다 → 모르는 값은 null.
    views: n.video_view_count > 0 ? n.video_view_count : null,
    likes: (n.edge_liked_by || n.edge_media_preview_like || {}).count ?? null,
    comments: (n.edge_media_to_comment || {}).count ?? null,
    takenAt: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
  }));

  return {
    handle,
    followers: (u.edge_followed_by || {}).count ?? null,
    name: u.full_name || '',
    isPrivate: !!u.is_private,
    postCount: (u.edge_owner_to_timeline_media || {}).count ?? null,
    posts,
  };
}

// ── 폴백: 프로필 페이지의 og:description ──────────────────────────────────
// 일부 계정(비즈니스/프로 계정으로 보인다)에서 web_profile_info 가 HTTP 400 을 뱉는다.
// 인스타 내부 오류다 — "Asset asset://laser.provider/ig_business_category_subvertical".
// 계정은 멀쩡히 있고(프로필 페이지 200) og:description 에 팔로워가 그대로 적혀 있다.
// 46명 중 7명이 여기 걸렸으므로 그냥 포기할 수 없다.
//
// 대신 게시물 목록은 못 얻는다(이 경로엔 안 들어있다) → 팔로워·이름만 채우고 posts 는 빈 배열.
export async function fetchIgProfileViaPage(ctx, handleRaw, { timeout = 60000 } = {}) {
  const handle = toIgHandle(handleRaw);
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(3500);
    const meta = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:description"]');
      return m ? m.content || '' : '';
    });
    // "팔로워 9,365명, 팔로잉 1,040명, 게시물 173개 - CHIKARA(@chikara1201)님의 …"
    // 로케일이 ko-KR 이라 한국어지만, 다른 로케일도 받도록 숫자 위치로도 잡는다.
    const mk = meta.match(/팔로워\s*([\d,.]+)\s*명/) || meta.match(/([\d,.]+)\s*Followers/i);
    if (!mk) { const e = new Error('프로필 페이지에서도 팔로워를 못 찾음'); e.code = 'NOTFOUND'; throw e; }
    const followers = Number(String(mk[1]).replace(/[,.]/g, ''));
    const nm = meta.match(/-\s*(.+?)\s*\(@/);
    const pc = meta.match(/게시물\s*([\d,.]+)\s*개/) || meta.match(/([\d,.]+)\s*Posts/i);
    return {
      handle,
      followers: Number.isFinite(followers) ? followers : null,
      name: nm ? nm[1] : '',
      isPrivate: false,
      postCount: pc ? Number(String(pc[1]).replace(/[,.]/g, '')) : null,
      posts: [],          // 이 경로로는 못 가져온다 — 업로드 감지는 API 경로가 돌아와야 한다
      via: 'page',
    };
  } finally { try { await page.close(); } catch {} }
}
// 프로필 그리드 한 장만 읽고, 정말 필요한 게시물만 연다.
//
// 핵심: 그리드 썸네일의 img[alt] 에 캡션이 해시태그까지 통째로 들어온다.
//   "소원을 말해봐💞 @girlsgeneration #kpop #dance"
// 그래서 캠페인 해시태그가 붙었는지를 페이지 한 장으로 판정할 수 있다. 예전엔 그걸 모르고
// 게시물을 8개씩 일일이 열어 계정당 1분이 걸렸다(48명이면 50분).
//
// 다만 캡션이 없는 게시물은 alt 가 "Photo by 이름 on 2022년 11월 13일." 꼴로 온다.
// 그건 '캠페인 게시물이 아니다'가 아니라 '판단 불가'라서, 그런 것만 열어서 확인한다.
// 좋아요·댓글·작성시각은 alt 에 없으므로 '맞는 게시물'만 열어서 채운다(보통 0~2개).
export async function fetchIgPostsViaPage(ctx, handleRaw, { max = 12, timeout = 60000, isMatch = null, needed = 2, since = '' } = {}) {
  const handle = toIgHandle(handleRaw);
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(2200);
    // 그리드의 게시물 링크 + 썸네일 alt(캡션). 순서가 곧 최신순이다.
    const grab = (n) => page.evaluate((n2) => {
      const seen = [];
      document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach((a) => {
        const m = a.getAttribute('href').match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (!m) return;
        const key = m[2];
        if (seen.some((x) => x.shortcode === key)) return;
        const img = a.querySelector('img');
        seen.push({ shortcode: key, kind: m[1], alt: img ? (img.getAttribute('alt') || '') : '' });
      });
      return seen.slice(0, n2);
    }, n);
    // 그리드는 늦게 그려질 때가 있다. 한 번 비었다고 '못 읽음'으로 접으면 멀쩡한 계정이 실패로 남는다.
    let links = await grab(max);
    if (!links.length) { await page.waitForTimeout(2500); links = await grab(max); }

    // 그리드를 못 읽은 것과 '정말 게시물이 없는 것'은 화면상 구분이 안 된다(로그인 월·차단·화면 변경).
    // 여기서 조용히 빈 배열을 돌려주면 호출부가 '미업로드'로 확정해버린다 → 실패로 던진다.
    if (!links.length) { const e = new Error('프로필 페이지에서 게시물 목록을 못 읽음(로그인 월·차단·화면 변경)'); e.code = 'EMPTY'; throw e; }

    // alt 가 캡션이 아니라 인스타가 만든 설명문이면 캡션을 모르는 것이다 → 열어봐야 안다.
    const noCaption = (t) => !String(t || '').trim()
      || /^(Photo|Video|Reel|사진|동영상)\s+by\s+/i.test(String(t).trim())
      || /^(Photo|Video|Reel)\s+shared\s+by/i.test(String(t).trim());

    // 그리드에서 얻은 '얇은' 게시물. 캡션만 있고 좋아요·시각은 없다.
    const posts = links.map((l) => ({
      shortcode: l.shortcode,
      link: `https://www.instagram.com/${l.kind}/${l.shortcode}/`,
      isVideo: l.kind === 'reel',
      caption: noCaption(l.alt) ? '' : l.alt,
      views: null,
      likes: null,
      comments: null,
      takenAt: null,
      thin: true,
    }));

    // 열어볼 것만 고른다: ① 캠페인 해시태그가 보이는 것 ② 캡션을 모르는 것.
    // 판정자가 없으면(옛 호출) 예전처럼 전부 연다.
    const idxToOpen = [];
    for (let i = 0; i < posts.length; i++) {
      if (!isMatch) { idxToOpen.push(i); continue; }
      if (noCaption(links[i].alt) || isMatch(posts[i])) idxToOpen.push(i);
    }

    const failed = [];
    let others = 0;   // 남의 게시물로 판단해 건너뛴 수 — 실패 메시지에 근거로 남긴다
    let opened = 0, matched = 0;
    const sinceMs = since ? new Date(since).getTime() : 0;
    let oldStreak = 0;
    for (const i of idxToOpen) {
      const l = links[i];
      try {
        await page.goto(`https://www.instagram.com/${l.kind}/${l.shortcode}/`, { waitUntil: 'domcontentloaded', timeout });
        // og:description 은 <head> 에 있어 domcontentloaded 면 대개 이미 있다.
        await page.waitForTimeout(1000);
        opened++;
        const info = await page.evaluate(() => {
          const og = document.querySelector('meta[property="og:description"]');
          const t = document.querySelector('time[datetime]');
          return { desc: og ? og.content || '' : '', dt: t ? t.getAttribute('datetime') : '' };
        });
        // og:description 은 "645 likes, 25 comments - 계정 - May 28, 2026: "본문"" 꼴이다.
        // 앞머리(좋아요·댓글·날짜)와 본문을 갈라 쓴다. 형식이 바뀌면 통째로 캡션으로 둔다 —
        // 해시태그만 보면 되므로 앞머리가 섞여도 판정에는 지장이 없다.
        const d = info.desc;
        // 프로필 페이지 그리드에 남의 게시물 링크가 섞일 수 있다(추천·태그된 게시물).
        // 캡션 안의 '(@멘션)' 을 주인으로 오인하면 정상 게시물을 버리게 되므로,
        // 캡션이 시작되기 전(': "' 앞) 머리말에 적힌 핸들만 대조한다. 못 찾으면 버리지 않는다.
        const ownerHead = d.split(/:\s*"/)[0];
        const owner = (ownerHead.match(/\(@([A-Za-z0-9._]+)\)/) || ownerHead.match(/(?:^|-\s*)([A-Za-z0-9._]+)\s+on\s+Instagram/i) || [])[1];
        const headHasMe = ownerHead.toLowerCase().includes(handle.toLowerCase());
        // 인스타가 붙이는 머리말('N likes, M comments -' · 'on Instagram' · '좋아요 N개')이 보일 때만 믿는다.
        const looksLikeHead = /likes?|comments?|좋아요|댓글|Instagram/i.test(ownerHead);
        if (owner && looksLikeHead && !headHasMe && owner.toLowerCase() !== handle.toLowerCase()) {
          others++; posts[i].foreign = true; await sleep(500); continue;
        }
        const head = d.match(/^([\d,]+)\s*likes?,\s*([\d,]+)\s*comments?/i);
        const body = d.match(/:\s*"([\s\S]*)"\s*$/);
        // 릴스는 time[datetime] 이 없을 때가 있다 — 앞머리의 날짜를 쓴다.
        const dateTxt = d.match(/-\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*:/);
        let taken = info.dt || null;
        if (!taken && dateTxt) { const t2 = new Date(dateTxt[1]); if (!isNaN(t2)) taken = t2.toISOString(); }
        const num = (v) => (v == null ? null : Number(String(v).replace(/,/g, '')));
        // 연 게시물은 '진짜' 값으로 덮는다. 캡션은 og 쪽이 더 정확하다.
        posts[i] = {
          ...posts[i],
          caption: body ? body[1] : (d || posts[i].caption),
          likes: head ? num(head[1]) : null,
          comments: head ? num(head[2]) : null,
          takenAt: taken,
          thin: false,
        };
        if (isMatch && isMatch(posts[i])) matched++;
        // 필요한 만큼 찾았으면 나머지는 열지 않는다. 콘텐츠①②면 충분하다.
        if (isMatch && matched >= needed) break;
        // 캠페인 기간 밖으로 넘어갔으면 더 볼 이유가 없다(고정 게시물 대비 연속 3개).
        if (sinceMs && taken) {
          if (new Date(taken).getTime() < sinceMs) { if (++oldStreak >= 3) break; }
          else oldStreak = 0;
        }
      } catch { failed.push(l.shortcode); /* 이 게시물만 건너뛴다 — 하나 못 봤다고 계정 전체를 포기하지 않는다 */ }
      await sleep(500);
    }
    // 열어야 할 게 있었는데 한 개도 못 열었으면 '게시물 없음'과 구분해야 한다 — 실패로 던진다.
    // (열 게 애초에 없었으면 = 그리드 캡션만으로 '해당 없음'을 확인한 것이라 정상이다.)
    if (idxToOpen.length && !opened) {
      const e = new Error(`게시물 ${idxToOpen.length}개를 못 열었어요(${failed.length}건 실패 · ${others}건은 다른 계정 것)`);
      e.code = 'EMPTY'; throw e;
    }
    // 남의 게시물은 빼고 돌려준다.
    const mine = posts.filter((x) => !x.foreign);
    // 그리드 순서가 최신순이 아닐 때가 있다(고정 게시물 등) → 시각을 아는 것부터 최신순으로.
    mine.sort((x, y) => new Date(y.takenAt || 0) - new Date(x.takenAt || 0));
    return { handle, followers: null, name: '', isPrivate: false, postCount: null, posts: mine, via: 'page', opened };
  } finally { try { await page.close(); } catch {} }
}

// 재시도 래퍼 — 막힘(BLOCKED)은 기다렸다 다시, 계정 없음은 즉시 포기(다시 해도 없다)
export async function fetchIgProfileRetry(page, handle, { retries = 2, delayMs = 4000 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fetchIgProfile(page, handle); } catch (e) {
      last = e;
      if (e.code === 'NOTFOUND' || e.code === 'LOGGEDOUT') break;
      if (i < retries) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

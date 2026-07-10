// 틱톡 영상 목록 수집 (Playwright, 창 보이게 = 봇 감지 우회). 캠페인 감지·성과용.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// 인증 통과 후의 쿠키를 여기 저장한다. 다음 스캔부턴 로봇 인증이 안 뜨거나 훨씬 덜 뜬다. (data/ 는 gitignore)
const SESSION_PATH = fileURLToPath(new URL('../data/tiktok-session.json', import.meta.url));
const WARMUP_URL = 'https://www.tiktok.com/@tiktok'; // 항상 존재하는 프로필 — 인증 통과 여부 확인용

// 프로필 데이터가 실제로 렌더됐는가 = 봇월/로봇인증을 통과했는가.
async function profileRendered(page) {
  try {
    return await page.evaluate(() => {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!el) return false;
      const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
      const info = scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo;
      return !!(info && info.user && info.user.id);
    });
  } catch { return false; }
}

// 창 하나를 먼저 띄워 사람이 로봇 인증을 끝낼 때까지 기다린다.
// 이걸 안 하면 첫 탭들이 전부 인증 화면에 막히고, 그게 '영상 없음'처럼 보인다.
// 통과하면 그 쿠키가 같은 ctx 의 모든 탭에 적용되므로 이후 스캔은 막히지 않는다.
async function warmUp(ctx, { onWait, timeout = 5 * 60 * 1000 } = {}) {
  const page = await ctx.newPage();
  const start = Date.now();
  let ok = false;
  try {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    let lastReload = Date.now();
    while (Date.now() - start < timeout) {
      ok = await profileRendered(page);
      if (ok) break;
      if (onWait) onWait({ seconds: Math.round((Date.now() - start) / 1000) });
      await page.waitForTimeout(2000);
      // 인증을 끝냈는데 화면이 안 넘어가는 경우가 있어 주기적으로 새로고침해 확인한다.
      if (Date.now() - lastReload > 25000) {
        lastReload = Date.now();
        await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      }
    }
  } catch {}
  try { await page.close(); } catch {}
  return ok;
}

// warmup=false 는 테스트용. 평소엔 항상 인증 관문을 거친다 (호출부가 빠뜨릴 수 없게 여기에 둠).
export async function launchBrowser({ warmup = true, onWait } = {}) {
  const { chromium } = await import('playwright'); // 미설치면 여기서 throw
  const browser = await chromium.launch({ headless: false });
  const base = { userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'ja-JP' };
  let ctx;
  try {
    ctx = await browser.newContext(existsSync(SESSION_PATH) ? { ...base, storageState: SESSION_PATH } : base);
  } catch {
    ctx = await browser.newContext(base); // 저장된 세션이 깨졌으면 그냥 새로 시작
  }
  if (warmup) {
    const ok = await warmUp(ctx, { onWait });
    if (!ok) {
      try { await browser.close(); } catch {}
      throw new Error('틱톡 로봇 인증을 통과하지 못했어요. 크롬 창에서 인증을 끝낸 뒤 다시 눌러주세요.');
    }
    try { mkdirSync(dirname(SESSION_PATH), { recursive: true }); await ctx.storageState({ path: SESSION_PATH }); } catch {}
  }
  return { browser, ctx };
}

// 한 계정 프로필의 팔로워수·닉네임 반환 (실제 브라우저 = 봇 차단 우회). 못 가져오면 { followers:null, nickname:'' }.
export async function fetchProfile(ctx, handle, { timeout = 30000 } = {}) {
  const page = await ctx.newPage();
  let out = { followers: null, nickname: '' };
  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout });
    // __UNIVERSAL_DATA__ 가 채워질 때까지 잠깐 폴링 (봇월 통과 대기)
    for (let i = 0; i < 8; i++) {
      const r = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return null;
        try {
          const info = JSON.parse(el.textContent)?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo;
          if (info?.stats && Number.isFinite(info.stats.followerCount)) {
            return { followers: info.stats.followerCount, nickname: info?.user?.nickname || '' };
          }
        } catch {}
        return null;
      });
      if (r) { out = r; break; }
      await page.waitForTimeout(1200);
    }
  } catch {}
  await page.close();
  return out;
}

// 영상 링크 하나를 직접 열어 그 영상 정보를 가져온다 → { video, ok, error }.
// 프로필의 영상 목록이 안 올 때(게시물이 아주 많은 계정) 사람이 찍어준 링크로 우회하는 길.
export async function fetchVideoByLink(ctx, link, { timeout = 45000 } = {}) {
  const page = await ctx.newPage();
  let video = null;
  let error = '';
  page.on('response', async (res) => {
    if (video) return;
    if (/item\/detail|aweme\/detail/.test(res.url())) {
      try {
        const j = await res.json();
        const v = j.itemInfo?.itemStruct || (Array.isArray(j.aweme_list) ? j.aweme_list[0] : null);
        if (v && v.id) video = v;
      } catch {}
    }
  });
  try {
    await page.goto(String(link), { waitUntil: 'domcontentloaded', timeout });
    for (let i = 0; i < 6 && !video; i++) {
      const inline = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return null;
        const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
        const vd = scope['webapp.video-detail'];
        return vd && vd.itemInfo && vd.itemInfo.itemStruct ? vd.itemInfo.itemStruct : null;
      }).catch(() => null);
      if (inline && inline.id) { video = inline; break; }
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    error = String((e && e.message) || e).slice(0, 120);
  }
  try { await page.close(); } catch {}
  return { video, ok: !!video, error: video ? '' : error || '영상 페이지를 못 열었어요' };
}

// 한 계정의 최근 영상을 { videos, ok, error } 로 반환.
//
// ⚠️ ok 가 핵심이다. 예전엔 실패해도 그냥 [] 을 돌려줬고, 호출부는 그걸 '영상 없음'으로 읽어
//    "미업로드" 로 기록했다. 틱톡 봇월에 한 번 막히면 이미 올라온 영상까지 미업로드로 뒤집혔다.
//      ok=false           → "못 봤다" (차단·타임아웃·목록 못 받음)
//      ok=true, videos=[] → "봤는데 진짜로 영상이 없다" (프로필의 게시물 수가 0)
//    이 둘은 절대 같은 뜻이 아니다.
//
// 영상 목록(itemList)은 XHR 로만 온다. 프로필은 떴는데 목록만 못 받는 경우가 실제로 있어
// (@mnrdance: 게시물 1,597개인데 0개 수신) 프로필이 말하는 게시물 수와 대조해 판정한다.
export async function fetchVideos(ctx, handle, { timeout = 45000, attempts = 2 } = {}) {
  const page = await ctx.newPage();
  let videos = [];
  page.on('response', async (res) => {
    if (/item_list|item\/list|post\/item/.test(res.url())) {
      try {
        const j = await res.json();
        const list = j.itemList || j.items || j.aweme_list;
        if (Array.isArray(list)) videos = videos.concat(list);
      } catch {}
    }
  });
  let hasUser = false;
  let videoCount = null; // 프로필이 밝힌 게시물 수. null = 못 읽음.
  let error = '';
  for (let att = 0; att < attempts; att++) {
    try {
      await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout });
      for (let i = 0; i < 6 && !videos.length; i++) {
        await page.mouse.wheel(0, 2200);
        await page.waitForTimeout(2200);
      }
      const probe = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return null;
        const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
        const ud = scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo;
        let inline = null;
        for (const k of Object.keys(scope)) if (scope[k] && scope[k].itemList) { inline = scope[k].itemList; break; }
        return {
          hasUser: !!(ud && ud.user && ud.user.id),
          videoCount: ud && ud.stats && Number.isFinite(ud.stats.videoCount) ? ud.stats.videoCount : null,
          inline,
        };
      }).catch(() => null);
      if (probe) {
        hasUser = probe.hasUser;
        if (probe.videoCount != null) videoCount = probe.videoCount;
        if (!videos.length && Array.isArray(probe.inline)) videos = probe.inline;
      }
    } catch (e) {
      error = String((e && e.message) || e).slice(0, 120);
    }
    // 영상을 받았거나, 프로필이 '게시물 0개'라고 확인해주면 더 볼 필요 없다.
    if (videos.length || (hasUser && videoCount === 0)) break;
  }
  await page.close();
  // 게시물이 있다는데 목록을 하나도 못 받았으면 그건 '영상 없음'이 아니라 '못 봤음'이다.
  const ok = videos.length > 0 || (hasUser && videoCount === 0);
  if (ok) return { videos, ok, error: '' };
  return {
    videos,
    ok,
    error: error || (hasUser ? `영상 목록을 못 받았어요 (게시물 ${videoCount ?? '?'}개)` : '프로필을 못 열었어요 (차단 의심)'),
  };
}

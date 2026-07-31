// [복사본] SIRIAI/Campaign/댄스캠페인/src/tiktok-videos.js 에서 가져온 검증된 엔진 코드입니다.
//          US_seeding 은 Garden 과 완전히 독립 실행됩니다 — 한쪽을 고쳐도 다른 쪽에 반영되지 않습니다.
// 틱톡 영상 목록 수집 (Playwright, 창 보이게 = 봇 감지 우회). 캠페인 감지·성과용.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// 인증 통과 후의 쿠키를 여기 저장한다. 다음 스캔부턴 로봇 인증이 안 뜨거나 훨씬 덜 뜬다. (data/ 는 gitignore)
const SESSION_PATH = fileURLToPath(new URL('../data/tiktok-session.json', import.meta.url));
const WARMUP_URL = 'https://www.tiktok.com/@tiktok'; // 항상 존재하는 프로필 — 인증 통과 여부 확인용

// 스캐너를 특정 프록시(다른 나라)로 내보내기 — .env 의 TIKTOK_PROXY 로 지정.
//   예) TIKTOK_PROXY=http://호스트:포트   또는   http://아이디:비번@호스트:포트   또는  socks5://호스트:포트
// (시스템 VPN 을 켜두면 크롬이 알아서 그 연결을 타므로 보통은 이게 필요 없다. 이건 '스캐너만' 특정 프록시로 보낼 때.)
export function proxyFromEnv() {
  const raw = (process.env.TIKTOK_PROXY || '').trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const proxy = { server: `${u.protocol}//${u.host}` };
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
    return proxy;
  } catch { return undefined; }
}

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

// 창 하나만 먼저 띄운다. 이 창에서 로봇 인증을 사람이 끝내고, 대시보드에서 '스캔 시작'을 누르면
// (waitForGo 가 resolve) 그때부터 실제 스캔이 착수한다. 통과 쿠키는 같은 ctx 의 모든 탭에 적용된다.
//
// 예전엔 자동 감지(프로필 렌더 폴링)로 판단했는데, 시간 압박·오탐이 있었다.
// 이제는 '사람 확인'이 기본 신호다: waitForGo 가 resolve 되면 신뢰하고 진행.
// (프로필이 저절로 렌더되면 인증이 필요 없던 것이므로 확인 없이도 자동 진행 — 쿠키 살아있을 때 편의)
async function warmUp(ctx, { onWarmup, waitForGo, timeout = 15 * 60 * 1000 } = {}) {
  const page = await ctx.newPage();
  const start = Date.now();
  let ok = false;
  let confirmed = false;
  if (waitForGo) { try { Promise.resolve(waitForGo()).then(() => { confirmed = true; }).catch(() => {}); } catch {} }
  try {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    if (onWarmup) { try { onWarmup(); } catch {} } // 창 떴고 인증 대기 — 대시보드에 '스캔 시작' 버튼 띄우라는 신호
    let lastReload = Date.now();
    while (Date.now() - start < timeout) {
      if (await profileRendered(page)) { ok = true; break; }   // 인증 필요 없었음(쿠키 살아있음) → 자동 진행
      if (confirmed) { ok = true; break; }                     // 사람이 '스캔 시작' 누름 → 신뢰하고 진행
      await page.waitForTimeout(1500);
      if (Date.now() - lastReload > 30000) { lastReload = Date.now(); await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); }
    }
  } catch {}
  try { await page.close(); } catch {}
  return ok;
}

// warmup=false 는 테스트용. 평소엔 항상 인증 관문을 거친다 (호출부가 빠뜨릴 수 없게 여기에 둠).
export async function launchBrowser({ warmup = true, onWarmup, waitForGo } = {}) {
  const { chromium } = await import('playwright'); // 미설치면 여기서 throw
  const proxy = proxyFromEnv(); // TIKTOK_PROXY 설정 시 스캐너를 그 프록시(다른 나라)로 내보냄
  const browser = await chromium.launch({ headless: false, ...(proxy ? { proxy } : {}) });
  const base = { userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'ja-JP' };
  let ctx;
  try {
    ctx = await browser.newContext(existsSync(SESSION_PATH) ? { ...base, storageState: SESSION_PATH } : base);
  } catch {
    ctx = await browser.newContext(base); // 저장된 세션이 깨졌으면 그냥 새로 시작
  }
  if (warmup) {
    const ok = await warmUp(ctx, { onWarmup, waitForGo });
    if (!ok) {
      try { await browser.close(); } catch {}
      throw new Error('로봇 인증 대기가 끝났어요(시간 초과). 크롬 창에서 인증을 끝내고 스캔을 다시 눌러주세요.');
    }
    try { mkdirSync(dirname(SESSION_PATH), { recursive: true }); await ctx.storageState({ path: SESSION_PATH }); } catch {}
  }
  return { browser, ctx };
}

// ── 개별 확인용 '워밍 브라우저' ────────────────────────────────────────────
// 계정 하나씩 확인할 때 매번 크롬을 새로 띄우면 느리다(런치 ~3초). 한 번 띄워두고 재사용하면
// 다음 확인은 새 탭만 열어 훨씬 빠르다. 유휴 2분이면 자동으로 닫는다(리소스 반납).
let _warm = null, _warmIdle = null;
function _touchWarm() {
  if (_warmIdle) clearTimeout(_warmIdle);
  _warmIdle = setTimeout(() => { closeWarm(); }, 2 * 60 * 1000);
  if (_warmIdle.unref) _warmIdle.unref(); // 이 타이머가 서버 종료를 막지 않게
}
export async function warmContext() {
  if (_warm && _warm.ctx) { _touchWarm(); return _warm.ctx; }
  const { browser, ctx } = await launchBrowser({ warmup: false }); // 저장세션으로 인증 게이트 없이
  _warm = { browser, ctx };
  _touchWarm();
  return ctx;
}
export async function closeWarm() {
  if (_warmIdle) { clearTimeout(_warmIdle); _warmIdle = null; }
  const w = _warm; _warm = null;
  if (w) { try { await w.browser.close(); } catch {} }
}

// 스캐너가 지금 실제로 어느 나라 IP로 나가는지 확인 — 틱톡이 보는 것과 동일한 출구 IP.
// VPN(시스템) 또는 TIKTOK_PROXY 가 적용됐는지 눈으로 볼 수 있게.
export async function checkExitLocation() {
  const { browser, ctx } = await launchBrowser({ warmup: false }); // 인증 게이트 없이 빠르게
  const page = await ctx.newPage();
  let info = {};
  try {
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const txt = await page.evaluate(() => document.body.innerText);
    info = JSON.parse(txt);
  } catch (e) { info = { error: String((e && e.message) || e) }; }
  try { await browser.close(); } catch {}
  return { ip: info.ip || null, country: info.country || null, city: info.city || null, region: info.region || null, proxied: !!proxyFromEnv(), error: info.error || null };
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
export async function fetchVideos(ctx, handle, { timeout = 45000, attempts = 2, quick = false } = {}) {
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
  const probeInline = () => page.evaluate(() => {
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
  const applyProbe = (probe) => { if (!probe) return; hasUser = probe.hasUser; if (probe.videoCount != null) videoCount = probe.videoCount; if (!videos.length && Array.isArray(probe.inline)) videos = probe.inline; };
  // quick(개별 확인): 스크롤 전에 초기 데이터부터 확인(최근 영상은 보통 거기 있음) → 없을 때만 짧게 2회, 1회 시도.
  // 전체 스캔(quick=false)은 기존대로 6회×2.2초 스크롤 후 인라인 확인.
  const maxAtt = quick ? 1 : attempts, scrolls = quick ? 2 : 6, waitMs = quick ? 900 : 2200;
  for (let att = 0; att < maxAtt; att++) {
    try {
      await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout });
      if (quick) applyProbe(await probeInline()); // 스크롤 전 선확인 → 있으면 바로 끝
      for (let i = 0; i < scrolls && !videos.length; i++) {
        await page.mouse.wheel(0, 2200);
        await page.waitForTimeout(waitMs);
      }
      applyProbe(await probeInline());
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

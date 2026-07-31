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

/* ⚠️ page.evaluate 에는 기본 타임아웃이 없다. 캡차 페이지처럼 렌더러가 붙들려 있으면
   영영 안 돌아온다 — 실제로 업로드 스캔이 45/45 에서 10분 넘게 선 채로 있었다.
   화면에는 진행률만 멈춰 보이고, 중단 버튼도 안 먹었다(멈춤 상태가 아니라 대기 중이라서).
   페이지에 묻는 모든 질문에 상한을 건다. 답이 늦으면 '못 읽었다'로 넘어간다. */
const EVAL_MS = 8000;
function withTimeout(p, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, ms);
    if (t.unref) t.unref();
    const fin = (v) => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } };
    Promise.resolve(p).then(fin, () => fin(fallback));
  });
}

// 프로필 데이터가 실제로 렌더됐는가 = 봇월/로봇인증을 통과했는가.
async function profileRendered(page) {
  try {
    return await withTimeout(page.evaluate(() => {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!el) return false;
      const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
      const info = scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo;
      return !!(info && info.user && info.user.id);
    }), EVAL_MS, false);
  } catch { return false; }
}

/* 지금 이 페이지가 무슨 상태인가. 셋을 구분해야 한다:
     ok       — 프로필이 떴다(통과)
     captcha  — 봇 인증/봇월. 사람이 풀면 통과한다
     notfound — 없는 계정. 기다려봐야 소용없다
   이 구분이 없으면 둘 중 하나로 망한다: 없는 계정까지 2분씩 기다려 45명 스캔이 한 시간이 되거나,
   반대로 진짜 캡차를 5초 만에 닫아버려 사람이 슬라이더를 잡는 순간 창이 사라진다. */
async function pageKind(page) {
  return withTimeout(page.evaluate(() => {
    if (document.querySelector('.captcha_verify_container, #captcha_container, #captcha-verify-image, [class*="captcha_verify"], [id*="captcha"]')) return 'captcha';
    const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if (el) {
      try {
        const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
        const ud = scope['webapp.user-detail'];
        if (ud && ud.userInfo && ud.userInfo.user && ud.userInfo.user.id) return 'ok';
        if (ud && ud.statusCode) return 'notfound';   // 10221 등 = 계정 없음/비공개
      } catch {}
    }
    const t = ((document.body && document.body.innerText) || '').slice(0, 600);
    if (/Couldn't find this account|該当するアカウント|계정을 찾을 수 없/i.test(t)) return 'notfound';
    if (/Please wait|Too many requests|Access Denied|Verify to continue|認証|보안 확인/i.test(t)) return 'captcha';
    return 'unknown';
  }), EVAL_MS, 'unknown');
}

/* 봇 인증이 떴으면 사람이 풀 때까지 탭을 열어 둔다.
   ⚠️ 이게 없어서 실제로 이런 일이 있었다: 스캔이 스크롤 3회(5.4초)만 돌고 page.close() 를 해서,
   사람이 슬라이더를 맞추는 도중에 창이 사라졌다. 기다림은 '캡차가 실제로 떠 있을 때만' 건다.
   창은 앞으로 끌어와 준다 — 탭이 둘 도는데 어느 창인지 찾느라 시간을 쓰면 안 된다. */
const CAPTCHA_WAIT_MS = Number(process.env.TIKTOK_CAPTCHA_WAIT_MS || 150000);
async function waitForHuman(page, handle, onCaptcha) {
  /* ⚠️ 사람이 보고 있을 때만 기다린다.
     onCaptcha 콜백은 '화면에 진행상황을 띄우는 누군가가 있다'는 뜻이다(스캔 버튼).
     집행(/api/execute)은 팔로워를 다시 확인하려고 이 함수를 부르는데 그 경로엔 콜백이 없다 —
     거기서 2분 30초씩 기다리면 계정 수만큼 곱해져 주문이 영영 안 나간다.
     실제로 집행이 무한대기에 빠졌다. 볼 사람이 없으면 기다리지 않고 실패로 넘긴다. */
  if (!onCaptcha) return false;
  let kind = await pageKind(page);
  if (kind !== 'captcha') return kind === 'ok';
  try { await page.bringToFront(); } catch {}
  if (onCaptcha) { try { onCaptcha({ handle, waiting: true, ms: CAPTCHA_WAIT_MS }); } catch {} }
  const start = Date.now();
  let solved = false;
  while (Date.now() - start < CAPTCHA_WAIT_MS) {
    await page.waitForTimeout(1200).catch(() => {});
    kind = await pageKind(page);
    if (kind === 'ok') { solved = true; break; }
    if (kind === 'notfound') break;
  }
  if (onCaptcha) { try { onCaptcha({ handle, waiting: false, solved }); } catch {} }
  return solved;
}

// 창 하나만 먼저 띄운다. 이 창에서 로봇 인증을 사람이 끝내고, 대시보드에서 '스캔 시작'을 누르면
// (waitForGo 가 resolve) 그때부터 실제 스캔이 착수한다. 통과 쿠키는 같은 ctx 의 모든 탭에 적용된다.
//
// 예전엔 자동 감지(프로필 렌더 폴링)로 판단했는데, 시간 압박·오탐이 있었다.
// 이제는 '사람 확인'이 기본 신호다: waitForGo 가 resolve 되면 신뢰하고 진행.
// (프로필이 저절로 렌더되면 인증이 필요 없던 것이므로 확인 없이도 자동 진행 — 쿠키 살아있을 때 편의)
async function warmUp(ctx, { onWarmup, waitForGo, takeGo, onNote, shouldStop, timeout = 15 * 60 * 1000 } = {}) {
  const page = await ctx.newPage();
  const start = Date.now();
  let ok = false;
  let confirmed = false;
  const note = (m) => { if (onNote) { try { onNote(m); } catch {} } };
  if (waitForGo) { try { Promise.resolve(waitForGo()).then(() => { confirmed = true; }).catch(() => {}); } catch {} }
  try {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    try { await page.bringToFront(); } catch {}
    if (onWarmup) { try { onWarmup(); } catch {} } // 창 떴고 인증 대기 — 화면에 '스캔 시작' 버튼 띄우라는 신호
    let lastReload = Date.now();
    while (Date.now() - start < timeout) {
      /* ⚠️ '완전 중지'가 여기서 안 먹었다. 인증 대기는 15분짜리 루프인데 중지 깃발을 안 봤다 —
         로봇 인증이 안 풀리면 눌러도 안 멈추고, 서버를 죽이는 것 말고는 크롬 창을 접을 방법이 없었다.
         (중지는 스캔 중일 때만 먹는다고 고쳤는데, 인증 구간이 그 바깥에 남아 있었다) */
      if (shouldStop && shouldStop()) { note('중지했어요 — 스캔을 시작하지 않았습니다.'); break; }
      if (await profileRendered(page)) { ok = true; break; }   // 인증 필요 없었음(쿠키 살아있음) → 자동 진행

      const kind = await pageKind(page);

      /* 사람이 '스캔 시작' 을 눌렀다 — 눌렀다고 곧바로 믿지 않는다.
         ⚠️ 예전엔 누르면 무조건 착수했다. 인증이 아직 안 풀린 상태로 시작하면 계정마다
         전부 실패하고, 사람은 '눌렀는데 왜 다 실패하지' 만 보게 된다. 화면을 다시 확인하고,
         아직이면 착수하지 않고 그렇게 말한 뒤 계속 기다린다(다시 누를 수 있다). */
      if (confirmed || (takeGo && takeGo())) {
        confirmed = false;
        if (await profileRendered(page)) { ok = true; break; }
        note(kind === 'captcha'
          ? '아직 로봇 인증이 안 끝났어요 — 크롬 창에서 인증을 마친 뒤 다시 눌러주세요.'
          : '화면이 아직 안 열렸어요 — 크롬 창을 확인한 뒤 다시 눌러주세요.');
        try { await page.bringToFront(); } catch {}
      }

      await page.waitForTimeout(1500);

      /* ⚠️ 새로고침이 문제였다. 예전엔 30초마다 무조건 page.goto 를 했다 —
         슬라이더를 맞추는 도중에 페이지가 갈아엎어져서 인증이 매번 초기화됐다.
         ('로봇인증 하려고 하면 창 닫고 새 창 열고' 가 이것이다)
         이제 인증 화면이 떠 있는 동안에는 절대 건드리지 않는다. 화면이 멎었을 때(unknown)만,
         그것도 2분에 한 번만 다시 연다. */
      if (kind !== 'captcha' && Date.now() - lastReload > 120000) {
        lastReload = Date.now();
        note('화면이 안 열려서 한 번 다시 엽니다.');
        await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      }
    }
    if (!ok) note('로봇 인증을 못 끝냈어요 — 스캔을 시작하지 않았습니다.');
  } catch {}
  try { await page.close(); } catch {}
  return ok;
}

// warmup=false 는 테스트용. 평소엔 항상 인증 관문을 거친다 (호출부가 빠뜨릴 수 없게 여기에 둠).
export async function launchBrowser({ warmup = true, onWarmup, waitForGo, takeGo, onNote, shouldStop } = {}) {
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
    const ok = await warmUp(ctx, { onWarmup, waitForGo, takeGo, onNote, shouldStop });
    if (!ok) {
      try { await browser.close(); } catch {}
      // 중지해서 안 연 것과 시간이 다 된 것은 다른 일이다 — 중지에 '시간 초과'라고 하면 안 된다.
      throw new Error(shouldStop && shouldStop()
        ? '중지했어요 — 스캔을 시작하지 않았습니다.'
        : '로봇 인증 대기가 끝났어요(시간 초과). 크롬 창에서 인증을 끝내고 스캔을 다시 눌러주세요.');
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
/* 프로필에서 팔로워·닉네임. 실패하면 followers:null 로 돌려준다(throw 안 함).
   ⚠️ 예전엔 8회×1.2초=9.6초만 기다리고 포기했다. 틱톡이 'Please wait...' 봇월을 띄우면
   그 화면엔 __UNIVERSAL_DATA__ 자체가 없어서, 통과가 늦은 계정은 멀쩡한데도 실패로 잡혔다
   (실측: @t1013u 는 자동 스캔 3회 연속 실패했지만 브라우저로 열어보니 6초 뒤 팔로워 1,285 정상 표시).
   그래서 ① 대기를 20회×1.2초=24초로 늘리고 ② 중간에 한 번 새로고침한다 —
   봇월은 재요청 때 풀리는 경우가 많아 마냥 기다리는 것보다 낫다. */
export async function fetchProfile(ctx, handle, { timeout = 30000, tries = 20, onCaptcha } = {}) {
  const page = await ctx.newPage();
  let out = { followers: null, nickname: '' };
  const read = () => withTimeout(page.evaluate(() => {
    const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if (!el) return null;
    try {
      const info = JSON.parse(el.textContent)?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo;
      if (info?.stats && Number.isFinite(info.stats.followerCount)) {
        return { followers: info.stats.followerCount, nickname: info?.user?.nickname || '' };
      }
    } catch {}
    return null;
  }), EVAL_MS, null);
  try {
    const url = `https://www.tiktok.com/@${handle}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    let reloaded = false;
    for (let i = 0; i < tries; i++) {
      const r = await read().catch(() => null);
      if (r) { out = r; break; }
      // 절반쯤 지나도 못 읽었으면 한 번만 새로고침 — 봇월이 그때 풀리는 경우가 많다.
      if (!reloaded && i === Math.floor(tries / 2)) {
        reloaded = true;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout }).catch(() => {});
      }
      await page.waitForTimeout(1200);
    }
    // 24초를 다 쓰고도 못 읽었으면 봇 인증일 수 있다 — 여기서도 사람을 기다린다.
    if (out.followers == null && await waitForHuman(page, handle, onCaptcha)) {
      const r2 = await read().catch(() => null);
      if (r2) out = r2;
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
export async function fetchVideos(ctx, handle, { timeout = 45000, attempts = 2, quick = false, onCaptcha } = {}) {
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
  const probeInline = () => withTimeout(page.evaluate(() => {
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
  }), EVAL_MS, null);
  const applyProbe = (probe) => { if (!probe) return; hasUser = probe.hasUser; if (probe.videoCount != null) videoCount = probe.videoCount; if (!videos.length && Array.isArray(probe.inline)) videos = probe.inline; };
  /* 스크롤 전에 인라인 데이터부터 본다 — 최근 영상은 대개 첫 응답(__UNIVERSAL_DATA__)에 들어 있다.
     예전엔 전체 스캔이 이걸 안 보고 무조건 6회×2.2초(최대 13초)를 돌아, 이미 손에 든 답을
     두고 기다렸다. quick 모드에만 있던 선확인을 전체 스캔에도 적용하고 스크롤을 3회로 줄인다.
     스크롤은 '인라인에 없을 때'의 보험이지 기본 경로가 아니다. */
  const maxAtt = quick ? 1 : attempts, scrolls = quick ? 2 : 3, waitMs = quick ? 900 : 1800;
  for (let att = 0; att < maxAtt; att++) {
    try {
      await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout });
      applyProbe(await probeInline()); // 스크롤 전 선확인 → 있으면 바로 끝(대부분 여기서 끝난다)
      for (let i = 0; i < scrolls && !videos.length; i++) {
        await page.mouse.wheel(0, 2200);
        await page.waitForTimeout(waitMs);
      }
      if (!videos.length) applyProbe(await probeInline());
      /* 아직도 못 읽었다면 봇 인증일 수 있다 — 사람이 풀 시간을 주고 다시 읽는다.
         (캡차가 아니면 waitForHuman 이 즉시 false 로 빠지므로 없는 계정에서 시간을 안 버린다) */
      if (!videos.length && !hasUser) {
        if (await waitForHuman(page, handle, onCaptcha)) {
          applyProbe(await probeInline());
          for (let i = 0; i < scrolls && !videos.length; i++) {
            await page.mouse.wheel(0, 2200);
            await page.waitForTimeout(waitMs);
          }
          if (!videos.length) applyProbe(await probeInline());
        }
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

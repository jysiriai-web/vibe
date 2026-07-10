// 틱톡 영상 목록 수집 (Playwright, 창 보이게 = 봇 감지 우회). 캠페인 감지·성과용.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function launchBrowser() {
  const { chromium } = await import('playwright'); // 미설치면 여기서 throw
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
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

// 한 계정의 최근 영상을 { videos, ok, error } 로 반환.
//
// ⚠️ ok 가 핵심이다. 예전엔 실패해도 그냥 [] 을 돌려줬고, 호출부는 그걸 '영상 없음'으로 읽어
//    "미업로드" 로 기록했다. 틱톡 봇월에 한 번 막히면 이미 올라온 영상까지 미업로드로 뒤집혔다.
//      ok=false           → "못 봤다" (차단·타임아웃)
//      ok=true, videos=[] → "봤는데 영상이 없다"
//    이 둘은 절대 같은 뜻이 아니다.
export async function fetchVideos(ctx, handle, { timeout = 45000 } = {}) {
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
  let profileLoaded = false;
  let error = '';
  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout });
    for (let i = 0; i < 6 && !videos.length; i++) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(2200);
    }
    // 프로필 데이터가 실제로 렌더됐는가 = 봇월을 통과했는가.
    // '영상 0개'와 '차단'을 가르는 유일한 신호라 반드시 확인한다.
    try {
      const probe = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return null;
        const scope = JSON.parse(el.textContent)['__DEFAULT_SCOPE__'] || {};
        const user = scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo;
        let inline = null;
        for (const k of Object.keys(scope)) if (scope[k] && scope[k].itemList) { inline = scope[k].itemList; break; }
        return { hasUser: !!(user && user.user && user.user.id), inline };
      });
      if (probe) {
        profileLoaded = probe.hasUser;
        if (!videos.length && Array.isArray(probe.inline)) videos = probe.inline;
      }
    } catch {}
  } catch (e) {
    error = String((e && e.message) || e).slice(0, 120);
  }
  await page.close();
  const ok = videos.length > 0 || profileLoaded; // 영상을 하나라도 받았으면 통과한 것
  return { videos, ok, error: ok ? '' : error || '프로필을 못 열었어요 (차단 의심)' };
}

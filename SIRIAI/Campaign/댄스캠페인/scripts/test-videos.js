// 틱톡 영상 목록 가져오기 테스트 v2 (Playwright, 창 보이게 + 스크롤). 무료 방식 가능성 확인.
//   node scripts/test-videos.js @maru_changho @studio_maru @rico_920
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('\n❌ Playwright 미설치. install-playwright.bat 먼저 실행.\n');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const handles = process.argv.slice(2).map((h) => (String(h).match(/[A-Za-z0-9._]+/) || [])[0]).filter(Boolean);
if (!handles.length) { console.log('사용법: node scripts/test-videos.js @maru_changho'); process.exit(1); }

// headless:false = 진짜 창 → 틱톡 봇 감지 우회율 높음
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
let firstDump = null;

for (const handle of handles) {
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
  process.stdout.write(`\n@${handle} ... `);
  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.log(`❌ 로드 오류: ${e.message}`);
    await page.close();
    continue;
  }
  // 영상 그리드 로딩 유도: 스크롤 반복
  for (let i = 0; i < 6 && !videos.length; i++) {
    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(2200);
  }
  // 폴백1: 페이지에 박힌 데이터
  if (!videos.length) {
    try {
      const inline = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el) return null;
        const scope = (JSON.parse(el.textContent)['__DEFAULT_SCOPE__']) || {};
        for (const k of Object.keys(scope)) { if (scope[k]?.itemList) return scope[k].itemList; }
        return null;
      });
      if (Array.isArray(inline)) videos = inline;
    } catch {}
  }
  // 폴백2: DOM 영상 링크(업로드 감지만)
  let domLinks = [];
  if (!videos.length) {
    try {
      domLinks = await page.$$eval('a[href*="/video/"]', (as) => [...new Set(as.map((a) => a.href))].slice(0, 5));
    } catch {}
  }

  if (videos.length) {
    console.log(`✅ 영상 ${videos.length}개 (풀데이터)`);
    videos.slice(0, 3).forEach((v) => {
      console.log(`   · ${(v.desc || '').replace(/\n/g, ' ').slice(0, 55)}`);
      console.log(`     음원: ${v.music?.title || '?'} (id ${v.music?.id || '?'}) | 조회수: ${v.stats?.playCount ?? '?'}`);
    });
    if (!firstDump) firstDump = { handle, count: videos.length, sample: videos[0] };
  } else if (domLinks.length) {
    console.log(`△ 영상 링크만 ${domLinks.length}개 (업로드 감지는 가능, 음원·조회수는 X)`);
    domLinks.slice(0, 3).forEach((u) => console.log(`   · ${u}`));
  } else {
    // 실패 → 진단 스샷
    mkdirSync(join(root, 'data'), { recursive: true });
    const shot = join(root, 'data', `video-debug-${handle}.png`);
    try { await page.screenshot({ path: shot }); } catch {}
    const title = await page.title().catch(() => '?');
    console.log(`❌ 못 가져옴 | 페이지 제목: "${title}" | 스샷: data/video-debug-${handle}.png`);
  }
  await page.close();
}

await browser.close();
if (firstDump) {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'videos-sample.json'), JSON.stringify(firstDump, null, 2));
  console.log('\n(영상 데이터 샘플 → data/videos-sample.json)');
}
console.log('');

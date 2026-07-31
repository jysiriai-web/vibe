// 히어로 타이포 안 여러 개를 실제로 구워서 비교
const p = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const SRC = 'C:/Users/whwns/Desktop/VIBE/SIRIAI/Routine/2_compose/templates/intercharm/_굽기/히어로_디자인원본.html';
const TMP = 'C:/Users/whwns/Desktop/VIBE/SIRIAI/Routine/2_compose/templates/intercharm/_굽기/_tmp';

// [id, 라벨, font-size, line-height(px), weight, letter-spacing]
const OPTS = [
  ['A', '홈페이지 그대로 · 33px / 행간0.95', 33, 31, 500, '-0.02em'],
  ['B', '행간만 품 · 33px / 행간1.15', 33, 38, 500, '-0.02em'],
  ['C', '크게+타이트 · 38px / 행간1.0', 38, 38, 500, '-0.02em'],
  ['D', '크게+적당 · 36px / 행간1.12', 36, 40, 500, '-0.02em'],
  ['E', '가볍게 · 34px / 행간1.15 / w400', 34, 39, 400, '-0.015em'],
];

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const base = fs.readFileSync(SRC, 'utf8');
  const re = /<div class="big" style="[^"]*"/;

  const b = await p.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'],
  });

  for (const [id, label, fs_, lh, w, ls] of OPTS) {
    const style = `font-size:${fs_}px;line-height:${lh}px;font-weight:${w};letter-spacing:${ls};`
      + `color:#f4f4f3;font-family:'Noto Sans KR','Inter Tight',Helvetica,Arial,sans-serif;word-break:keep-all;`;
    const html = base.replace(re, `<div class="big" style="${style}"`);
    const f = path.join(TMP, `h_${id}.html`);
    fs.writeFileSync(f, html, 'utf8');

    const pg = await b.newPage();
    await pg.setViewport({ width: 760, height: 1200, deviceScaleFactor: 2 });
    await pg.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 60000 });
    await pg.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1800));
    const el = (await pg.evaluateHandle(() =>
      [...document.querySelectorAll('*')].find(e => (getComputedStyle(e).backgroundImage || '').includes('hero_bg')))).asElement();
    await el.screenshot({ path: `./opt_${id}.png` });
    console.log(`  ${id}  ${label}`);
    await pg.close();
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

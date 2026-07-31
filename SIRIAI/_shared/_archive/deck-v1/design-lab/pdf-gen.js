const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'pdf');
const versions = [
  ['v1', '분야별 레이아웃 변주'],
  ['v2', '에디토리얼 매거진'],
  ['v3', '소프트 오가닉'],
  ['v4', '제품 스테이지'],
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  for (const [v, name] of versions) {
    await page.goto(`http://localhost:8770/field-variations-${v}.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    // 시안 표시 플래그 제거
    await page.evaluate(() => { const f = document.querySelector('.lab-flag'); if (f) f.remove(); });
    await new Promise(r => setTimeout(r, 700)); // 폰트/그라데이션 안정화
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.pdf({
      path: path.join(OUT, `SIRIAI-02-${v}.pdf`),
      width: '1280px',
      height: `${h}px`,
      printBackground: true,
    });
    console.log(`PDF done: ${v} (${name}) — height ${h}px`);
  }
  await browser.close();
  console.log('ALL DONE');
})();

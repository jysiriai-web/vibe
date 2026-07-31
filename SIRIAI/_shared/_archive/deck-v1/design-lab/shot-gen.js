const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// usage: node shot-gen.js <file.html> <name> <count>
const file = process.argv[2] || 'pb-mystery-variations.html';
const tag = process.argv[3] || 'pb';
const count = parseInt(process.argv[4] || '4', 10);

const OUT = path.join(__dirname, 'shots');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const target = file.startsWith('http') ? file : `http://localhost:8770/${file}`;
  await page.goto(target, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate(() => { const f = document.querySelector('.lab-flag'); if (f) f.remove(); });
  await new Promise(r => setTimeout(r, 600));
  for (let i = 0; i < count; i++) {
    await page.evaluate(y => window.scrollTo(0, y), i * 800);
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(OUT, `${tag}-${i + 1}.png`) });
    console.log('shot', tag, i + 1);
  }
  await browser.close();
  console.log('DONE');
})();

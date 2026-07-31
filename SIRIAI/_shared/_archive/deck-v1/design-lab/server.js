const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

// "/" 는 현재 활성 시안으로 매핑 (버전 올라가면 이 한 줄만 교체)
const ACTIVE = 'field-variations-v1.html';

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/' + ACTIVE;
  const fp = path.join(root, p);
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + p);
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8770, () => console.log('design-lab serving on http://localhost:8770 (active: ' + ACTIVE + ')'));

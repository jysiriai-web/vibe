require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
const http = require('http');
const { exec } = require('child_process');
const path = require('path');

const PORT = 3002;
const PROJECT_ROOT = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method === 'POST' && req.url === '/api/deploy') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: '시작됨 — 이 창에서 진행상황 확인' }));

    console.log('\n[' + new Date().toLocaleTimeString() + '] 매칭 + 배포 시작...');
    exec('npm run update', { cwd: PROJECT_ROOT, timeout: 600000 }, (err, stdout, stderr) => {
      if (err) { console.error('오류:', stderr || err.message); }
      else { console.log(stdout); console.log('✓ 배포 완료\n'); }
    });
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`Deploy Agent 실행 중 (포트 ${PORT})`);
  console.log('Vercel 대시보드에서 "매칭 실행" 버튼을 누르면 여기서 처리됩니다.\n');
});

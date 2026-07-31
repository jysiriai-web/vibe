// 오픈 추적 픽셀 — 메일이 열리면 이 주소가 불리고 '열람기록' 탭에 한 줄 남는다.
//   <img src="https://<배포주소>/api/o?c=LAN4077" width="1" height="1">
//
// 마스터 시트의 어떤 칸도 건드리지 않는다(클릭 열은 실시간 수식이라 덮어쓰면 깨진다).
// 의존성 0 — node 내장 crypto 로 서비스계정 JWT 를 직접 서명한다.
const crypto = require('crypto');

const SHEET_ID = process.env.SHEET_ID || '1ebBKzcX3dEN77EElLBWn1fHZtBFOLoPz8upDLvdO2kQ';
const TAB = '열람기록';
// 1x1 투명 GIF
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const b64u = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

function kst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 19)}`;   // yyyy-mm-dd hh:mm:ss
}

module.exports = async (req, res) => {
  // 픽셀은 무슨 일이 있어도 돌려준다 — 기록 실패가 메일 렌더를 깨뜨리면 안 된다
  const done = () => {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).end(GIF);
  };
  try {
    const url = new URL(req.url, 'http://x');
    const code = (url.searchParams.get('c') || '').trim().toUpperCase();
    if (!/^[A-Z]{3}\d{4}$/.test(code)) return done();

    const sa = JSON.parse(process.env.GOOGLE_SA || '{}');
    if (!sa.client_email) return done();
    const tk = await token(sa);
    const api = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}`;

    // 같은 코드가 2분 내 다시 오면 무시 — Gmail 프록시가 한 번에 여러 번 부르는 경우가 있다
    const now = kst();
    const prev = await fetch(`${api}!A2:B?majorDimension=ROWS`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (prev.ok) {
      const rows = ((await prev.json()).values || []).slice(-40);
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((rows[i][1] || '').trim().toUpperCase() !== code) continue;
        const gap = Date.parse(now.replace(' ', 'T')) - Date.parse(String(rows[i][0]).replace(' ', 'T'));
        if (gap >= 0 && gap < 120000) return done();     // 중복으로 보고 버림
        break;
      }
    }

    const ua = (req.headers['user-agent'] || '').slice(0, 60);
    await fetch(`${api}!A:D:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[now, code, '', ua]] }),
    });
  } catch (e) {
    // 조용히 삼킨다
  }
  done();
};

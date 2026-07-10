// 클라우드(Vercel) 모드 + 팀 접속 비번.
// 로컬 대시보드(대표님 PC)는 CLOUD=false 라 비번 없이 지금까지처럼 그대로 쓴다.
// 클라우드는 팀이 URL 로 들어오므로 비번 게이트를 걸고, 스캔·돈 라우트는 아예 막는다.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const CLOUD = !!(process.env.GARDEN_CLOUD || process.env.VERCEL);
const TEAM_PW = process.env.TEAM_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || (CLOUD ? '' : randomBytes(32).toString('hex'));
const COOKIE = 'garden_team';
const MAX_AGE = 60 * 60 * 24 * 365; // 1년 — 팀원이 링크 한 번 누르면 계속 유지

// 팀 비번이 설정돼 있을 때만 게이트가 켜진다(로컬은 미설정 → 그대로 열림).
export const authRequired = () => !!TEAM_PW;

// 클라우드 설정 안전장치 — 하나라도 빠지면 열지 않는다.
//  · TEAM_PASSWORD 없이 열면 시트 데이터가 인터넷에 공개된다.
//  · SESSION_SECRET 없이 비번만 켜면 쿠키 검증이 항상 실패해 로그인 무한루프가 된다.
export function cloudConfigError() {
  if (!CLOUD) return null;
  const missing = [];
  if (!TEAM_PW) missing.push('TEAM_PASSWORD');
  if (!SECRET) missing.push('SESSION_SECRET');
  if (!process.env.CAMPAIGNS_JSON) missing.push('CAMPAIGNS_JSON');
  if ((process.env.GARDEN_STATE || '').toLowerCase() !== 'sheet') missing.push('GARDEN_STATE=sheet');
  if (!missing.length) return null;
  return `Vercel 환경변수가 빠졌어요: ${missing.join(', ')}\nSettings → Environment Variables 에서 넣고, Deployments 에서 Redeploy 하세요.`;
}

// 클라우드에서 실행 불가한 것들 — 대표님 PC 대시보드 전용.
// (틱톡 스캔은 집 IP+실제 크롬 필요, 집행/종료/포기는 돈, 환율·서비스는 설정 파일 쓰기)
export const LOCAL_ONLY = new Set([
  '/api/scan',
  '/api/content-scan',
  '/api/content-scan/status',
  '/api/plan',
  '/api/execute',
  '/api/order/close',
  '/api/order/abandon',
  '/api/rate',
  '/api/service',
]);
export const isLocalOnly = (path) => CLOUD && LOCAL_ONLY.has(path);

function eq(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
export const passwordMatches = (input) => !!TEAM_PW && eq(input, TEAM_PW);

const sign = (v) => createHmac('sha256', SECRET).update(v).digest('hex');

// 토큰 = 만료시각.서명  (SESSION_SECRET 을 모르면 위조 불가)
export function makeToken() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${sign(exp)}`;
}
export function tokenValid(token) {
  if (!token || !SECRET) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig) return false;
  if (!eq(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export function cookieHeader(token) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${MAX_AGE}`];
  if (CLOUD) parts.push('Secure');
  return parts.join('; ');
}
export function readCookie(req) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}
export const authed = (req) => !authRequired() || tokenValid(readCookie(req));

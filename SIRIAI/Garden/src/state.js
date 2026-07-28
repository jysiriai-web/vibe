// 시트 상태 저장소 클라이언트 (호스팅 1단계) — 주문(돈)·검수잠금·베스트를 마스터시트 _orders/_state 탭에 읽고 쓴다.
// ⚠️ 이 단계에서는 server.js 가 아직 이 파일을 부르지 않는다. 로컬 data/c/<id>/*.json 이 여전히 유일한 진실.
//    2단계에서 server.js 의 loadOrders/saveOrders 등을 여기로 갈아끼운다.
// 주문은 브릿지가 _json 열(무손실 원본)만 읽어 돌려주므로 charge 문자열·remains 빈값이 그대로 보존된다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 2단계 전환 스위치. 'sheet' 로 켜면 시트가 진실, 기본 'local' 은 로컬 파일.
export function stateMode() {
  return (process.env.GARDEN_STATE || 'local').toLowerCase() === 'sheet' ? 'sheet' : 'local';
}

function ensure(sheet) {
  if (!sheet || !sheet.url || !sheet.token) {
    throw new Error('캠페인 시트 설정(url/token)이 없습니다. campaigns.json 확인.');
  }
}

async function get(sheet, action) {
  ensure(sheet);
  const res = await fetch(`${sheet.url}?action=${action}&token=${encodeURIComponent(sheet.token)}`, { redirect: 'follow' });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data;
}

async function post(sheet, payload) {
  ensure(sheet);
  const res = await fetch(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, ...payload }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data;
}

// ── 주문 (돈 로그) ─────────────────────────────────────────
export async function getOrders(sheet) {
  return (await get(sheet, 'orders')).orders || [];
}
// id 유일키 upsert. 브릿지가 행을 지우지 않으므로 기존 돈 기록은 절대 유실되지 않는다.
export async function putOrders(sheet, orders) {
  if (!orders || !orders.length) return 0;
  return (await post(sheet, { orders })).upserted || 0;
}

// ── 검수잠금(overrides) · 베스트(best) ───────────────────────
export async function getState(sheet) {
  const d = await get(sheet, 'state');
  return { overrides: d.overrides || {}, best: d.best || [] };
}
export async function getOverrides(sheet) {
  return (await getState(sheet)).overrides;
}
export async function putOverrides(sheet, overrides) {
  return (await post(sheet, { state: { overrides } })).written || 0;
}
export async function getBest(sheet) {
  return (await getState(sheet)).best;
}
export async function putBest(sheet, best) {
  return (await post(sheet, { state: { best } })).written || 0;
}

// 계정 + 주문 + 상태를 한 번에 (2단계에서 /api/data 왕복 절약용)
export async function getBundle(sheet) {
  const d = await get(sheet, 'bundle');
  // getAccountsFromSheet 와 같은 규칙 — 헤더행을 못 찾았으면 추측 좌표로 읽어 온 값이라 안 쓴다.
  if (d.colinfo && d.colinfo.headerFound === false) {
    throw new Error('마스터 헤더행(계정링크 + 닉네임/진행사)을 못 찾았어요 — 열 위치를 몰라 값을 읽지 않았습니다. 시트 헤더 이름을 확인해 주세요.');
  }
  // scans = 마지막 스캔 시각. 여기서 안 넘기면 배포본(로컬 파일 없음)이 영영 '아직' 이다.
  // startFol = 계정별 최초 팔로워. ⚠️ 여기 안 적으면 시트에 있어도 화면까지 못 온다
  //    — 이 함수는 '아는 키만' 통과시킨다(브릿지·readAll 도 같은 구조라 네 군데 다 열어야 했다).
  return { accounts: d.accounts || [], orders: d.orders || [], overrides: d.overrides || {}, best: d.best || [], scans: d.scans || {}, startFol: d.startFol || {}, svcPick: d.svcPick || null };
}

// ── 로컬 파일 폴백 (2단계 전환·백업 이중쓰기용) ─────────────
const readJson = (f, dflt) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : dflt);
const writeJson = (dir, f, v) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, f), JSON.stringify(v, null, 2)); };

export const localOrders = (dataDir) => readJson(join(dataDir, 'orders.json'), []);
export const localOverrides = (dataDir) => readJson(join(dataDir, 'overrides.json'), {});
export const localBest = (dataDir) => readJson(join(dataDir, 'best.json'), []);
export const saveLocalOrders = (dataDir, v) => writeJson(dataDir, 'orders.json', v);

// 상태 계층 (호스팅 2단계) — 주문(돈)·검수잠금·베스트를 '로컬 파일' 또는 '시트'에서 읽고 쓴다.
// GARDEN_STATE=sheet 로 켜면 시트가 진실, 기본(local)은 지금까지처럼 로컬 파일.
//
// 돈 안전 3원칙 (이 파일의 존재 이유):
//  ① 쓰기는 로컬 파일 먼저(동기·거의 안 깨짐) → 시트 나중(네트워크·실패 가능).
//     smmkings 과금 직후 호출되므로, 시트가 실패해도 주문 기록은 절대 유실되지 않는다.
//  ② 읽기는 시트가 진실이되, '로컬에만 있는 주문'(=이전 시트 쓰기 실패분)을 반드시 합쳐서 돌려준다.
//     안 그러면 그 주문이 진행중으로 안 잡혀 같은 계정을 또 사게 된다(이중지출).
//  ③ 시트 읽기 실패는 삼키지 않고 throw. 오래된 데이터로 집행하는 것을 막는다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadOrders as fileLoadOrders, saveOrders as fileSaveOrders } from './orders.js';
import { loadOverrides as fileLoadOverrides, OVERRIDE_COLS } from './overrides.js';
import { getAccountsFromSheet } from './sheet.js';
import { getOrders, putOrders, getState, putOverrides, putBest, getBundle } from './state.js';

export function mode() {
  return (process.env.GARDEN_STATE || 'local').toLowerCase() === 'sheet' ? 'sheet' : 'local';
}
export const isSheet = () => mode() === 'sheet';

// ── 로컬 파일 헬퍼 ────────────────────────────────────────
const ovFile = (dataDir) => join(dataDir, 'overrides.json');
const bestFile = (dataDir) => join(dataDir, 'best.json');
const readJson = (f, dflt) => { if (!existsSync(f)) return dflt; try { return JSON.parse(readFileSync(f, 'utf8')) ?? dflt; } catch { return dflt; } };
const writeJson = (dataDir, f, v) => { mkdirSync(dataDir, { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2)); };

export const localOrders = (campaign) => fileLoadOrders(campaign.dataDir);
export const localOverrides = (campaign) => fileLoadOverrides(campaign.dataDir);
export const localBest = (campaign) => readJson(bestFile(campaign.dataDir), []);

// ── 주문 (돈) ────────────────────────────────────────────
// 시트 목록에 없고 로컬에만 있는 주문 = 과거 시트 쓰기 실패분. 합쳐서 돌려주고 되올림 시도.
function mergeMissing(remote, local) {
  const rIds = new Set(remote.map((o) => String(o.id)));
  return local.filter((o) => !rIds.has(String(o.id)));
}

export async function readOrders(campaign) {
  if (!isSheet()) return localOrders(campaign);
  const remote = await getOrders(campaign.sheet); // 실패하면 throw (원칙 ③)
  const missing = mergeMissing(remote, localOrders(campaign));
  if (missing.length) {
    try { await putOrders(campaign.sheet, missing); } catch { /* 되올림 실패해도 아래서 합쳐 반환 */ }
    return remote.concat(missing); // 원칙 ②: 과금된 주문을 절대 빠뜨리지 않는다
  }
  return remote;
}

// 원칙 ①: 로컬 먼저, 시트 나중. 절대 throw 하지 않는다(과금 직후 호출되므로).
export async function writeOrders(campaign, orders) {
  fileSaveOrders(campaign.dataDir, orders); // 동기·durable
  if (!isSheet()) return { sheet: 'skip' };
  try { await putOrders(campaign.sheet, orders); return { sheet: 'ok' }; }
  catch (e) { return { sheet: 'fail', error: String(e.message || e) }; }
}

// ── 검수잠금(overrides) ──────────────────────────────────
export async function readOverrides(campaign) {
  if (!isSheet()) return localOverrides(campaign);
  return (await getState(campaign.sheet)).overrides;
}
async function writeOverrides(campaign, ov) {
  writeJson(campaign.dataDir, ovFile(campaign.dataDir), ov);
  if (!isSheet()) return { sheet: 'skip' };
  try { await putOverrides(campaign.sheet, ov); return { sheet: 'ok' }; }
  catch (e) { return { sheet: 'fail', error: String(e.message || e) }; }
}
export async function setOverrideStore(campaign, row, col, value) {
  if (!OVERRIDE_COLS.includes(Number(col))) return { sheet: 'skip' }; // 닉 등은 잠금 대상 아님
  const ov = await readOverrides(campaign);
  const r = String(row);
  ov[r] = ov[r] || {};
  ov[r][String(col)] = value;
  return writeOverrides(campaign, ov);
}
export async function clearOverrideStore(campaign, row, col) {
  const ov = await readOverrides(campaign);
  const r = String(row), c = String(col);
  if (!ov[r] || !(c in ov[r])) return { sheet: 'skip' };
  delete ov[r][c];
  if (!Object.keys(ov[r]).length) delete ov[r];
  return writeOverrides(campaign, ov);
}

// ── 베스트 ──────────────────────────────────────────────
export async function readBest(campaign) {
  if (!isSheet()) return localBest(campaign);
  return (await getState(campaign.sheet)).best;
}
export async function writeBest(campaign, arr) {
  writeJson(campaign.dataDir, bestFile(campaign.dataDir), arr);
  if (!isSheet()) return { sheet: 'skip' };
  try { await putBest(campaign.sheet, arr); return { sheet: 'ok' }; }
  catch (e) { return { sheet: 'fail', error: String(e.message || e) }; }
}

// ── 한 번에 (대시보드 로드용 — 시트 모드에서 왕복 1회) ────────
export async function readAll(campaign) {
  if (!isSheet()) {
    return { accounts: await getAccountsFromSheet(campaign.sheet), orders: localOrders(campaign), overrides: localOverrides(campaign), best: localBest(campaign) };
  }
  const b = await getBundle(campaign.sheet); // accounts+orders+overrides+best 를 한 번에
  const missing = mergeMissing(b.orders, localOrders(campaign));
  if (missing.length) {
    try { await putOrders(campaign.sheet, missing); } catch {}
    b.orders = b.orders.concat(missing); // 원칙 ②
  }
  return b;
}

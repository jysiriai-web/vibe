// 상태 계층 (호스팅 2단계) — 주문(돈)·검수잠금·베스트를 '로컬 파일' 또는 '시트'에서 읽고 쓴다.
// GARDEN_STATE=sheet 로 켜면 시트가 진실, 기본(local)은 지금까지처럼 로컬 파일.
//
// 돈 안전 원칙
//  ① writeOrders 는 절대 throw 하지 않는다. 로컬·시트 쓰기를 각각 독립 try/catch 로 감싸,
//     한쪽이 죽어도 다른 쪽은 반드시 시도한다. 어디에도 못 남기면 durable=false 로 알린다
//     (호출부가 배치를 중단시켜 '기록 없는 과금'이 더 늘지 않게 한다).
//  ② 시트 쓰기가 실패하면 pending 표시를 남긴다. 다음 읽기에서 '로컬이 더 최신'으로 보고
//     로컬을 우선 병합해 되올린다(read-repair). 없으면 abandoned/closed 같은 변경분이
//     다음 읽기에 시트값으로 조용히 되돌아간다.
//  ③ 주문(돈) 시트 읽기 실패는 삼키지 않고 throw — 낡은 데이터로 집행하는 것을 막는다.
//  ④ 검수잠금(overrides)은 반대로 '잠금을 잃지 않는 쪽'이 안전하다. 시트를 못 읽으면 로컬
//     잠금을 쓰고, 병합은 합집합으로 한다(잠금이 남으면 스캔 워커가 덮어쓰지 않는다).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadOrders as fileLoadOrders, saveOrders as fileSaveOrders } from './orders.js';
import { loadOverrides as fileLoadOverrides, OVERRIDE_FIELDS, normalizeOverrides, baseFieldOf } from './overrides.js';
import { getAccountsFromSheet } from './sheet.js';
import { getOrders, putOrders, getState, putOverrides, putBest, getBundle } from './state.js';
import { eq } from './state-diff.js';

export function mode() {
  return (process.env.GARDEN_STATE || 'local').toLowerCase() === 'sheet' ? 'sheet' : 'local';
}
export const isSheet = () => mode() === 'sheet';

// ── 로컬 파일 ────────────────────────────────────────────
const ovFile = (d) => join(d, 'overrides.json');
const bestFile = (d) => join(d, 'best.json');
const pendFile = (d) => join(d, 'pending-sync.json');
const readJson = (f, dflt) => { if (!existsSync(f)) return dflt; try { return JSON.parse(readFileSync(f, 'utf8')) ?? dflt; } catch { return dflt; } };
const writeJson = (dir, f, v) => { mkdirSync(dir, { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2)); };

export const localOrders = (c) => fileLoadOrders(c.dataDir);
export const localOverrides = (c) => fileLoadOverrides(c.dataDir);
export const localBest = (c) => readJson(bestFile(c.dataDir), []);

// ── pending: '시트에 아직 못 올린 변경이 있다' 표시 ──────────
const readPending = (c) => readJson(pendFile(c.dataDir), {});
function markPending(c, key, why) {
  try { const p = readPending(c); p[key] = { at: new Date().toISOString(), why: String(why || '') }; writeJson(c.dataDir, pendFile(c.dataDir), p); } catch {}
}
function clearPending(c, key) {
  try {
    const p = readPending(c);
    if (!(key in p)) return;
    delete p[key];
    if (Object.keys(p).length) writeJson(c.dataDir, pendFile(c.dataDir), p);
    else if (existsSync(pendFile(c.dataDir))) rmSync(pendFile(c.dataDir));
  } catch {}
}
export const pendingState = (c) => readPending(c);

// ── 캠페인·자원별 직렬화 (read-modify-write 경쟁 방지) ────────
const chains = new Map();
function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(key, next.then(() => {}, () => {}));
  return next;
}

// ── 주문 (돈) ────────────────────────────────────────────
/* 주문을 가리키는 키. id 가 없는 주문(수기 집행·'패널 확인 필요')이 있어서
   id 만 쓰면 전부 'null' 한 칸으로 뭉친다 — 재주문 차단 기록이 조용히 사라진다.
   브릿지(Code.gs)는 같은 사고를 겪고 uid 키로 고쳤는데 Node 쪽만 안 따라왔다. */
const okey = (o) => (o && o.id != null) ? String(o.id) : (o && o.uid ? 'uid:' + o.uid : '');
const idsOf = (arr) => new Set(arr.map(okey).filter(Boolean));

// 시트 결과 + 로컬을 합쳐 '과금된 주문이 절대 빠지지 않는' 배열을 만든다.
// pending 이면 로컬이 더 최신(변경분 포함) → 로컬 우선. 아니면 시트 우선 + 로컬에만 있는 것 추가.
export function reconcileOrders(campaign, remote) {
  const local = localOrders(campaign);
  /* ⚠️ 조회도 반드시 okey 로 한다. 집합만 okey 로 바꾸고 조회를 String(o.id) 로 두면
     id:null 주문(수기 집행·'패널 확인 필요')이 'null' 로 조회돼 집합에 절대 없고,
     매번 '상대편에 없는 주문'으로 판정돼 읽을 때마다 한 벌씩 늘어난다.
     실측: 5건 → 6건, 그 배열이 저장되면 다음 읽기에 7건. 지출 9,000 → 18,000.
     게다가 낡은 사본이 배열 뒤에 와서 마지막에 시트에 써지므로,
     방금 누른 '완료 처리'가 조용히 되돌아간다. */
  if (readPending(campaign).orders) {
    const lIds = idsOf(local);
    return { merged: local.concat(remote.filter((o) => !lIds.has(okey(o)))), needPush: true };
  }
  const rIds = idsOf(remote);
  const missing = local.filter((o) => !rIds.has(okey(o)));
  return { merged: missing.length ? remote.concat(missing) : remote, needPush: missing.length > 0 };
}
async function repairOrders(campaign, r) {
  if (r.needPush) {
    try { await putOrders(campaign.sheet, r.merged); clearPending(campaign, 'orders'); } catch {}
  }
  return r.merged;
}

// ⚠️ 락 없는 내부판. 반드시 withLock(`${id}:orders`) 안에서만 불러라.
// (withLock 은 재진입이 안 된다 — 같은 키를 안에서 또 잡으면 그 자리에서 멈춘다.)
async function readOrdersUnlocked(campaign) {
  if (!isSheet()) return localOrders(campaign);
  const remote = await getOrders(campaign.sheet); // 원칙 ③: 실패하면 throw
  return repairOrders(campaign, reconcileOrders(campaign, remote));
}

export function readOrders(campaign) {
  return withLock(`${campaign.id}:orders`, () => readOrdersUnlocked(campaign));
}

// 내가 못 본 id 는 남긴다. 같은 id 는 호출부(방금 계산한 쪽)가 이긴다.
// 이게 없으면 20초 폴링이 낡은 배열로 방금 나간 주문을 통째로 지운다 — 돈은 나갔는데 기록이 없어진다.
function mergeById(base, incoming) {
  const out = incoming.slice();
  const ids = new Set(out.map(okey).filter(Boolean));
  for (const o of base) { const k = okey(o); if (k && !ids.has(k)) out.push(o); }
  return out;
}

// 원칙 ①: 절대 throw 하지 않는다. 로컬·시트를 각각 독립 시도.
// durable=false → 어디에도 기록 못 함(과금됐다면 즉시 배치를 멈춰야 하는 상황).
async function writeOrdersUnlocked(campaign, orders) {
  const out = { local: 'fail', sheet: 'skip', durable: false };
  // 쓰기 직전의 pending 표식을 기억해 둔다. 내 쓰기가 도는 사이 남이 새로 찍은 표식까지
  // 지워버리면, 그쪽의 read-repair 가 영영 안 돌아 시트가 조용히 뒤처진다.
  const seenAt = (readPending(campaign).orders || {}).at || null;
  const merged = mergeById(localOrders(campaign), orders);
  try { fileSaveOrders(campaign.dataDir, merged); out.local = 'ok'; }
  catch (e) { out.localError = String((e && e.message) || e); }
  if (isSheet()) {
    try {
      await putOrders(campaign.sheet, merged);
      out.sheet = 'ok';
      const now = (readPending(campaign).orders || {}).at || null;
      if (now === seenAt) clearPending(campaign, 'orders');
    } catch (e) { out.sheet = 'fail'; out.sheetError = String((e && e.message) || e); markPending(campaign, 'orders', out.sheetError); }
  }
  out.durable = out.local === 'ok' || out.sheet === 'ok';
  out.orders = merged;
  return out;
}

// 집행(execute-core)만은 락을 잡지 않고 이 공개판을 쓴다 — 집행은 수 분이라
// 락을 쥐면 그동안 대시보드 폴링이 통째로 멈춘다. 병합 + 조건부 clearPending 만으로
// '남이 방금 넣은 주문이 지워지는' 사고는 막힌다.
export function writeOrders(campaign, orders) {
  return writeOrdersUnlocked(campaign, orders);
}

// 읽기→수정→저장을 한 락 안에서. 주문(돈) 배열을 고치는 곳은 전부 이걸 써라.
// fn(orders) 가 돌려준 배열을 저장하고, undefined 를 돌려주면 저장하지 않는다.
export function updateOrders(campaign, fn) {
  return withLock(`${campaign.id}:orders`, async () => {
    const orders = await readOrdersUnlocked(campaign);
    const next = await fn(orders);
    if (next === undefined) return { orders, w: { sheet: 'skip', durable: true, orders } };
    const w = await writeOrdersUnlocked(campaign, next);
    return { orders: w.orders, w };
  });
}

// ── 검수잠금(overrides) — 원칙 ④: 잠금을 잃지 않는 쪽이 안전 ──
function unionOverrides(base, extra) {
  const out = {};
  for (const r of Object.keys(base || {})) out[r] = { ...base[r] };
  for (const r of Object.keys(extra || {})) {
    out[r] = out[r] || {};
    for (const c of Object.keys(extra[r])) if (!(c in out[r])) out[r][c] = extra[r][c];
  }
  return out;
}

export async function readOverrides(campaign) {
  if (!isSheet()) return localOverrides(campaign);
  const local = localOverrides(campaign);
  let sheetRaw;
  try { sheetRaw = (await getState(campaign.sheet)).overrides || {}; }
  catch { return local; } // 시트를 못 읽어도 로컬 잠금은 지킨다(워커가 덮어쓰지 않게)
  // 시트에는 아직 옛 열번호 키가 들어있을 수 있다 → 필드 키로 정규화해서 합친다.
  const sheetOv = normalizeOverrides(sheetRaw);
  const pend = !!readPending(campaign).overrides;
  const merged = pend ? unionOverrides(local, sheetOv) : unionOverrides(sheetOv, local);
  // 비교 대상은 '정규화 전 원본' — 그래야 정규화만 일어난 경우에도 한 번 밀어 넣어
  // 시트의 옛 키가 자연히 필드 키로 마이그레이션된다.
  if (!eq(merged, sheetRaw)) {
    try { await putOverrides(campaign.sheet, merged); clearPending(campaign, 'overrides'); } catch {}
  }
  return merged;
}

async function writeOverrides(campaign, ov) {
  const out = { local: 'fail', sheet: 'skip', durable: false };
  try { writeJson(campaign.dataDir, ovFile(campaign.dataDir), ov); out.local = 'ok'; }
  catch (e) { out.localError = String((e && e.message) || e); }
  if (isSheet()) {
    try { await putOverrides(campaign.sheet, ov); out.sheet = 'ok'; clearPending(campaign, 'overrides'); }
    catch (e) { out.sheet = 'fail'; out.sheetError = String((e && e.message) || e); markPending(campaign, 'overrides', out.sheetError); }
  }
  out.durable = out.local === 'ok' || out.sheet === 'ok';
  return out;
}

// 잠금 키 = 필드명(브릿지 Code.gs 의 COL 키). 열 번호는 마스터마다 달라서 키로 쓸 수 없다.
// 화이트리스트는 접두어를 뗀 이름으로 보고, 저장은 화면이 보낸 이름 그대로 한다.
// (예전엔 'tk.hashtagOk' 가 화이트리스트에 없어 아무것도 안 쓰고 durable:true 를 돌려줬다
//  → 화면엔 '저장됨', 파일엔 아무것도. 조용한 실패의 전형이었다.)
export function setOverrideStore(campaign, row, field, value) {
  if (!OVERRIDE_FIELDS.includes(baseFieldOf(field))) return Promise.resolve({ sheet: 'skip', durable: true });
  return withLock(`${campaign.id}:ov`, async () => {
    const ov = await readOverrides(campaign);
    const r = String(row);
    ov[r] = ov[r] || {};
    ov[r][String(field)] = value;
    return writeOverrides(campaign, ov);
  });
}
export function clearOverrideStore(campaign, row, field) {
  return withLock(`${campaign.id}:ov`, async () => {
    const ov = await readOverrides(campaign);
    const r = String(row), c = String(field);
    if (!ov[r] || !(c in ov[r])) return { sheet: 'skip', durable: true };
    delete ov[r][c];
    if (!Object.keys(ov[r]).length) delete ov[r];
    return writeOverrides(campaign, ov);
  });
}

// ── 베스트 (표시용 — 잠금과 달리 합집합하지 않는다: 해제가 되살아나면 안 됨) ──
export async function readBest(campaign) {
  if (!isSheet()) return localBest(campaign);
  try { return (await getState(campaign.sheet)).best || []; }
  catch { return localBest(campaign); }
}
export async function writeBest(campaign, arr) {
  const out = { local: 'fail', sheet: 'skip', durable: false };
  try { writeJson(campaign.dataDir, bestFile(campaign.dataDir), arr); out.local = 'ok'; }
  catch (e) { out.localError = String((e && e.message) || e); }
  if (isSheet()) {
    try { await putBest(campaign.sheet, arr); out.sheet = 'ok'; }
    catch (e) { out.sheet = 'fail'; out.sheetError = String((e && e.message) || e); markPending(campaign, 'best', out.sheetError); }
  }
  out.durable = out.local === 'ok' || out.sheet === 'ok';
  return out;
}
// read-modify-write 를 직렬화해 동시 토글이 서로를 덮어쓰지 않게 한다.
export function toggleBest(campaign, handle, on) {
  return withLock(`${campaign.id}:best`, async () => {
    let best = await readBest(campaign);
    if (on) { if (!best.includes(handle)) best.push(handle); }
    else best = best.filter((h) => h !== handle);
    const w = await writeBest(campaign, best);
    return { best, w };
  });
}

// ── 대시보드 로드 (시트 모드에서 왕복 1회) ────────────────────
export async function readAll(campaign) {
  if (!isSheet()) {
    // 로컬 모드는 시트가 잠깐 안 되더라도 대시보드가 죽으면 안 된다.
    // accounts 를 못 읽으면 undefined 로 넘겨 buildAccounts 의 기존 폴백(scan-latest)이 작동하게 한다.
    let accounts;
    try { accounts = await getAccountsFromSheet(campaign.sheet); } catch { accounts = undefined; }
    return { accounts, orders: localOrders(campaign), overrides: localOverrides(campaign), best: localBest(campaign), startFol: {} };
  }
  const b = await getBundle(campaign.sheet); // 원칙 ③: 실패하면 throw
  const orders = await repairOrders(campaign, reconcileOrders(campaign, b.orders || []));
  // 잠금은 합집합(원칙 ④). 시트 값은 옛 열번호 키일 수 있으므로 먼저 필드 키로 정규화한다.
  const local = localOverrides(campaign);
  const pend = !!readPending(campaign).overrides;
  const sheetRaw = b.overrides || {};
  const sheetOv = normalizeOverrides(sheetRaw);
  const overrides = pend ? unionOverrides(local, sheetOv) : unionOverrides(sheetOv, local);
  // 원본과 비교 → 정규화만 일어나도 한 번 밀어 넣어 시트를 필드 키로 마이그레이션한다.
  if (!eq(overrides, sheetRaw)) { try { await putOverrides(campaign.sheet, overrides); clearPending(campaign, 'overrides'); } catch {} }
  return { accounts: b.accounts, orders, overrides, best: b.best || [], scans: b.scans || {}, startFol: b.startFol || {} };
}

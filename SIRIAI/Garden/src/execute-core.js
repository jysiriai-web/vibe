// 집행 공용 로직 — CLI(execute.js)와 웹 대시보드(server.js)가 같은 돈 로직을 씀.
import { sleep } from './tiktok.js';
import { launchBrowser, fetchProfile } from './tiktok-videos.js';
import { orderQuantity } from './garden.js';
import { inFlightFor } from './orders.js';

// 계정 리스트 팔로워·닉네임 스크랩 — 실제 브라우저(Playwright headless:false)로 봇 차단 우회.
// 직접 fetch 방식은 틱톡이 'Please wait'로 전부 차단해서 폐기(2026-07-09).
// 동시성 3 + 계정 간 랜덤 간격 — 탭을 많이 열면 틱톡이 막아서 차단을 줄이려 낮췄다(5→3).
export async function scanAccounts(accounts, { delayMs = 500, onProgress, onWait, concurrency = 3 } = {}) {
  if (!accounts.length) return [];
  const out = new Array(accounts.length);
  // 창 하나 먼저 띄워 로봇 인증을 사람이 끝낼 때까지 대기 (인증 실패면 throw — 빈 결과로 진행하지 않는다)
  const { browser, ctx } = await launchBrowser({ onWait }); // Playwright 미설치면 여기서 throw
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < accounts.length) {
      const i = idx++;
      const a = accounts[i];
      let current = null;
      let nickname = '';
      try {
        const r = await fetchProfile(ctx, a.handle);
        current = r.followers;
        nickname = r.nickname || '';
      } catch {
        /* 실패 → current=null */
      }
      const row = { ...a, current, scrapedNick: nickname };
      out[i] = row; // 인덱스로 결과 순서 보존
      done++;
      if (onProgress) onProgress({ ...row, done, total: accounts.length });
      if (delayMs) await sleep(delayMs + Math.floor(Math.random() * delayMs)); // 사람처럼 간격 랜덤화
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) || 1 }, worker));
  } finally {
    try { await browser.close(); } catch {}
  }
  return out;
}

// 집행 계획 계산 (주문 안 함). 100단위 충전 규칙 + 진행중 차감(중복방지).
// 이 아래는 '계정이 아니라 스크랩 실패'로 본다. 1K 이상으로 모집한 캠페인에서
// 두 자리 팔로워는 계정이 없거나 핸들이 틀린 것이다 — 그걸 믿고 주문하면 돈이 사라진다.
const SANE_FLOOR = 50;

export function buildPlan(scanned, orders, { target, min, service }) {
  const rate = Number(service.rate);
  const sMin = Number(service.min);
  const sMax = Number(service.max);
  const toOrder = [];
  const filling = [];
  const errored = [];
  const seen = new Set(); // 같은 배치에 동일 핸들이 두 행(예: 시트 중복 등록)으로 오면 한 번만 주문 → 이중지출 방지
  for (const a of scanned) {
    if (a.current == null) { errored.push(a); continue; }
    // 사람이 눈으로 확인해야 할 값 — 주문 목록이 아니라 오류 목록으로 보낸다.
    if (a.current < SANE_FLOOR) { errored.push({ ...a, reason: `팔로워 ${a.current}명 — 계정이 없거나 핸들이 틀린 것 같아요. 확인 후 수기로 처리해 주세요.` }); continue; }
    if (seen.has(a.handle)) continue;
    seen.add(a.handle);
    const inFlight = inFlightFor(orders, a.handle);
    if (inFlight > 0) { filling.push({ ...a, inFlight, projected: a.current + inFlight }); continue; } // 진행중 → 대기(재주문 안 함)
    if (a.current >= min) continue; // 이미 충족(1000+)
    const want = orderQuantity(a.current, { target });
    if (want <= 0) continue;
    const qty = Math.min(Math.max(want, sMin), sMax);
    toOrder.push({ ...a, inFlight: 0, qty, cost: (qty / 1000) * rate });
  }
  const totalQty = toOrder.reduce((s, o) => s + o.qty, 0);
  const totalCost = toOrder.reduce((s, o) => s + o.cost, 0);
  return { toOrder, filling, errored, totalQty, totalCost };
}

// 주문 실행. orders 배열에 기록 push. placed[] 반환. onEach 콜백 옵션.
// persist: 각 주문 성공 직후 호출(즉시 디스크 저장) — 배치 도중 중단돼도 과금된 주문 기록 유실 방지(이중지출 방지).
export async function placeOrders(smm, orders, toOrder, service, { onEach, persist } = {}) {
  const placed = [];
  const svcId = Number(service.service);
  for (const o of toOrder) {
    let rec = null;
    // 1) 과금 시도 — 여기서 실패한 건 돈이 안 나갔으므로 다음 계정으로 넘어간다.
    try {
      const res = await smm.addOrder({
        service: svcId,
        link: `https://www.tiktok.com/@${o.handle}`,
        quantity: o.qty,
      });
      // 주문번호가 없으면(패널 이상응답) 과금 여부도 불명이고, 기록해도 추적 불가한 좀비가 된다
      // (refreshOrders 가 id 없는 주문을 영구 제외 → remains 가 qty 로 고정 → 그 계정 재가드닝 영영 불가).
      // 더 사지 말고 배치를 멈춰서 대표님이 패널에서 직접 확인하게 한다.
      if (!res || res.order == null || String(res.order).trim() === '') {
        const err = new Error('주문 응답에 주문번호가 없어요. 돈이 나갔을 수 있으니 smmkings 패널에서 확인하세요. (배치 중단)');
        err.abortBatch = true;
        err.placed = placed;
        err.noOrderId = { handle: o.handle, qty: o.qty };
        throw err;
      }
      rec = {
        id: res.order,
        handle: o.handle,
        row: o.row,
        service: svcId,
        quantity: o.qty,
        cost: o.cost != null ? o.cost : (o.qty / 1000) * Number(service.rate), // 주문 시점 예상 USD
        startCount: o.current,
        remains: o.qty,
        status: 'placed',
        done: false,
        placedAt: new Date().toISOString(),
      };
      orders.push(rec);
      placed.push(rec);
    } catch (e) {
      if (e && e.abortBatch) throw e; // 추적 불가 주문 → 계속 사지 않고 배치 중단
      if (onEach) onEach({ ok: false, handle: o.handle, error: e.message });
      await sleep(800);
      continue;
    }
    // 2) 과금 성공 → 즉시 기록. 로컬·시트 어디에도 못 남기면(durable=false) 더 이상 과금하지 않고
    //    배치를 중단한다. '기록 없는 과금'이 쌓이면 다음 집행에서 진행중=0 으로 보여 이중지출된다.
    if (persist) {
      let p;
      try { p = await persist(); } catch (e) { p = { durable: false, sheetError: e.message }; }
      if (p && p.durable === false) {
        if (onEach) onEach({ ok: true, handle: o.handle, id: rec.id, qty: o.qty, recordFailed: true });
        const err = new Error('주문은 과금됐는데 기록에 실패해 배치를 중단했습니다. smmkings 패널에서 실제 주문을 확인하세요.');
        err.placed = placed;
        err.recordFailed = rec;
        throw err;
      }
    }
    if (onEach) onEach({ ok: true, handle: o.handle, id: rec.id, qty: o.qty });
    await sleep(800);
  }
  return placed;
}

// 서비스 카탈로그에서 서비스 정보 조회
export function findService(catalog, id) {
  return catalog.find((s) => Number(s.service) === Number(id)) || null;
}

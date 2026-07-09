// 집행 공용 로직 — CLI(execute.js)와 웹 대시보드(server.js)가 같은 돈 로직을 씀.
import { sleep } from './tiktok.js';
import { launchBrowser, fetchProfile } from './tiktok-videos.js';
import { orderQuantity } from './garden.js';
import { inFlightFor } from './orders.js';

// 계정 리스트 팔로워·닉네임 스크랩 — 실제 브라우저(Playwright headless:false)로 봇 차단 우회.
// 직접 fetch 방식은 틱톡이 'Please wait'로 전부 차단해서 폐기(2026-07-09). onProgress(계정) 콜백 옵션.
export async function scanAccounts(accounts, { delayMs = 400, onProgress } = {}) {
  const out = [];
  if (!accounts.length) return out;
  const { browser, ctx } = await launchBrowser(); // Playwright 미설치면 여기서 throw
  try {
    for (const a of accounts) {
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
      out.push(row);
      if (onProgress) onProgress(row);
      await sleep(delayMs);
    }
  } finally {
    try { await browser.close(); } catch {}
  }
  return out;
}

// 집행 계획 계산 (주문 안 함). 100단위 충전 규칙 + 진행중 차감(중복방지).
export function buildPlan(scanned, orders, { target, min, service }) {
  const rate = Number(service.rate);
  const sMin = Number(service.min);
  const sMax = Number(service.max);
  const toOrder = [];
  const filling = [];
  const errored = [];
  for (const a of scanned) {
    if (a.current == null) { errored.push(a); continue; }
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
export async function placeOrders(smm, orders, toOrder, service, { onEach } = {}) {
  const placed = [];
  const svcId = Number(service.service);
  for (const o of toOrder) {
    try {
      const res = await smm.addOrder({
        service: svcId,
        link: `https://www.tiktok.com/@${o.handle}`,
        quantity: o.qty,
      });
      const rec = {
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
      if (onEach) onEach({ ok: true, handle: o.handle, id: res.order, qty: o.qty });
    } catch (e) {
      if (onEach) onEach({ ok: false, handle: o.handle, error: e.message });
    }
    await sleep(800);
  }
  return placed;
}

// 서비스 카탈로그에서 서비스 정보 조회
export function findService(catalog, id) {
  return catalog.find((s) => Number(s.service) === Number(id)) || null;
}

// 집행 공용 로직 — CLI(execute.js)와 웹 대시보드(server.js)가 같은 돈 로직을 씀.
import { sleep } from './tiktok.js';
import { launchBrowser, fetchProfile } from './tiktok-videos.js';
import { orderQuantity } from './garden.js';
import { inFlightFor } from './orders.js';

// 계정 리스트 팔로워·닉네임 스크랩 — 실제 브라우저(Playwright headless:false)로 봇 차단 우회.
// 직접 fetch 방식은 틱톡이 'Please wait'로 전부 차단해서 폐기(2026-07-09).
// 동시성 풀(기본 5) — 한 브라우저에 탭 여러 개 병렬로 열어 스캔 (콘텐츠 스캔과 동일 패턴, 300건 대비 ~5배↑).
export async function scanAccounts(accounts, { delayMs = 200, onProgress, concurrency = 5 } = {}) {
  if (!accounts.length) return [];
  const out = new Array(accounts.length);
  const { browser, ctx } = await launchBrowser(); // Playwright 미설치면 여기서 throw
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
      if (delayMs) await sleep(delayMs);
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

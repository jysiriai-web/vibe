// 주문 저장소 + 상태 갱신 + 진행중 수량 계산. 캠페인별 dataDir/orders.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TERMINAL = ['Completed', 'Canceled', 'Cancelled', 'Refunded', 'Partial'];
const fileOf = (dataDir) => join(dataDir, 'orders.json');

export function loadOrders(dataDir) {
  const f = fileOf(dataDir);
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return [];
  }
}

export function saveOrders(dataDir, orders) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(fileOf(dataDir), JSON.stringify(orders, null, 2));
}

// SMM status 로 주문 remains/status/charge 갱신. Completed 만 스킵(취소·환불·부분도 갱신).
export async function refreshOrders(smm, orders) {
  const active = orders.filter((o) => o.id && o.status !== 'Completed');
  if (!active.length) return orders;
  let statuses = {};
  try {
    statuses = await smm.multiStatus(active.map((o) => o.id));
  } catch {
    return orders;
  }
  for (const o of active) {
    const st = statuses[String(o.id)];
    if (!st || st.error) continue;
    o.status = st.status;
    // 유효한 숫자일 때만 갱신 — 응답에 remains 누락 시 NaN 으로 덮어써 진행중 수량을 0 으로 만드는 이중지출 방지
    const r = Number(st.remains);
    if (Number.isFinite(r)) o.remains = r;
    const sc = Number(st.start_count);
    if (Number.isFinite(sc)) o.startCount = sc;
    if (st.charge != null && st.charge !== '') o.charge = st.charge;
    o.done = TERMINAL.includes(st.status) || (Number.isFinite(r) && r === 0);
  }
  return orders;
}

// 핸들별 진행중(아직 안 들어온) 수량 합 — 중복주문 방지 핵심. 종료(closed)·완료(done)는 제외.
// remains 가 불명(NaN)이면 0 이 아니라 주문 수량 전체를 진행중으로 간주(보수적) → 잘못된 재주문 차단.
export function inFlightFor(orders, handle) {
  return orders
    .filter((o) => o.handle === handle && !o.closed && !o.done)
    .reduce((s, o) => {
      const r = Number(o.remains);
      return s + (Number.isFinite(r) ? r : (Number(o.quantity) || 0));
    }, 0);
}

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
    // 유효한 숫자일 때만 갱신 — 응답에 remains 가 누락/null/빈값으로 오면(패널이 종종 그럼)
    // Number(null)=Number('')=0 이 finite 라 진행중 수량을 0 으로 만들어 이중지출 유발 → 명시적으로 배제.
    const r = toNum(st.remains);
    if (Number.isFinite(r)) o.remains = r;
    const sc = toNum(st.start_count);
    if (Number.isFinite(sc)) o.startCount = sc;
    if (st.charge != null && st.charge !== '') o.charge = st.charge;
    o.done = TERMINAL.includes(st.status) || (Number.isFinite(r) && r === 0);
  }
  return orders;
}
// null/''/공백은 NaN 으로 (0 으로 오인 금지). 그 외는 숫자 변환.
function toNum(v) { return (v == null || String(v).trim() === '') ? NaN : Number(v); }

// 핸들별 진행중(아직 안 들어온) 수량 합 — 중복주문 방지 핵심.
// 완료(done)는 제외. 종료(closed)는 '실제로 취소 성공'한 경우만 제외 —
// 취소 실패(cancelled===false)면 주문이 계속 배송될 수 있으니 보수적으로 진행중으로 카운트.
// remains 불명(NaN)이면 0 대신 주문 수량 전체를 진행중으로 간주.
export function inFlightFor(orders, handle) {
  return orders
    .filter((o) => o.handle === handle && !o.done && !(o.closed && o.cancelled !== false))
    .reduce((s, o) => {
      const r = Number(o.remains);
      return s + (Number.isFinite(r) ? r : (Number(o.quantity) || 0));
    }, 0);
}

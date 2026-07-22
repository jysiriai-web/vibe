// 주문 저장소 + 상태 갱신 + 진행중 수량 계산. 캠페인별 dataDir/orders.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TERMINAL = ['Completed', 'Canceled', 'Cancelled', 'Refunded', 'Partial'];
const CANCEL_STATES = ['Canceled', 'Cancelled', 'Refunded']; // smm 상에서 '취소됨'으로 볼 상태
const CANCEL_GRACE_MS = 60 * 60 * 1000; // 종료 누른 뒤 이 시간 지나도 배송 중이면 '오류'(취소 안 먹힘) 표기
const fileOf = (dataDir) => join(dataDir, 'orders.json');

export function loadOrders(dataDir) {
  const f = fileOf(dataDir);
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    // 여기서 throw 하면 store.js 의 localOrders 가 가드 없이 부르는 탓에 대시보드 전체가 죽는다.
    // 그래도 조용히 [] 를 돌려주면 '주문 0건'으로 보여 이중지출로 이어지니 최소한 로그는 남긴다.
    console.error(`[orders] ${f} 파싱 실패 — 빈 기록으로 취급합니다: ${e.message}`);
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
  } catch (e) {
    // 갱신 실패 = 낡은 remains 로 계속 판단한다는 뜻(집행 직전 재확인도 이 값을 본다).
    // 호출부들이 이 함수의 '절대 안 던짐'에 기대고 있어 흐름은 그대로 두되, 침묵은 깨 둔다.
    console.error(`[orders] 주문 상태 갱신 실패 — 이전 기록 그대로 씁니다: ${e.message}`);
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
    const wasDone = o.done;
    o.done = TERMINAL.includes(st.status) || (Number.isFinite(r) && r === 0);
    // 처음 완료로 넘어간 순간을 기록 — 완료까지 걸린 시간(placedAt→doneAt) 계산용.
    if (o.done && !wasDone && !o.doneAt) o.doneAt = new Date().toISOString();
    // 종료(취소) 요청했는데 smm은 아직 배송 중 → 취소가 실제로 안 먹힘.
    // 방금 눌렀을 수 있으니 유예(1시간) 지난 뒤에만 '오류'로 표기(재취소 가능). closed 는 유지.
    if (o.closed && !o.done && Number.isFinite(r) && r > 0 && !CANCEL_STATES.includes(st.status)) {
      const since = o.closedAt ? Date.now() - new Date(o.closedAt).getTime() : Infinity;
      o.cancelStuck = since > CANCEL_GRACE_MS;
    } else {
      o.cancelStuck = false; // 취소 성공/완료되면 해제
    }
  }
  return orders;
}
// null/''/공백은 NaN 으로 (0 으로 오인 금지). 그 외는 숫자 변환.
function toNum(v) { return (v == null || String(v).trim() === '') ? NaN : Number(v); }

// 핸들별 진행중(아직 안 들어온) 수량 합 — 중복주문 방지 핵심.
// done(완료·취소·remains0) 아니면 전부 진행중으로 카운트 = 배송 중이면 무조건 재주문 차단(종료여부 무관).
// 단 '포기(abandoned)'한 주문은 제외 — 사용자가 급해서 접고 재주문하기로 명시 결정한 경우(탈출구).
// remains 불명이면 0 대신 주문 수량 전체를 진행중으로 간주(보수).
// ⚠️ 반드시 toNum 을 쓸 것 — Number(null)=Number('')=0 이고 isFinite(0)=true 라,
//    '남은 수량 불명'을 '다 들어옴(0)'으로 오판해 같은 계정을 또 사게 된다(이중지출).
export function inFlightFor(orders, handle) {
  return orders
    .filter((o) => o.handle === handle && !o.done && !o.abandoned)
    .reduce((s, o) => {
      const r = toNum(o.remains);
      return s + (Number.isFinite(r) ? r : (Number(o.quantity) || 0));
    }, 0);
}

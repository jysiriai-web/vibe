// 가드닝 브레인 — 충전 수량 계산 & 상태 분류.
//
//   규칙(사용자 지정): 목표 1100 기준, (목표 − 예상)을 100단위로 "반올림"해서 충전.
//     - 정확히 1000 안 맞추고 ~100 버퍼가 남게. 충전은 100단위. 약간의 유동성 포함.
//     - 예) 현재 410 → round((1100-410)/100)*100 = 700  (→ 1110)
//           현재 899 → round((1100-899)/100)*100 = 200  (→ 1099)
//   inFlight = 진행중 주문의 아직 안 들어온 수량(remains). 차감해서 중복주문 방지.

export function roundTo100(n) {
  return Math.round(n / 100) * 100;
}

// 충전할 수량 (100단위). 0이면 주문 불필요.
export function orderQuantity(current, { target = 1100, inFlight = 0 } = {}) {
  const q = roundTo100(target - (current + inFlight));
  return q > 0 ? q : 0;
}

// 상태 분류 (모니터링/집행 공용). min = 납품 최소조건(이 이상이면 가드닝 대상 아님).
//   진행중 주문(inFlight>0)이 있으면 무조건 '채워지는 중' → 재주문 안 함(사용자 원칙).
export function classify(current, { target = 1100, min = 1000, inFlight = 0 } = {}) {
  if (current == null) return { status: 'error', order: 0, projected: null };
  const projected = current + inFlight;
  if (inFlight > 0) return { status: 'filling', order: 0, projected };
  if (current >= min) return { status: 'ok', order: 0, projected };
  const order = orderQuantity(current, { target });
  return order > 0 ? { status: 'needs', order, projected } : { status: 'ok', order: 0, projected };
}

export const STATUS_LABEL = {
  ok: '충족',
  needs: '가드닝 필요',
  filling: '채워지는 중',
  error: '수집 실패',
};

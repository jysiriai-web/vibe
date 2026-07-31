// 자동 리필 — 리필 되는 서비스(3693 등)로 넣은 주문이 30일 안에 빠지면 패널에 리필을 요청한다.
//
// 왜: smmkings 는 문의(티켓) API 가 없다(404). 리필 없는 서비스로 빠진 건 되받을 길이 없었지만,
//     리필 서비스는 refill 액션으로 빠진 만큼 패널이 다시 채워준다. 이게 정식·유일한 자동 회수 수단.
//
// 안전 원칙
//  · 리필 되는 서비스(refill=true)로 넣은 주문만.
//  · 주문 후 30일 안(리필 보장 기간)만.
//  · 실제로 눈에 띄게 빠졌을 때만(자잘한 변동엔 요청 안 함) — 패널 스팸/오작동 방지.
//  · 같은 주문은 쿨다운(기본 12h) 안엔 다시 안 조른다.
//  · 팔로워를 모르면(스캔 실패) 판단 보류 — 0 으로 보고 리필하지 않는다.

export const REFILL_WINDOW_DAYS = 30;
export const REFILL_MIN_DROP = 20; // 이 이상 빠졌을 때만
export const REFILL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const num = (v) => (v == null || String(v).trim() === '' ? NaN : Number(String(v).replace(/,/g, '')));

export function refillServiceIds(services) {
  const set = new Set();
  for (const s of services || []) {
    if (s && (s.refill === true || s.refill === 'true')) set.add(String(s.service));
  }
  return set;
}

// 순수 함수 — 어떤 주문에 리필이 필요한지 계산(요청은 안 함). 테스트 위해 now 주입.
// followersByHandle: { handle: 현재팔로워(숫자|null) }
/* followersByPlat: { tk:{handle:수}, ig:{handle:수} }
   ⚠️ 예전엔 { handle:수 } 하나만 받아 틱톡 스캔 결과로 인스타 주문까지 판정했다.
   양쪽에 같은 이름을 가진 사람이 16명이다(@zn09_k2 는 ig 532 / tk 11,100).
   그래서 인스타 리필은 dropped 가 음수로 나와 영영 안 나가고(빠진 팔로워를 회수 못 한다),
   반대 경우엔 헛리필 + 12시간 쿨다운을 먹었다.
   다른 돈 경로(buildPlan·inFlightFor·orderLink)는 이미 plat 을 가리는데 리필만 밖에 있었다. */
export function planRefills(orders, followersByPlat, refillIds, now) {
  const due = [];
  for (const o of orders || []) {
    if (o.abandoned) continue;
    /* 취소·환불된 주문은 리필 대상이 아니다.
       ⚠️ 아래 delivered = qty - remains 인데 취소된 주문은 remains:0 이라 '전량 배송됨' 으로
       계산된다 → endCount 가 부풀고 dropped 가 커져 리필을 조른다. 실제로 2026-07-28 01:23 에
       전액 환불(charge 0.00)된 #3693 주문 4건에 리필 요청이 나갔고 12시간마다 30일간 반복될
       예정이었다. 화면은 '리필 요청 4건 (성공 0)' 이라고만 말해 진짜 실패와 구분이 안 됐다. */
    if (o.canceled || o.refunded) continue;
    if (!refillIds.has(String(o.service))) continue; // 리필 안 되는 서비스
    const placed = o.placedAt ? new Date(o.placedAt).getTime() : NaN;
    if (!Number.isFinite(placed)) continue;
    if (now - placed > REFILL_WINDOW_DAYS * 86400000) continue; // 30일 지남 → 리필 불가
    if (o.refillAt && now - new Date(o.refillAt).getTime() < REFILL_COOLDOWN_MS) continue; // 최근에 이미 요청

    const start = num(o.startCount);
    const rem = num(o.remains);
    const qty = Number(o.quantity) || 0;
    const delivered = Number.isFinite(rem) ? qty - rem : qty; // 이 주문이 실제 넣은 양
    const endCount = (Number.isFinite(start) ? start : 0) + delivered; // 도달했어야 하는 팔로워
    // 이 주문의 플랫폼 팔로워만 본다. 출처를 못 대는 주문은 보류한다(남의 숫자로 판정하지 않는다).
    const src = followersByPlat && followersByPlat[o.plat || 'tk'];
    const cur = num(src && src[o.handle]);
    if (!Number.isFinite(cur)) continue; // 팔로워 모름(null·빈값·숫자아님·출처없음) → 보류
    const dropped = endCount - cur;
    if (dropped < REFILL_MIN_DROP) continue; // 안 빠졌음(또는 오히려 늘어남)
    due.push({ order: o, dropped, endCount, current: cur });
  }
  return due;
}

// 실제 리필 요청 + 주문 객체에 결과 기록(호출부가 writeOrders 로 저장). smm 없으면 아무것도 안 함.
export async function runAutoRefill({ orders, followersByPlat, smm, services, now = Date.now() }) {
  if (!smm) return { requested: 0, ok: 0, results: [] };
  const ids = refillServiceIds(services);
  const due = planRefills(orders, followersByPlat, ids, now);
  if (!due.length) return { requested: 0, ok: 0, results: [] };

  let res = [];
  try { res = await smm.refill(due.map((d) => d.order.id)); }
  catch (e) {
    // 요청 자체가 실패(네트워크 등) — 패널에 닿지도 못했으므로 refillAt 를 찍지 않는다(쿨다운 X).
    // 그래야 다음 스캔에서 바로 재시도된다. (refillAt 를 찍으면 12h 쿨다운에 걸려 재시도가 막혔음)
    const msg = String((e && e.message) || e);
    for (const d of due) { d.order.refillError = msg; }
    return { requested: due.length, ok: 0, error: msg, results: due.map((d) => ({ handle: d.order.handle, orderId: d.order.id, dropped: d.dropped, ok: false, error: msg })) };
  }

  const byId = new Map(res.map((r) => [String(r.order), r]));
  const results = [];
  for (const d of due) {
    const r = byId.get(String(d.order.id)) || {};
    d.order.refillAt = new Date(now).toISOString();
    if (r.ok) { d.order.refillId = r.refillId; d.order.refillError = undefined; }
    else { d.order.refillError = r.error || '리필 거절됨'; }
    results.push({ handle: d.order.handle, orderId: d.order.id, dropped: d.dropped, ok: !!r.ok, refillId: r.refillId, error: r.error });
  }
  return { requested: due.length, ok: results.filter((r) => r.ok).length, results };
}

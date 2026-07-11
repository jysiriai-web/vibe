// smmkings.com SMM 클라이언트 — /api/v2 (표준 Perfect Panel 포맷)
// 의존성 없음: Node 18+ 전역 fetch 사용.
//
// 응답 형태(smmkings 문서 확인됨):
//   balance  -> { balance, currency }
//   services -> [ { service, name, type, category, rate, min, max, refill, cancel }, ... ]
//   add      -> { order }
//   status   -> { charge, start_count, status, remains, currency }
//   status(다건) -> { "<orderId>": { ...상태 }, ... }

const DEFAULT_URL = 'https://smmkings.com/api/v2';

export function createSmm(key, apiUrl) {
  if (!key) {
    throw new Error('SMMKINGS_API_KEY 가 비어있습니다. Garden/.env 를 확인하세요.');
  }
  const url = apiUrl || process.env.SMM_API_URL || DEFAULT_URL;

  async function req(params) {
    const body = new URLSearchParams({ key, ...params });
    let res, text;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      text = await res.text();
    } catch (e) {
      throw new Error(`SMM 네트워크 오류: ${e.message}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `SMM 응답이 JSON 이 아님 (HTTP ${res.status}): ${text.slice(0, 300)}`
      );
    }
    if (json && json.error) throw new Error(`SMM 오류: ${json.error}`);
    return json;
  }

  return {
    balance: () => req({ action: 'balance' }),
    services: () => req({ action: 'services' }),
    addOrder: ({ service, link, quantity }) =>
      req({
        action: 'add',
        service: String(service),
        link,
        quantity: String(quantity),
      }),
    status: (order) => req({ action: 'status', order: String(order) }),
    multiStatus: (orders) =>
      req({ action: 'status', orders: orders.join(',') }),

    // ⚠️ 취소 실패는 최상위 error 가 아니라 배열 안에 들어온다. HTTP 200 이고 json.error 도 없다.
    //      [{"order":1,"cancel":{"error":"error.incorrect_order_id"}}]   ← 실패
    //      [{"order":1,"cancel":1}]                                      ← 성공
    //    예전엔 req() 가 안 던진다는 이유로 전부 '취소됨'으로 기록했다. 그래서 배송이 계속되는데도
    //    대시보드는 취소된 줄 알았다. 이제 건별로 성공/실패를 돌려준다.
    cancel: async (orders) => {
      const r = await req({ action: 'cancel', orders: orders.join(',') });
      const arr = Array.isArray(r) ? r : [r];
      return arr.map((x) => {
        const c = x && x.cancel;
        const err = c && typeof c === 'object' && c.error ? String(c.error) : '';
        return { order: x && x.order, ok: !!c && !err, error: err };
      });
    },

    // 리필(빠진 팔로워 다시 채우기) — 리필 되는 서비스만 됨. cancel 과 같은 배열 형태로 온다.
    //   [{"order":1,"refill":123}]                          ← 성공(리필 id 123)
    //   [{"order":1,"refill":{"error":"error.refill_..."}}]  ← 실패
    // smmkings 는 문의(티켓) API 가 없어서(404), 빠진 걸 되받는 정식 수단이 이 refill 이다.
    refill: async (orders) => {
      const r = await req({ action: 'refill', orders: orders.join(',') });
      const arr = Array.isArray(r) ? r : [r];
      return arr.map((x) => {
        const rf = x && x.refill;
        const err = rf && typeof rf === 'object' && rf.error ? String(rf.error) : (x && x.error ? String(x.error) : '');
        const id = rf && typeof rf === 'object' ? (rf.refill ?? null) : (rf ?? null);
        return { order: x && x.order, ok: !!id && !err, refillId: id, error: err };
      });
    },
    refillStatus: (refillId) => req({ action: 'refill_status', refill: String(refillId) }),
  };
}

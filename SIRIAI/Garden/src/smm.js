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
    cancel: (orders) => req({ action: 'cancel', orders: orders.join(',') }),
  };
}

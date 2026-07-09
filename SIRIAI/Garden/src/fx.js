// 실시간 시장 USD/KRW 환율 — 무료 API, 메모리 캐시(6시간). 실패 시 마지막 캐시 or null.
let cache = { rate: null, at: 0 };
const TTL = 6 * 60 * 60 * 1000;

export async function getMarketUsdKrw() {
  const now = Date.now();
  if (cache.rate && now - cache.at < TTL) return cache.rate;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await res.json();
    const krw = Number(d?.rates?.KRW);
    if (krw > 0) {
      cache = { rate: krw, at: now };
      return krw;
    }
  } catch {
    /* 네트워크 실패 → 아래 캐시 반환 */
  }
  return cache.rate; // 있으면 마지막 값, 없으면 null
}

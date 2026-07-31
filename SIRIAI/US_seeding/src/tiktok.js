// [복사본] SIRIAI/Garden/src/tiktok.js 에서 가져온 검증된 엔진 코드입니다.
//          US_seeding 은 Garden 과 완전히 독립 실행됩니다 — 한쪽을 고쳐도 다른 쪽에 반영되지 않습니다.
// 틱톡 팔로워 수집 — 프로필 페이지의 __UNIVERSAL_DATA__ JSON 파싱. 의존성 0(전역 fetch).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toHandle(s) {
  s = String(s || '').trim();
  const m = s.match(/@([A-Za-z0-9._]+)/);
  return m ? m[1] : s.replace(/^@/, '');
}

// 성공: { followers, nickname, via }. 실패: throw (err.code = 'BLOCKED' | 'NOTFOUND' | 'TIMEOUT' | 기타)
export async function fetchFollowers(handle, { timeout = 15000 } = {}) {
  const url = `https://www.tiktok.com/@${toHandle(handle)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
    });
    html = await res.text();
  } catch (e) {
    if (e.name === 'AbortError') { const err = new Error(`타임아웃(${timeout}ms)`); err.code = 'TIMEOUT'; throw err; }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (html.length < 4000 && /please wait/i.test(html)) {
    const e = new Error('차단(Please wait)');
    e.code = 'BLOCKED';
    throw e;
  }

  // 1) 정식 JSON 블록
  const m = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const info =
        data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo;
      const stats = info?.stats;
      if (stats && Number.isFinite(stats.followerCount)) {
        return { followers: stats.followerCount, nickname: info?.user?.nickname || '', via: 'JSON' };
      }
    } catch {
      /* 폴백으로 */
    }
  }
  // 2) 정규식 폴백
  const r = html.match(/"followerCount":(\d+)/);
  if (r) {
    const nm = html.match(/"nickname":"((?:[^"\\]|\\.)*)"/);
    let nickname = '';
    if (nm) { try { nickname = JSON.parse('"' + nm[1] + '"'); } catch {} }
    return { followers: Number(r[1]), nickname, via: 'regex' };
  }

  const e = new Error(`팔로워 못 찾음 (응답 ${html.length}b)`);
  e.code = 'NOTFOUND';
  throw e;
}

// 재시도 래퍼 (지연 점증)
export async function fetchFollowersRetry(handle, { retries = 2, delayMs = 2500 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchFollowers(handle);
    } catch (e) {
      last = e;
      if (i < retries) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

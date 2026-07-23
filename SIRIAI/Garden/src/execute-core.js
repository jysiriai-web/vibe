// 집행 공용 로직 — CLI(execute.js)와 웹 대시보드(server.js)가 같은 돈 로직을 씀.
import { sleep } from './tiktok.js';
import { launchBrowser, fetchProfile, warmContext } from './tiktok-videos.js';
import { orderQuantity } from './garden.js';
import { inFlightFor, normH } from './orders.js';

// 계정 리스트 팔로워·닉네임 스크랩 — 실제 브라우저(Playwright headless:false)로 봇 차단 우회.
// 직접 fetch 방식은 틱톡이 'Please wait'로 전부 차단해서 폐기(2026-07-09).
// 동시성 3 + 계정 간 랜덤 간격 — 탭을 많이 열면 틱톡이 막아서 차단을 줄이려 낮췄다(5→3).
// reuse: 살아 있는 브라우저를 다시 쓴다(집행 직전 재확인용).
// 집행은 이미 계획을 본 뒤라 창을 새로 띄우고 로봇 인증 게이트까지 다시 거칠 이유가 없다 —
// 그게 '주문 중…' 이 오래 걸리던 이유였다. 저장된 세션으로 바로 긁고 브라우저는 안 닫는다.
// 긁기에 실패하면 followers=null 이 되고 buildPlan 이 errored 로 빼므로, 막혀도 주문은 안 나간다.
export async function scanAccounts(accounts, { delayMs = 500, onProgress, onWait, concurrency = 3, reuse = false } = {}) {
  if (!accounts.length) return [];
  const out = new Array(accounts.length);
  let browser = null, ctx;
  if (reuse) { ctx = await warmContext(); }
  else {
    // 창 하나 먼저 띄워 로봇 인증을 사람이 끝낼 때까지 대기 (인증 실패면 throw — 빈 결과로 진행하지 않는다)
    const b = await launchBrowser({ onWait }); browser = b.browser; ctx = b.ctx; // Playwright 미설치면 여기서 throw
  }
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
      // folPlat = 이 팔로워 숫자의 출처. 이 함수는 틱톡 프로필 스크래퍼라 언제나 'tk' 다.
      const row = { ...a, current, scrapedNick: nickname, folPlat: 'tk' };
      out[i] = row; // 인덱스로 결과 순서 보존
      done++;
      if (onProgress) onProgress({ ...row, done, total: accounts.length });
      if (delayMs) await sleep(delayMs + Math.floor(Math.random() * delayMs)); // 사람처럼 간격 랜덤화
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) || 1 }, worker));
  } finally {
    if (browser) { try { await browser.close(); } catch {} }   // 재사용 브라우저는 안 닫는다(다음 작업이 또 쓴다)
  }
  return out;
}

// 집행 계획 계산 (주문 안 함). 100단위 충전 규칙 + 진행중 차감(중복방지).
// 이 아래는 '계정이 아니라 스크랩 실패'로 본다. 1K 이상으로 모집한 캠페인에서
// 두 자리 팔로워는 계정이 없거나 핸들이 틀린 것이다 — 그걸 믿고 주문하면 돈이 사라진다.
const SANE_FLOOR = 50;

// 틱톡 서비스로 과금하므로 틱톡 핸들이 있는 행만 남긴다.
// 인스타 전용 행을 넘기면 인스타 핸들로 틱톡을 검색해 남의 계정에 돈이 나간다.
// ⚠️ 집행·계획 경로는 반드시 이 함수를 거칠 것. 규칙을 복제하면 한 곳이 빠진다(실제로 CLI 가 빠져 있었다).
/* 주문에 넣을 계정 주소. 플랫폼마다 형식이 다르다 —
   예전엔 틱톡 주소가 박혀 있어서, 인스타 서비스에 틱톡 링크를 보낼 뻔했다. */
export function orderLink(plat, handle) {
  const h = String(handle || '').replace(/^@/, '');
  return plat === 'ig' ? 'https://www.instagram.com/' + h : 'https://www.tiktok.com/@' + h;
}

export function tiktokOnly(accounts) {
  return (accounts || []).filter((a) => a && a.plat !== 'ig' && a.handle);
}

/* 인스타 계정의 팔로워는 인스타 스캔 결과에서만 가져온다(작업 콘솔의 '인스타 팔로워 스캔').
   ⚠️ scanAccounts 로는 절대 못 가져온다 — 그건 틱톡 프로필을 여는 스크래퍼라
   인스타 핸들을 주면 '같은 이름의 다른 틱톡 계정' 숫자를 돌려준다(실패해도 throw 안 한다).
   실측: 인스타 핸들과 같은 이름의 틱톡 계정이 16건 실재했고, @zn09_k2 는
   인스타 522(충전 필요) / 틱톡 11,100(불필요) 이라 충전이 조용히 안 나갔다.

   staleH: 스캔이 이만큼 지났으면 안 쓴다. 낡은 팔로워로 주문하면 이미 채워진 계정에 또 산다. */
export function igFollowers(latest, { staleH = 12 } = {}) {
  const ranAt = latest && latest.ranAt;
  const rows = (latest && (latest.accounts || latest.results)) || [];
  if (!ranAt || !rows.length) return { rows: [], stale: true, why: '인스타 팔로워 스캔 기록이 없어요' };
  const ageOf = (t) => (Date.now() - new Date(t).getTime()) / 3600000;
  const ageH = ageOf(ranAt);
  if (!(ageH >= 0) || ageH > staleH) {
    return { rows: [], stale: true, ageH, why: `인스타 팔로워 스캔이 ${Math.round(ageH)}시간 지났어요(기준 ${staleH}시간) — 작업 콘솔에서 먼저 돌려주세요` };
  }
  /* ⚠️ 파일의 ranAt 은 '스캔을 돌린 시각'이지 '이 숫자를 잰 시각'이 아니다.
     인스타 스캔은 증분이라 이미 숫자가 있는 계정은 건너뛰면서도 파일 시각만 새로 찍는다 —
     그러면 몇 날 지난 팔로워가 영원히 '방금 잰 것'으로 통과해 이미 채워진 계정을 또 산다.
     그래서 행마다 찍어둔 at(측정시각)으로 각각 판정한다. at 이 없는 옛 파일만 ranAt 으로 본다.
     folPlat 은 긁은 쪽(runIgSync)이 찍는다 — 읽는 쪽이 찍으면 출처 검사가 제 글씨를 읽는 셈이라
     아무것도 못 막는다. 라벨이 붙어 있는데 인스타가 아니면 여기서 떨어뜨린다. */
  const fresh = [], old = [], wrong = [];
  for (const a of rows) {
    if (a.folPlat && a.folPlat !== 'ig') { wrong.push(a); continue; }
    const at = a.at || a.scrapedAt;
    const h = at ? ageOf(at) : ageH;
    if (!(h >= 0) || h > staleH) { old.push({ ...a, ageH: h }); continue; }
    fresh.push({ ...a, plat: 'ig', folPlat: 'ig' });
  }
  const why = [
    old.length ? `인스타 팔로워를 ${staleH}시간 넘게 안 잰 계정 ${old.length}건은 뺐어요 — 작업 콘솔에서 인스타 팔로워 스캔을 먼저 돌려주세요` : '',
    wrong.length ? `팔로워 숫자의 출처가 인스타가 아닌 ${wrong.length}건은 뺐어요` : '',
  ].filter(Boolean).join(' · ');
  return { rows: fresh, stale: false, ageH, why, dropped: old.concat(wrong) };
}

export function buildPlan(scanned, orders, { target, min, service, plat = 'tk' }) {
  const rate = Number(service.rate);
  const sMin = Number(service.min);
  const sMax = Number(service.max);
  const toOrder = [];
  const filling = [];
  const errored = [];
  const seen = new Set(); // 같은 배치에 동일 핸들이 두 행(예: 시트 중복 등록)으로 오면 한 번만 주문 → 이중지출 방지
  for (const a of scanned) {
    /* 출처 검사 — 이 계정의 플랫폼과 팔로워 숫자의 출처가 같아야 한다.
       tiktokOnly() 필터가 지금은 인스타를 막고 있지만, 그건 '거르는' 장치라
       누가 빼면 그대로 뚫린다. 여기서 한 번 더 막아 '남의 숫자로 주문'을 구조적으로 없앤다.
       옛 스캔 기록엔 folPlat 이 없다 — 전부 틱톡 스캔이었으므로 tk 로 본다(지금 동작 유지). */
    const platOf = a.plat === 'ig' ? 'ig' : 'tk';
    const src = a.folPlat || 'tk';
    if (src !== platOf) {
      errored.push({ ...a, reason: `이 계정은 ${platOf === 'ig' ? '인스타' : '틱톡'}인데 팔로워 숫자는 ${src === 'ig' ? '인스타' : '틱톡'} 스캔에서 왔어요 — 다른 계정 숫자로 주문할 뻔했습니다. 해당 플랫폼 팔로워 스캔을 먼저 돌려주세요.` });
      continue;
    }
    if (a.current == null) { errored.push(a); continue; }
    // 사람이 눈으로 확인해야 할 값 — 주문 목록이 아니라 오류 목록으로 보낸다.
    if (a.current < SANE_FLOOR) { errored.push({ ...a, reason: `팔로워 ${a.current}명 — 계정이 없거나 핸들이 틀린 것 같아요. 확인 후 수기로 처리해 주세요.` }); continue; }
    // 진행중 판정과 같은 정규화여야 한다 — 한쪽만 대소문자를 가리면 막는 그물에 구멍이 난다.
    if (seen.has(normH(a.handle))) continue;
    seen.add(normH(a.handle));
    const inFlight = inFlightFor(orders, a.handle, plat);
    if (inFlight > 0) { filling.push({ ...a, plat, inFlight, projected: a.current + inFlight }); continue; } // 진행중 → 대기(재주문 안 함)
    if (a.current >= min) continue; // 이미 충족(1000+)
    const want = orderQuantity(a.current, { target });
    if (want <= 0) continue;
    const qty = Math.min(Math.max(want, sMin), sMax);
    toOrder.push({ ...a, plat, inFlight: 0, qty, cost: (qty / 1000) * rate });
  }
  const totalQty = toOrder.reduce((s, o) => s + o.qty, 0);
  const totalCost = toOrder.reduce((s, o) => s + o.cost, 0);
  return { toOrder, filling, errored, totalQty, totalCost };
}

// 주문 실행. orders 배열에 기록 push. placed[] 반환. onEach 콜백 옵션.
// persist: 각 주문 성공 직후 호출(즉시 디스크 저장) — 배치 도중 중단돼도 과금된 주문 기록 유실 방지(이중지출 방지).
/* plat: 이 주문이 어느 플랫폼 것인지. 집행 경로는 tiktokOnly() 를 거치므로 기본이 'tk' 다.
   ⚠️ 반드시 기록해야 한다 — 인스타 핸들과 틱톡 핸들이 같은 문자열인 사람이 17명이라,
   플랫폼이 없으면 inFlightFor 가 한 주문을 양쪽에 세서 '채워지는 중'이 두 번 뜬다.
   더 나쁜 건 인스타 가드닝을 켰을 때 그 틱톡 주문 때문에 인스타가 조용히 건너뛰어진다. */
export async function placeOrders(smm, orders, toOrder, service, { onEach, persist, plat = 'tk' } = {}) {
  const placed = [];
  const svcId = Number(service.service);
  for (const o of toOrder) {
    let rec = null;
    // 1) 과금 시도 — 여기서 실패한 건 돈이 안 나갔으므로 다음 계정으로 넘어간다.
    try {
      const res = await smm.addOrder({
        service: svcId,
        link: orderLink(plat, o.handle),
        quantity: o.qty,
      });
      // 주문번호가 없으면(패널 이상응답) 과금 여부도 불명이고, 기록해도 추적 불가한 좀비가 된다
      // (refreshOrders 가 id 없는 주문을 영구 제외 → remains 가 qty 로 고정 → 그 계정 재가드닝 영영 불가).
      // 더 사지 말고 배치를 멈춰서 대표님이 패널에서 직접 확인하게 한다.
      if (!res || res.order == null || String(res.order).trim() === '') {
        const err = new Error('주문 응답에 주문번호가 없어요. 돈이 나갔을 수 있으니 smmkings 패널에서 확인하세요. (배치 중단)');
        err.abortBatch = true;
        err.placed = placed;
        err.noOrderId = { handle: o.handle, qty: o.qty };
        throw err;
      }
      rec = {
        id: res.order,
        handle: o.handle,
        plat,
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
      if (e && e.abortBatch) throw e; // 추적 불가 주문 → 계속 사지 않고 배치 중단
      // 응답을 못 받아 과금 여부가 불명이면(네트워크 끊김·502 등) '안 나갔다'고 단정할 수 없다.
      // 단정하고 넘어가면 다음 집행에서 같은 계정을 또 산다. '패널 확인 필요' 주문으로 기록을 남겨
      // inFlightFor 가 진행중으로 세게 하고(재주문 원천 차단), 배치를 멈춰 사람이 패널을 확인하게 한다.
      // 확인 뒤에는 대시보드에서 '포기'(abandon)로 풀면 재주문이 열린다(uid 로 매칭).
      if (e && e.unknownCharge) {
        const rec = {
          id: null,
          uid: 'chk-' + o.handle + '-' + o.qty + '-' + orders.length,
          handle: o.handle,
          plat,
          row: o.row,
          service: svcId,
          quantity: o.qty,
          cost: o.cost != null ? o.cost : (o.qty / 1000) * Number(service.rate),
          startCount: o.current,
          remains: o.qty,          // 불명이라 전체를 진행중으로 — 보수적으로 재주문을 막는다
          status: 'unknown',
          done: false,
          needsPanelCheck: true,
          errorKind: e.kind || 'unknown',
          placedAt: new Date().toISOString(),
        };
        orders.push(rec);
        placed.push(rec);
        if (onEach) onEach({ ok: false, handle: o.handle, error: e.message, needsPanelCheck: true });
        if (persist) { try { await persist(); } catch {} } // 기록이 안 남으면 이 안전장치가 무의미하다 — 반드시 시도
        const err = new Error('주문 응답을 못 받아 과금 여부가 불명이에요(' + (e.kind || 'unknown') + '). smmkings 패널에서 @' + o.handle + ' 을(를) 확인해 주세요. 확인 전까지 이 계정 재주문을 막았고 배치를 멈췄습니다.');
        err.abortBatch = true;
        err.placed = placed;
        err.needsPanelCheck = rec;
        throw err;
      }
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

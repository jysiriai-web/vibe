# E_store 결함 4건

## i=2 · 플랫폼 접두어 붙은 검수 편집은 '수동 잠금'이 아예 기록 안 되는데 서버는 성공이라고 답한다
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\store.js:148
- 심각도: high

### 재현/근거
업로드 탭에서 틱톡 해시태그를 '미준수'로 고침 → lun8.html:2003 이 field='tk.hashtagOk' 로 /api/cell 호출 → server.js:347 은 baseField('hashtagOk')로 화이트리스트를 통과시키지만, server.js:355 는 접두어가 붙은 전체 field 를 setOverrideStore 에 넘긴다. store.js:148 의 OVERRIDE_FIELDS.includes('tk.hashtagOk') 는 false → 아무것도 저장하지 않고 {durable:true} 를 반환. 서버는 200 OK, 화면은 '저장됨' 토스트. overrides.json/_state 에는 잠금이 없다. 이후 전체 재스캔(Shift+클릭, full=true)에서 content-core.js:226 이 isLocked(overrides,row,'hashtagOk')=false 를 보고 사람 판정을 '확인 완료'로 덮어쓴다. 잠금이 저장됐더라도 키가 'tk.hashtagOk' 대 조회 키 'hashtagOk' 로 어긋나 여전히 못 막는다(이중 불일치). 프론트가 검수 3종을 항상 접두어로 보내므로 LUN8 에서 검수 수동잠금은 한 건도 성립하지 않는다.

### 제안
저장 키 = 프론트가 보낸 전체 field, 조회 키 = '플랫폼 접두어 또는 맨 필드 둘 다' 로 통일한다. (베이온에 이미 쌓인 접두어 없는 잠금을 죽이지 않으려면 조회는 반드시 양쪽을 봐야 한다.)

① src/overrides.js — isLocked(86행) 아래에 접두어 인지 헬퍼를 추가:
```js
// 잠금 조회 규약: 저장 키는 프론트가 보낸 그대로('tk.hashtagOk' 또는 옛 화면의 'hashtagOk').
// 그래서 조회는 접두어 있는 키와 맨 키를 둘 다 본다 — 한쪽만 보면 마스터마다 잠금이 새어 나간다.
export function isLockedField(overrides, row, field, plat) {
  return isLocked(overrides, row, field) || (!!plat && isLocked(overrides, row, plat + '.' + field));
}
```

② src/store.js:147~148 — 화이트리스트는 baseField 로, 저장 키는 전체 field 로:
```js
export function setOverrideStore(campaign, row, field, value) {
  const f = String(field);
  const dot = f.indexOf('.');
  const base = dot > 0 ? f.slice(dot + 1) : f;   // 'tk.hashtagOk' → 'hashtagOk'
  if (!OVERRIDE_FIELDS.includes(base)) return Promise.resolve({ sheet: 'skip', durable: true });
  return withLock(`${campaign.id}:ov`, async () => {
    const ov = await readOverrides(campaign);
    const r = String(row);
    ov[r] = ov[r] || {};
    ov[r][f] = value;              // 저장 키는 접두어 포함 전체 field
    return writeOverrides(campaign, ov);
  });
}
```
clearOverrideStore(157행)는 이미 전체 field 로 지우므로 ①②만 맞추면 짝이 맞는다(그대로 둔다).

③ src/content-core.js — 틱톡 스캔의 조회 키에 'tk' 를 넘긴다.
- 9행 import 를 `import { isLocked, isLockedField } from './overrides.js';` 로 (isLocked 는 243행 이후 재조정 블록에서 더 쓰이면 유지, 안 쓰면 isLockedField 만).
- 34행: `const putIf = (field, value) => { if (!isLockedField(overrides, row, field, 'tk')) cells.push({ row, field, value }); };`
- 91행: 위와 동일하게 `isLockedField(overrides, row, field, 'tk')`.
- 219행: `const putIf = (r, field, value) => { if (!isLockedField(overrides, r, field, 'tk')) cells.push({ row: r, field, value }); };`

④ src/ig-content.js:129~134 — 인스타는 잠금 검사 자체가 없다. readOverrides/isLockedField 를 import 하고, 스캔 시작부에서 `const overrides = await readOverrides(campaign);` 를 한 번 읽은 뒤 검수/콘텐츠 3종만 게이트한다(좋아요·댓글 수치는 지금처럼 항상 갱신):
```js
const putIf = (row, base, value) => { if (!isLockedField(overrides, row, base, 'ig')) cells.push({ row, field: 'ig.' + base, value }); };
putIf(a.row, 'contentA', first.post.link);
if (hits[1]) putIf(a.row, 'contentB', hits[1].post.link);
putIf(a.row, 'hashtagOk', first.m.all ? '준수' : '미준수');
```
(contentB 는 OVERRIDE_FIELDS 에 없어 잠금이 안 걸리는 필드다. 인스타 콘텐츠②도 사람이 고치고 지켜야 한다면 overrides.js:18 OVERRIDE_FIELDS 에 'contentB' 를 추가해야 한다 — 추가하지 않으면 위 putIf 는 contentB 에 대해 항상 통과한다.)

⑤ 회귀 방지 테스트(저장 키 == 조회 키 고정). scripts/ 에 실행 가능한 스크립트 하나로 충분하다 — 임시 dataDir 로 캠페인을 만들고 GARDEN_STATE 를 local 로 둔 채:
- setOverrideStore(c, 12, 'tk.hashtagOk', '미준수') → overrides.json 에 {"12":{"tk.hashtagOk":"미준수"}} 가 실제로 생길 것
- isLockedField(loadOverrides(dir), 12, 'hashtagOk', 'tk') === true
- 접두어 없는 옛 경로도 유지: setOverrideStore(c, 13, 'hashtagOk', '준수') → isLockedField(…, 13, 'hashtagOk', 'tk') === true
- 화이트리스트 밖은 여전히 무시: setOverrideStore(c, 14, 'tk.nick', 'x') → overrides.json 에 14 행이 없을 것
- clearOverrideStore(c, 12, 'tk.hashtagOk') 후 isLockedField === false

주의: 이 수정으로 LUN8 에 처음으로 잠금이 쌓이기 시작한다. 시트 모드에서는 state.js putOverrides 로 'tk.hashtagOk' 같은 점 있는 키가 올라가는데, overrides.js:36 normalizeOverrides 가 숫자 아닌 키를 그대로 통과시키므로(47행) 브릿지·정규화 쪽 추가 변경은 필요 없다.

---

## i=8 · 주문 배열 read-modify-write 미직렬화 — 시트 쓰기 1회 실패가 겹치면 과금 기록이 어디에도 안 남고 복구 표식(pending)까지 지워진다
- 파일: src/store.js:98
- 심각도: high

### 재현/근거
전제: .env 의 GARDEN_STATE=sheet, 로컬 서버가 대시보드(lun8.html)를 자동으로 띄워 20초마다 /api/data 를 친다. ① T0 에 대시보드 폴링이 readAll 로 주문 5건을 읽고 smm.multiStatus 응답을 기다린다(수 초). ② 그 사이 워커에서 집행이 진행돼 placeOrders 가 주문 #6 을 과금하고 persist→writeOrders 를 부른다. 이때 putOrders(Apps Script) 가 한 번 실패(502·타임아웃 — 이 코드가 pending/read-repair 를 만든 이유 그 자체)하면 #6 은 로컬 orders.json 에만 남고 pending.orders 표식이 찍힌다. ③ T0 폴링이 깨어나 자기가 들고 있던 낡은 5건 배열로 writeOrders 를 호출한다 → fileSaveOrders 가 orders.json 을 5건으로 통째로 덮어써 #6 이 로컬에서 사라지고, putOrders 는 성공하므로 clearPending(campaign,'orders') 까지 실행돼 read-repair 표식이 지워진다. 결과: 과금된 주문 #6 이 로컬에도 시트에도 없고 복구 경로도 끊긴다 → 다음 집행에서 inFlightFor(해당 handle)=0 → 같은 계정을 다시 산다. (시트 쓰기가 안 깨지면 Code.gs 의 id upsert 덕에 복구되지만, 종료/포기/리필이 붙인 closed·abandoned·refillId 플래그는 같은 방식으로 낡은 _json 이 덮어써 조용히 되돌아간다.)

### 제안
src/store.js — 주문 read-modify-write 를 직렬화 + 쓰기 시 병합 + pending 조건부 해제.

(1) store.js:85-89 readOrders, 93-103 writeOrders 를 '락 없는 내부판 + 락 거는 공개판' 으로 쪼갠다(withLock 은 재진입 불가이므로 반드시 분리):

  async function readOrdersUnlocked(campaign) {
    if (!isSheet()) return localOrders(campaign);
    const remote = await getOrders(campaign.sheet);
    return repairOrders(campaign, reconcileOrders(campaign, remote));
  }
  export function readOrders(campaign) { return withLock(`${campaign.id}:orders`, () => readOrdersUnlocked(campaign)); }

(2) store.js:93-103 writeOrders 를 아래로 교체. 저장 직전 현재 로컬 저장본을 다시 읽어 id 합집합으로 병합한다(전량 덮어쓰기 금지 — 내가 못 본 id 는 보존, 같은 id 는 호출부 값 우선). clearPending 은 '내가 쓰기 시작할 때 본 pending.at' 과 지금 값이 같을 때만 지운다:

  const mergeById = (base, incoming) => {
    const out = incoming.slice();
    const ids = new Set(out.map((o) => String(o.id)));
    for (const o of base) if (o && o.id != null && !ids.has(String(o.id))) out.push(o);
    return out;
  };
  async function writeOrdersUnlocked(campaign, orders) {
    const out = { local: 'fail', sheet: 'skip', durable: false };
    const seenAt = (readPending(campaign).orders || {}).at || null; // 쓰기 시작 시점 표식
    const merged = mergeById(localOrders(campaign), orders);        // 낡은 배열이 남의 주문을 지우지 못하게
    try { fileSaveOrders(campaign.dataDir, merged); out.local = 'ok'; }
    catch (e) { out.localError = String((e && e.message) || e); }
    if (isSheet()) {
      try {
        await putOrders(campaign.sheet, merged); out.sheet = 'ok';
        const now = (readPending(campaign).orders || {}).at || null;
        if (now === seenAt) clearPending(campaign, 'orders');       // 내 쓰기 이후 새로 찍힌 표식은 남긴다
      } catch (e) { out.sheet = 'fail'; out.sheetError = String((e && e.message) || e); markPending(campaign, 'orders', out.sheetError); }
    }
    out.durable = out.local === 'ok' || out.sheet === 'ok';
    return out;
  }
  export function writeOrders(campaign, orders) { return withLock(`${campaign.id}:orders`, () => writeOrdersUnlocked(campaign, orders)); }

(3) 같은 id 의 플래그 원복(closed/abandoned/refillId)은 병합만으로는 못 막는다 — 읽기~쓰기 전체를 한 단위로 묶어야 한다. store.js 에 헬퍼를 추가한다:

  // 읽기 → 수정 → 저장을 한 락 안에서. fn 은 orders 배열을 제자리 수정하고 아무거나 반환.
  export function updateOrders(campaign, fn) {
    return withLock(`${campaign.id}:orders`, async () => {
      const orders = await readOrdersUnlocked(campaign);
      const result = await fn(orders);
      const w = await writeOrdersUnlocked(campaign, orders);
      return { orders, result, w };
    });
  }

(4) src/server.js — 낡은 배열로 쓰는 지점을 updateOrders 로 갈아끼운다(import 줄 server.js:25 에 updateOrders 추가).
 · server.js:325-332 (/api/data 상태폴링, 이 결함의 진원지):
     const u = await updateOrders(campaign, async (o) => { const before = JSON.stringify(o); await refreshOrders(smm, o); return JSON.stringify(o) !== before; });
     orders = u.orders; if (u.result && u.w.sheet === 'fail') console.error('[상태폴링] 시트 기록 실패(로컬엔 저장됨):', u.w.sheetError);
   (변경 없을 때 쓰기를 건너뛰려면 updateOrders 에 skipWrite 반환 규약을 두거나, fn 이 false 를 반환하면 writeOrdersUnlocked 를 생략하도록 한 줄 추가.)
 · server.js:731-759 (/api/order/close), 770-779 (/api/order/refill), 788-795 (/api/order/abandon), 545-556 (/api/scan 자동리필): 각 핸들러의 `let orders = await readOrders(...)` ~ `await writeOrders(campaign, orders)` 구간을 updateOrders(campaign, async (orders) => { ...기존 수정 로직... }) 한 덩어리로 감싼다. 주문을 못 찾는 경우(404)는 fn 안에서 플래그를 반환해 바깥에서 send 하도록 한다.
 · server.js:680-695 (/api/execute persist): 집행은 수 분이라 락을 통째로 잡으면 폴링이 멈춘다 — 여기는 그대로 두되, (2)의 병합·조건부 clearPending 덕에 persist 가 넣은 신규 주문이 폴링 쓰기에 지워지지 않는다. 주석으로 그 이유를 남길 것.

검증: GARDEN_STATE=sheet 로 두고 putOrders 를 1회 강제 실패시킨 뒤, /api/data 폴링과 /api/execute 를 겹쳐 돌려 orders.json 에서 신규 주문 id 가 살아남고 pending-sync.json 의 orders 표식이 남는지 확인.

---

## i=37 · 주문(돈) 기록의 read-modify-write 가 직렬화되지 않는다 — 단순 조회(GET /api/data)가 옛 스냅샷으로 되쓴다
- 파일: src/server.js:297
- 심각도: high

### 재현/근거
overrides·best 는 store.js 의 withLock 으로 직렬화하는데(store.js:149,187) orders 만 빠져 있다. 게다가 /api/data 는 GET 인데도 쓰기 참여자다: readAll() 로 주문 배열을 읽고 → refreshOrders(smmkings 왕복 0.3~2초) → writeOrders 로 그 스냅샷을 로컬 파일과 시트에 통째로 되쓴다. 로컬 서버는 기동 시 대시보드를 자동으로 띄우고(server.js:754) 그 화면이 20초마다 /api/data 를 친다(lun8.html:2069). 시나리오: 집행 중 마지막 주문이 과금되고 persist() 가 로컬은 성공·시트는 실패(Apps Script 일시 오류) → markPending('orders') 로 '로컬이 더 최신' 표시가 남는다. 이때 이미 refreshOrders 왕복 중이던 /api/data 가 끝나며 자기 스냅샷(새 주문 없음)을 writeOrders 한다 → fileSaveOrders 가 로컬 orders.json 을 새 주문 없는 상태로 덮고, 시트 putOrders 는 성공하며 clearPending 까지 호출해 보호 표식을 지운다. 결과: 과금된 주문이 로컬·시트 어디에도 없고 pending 표시도 사라져 read-repair 가 못 살린다 → 다음 집행에서 inFlightFor=0 → 같은 계정 재주문(이중지출). GARDEN_STATE=local 로 도는 CLI(scripts/)에서는 시트 upsert 보정조차 없어 시트 실패 없이도 곧바로 유실된다.

### 제안
1) src/store.js — 주문 구간 직렬화용 락을 내보낸다. withLock 정의(store.js:56-61) 바로 아래에 추가:

```js
// 주문(돈)은 배열을 통째로 덮어쓴다. '읽기→수정→쓰기' 사이에 다른 요청이 끼면
// 그 사이 과금된 주문이 스냅샷에서 사라진다 → 캠페인별로 그 구간 전체를 직렬화한다.
export function lockOrders(campaign, fn) { return withLock(`${campaign.id}:orders`, fn); }
```

2) src/server.js:329 — GET 을 쓰기 참여자에서 뺀다(핵심·최소 조치). 318~332 블록에서 되쓰기를 삭제하고 응답 전용으로:

```js
      if (smm && (!sc.ordersAt || now - sc.ordersAt > SMM_TTL)) {
        try {
          // 폴링은 화면 갱신만 한다. 여기서 writeOrders 하면 집행이 방금 과금한 주문이
          // 이 요청의 낡은 스냅샷에 덮여 사라진다(로컬 파일 + 시트 행 모두).
          orders = await refreshOrders(smm, orders);
          sc.ordersAt = now;
        } catch {}
      }
```
(327행 `const before = JSON.stringify(orders);` 와 329행 전체를 지운다. 상태값은 집행·스캔·종료·포기·리필 경로가 각자 쓰기 전에 refreshOrders 를 다시 하므로 유실되지 않는다. doneAt 기록만 최대 한 사이클 늦어진다.)

3) src/server.js — 남은 쓰기 경로의 read-modify-write 를 락 안에 넣는다. import 를 `import { mode as stateMode, readOrders, writeOrders, ..., lockOrders } from './store.js';` (server.js:25) 로 늘리고:
 - /api/order/close: server.js:731~762 의 `let orders = await readOrders(campaign)` 부터 `const w = await writeOrders(...)` 까지를 `return lockOrders(campaign, async () => { ... })` 로 감싼다(내부에서 send 후 return).
 - /api/order/refill: server.js:770~781 동일.
 - /api/order/abandon: server.js:788~798 동일.
 - /api/execute: server.js:668~695 (스캔 뒤 '주문기록 재확인' → placeOrders → 최종 writeOrders) 구간을 lockOrders 로 감싼다. 앞의 scanAccounts(수 분)는 락 밖에 두어 화면이 그 시간 내내 멈추지 않게 한다.
 - /api/scan: server.js:545~556 의 readOrders~writeOrders(자동리필) 구간도 같은 방식으로 감싼다.

4) src/store.js:98 — clearPending 은 '자기가 실제로 밀어넣은 주문 집합'에 대해서만 유효하다. 3)으로 모든 쓰기가 락 안에서 재읽기 후 저장하게 되면 스냅샷이 항상 최신이라 현재 위치가 안전해진다. 그 전까지의 보강으로, writeOrders 에 넘긴 배열이 pending 시점의 로컬 주문을 전부 포함하는지 확인 후에만 clearPending 을 부르도록 한다(예: `const lIds = idsOf(localOrders(campaign)); if ([...lIds].every(id => idsOf(orders).has(id))) clearPending(campaign,'orders');`).

---

## i=38 · tk./ig. 접두어가 붙은 편집은 수동잠금이 기록되지 않는데 서버는 200 ok 로 답한다
- 파일: src/store.js:148
- 심각도: high

### 재현/근거
대시보드의 검수·콘텐츠 편집은 항상 플랫폼 접두어를 붙여 보낸다(lun8.html:2003 → 'tk.soundOk' / 'ig.hashtagOk'). server.js:353 은 접두어를 뗀 baseField 로 화이트리스트만 검사하고, setOverrideStore 에는 접두어가 붙은 원본 field 를 그대로 넘긴다. setOverrideStore 는 OVERRIDE_FIELDS.includes('tk.soundOk') 가 false 이므로 아무것도 저장하지 않고 {durable:true} 를 돌려준다 → server.js:357 의 '잠금 기록 실패' 경고에도 안 걸리고 사용자는 '저장됨' 토스트만 본다. 즉 팀원이 대시보드에서 고친 검수/콘텐츠 칸은 잠금이 어디에도 남지 않는다. 결과 ①content-core 의 isLocked 가 항상 false → full 재스캔(/api/content-scan?full=1)이 사람 판정을 '사용 확인'/'확인 완료' 로 덮어쓴다. ②buildAccounts 의 '수동 우선' 병합(server.js:136-145)도 rowOv 가 비어 동작하지 않아, 자동감지값이 다시 표시로 올라온다. clearOverrideStore 도 같은 이유로 무조건 no-op 이다.

### 제안
1) src/store.js:146-166 — 잠금 키를 정규화하고 '모르는 필드'를 조용히 넘기지 않는다.

```js
// 잠금 키 정규화: 'tk.soundOk' → 'soundOk' (틱톡 = 무접두 기본 열, content-core/브릿지가 쓰는 키),
// 'ig.soundOk' → 'ig.soundOk' (인스타는 별도 열이라 키도 별도). 베이온(무접두)은 그대로.
export function overrideKey(field) {
  const f = String(field), dot = f.indexOf('.');
  if (dot <= 0) return f;
  const plat = f.slice(0, dot), base = f.slice(dot + 1);
  return plat === 'tk' ? base : plat + '.' + base;
}
const baseOf = (key) => (key.indexOf('.') > 0 ? key.slice(key.indexOf('.') + 1) : key);

export function setOverrideStore(campaign, row, field, value) {
  const key = overrideKey(field);
  // 화이트리스트는 접두어를 뗀 필드명으로 검사한다 (예전엔 'tk.soundOk' 가 통째로 안 맞아 조용히 버려졌다).
  if (!OVERRIDE_FIELDS.includes(baseOf(key))) return Promise.resolve({ sheet: 'skip', durable: true, skipped: String(field) });
  return withLock(`${campaign.id}:ov`, async () => {
    const ov = await readOverrides(campaign);
    const r = String(row);
    ov[r] = ov[r] || {};
    ov[r][key] = value;
    return writeOverrides(campaign, ov);
  });
}
export function clearOverrideStore(campaign, row, field) {
  const key = overrideKey(field);
  return withLock(`${campaign.id}:ov`, async () => {
    const ov = await readOverrides(campaign);
    const r = String(row);
    if (!ov[r] || !(key in ov[r])) return { sheet: 'skip', durable: true };
    delete ov[r][key];
    if (!Object.keys(ov[r]).length) delete ov[r];
    return writeOverrides(campaign, ov);
  });
}
```
(store.js:17 의 import 는 그대로 — OVERRIDE_FIELDS 만 쓴다.)

2) src/server.js:388-395 — 잠금 대상 필드일 때만 부르고, skipped 면 경고한다. 현재 389-391 블록을 아래로 교체.

```js
        // 검수/콘텐츠 필드만 잠금 대상. 값 있으면 잠금, 빈값(미확인)이면 해제. nick·memo 등은 잠금 무관.
        let w = null;
        if (OVERRIDE_FIELDS.includes(baseField)) {
          w = value.trim()
            ? await setOverrideStore(campaign, row, field, value)
            : await clearOverrideStore(campaign, row, field);
          if (w && w.skipped) { console.error('[검수잠금] 키를 못 알아봄 — 잠금 미기록:', field); return send(res, 500, { error: '수정은 됐지만 잠금 기록에 실패했어요. 다음 스캔이 이 칸을 덮어쓸 수 있어요.' }); }
        }
```
(뒤따르는 393-395 의 `w && w.durable === false` / `w.sheet === 'fail'` 검사는 그대로 두면 된다 — w 가 null 이면 통과.)

3) src/ig-content.js:129-134 — 인스타 스캔은 잠금을 아예 안 본다(파일에 isLocked import 자체가 없음). 위 키 규칙('ig.contentA' 등)에 맞춰 가드를 넣는다.
   - 상단에 `import { isLocked } from './overrides.js';` 와 `import { readOverrides } from './store.js';` 추가
   - runIgContentScan 안, targets 계산 직후(파일 61행 근처)에 `const overrides = await readOverrides(campaign);`
   - 129-132 의 push 를 `const putIf = (field, value) => { if (!isLocked(overrides, a.row, field)) cells.push({ row: a.row, field, value }); };` 로 감싸 `putIf('ig.contentA', …)`, `putIf('ig.contentB', …)`, `putIf('ig.hashtagOk', …)` 로 바꾼다. likes/comments(성과 수치)는 지금처럼 무조건 갱신.

검증: 대시보드에서 틱톡 음원을 '미준수'로 고친 뒤 data/<campaign>/overrides.json 에 `{"<row>":{"soundOk":"미준수"}}` 가 생기는지, 인스타 해시태그를 고치면 `{"ig.hashtagOk":…}` 가 생기는지 확인. 이후 /api/content-scan?full=1 이 그 행의 soundOk 를 안 쓰는지(pushCellsToSheet 로 나가는 cells 에 없는지) 확인.

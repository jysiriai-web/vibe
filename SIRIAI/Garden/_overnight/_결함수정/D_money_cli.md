# D_money_cli 결함 4건

## i=0 · CLI 집행이 시트가 아닌 (없는) 로컬 orders.json을 읽어 '진행중 0건'으로 이중지출
- 파일: scripts/execute.js:38
- 심각도: high

### 재현/근거
.env 에 GARDEN_STATE=sheet 가 켜져 있어 주문(돈) 기록의 진실은 구글시트 _orders 탭이고, data/c/lun8/ 에는 orders.json 이 실제로 없다(현재 파일: ig-detected/ig-scan-latest/scan-latest 뿐). 그런데 이 CLI는 store.js(readOrders)가 아니라 orders.js 의 loadOrders(campaign.dataDir) 를 직접 부른다. loadOrders 는 파일이 없거나 JSON 이 깨져도 조용히 [] 을 돌려준다(orders.js:12,16). 결과: `npm run execute` 를 돌리면 '진행중 주문 0건' 이라고 당당히 출력하고, buildPlan 의 inFlightFor 가 모든 핸들에 0을 돌려줘 이미 채워지는 중인 계정에 같은 주문을 다시 넣는다. 서버 경로(/api/execute)는 store.readOrders 로 시트를 읽고 실패 시 throw 하는데(store.js:87, 원칙③), CLI만 그 보호 밖에 있다.

### 제안
1) scripts/execute.js — 주문 읽기/쓰기를 store 로 교체
- 13행 `import { loadOrders, saveOrders, refreshOrders } from '../src/orders.js';`
  → `import { refreshOrders } from '../src/orders.js';`
  + `import { readOrders, writeOrders } from '../src/store.js';`
- 38행 `let orders = loadOrders(campaign.dataDir);`
  → 시트 읽기 실패는 삼키지 말고 중단:
  ```js
  let orders;
  try { orders = await readOrders(campaign); }
  catch (e) { console.error(`\n❌ 주문 기록을 읽지 못했어(${e.message}). 낡은 데이터로 집행하면 이중지출이라 멈춰.\n`); process.exit(1); }
  ```
- 41행 `saveOrders(campaign.dataDir, orders);` → `await writeOrders(campaign, orders);` (갱신분 저장. durable 실패해도 여기선 과금 전이라 경고만 출력)
- 79행 persist 콜백 `persist: () => saveOrders(campaign.dataDir, orders),`
  → `persist: () => writeOrders(campaign, orders),`
  (writeOrders 가 {durable} 를 돌려주므로 execute-core.js:131-141 의 '기록 실패 시 배치 중단' 가드가 CLI 에서도 살아난다. 지금은 undefined 반환이라 죽어 있음)
- 78~81행 placeOrders 호출을 try/catch 로 감싸서 배치 중단 에러를 사람이 읽게:
  ```js
  try { await placeOrders(...); }
  catch (e) { console.error(`\n❌ ${e.message}\n   이미 나간 주문: ${(e.placed||[]).map(p=>'#'+p.id+' @'+p.handle).join(', ') || '없음'}\n`); await writeOrders(campaign, orders); process.exit(1); }
  ```
- 82행 마지막 `saveOrders(campaign.dataDir, orders);`
  → ```js
    const w = await writeOrders(campaign, orders);
    if (!w.durable) console.error('\n⚠️ 주문은 나갔는데 기록에 실패했어. smmkings 패널에서 직접 확인해.\n');
    ```

2) src/orders.js — 조용한 [] 를 CLI에서만 없앤다 (loadOrders 자체는 건드리지 말 것)
`loadOrders` 를 throw 로 바꾸면 store.js:34 localOrders 가 reconcileOrders/readAll 안에서 가드 없이 불리므로 로컬 파일이 깨졌을 때 대시보드 전체가 죽는다. 대신 15-17행 catch 에 경고만 추가하고
```js
} catch (e) {
  console.error(`[orders] ${f} 파싱 실패 — 빈 기록으로 취급합니다: ${e.message}`);
  return [];
}
```
파일 없음(12행)은 그대로 [] 유지.

3) (선택, 표시만) scripts/orders.js:6,16 도 같은 방식으로 store.readOrders 로 교체하면 시트 기록이 CLI 현황에도 보인다.

---

## i=9 · 주문 요청이 네트워크에서 끊기면 '돈 안 나갔다'로 단정하고 다음 계정으로 넘어간다 — 과금됐는데 기록이 없어 다음 집행에서 또 산다
- 파일: src/execute-core.js:116
- 심각도: critical

### 재현/근거
placeOrders 의 catch 는 addOrder 에서 나온 예외를 전부 '여기서 실패한 건 돈이 안 나갔으므로'(84행 주석)로 취급해 continue 한다. 그런데 smm.js 의 req() 는 타임아웃도 재시도 구분도 없이 fetch 실패·JSON 아님(HTTP 502/차단 페이지)까지 같은 Error 로 던진다. 패널이 주문을 생성한 뒤 응답만 유실되는 경우(모바일테더링 끊김, 패널 게이트웨이 502, undici 기본 300초 타임아웃)가 정확히 여기 걸린다. 예: @ruto__39 700명 주문 POST 가 패널에 도달해 주문번호가 발급됐는데 응답이 안 옴 → 예외 → orders 배열에 rec 이 안 들어가고 시트 _orders 에도 안 남음 → placed 에도 없어 화면에 아무 말도 안 뜸 → 다음 집행에서 inFlightFor(@ruto__39)=0 → 같은 계정에 700명을 또 주문(2회 과금, 팔로워는 1800까지 붕 뜸). 바로 아래 '주문번호 없음' 분기(94~100행)는 같은 위험을 알아보고 abortBatch 로 배치를 멈추는데, 그보다 더 흔한 '응답 자체를 못 받음'은 오히려 안전한 실패로 취급된다.

### 제안
1) src/smm.js:19-42 — req() 에 타임아웃과 과금불명 표식을 붙인다.

- fetch 호출에 `signal: AbortSignal.timeout(30000)` 추가(현재 undici 기본 300초 매달림 제거).
- 실패 종류를 구분해 표식을 단다. 지금 코드의 3개 throw 지점을 이렇게 바꾼다:

  catch (e) {                                   // 29행: fetch/본문읽기 실패
    const err = new Error(`SMM 네트워크 오류: ${e.message}`);
    err.unknownCharge = true;                   // 요청이 패널에 닿았을 수 있다 → 과금 여부 불명
    throw err;
  }
  ...
  catch {                                       // 35행: JSON 아님(502·차단 페이지 등)
    const err = new Error(`SMM 응답이 JSON 이 아님 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    err.unknownCharge = true;
    throw err;
  }
  if (!res.ok) {                                // 40행 앞에 신설: 비2xx
    const err = new Error(`SMM HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.unknownCharge = true;
    throw err;
  }
  if (json && json.error) throw new Error(`SMM 오류: ${json.error}`);  // 이것만 charged=false (표식 없음, 그대로 둔다)

  ※ `if (!res.ok)` 는 반드시 `json.error` 검사보다 앞에 두되, 패널이 4xx 로 명시 거절 JSON 을 주는 경우를 살리려면
    `if (!res.ok && !(json && json.error))` 로 쓴다(권장).

2) src/execute-core.js:123-128 — placeOrders 의 catch 를 과금불명이면 배치 중단으로 바꾼다.
   현재:
     } catch (e) {
       if (e && e.abortBatch) throw e;
       if (onEach) onEach({ ok: false, handle: o.handle, error: e.message });
       await sleep(800);
       continue;
     }
   변경:
     } catch (e) {
       if (e && e.abortBatch) throw e;
       // 응답을 못 받았거나 패널이 JSON 이 아닌 걸 돌려준 경우 = 주문이 실제로 들어갔을 수 있다.
       // 기록이 없으면 다음 집행에서 inFlightFor=0 이라 같은 계정을 또 산다 → 여기서 멈춘다.
       if (e && e.unknownCharge) {
         const err = new Error(`@${o.handle} ${o.qty}명 주문의 응답을 받지 못했어요(${e.message}). 실제로 주문이 들어갔을 수 있으니 smmkings 패널에서 확인한 뒤 다시 집행하세요. (배치 중단)`);
         err.abortBatch = true;
         err.placed = placed;
         err.unknownCharge = { handle: o.handle, qty: o.qty };
         throw err;
       }
       if (onEach) onEach({ ok: false, handle: o.handle, error: e.message });
       await sleep(800);
       continue;
     }

   ※ src/execute-core.js:91 의 주석 '여기서 실패한 건 돈이 안 나갔으므로'도 '패널이 JSON 으로 명시 거절한 것만 돈이 안 나간 것'으로 고쳐 둔다.

3) 호출부는 손댈 필요 없다 — src/server.js:689-694 의 catch 가 e.message·e.placed 를 그대로 500 으로 올려 주고, scripts/execute.js:78 은 throw 가 그대로 터져 CLI 가 멈춘다(직전 persist 로 이미 저장된 주문은 보존됨).

---

## i=11 · 주문 API 가 네트워크·HTTP 오류로 실패하면 '돈 안 나갔다'고 단정하고 기록 없이 다음 계정으로 넘어간다 — 다음 집행에서 같은 계정에 또 과금
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\execute-core.js:116
- 심각도: critical

### 재현/근거
placeOrders 의 catch 블록 주석이 '여기서 실패한 건 돈이 안 나갔으므로 다음 계정으로 넘어간다'로 되어 있고 실제로 continue 한다. 그런데 smm.js req() 는 (a) fetch 자체가 거절될 때 'SMM 네트워크 오류', (b) 응답이 JSON 이 아닐 때 'SMM 응답이 JSON 이 아님 (HTTP 502)' 를 던진다 — 둘 다 '패널이 주문을 이미 만든 뒤 응답만 못 받은' 경우에 발생한다. 예: @user_a 에 addOrder 요청 → smmkings 가 주문 생성 후 Cloudflare 가 502/타임아웃 → placeOrders 는 orders 배열에 아무것도 push 하지 않고 조용히 다음 계정으로 진행. 그 계정은 orders/_orders 어디에도 없으므로 inFlightFor()=0, buildPlan 이 다시 '가드닝 필요'로 잡고, 다음 집행에서 1100까지 또 충전 주문이 나간다(같은 계정 2회 과금 + 팔로워 2배 유입). 바로 아래 '주문번호 없음' 케이스는 err.abortBatch 로 배치를 세우도록 정성껏 막아놨는데, 훨씬 흔한 네트워크·5xx 케이스는 그 방어를 안 탄다.

### 제안
[사람이 정할 것] 네트워크/5xx 로 '과금 불명'이 났을 때 (A) 배치 전체를 즉시 중단할지, (B) 그 핸들만 미확인으로 잠그고 나머지는 계속 집행할지 — 돈·운영 정책 결정. 아래는 (A) 기준이며 (B)면 throw 대신 continue 로만 바꾸면 됩니다.

1) src/smm.js:19-41 — 오류 종류를 구분해서 던진다.
 - 29-31 줄 catch 를:
     } catch (e) {
       const err = new Error(`SMM 네트워크 오류: ${e.message}`);
       err.kind = 'network'; // 패널이 주문을 만들었는지 알 수 없음
       throw err;
     }
 - 35-39 줄 JSON 파싱 실패를:
     } catch {
       const err = new Error(`SMM 응답이 JSON 이 아님 (HTTP ${res.status}): ${text.slice(0, 300)}`);
       err.kind = 'nonjson';
       throw err;
     }
 - 40 줄 앞에 HTTP 5xx 도 불명으로 처리 추가(파싱 성공했더라도):
     if (!res.ok && res.status >= 500) { const err = new Error(`SMM 서버 오류 (HTTP ${res.status})`); err.kind = 'http5xx'; throw err; }
 - 40 줄 json.error 는 패널이 명시 거절한 것 → 과금 없음:
     if (json && json.error) { const err = new Error(`SMM 오류: ${json.error}`); err.kind = 'panel'; throw err; }

2) src/execute-core.js:91 주석 교체 — "1) 과금 시도. 패널이 명시 거절(kind==='panel')한 경우만 돈이 안 나간 것이 확실하다. 네트워크·비JSON·5xx 는 '패널이 주문을 만든 뒤 응답만 못 받은' 경우와 구분할 수 없으므로 과금 불명으로 취급한다."

3) src/execute-core.js:123-128 catch 를 아래로 교체.
    } catch (e) {
      if (e && e.abortBatch) throw e; // 추적 불가 주문 → 계속 사지 않고 배치 중단
      // 패널이 명시 거절한 경우(not_enough_funds, incorrect_link 등)만 과금이 없다 → 다음 계정으로.
      if (e && e.kind === 'panel') {
        if (onEach) onEach({ ok: false, handle: o.handle, error: e.message });
        await sleep(800);
        continue;
      }
      // 그 외(network·nonjson·http5xx·미상)는 '과금 여부 불명'. 기록 없이 넘어가면 inFlightFor=0 이라
      // 다음 집행에서 같은 계정에 또 과금된다. 미확인 레코드를 남겨 재주문 대상에서 빼고 배치를 멈춘다.
      const unknown = {
        id: null,                 // 합성 id 금지 — refreshOrders/multiStatus 가 이걸 조회하면 전체 갱신이 깨진다
        uid: `unknown-${Date.now()}-${o.handle}`, // 사람이 해제(포기)할 때 쓰는 키
        handle: o.handle,
        row: o.row,
        service: svcId,
        quantity: o.qty,
        cost: o.cost != null ? o.cost : (o.qty / 1000) * Number(service.rate),
        startCount: o.current,
        remains: o.qty,           // inFlightFor 가 qty 만큼 진행중으로 세도록
        status: 'unknown',
        needsPanelCheck: true,
        done: false,
        placedAt: new Date().toISOString(),
        error: e.message,
      };
      orders.push(unknown);
      if (persist) { try { await persist(); } catch {} }
      if (onEach) onEach({ ok: false, handle: o.handle, error: e.message, needsPanelCheck: true });
      const err = new Error(`주문 요청이 응답을 못 받았어요(${o.handle}). 돈이 나갔는지 불명이라 배치를 멈췄습니다. smmkings 패널에서 @${o.handle} 주문이 실제로 생겼는지 확인해 주세요.`);
      err.abortBatch = true;
      err.placed = placed;
      err.needsPanelCheck = unknown;
      throw err;
    }

4) src/server.js:789 — 미확인 레코드를 사람이 해제할 수 있게 조회 키 확장(안 하면 그 핸들이 영구 차단됨).
    const o = orders.find((x) => (x.id != null && String(x.id) === String(body.orderId)) || (x.uid && x.uid === body.orderId));
   그리고 791 줄 취소 시도를 id 있을 때만: if (smm && o.id != null) { try { await smm.cancel([o.id]); } catch {} }
   (프런트에서 orderId 로 id ?? uid 를 보내도록 같이 맞출 것.)

5) src/orders.js:27 refreshOrders 는 이미 `o.id &&` 로 걸러 미확인 레코드를 건드리지 않으므로 수정 불필요. 다만 27 줄 옆에 "id 없는 레코드 = 과금 불명(needsPanelCheck) — 사람이 패널 확인 후 abandon 으로 해제" 주석 추가.

6) 대시보드 표시(public/): status==='unknown' || needsPanelCheck 인 주문을 '패널 확인 필요'로 눈에 띄게 노출 + 포기(abandon) 버튼 연결. 안 그러면 그 계정이 조용히 영구 대기 상태가 된다.

---

## i=26 · CLI 집행이 시트(_orders) 대신 로컬 orders.json 만 읽어 진행중 주문을 못 본다
- 파일: scripts/execute.js:38
- 심각도: high

### 재현/근거
.env 의 GARDEN_STATE=sheet 라 주문(돈) 원장의 진실은 마스터시트 _orders 탭이고, 서버는 store.readOrders/writeOrders 로 시트를 본다. 그런데 CLI 는 src/orders.js 의 loadOrders(campaign.dataDir)/saveOrders 로 로컬 파일만 본다. data/ 는 .gitignore 대상이고 실제로 지금 data/c/lun8/orders.json 은 존재하지 않는다. 따라서 로컬 파일이 없거나 뒤처진 상태(다른 PC·새 클론·data 정리 후)에서 CLI 를 돌리면 orders=[] → inFlightFor 가 전부 0 → 시트에 배송중 주문이 있는 계정까지 전부 재주문된다(계정당 최대 1100명 재구매). 반대로 CLI 가 넣은 주문도 로컬에만 저장돼, 그 사이 대시보드에서 집행하면 같은 계정에 또 나간다.

### 제안
scripts/execute.js 를 서버와 같은 상태 계층(src/store.js)으로 통일한다.

1) 13줄
  기존: import { loadOrders, saveOrders, refreshOrders } from '../src/orders.js';
  변경: import { refreshOrders } from '../src/orders.js';
        import { readOrders, writeOrders } from '../src/store.js';

2) 38줄 (기존 주문 읽기) — 시트가 진실. store.js 원칙 ③ 대로 시트 읽기 실패는 로컬로 폴백하지 말고 집행을 중단한다(낡은 데이터로 돈 쓰는 것 방지). backfill-gardening.js:42 처럼 localOrders 로 폴백하면 안 된다.
  기존: let orders = loadOrders(campaign.dataDir);
  변경: let orders;
        try { orders = await readOrders(campaign); }
        catch (e) { console.error(`\n❌ 주문 원장(시트)을 못 읽었어요 — 낡은 기록으로 집행하면 같은 계정에 또 돈이 나가서 중단합니다.\n   ${e.message}\n`); process.exit(1); }

3) 41줄 (상태 갱신 저장)
  기존: saveOrders(campaign.dataDir, orders);
  변경: { const w = await writeOrders(campaign, orders);
          if (w.sheet === 'fail') console.error(`  ⚠️ 시트 기록 실패(로컬엔 저장됨): ${w.sheetError}`); }

4) 79줄 (persist 콜백) — writeOrders 는 throw 하지 않고 {durable} 을 돌려주므로 placeOrders 의 규약이 그대로 살아난다.
  기존: persist: () => saveOrders(campaign.dataDir, orders),
  변경: persist: () => writeOrders(campaign, orders),

5) 82줄 (마지막 저장) — 기록 실패를 조용히 넘기지 않는다.
  기존: saveOrders(campaign.dataDir, orders);
  변경: { const w = await writeOrders(campaign, orders);
          if (!w.durable) console.error('\n❌ 주문은 나갔는데 기록에 실패했습니다. smmkings 패널에서 실제 주문을 확인하세요.\n');
          else if (w.sheet === 'fail') console.error(`\n⚠️ 로컬엔 저장됐지만 시트 기록 실패: ${w.sheetError} — 대시보드를 한 번 열어 동기화하세요.\n`); }

(참고: 78줄 placeOrders 호출은 이미 await 안에 있고 모듈이 ESM top-level await 을 쓰고 있어 await 추가에 문제 없음. scripts/orders.js 도 같은 로컬 전용 import(6·16·21줄)를 쓰지만 조회·상태갱신 전용이라 돈이 직접 나가지 않으므로 이번 수정 범위와 별개로 두어도 된다.)

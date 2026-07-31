# A_lun8html 결함 10건

## i=14 · lun8.html의 집행·스캔 버튼이 아무 요청도 없이 '시트에 기록했어요' 토스트만 띄움
- 파일: public/lun8.html:1916
- 심각도: medium

### 재현/근거
execModal() 의 [집행 요청] 버튼은 closeModal() 후 '집행 요청을 시트에 기록했어요 · 워커가 로컬 SMM 키로 처리합니다' 를 띄우지만 fetch 가 한 줄도 없다(1914-1917). scanRequest() 도 마찬가지로 '스캔 요청을 시트에 기록했어요' 만 띄우고 끝이며(1921-1923), 모집/업로드/조회수 스캔 버튼 세 개가 전부 여기에 묶여 있다(1984-1988). 비번 입력칸은 value='••••' 로 채워진 장식이다(1911). 재현: 팀이 대시보드에서 집행을 누르고 '기록됐다'고 믿은 채 기다리지만 워커 쪽에는 어떤 요청도 도착하지 않고, 가드닝은 영영 집행되지 않는다.

### 제안
public/lun8.html — 정의 없는 scanRequest 호출 2곳을 없애고, 조회수 스캔을 실제 배선한다.

1) 1981행: 조회수 스캔 버튼을 로컬에서만 보이게 바꾼다(스캔은 대표님 PC 크롬에서만 돈다 — 가드닝 #btnExec 와 같은 규칙).
   기존: `<div class="bar"><button class="btn small" id="btnPerf">📊 조회수 스캔</button><button class="btn small" id="btnDeliver">...`
   변경: `<div class="bar">${LOCAL.on?`<button class="btn small" id="btnPerf">📊 조회수 스캔</button>`:`<span class="cmuted">조회수 스캔은 대표님 PC 작업 콘솔(worker.html)에서 실행해요</span>`}<button class="btn small" id="btnDeliver">...` (나머지 동일)

2) 2813행 `if(e.target.closest('#btnPerf')){ scanRequest('조회수'); return; }` →
   `{ const bp=e.target.closest('#btnPerf'); if(bp){ runPerfScan(bp); return; } }`

3) 2779행 `if(e.target.closest('#btnUpScan')){ scanRequest('업로드'); return; }` 은 삭제한다(#btnUpScan 은 upScanBtn() 이 호출되지 않아 렌더되지 않는 죽은 경로다). 함께 1646행의 upScanBtn 정의도 삭제.

4) runPickScan(1679) 바로 아래에 실제 호출 함수를 추가한다. /api/content-scan 은 {started:true} 만 돌려주고 로봇인증 확인 게이트가 worker.html 에 있으므로, '시작됨'까지만 정직하게 말한다:
```js
// 조회수 스캔 — 업로드된 계정만 조회수를 다시 긁는다(perf=1). 로컬 서버에서만 돈다.
// 서버는 {started:true} 만 돌려주고 로봇인증 확인·진행률은 작업 콘솔(worker.html)에 있다 —
// 여기서 '완료'라고 말하면 안 된다. 시작됐다는 것까지만 말한다.
async function runPerfScan(btn){
  btn.disabled = true; const t = btn.textContent; btn.textContent = '스캔 시작 중…';
  try {
    const r = await fetch(localApi('/api/content-scan?perf=1&campaign=' + state.campaign), { method:'POST' });
    const j = await r.json();
    if(j.error) throw new Error(j.error);
    if(j.running) toast('이미 스캔이 돌고 있어요 — 작업 콘솔에서 진행상황을 봐주세요.');
    else toast('조회수 스캔을 시작했어요 — 작업 콘솔(worker.html)에서 로봇인증 확인 후 진행돼요.');
  } catch(e){ toast('조회수 스캔 실패: ' + esc(e.message)); }
  finally { btn.disabled = false; btn.textContent = t; }
}
```

5) 같은 부류인 2814행 #btnDeliver 도 함께 고친다. 지금은 fetch 없이 '자동 기입' 토스트만 띄운다. /api/deliver(src/server.js:523)를 실제로 부르고 응답의 added 건수를 말하게 한다:
```js
{ const bd = e.target.closest('#btnDeliver');
  if(bd){ (async()=>{ bd.disabled=true; const t=bd.textContent; bd.textContent='기입 중…';
    try { const r = await fetch('/api/deliver?campaign=' + state.campaign, { method:'POST' });
          const j = await r.json(); if(j.error) throw new Error(j.error);
          toast('납품시트에 <b>' + (j.added||0) + '건</b> 기입했어요 (검수완료 ' + (j.reviewedTotal||0) + '건 중, 중복 제외).');
    } catch(e){ toast('납품 기입 실패: ' + esc(e.message)); }
    finally { bd.disabled=false; bd.textContent=t; } })(); return; } }
```


---

## i=15 · 업로드·가드닝·납품 탭 편집 모달이 메모리만 고치고 '저장됨' — 20초 뒤 소멸
- 파일: public/lun8.html:1845
- 심각도: medium

### 재현/근거
편집 모달의 save 콜백 중 시트에 쓰는 것은 recruit 뷰의 schedDate·fixedDate·memo 세 개뿐이다(1773-1775). upload 뷰(콘텐츠①②·음원·음원구간·해시태그·미러링·플랫폼 비고, 1796-1799), garden 뷰(팔로워 수동보정·inFlight·보류 체크, 1813), deliver 뷰(콘텐츠①·조회수·납품비고, 1823) 의 save 는 전부 D 배열만 바꾸고 saveField 를 부르지 않는다. recruit 뷰에서도 크리에이터명(reNick)과 틱톡/인스타 링크(reTk/reIg)는 메모리에만 남는다(1772,1776). 그런데 1843-1846 은 무조건 '편집 저장됨' 토스트를 띄우고, boot 의 20초 인터벌 loadData() 가 D 를 통째로 갈아끼운다(2069-2072, 795-803). 재현: 납품 탭에서 조회수를 입력→저장→'저장됨' 표시→20초 후 화면이 새로고침되며 입력값이 사라진다(모달이 닫혀 있으므로 스킵 조건 2070 에 안 걸린다).

### 제안
C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\lun8.html

1) garden save — 2493행. 지금:
   save = ()=>{ const f=val('reFol'); x.fol = f===''?null:(+f); x.inFlight=+val('reInf')||0; d.oddsLow=chk('reOdds'); d.noUpload=chk('reNo'); x.memo=val('rePMemo'); };
   → upload/deliver 와 같은 모양으로 바꾼다. 모달 body 를 만든 직후(2491행 뒤)에 스냅샷을 잡고:
   const wasG = { fol: x.fol, memo: x.memo||'' };
   save = ()=>{
     const f=val('reFol'); x.fol = f===''?null:(+f); x.inFlight=+val('reInf')||0;
     d.oddsLow=chk('reOdds'); d.noUpload=chk('reNo'); x.memo=val('rePMemo');
     if(x.memo!==wasG.memo) saveField(d.id, p+'.memo', x.memo);
     if(x.fol!==wasG.fol && x.fol!=null) saveManualFollowers(d.id, x.fol);
   };
   팔로워는 saveField 로 보내면 안 된다 — EDITABLE_FIELDS(src/overrides.js:21)에 followers 가 없어 서버가 400 을 낸다. 대신 기존 /api/manual (src/server.js:354, body {row, followers}) 를 쓰는 얇은 헬퍼를 saveField 옆(1023행 근처)에 추가:
   async function saveManualFollowers(row, followers){
     try{ const r=await fetch('/api/manual?campaign=lun8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({row,followers})});
          const j=await r.json(); if(j.error) throw new Error(j.error); toast('저장됨 — <b>팔로워</b>'); }
     catch(e){ toast('저장 실패: '+esc(e.message)); loadData(); }
   }

2) recruit save — 2420-2426행. was 스냅샷에 nick 은 이미 잡혀 있으니(2420) 아래 두 줄을 2425행 뒤에 추가하고, 링크 줄(2426)을 되쓰기까지 하도록 바꾼다:
   if(d.nick!==was.nick) saveField(d.id,'nick',d.nick);
   if(d.tk && val('reTk') && val('reTk')!==d.tk.h){ d.tk.h=val('reTk'); saveField(d.id,'tk.link',d.tk.h); }
   if(d.ig && val('reIg') && val('reIg')!==d.ig.h){ d.ig.h=val('reIg'); saveField(d.id,'ig.link',d.ig.h); }
   (기존 2426행의 무조건 대입 두 개는 삭제. 틱톡 link 는 서버가 @핸들을 요구하므로 — src/server.js:385 — 저장 실패 토스트가 그대로 뜨는 게 맞다.)

3) 토스트 — 2531-2534행. 뷰별로 되쓰기 여부를 알려준다. save() 가 실제로 시트에 보낸 게 없는 뷰(현재 settle, 그리고 위 1)을 적용해도 남는 inFlight·보류 체크)에 대해 "편집 저장됨" 이라고 하면 안 된다:
   const SHEETLESS = { settle:'정산 값은 아직 시트 열이 없어 화면에만 반영돼요.' };
   save(); closeModal(); render();
   toast(SHEETLESS[state.view] ? `<b>${esc(d.nick)}</b> · ${SHEETLESS[state.view]}` : `<b>${esc(d.nick)}</b> · ${TABN} 편집 저장됨.`);
   garden 모달에는 inFlight·'업로드 확률 낮음'·'연락두절' 체크 아래에 한 줄을 박아둔다(2488-2490행 뒤):
   <div class="cmuted" style="font-size:12.5px">진행중 주문·보류 체크는 화면 계산용이라 시트에 저장되지 않아요(새로고침하면 초기화).</div>

4) 판단이 필요한 곳(needsUser): inFlight(진행중 remains)·oddsLow·noUpload·정산 5개 항목(방식·개별단가·최우수·입금·정산비고)을 시트 열로 승격할지, 아니면 편집 UI 에서 아예 뺄지. 승격하려면 시트 열 추가 + src/overrides.js:21 EDITABLE_FIELDS 확장 + src/sheet.js 매핑 + public/lun8.html:928 의 `noUpload:false, oddsLow:false` 하드코딩 해제까지 한 세트다. 열을 안 늘릴 거면 위 3)의 안내문만 두고 입력칸은 읽기전용으로 내리는 편이 낫다.

---

## i=18 · 업로드·가드닝·납품·정산 탭 편집이 시트에 전혀 안 써지는데 '저장됨'이라고 알린다
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\lun8.html:1796
- 심각도: high

### 재현/근거
openRowEdit 의 save 클로저 중 saveField 를 부르는 것은 모집 탭(1773~1775: schedDate·fixedDate·memo)뿐이다. 업로드 탭(1796~1799: 콘텐츠①/② 링크, 음원·음원구간·해시태그, 플랫폼 비고), 가드닝 탭(1813: 팔로워 보정·inFlight), 납품 탭(1823: 콘텐츠①·조회수·비고), 정산 탭(1837: 정산방식·개별단가·최우수·입금·정산비고)은 전부 JS 객체만 바꾼다. 그런데 1845행이 '<이름> · <탭> 편집 저장됨' 토스트를 띄운다. 2069행의 20초 자동 loadData() 가 D 를 통째로 갈아끼우므로 입력값은 20초 안에 사라진다. 콘텐츠① 링크가 사라지면 업로드 판정·납품·정산 카운트가 전부 어긋난다. 인라인 정산방식/최우수 변경(2008·2009행)도 동일하게 저장 없음.

### 제안
1) public/lun8.html:2493 (가드닝 save) — 최소한 비고는 저장하고 나머지는 저장 안 됨을 명시.
   기존 한 줄을 다음으로 교체:
   const wasG = { memo: x.memo||'' };
   save = ()=>{ const f=val('reFol'); x.fol = f===''?null:(+f); x.inFlight=+val('reInf')||0; d.oddsLow=chk('reOdds'); d.noUpload=chk('reNo'); x.memo=val('rePMemo');
     if(x.memo!==wasG.memo) saveField(d.id, p+'.memo', x.memo); };
   그리고 2486~2490 의 라벨에 "이 값은 시트에 저장되지 않아요 — 스캔/주문에서 다시 계산됩니다" 를 붙이거나(현재 팔로워·진행중 주문 remains), 입력칸 자체를 제거한다. oddsLow/noUpload 도 같은 처리.

2) public/lun8.html:2525 (정산 save) — 지금 상태로는 저장할 열이 없다. 둘 중 하나를 골라야 한다(아래 4번).
   서버 API가 이미 있는 '최우수'만이라도 즉시 연결 가능:
   src/server.js:492 의 POST /api/best 는 body {handle, on} 을 받는다. 따라서
   if(st.best!==wasS.best) fetch('/api/best?campaign=lun8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:(d.tk?d.tk.h:(d.ig?d.ig.h:'')), on:st.best})});
   나머지(pay·override·paid·memo)는 라벨에 '시트에 저장되지 않습니다'를 명시하거나 칸을 제거.

3) public/lun8.html:2531~2534 — 토스트를 결과에 연동.
   save() 가 저장한 필드가 하나도 없으면 "저장됨"을 띄우지 말 것. save 를 async 로 만들어 saveField 의 반환(true/false)을 모아 두고
   document.getElementById('reSave').addEventListener('click', async ()=>{ const oks = await save(); closeModal(); render(); if(oks && oks.length) toast(`<b>${esc(d.nick)}</b> · ${TABN} 편집 저장됨.`); else toast('화면에만 반영됐어요 — 이 탭 값은 시트에 저장되지 않습니다.'); });
   (saveField 는 이미 1030/1034 행에서 자체 성공·실패 토스트를 띄우므로 중복 토스트를 줄이는 것도 같이 검토.)

4) 인라인 조작도 동일하게: public/lun8.html:2770(입금 토글) · 2833(정산방식 select) · 2834~2836(우수선정 select) 는 저장 경로가 생기기 전까지 "화면에만 반영" 문구로 바꾸거나 비활성화한다. 특히 2833 의 `정산방식 → …` 토스트는 저장으로 오해된다.

5) 근본 해결(사람 결정 필요): 정산방식·개별단가·입금·정산비고를 마스터시트 열로 만들고 src/overrides.js:21 EDITABLE_FIELDS 에 payMethod·unitOverride·paid·settleMemo 를 추가한 뒤, appsscript 브릿지의 FIELD_HEADERS 에 같은 키를 매핑한다. 그래야 saveField(d.id,'paid',…) 가 server.js:383 을 통과한다.

---

## i=22 · 대시보드의 inFlight(진행중 주문)가 항상 0 — '채워지는 중'이 절대 안 뜨고 가드닝 대상·충전합계가 부풀려짐
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\lun8.html:710
- 심각도: high

### 재현/근거
appsscript/Code.gs의 readPlat_()(116~131행)이 반환하는 tk/ig 한 벌에는 followers·contentA·soundOk 등만 있고 current·inFlight 키가 없다. LUN8 마스터는 '틱톡 팔로워/인스타 팔로워' 헤더가 있어 PLAT_COL이 잡히므로 응답에 a.tk/a.ig가 항상 붙고, fromApi()의 split이 true가 된다(720행). 그러면 platBlock(a.tk)의 inFlight = numOrNull(undefined) || 0 = 0 이 되어, 서버가 decorate()에서 inFlightFor(orders, handle)로 계산해 최상위에 붙여준 inFlight/current/status/order(server.js 94~99행)는 프론트가 통째로 버린다. 재현: @X 계정에 remains 700짜리 주문이 살아 있는 상태에서 대시보드 가드닝 탭을 연다 → gStat()의 inF가 0이라 'filling'이 아니라 'target'으로 분류되고 충전량 700이 다시 계산돼 '가드닝 대상 N건 · 충전 합계'와 좌측 네비 뱃지(c-garden)에 중복 계상된다. 같은 이유로 buildAccounts()가 detected.json에서 채워준 soundOk/hashtagOk/contentLink 자동판정값(server.js 123~134행)도 화면에 안 나온다 — 스캔은 업로드를 감지했는데 시트 되쓰기가 실패한 계정이 대시보드에서는 영영 '미업로드·미확인'으로 남는다.

### 제안
public/lun8.html 한 파일만 고치면 된다(Apps Script 재배포 불필요).

1) platBlock 에 '최상위 폴백' 인자를 받는다 — 880~896행을 아래로 교체:

function platBlock(src, fb){
  if(!src) return null;
  const F = fb || {};
  // 빈 문자열/널을 건너뛰고 첫 실값을 고른다(폴백은 '이 한 벌에 값이 없을 때'만).
  const pick = (...vs)=>{ for(const v of vs){ const s = String(v==null?'':v).trim(); if(s) return s; } return ''; };
  const raw = String(src.handle==null?'':src.handle).trim();
  const h = raw ? (raw.charAt(0)==='@' ? raw : '@'+raw) : String(src.link==null?'':src.link).trim();
  // 서버가 계산한 current(스캔값 우선)가 시트 원본 followers 보다 최신이다.
  const fol = numOrNull(src.current) ?? numOrNull(F.current)
           ?? numOrNull(src.followers) ?? numOrNull(src.sheetFollowers);
  return {
    h: h,
    c1: contentObj(pick(src.contentA, src.contentLink, F.contentLink), '콘텐츠①'),
    c2: contentObj(pick(src.contentB, F.contentB), '콘텐츠②'),
    snd: revFlag(pick(src.soundOk, F.soundOk)),
    sec: revFlag(pick(src.soundSection, F.soundSection)),
    hash: revFlag(pick(src.hashtagOk, F.hashtagOk)),
    fol: fol,
    // 서버 decorate()가 inFlightFor(orders, a.handle)로 계산한 값. 프론트는 이걸 버리면 안 된다.
    inFlight: (numOrNull(src.inFlight) ?? numOrNull(F.inFlight)) || 0,
    views: String(pick(src.views, F.views)),
    memo: String(src.memo==null?'':src.memo)
  };
}

2) fromApi 903행 — 틱톡 한 벌에만 최상위를 폴백으로 넘긴다(인스타에는 넘기지 말 것: inFlight 는 틱톡 핸들 기준 주문이고 최상위 soundOk/contentA 도 Code.gs FIELD_HEADERS 상 '틱톡○○' 열에 붙는다. Code.gs:34,38,40 별칭 참조):

  const tk = split ? platBlock(a.tk, a) : platBlock(a);
  const ig = split ? platBlock(a.ig) : null;      // ← ig 는 폴백 없음(그대로)

회귀 위험: 비-split 응답(브릿지 재배포 전)에서는 fb 미전달이라 동작 동일. 인스타 전용 행은 a.tk 가 null 이라 tk=null 로 종전과 동일.

(대안: server.js decorate()에서 계산 직후 a.tk 에도 주입 — return { ...a, inFlight, ..., tk: a.tk ? { ...a.tk, current: a.current, inFlight, contentLink: a.contentLink, soundOk: a.soundOk, hashtagOk: a.hashtagOk } : null }. 어느 쪽이든 '서버 계산값이 프론트에서 조용히 버려지는' 이중 경로를 없애는 게 핵심이며, 둘 다 하면 안 된다.)

---

## i=23 · isLate()가 확정일을 무시하고 희망일로 지연을 판정 — 날짜를 뒤로 합의한 사람이 '일정 미준수'로 잡히고 완충 KPI가 잘못 소진됨
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\lun8.html:936
- 심각도: medium

### 재현/근거
같은 파일 910~912행이 '기준은 항상 확정일 우선'이라 선언하고 effDay = fixed || sched 를 만들어 dayBucket()·주차 칩·일정 스트립은 전부 effDay를 쓴다. 그런데 isLate()만 dayIdx(d.sched)로 희망일을 본다. 재현: 크리에이터 희망일 7/24, 협의 확정일 7/30인 사람. 오늘 7/28. 일정 스트립에는 7/30 칸에 정상 배치되는데, 업로드 탭에서는 같은 사람이 '7/24 지남' 빨간 칩 + '일정 미준수' KPI에 계상된다. 나아가 bufferKpi()(1230행)가 이 late를 그대로 세므로 '미업로드 완충 10건'이 허위로 깎이고, 완충이 0을 넘으면 '마루에 대체 요청'이라는 실제 발주 결정을 잘못된 숫자 위에서 내리게 된다. 예정일 열의 정렬키(schedKey(r.sched))와 통합탭 셀(1201~1202행)도 같은 불일치를 갖는다.

### 제안
C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\lun8.html

① 1196행 `const effDay = d => (d.fixed || d.sched || '');` 바로 아래에 지연 전용 기준일 헬퍼를 추가한다(normDay 1193·isFixedState 1127 모두 위에 정의돼 있어 안전):
```js
/* 지연 판정 기준일 — 확정일이 '날짜'일 때만 그게 기준이다.
   확정일 칸에는 진행상태(확정메일 발송·최종 드랍)도 들어가는데(FIXED_STATES),
   그건 날짜가 아니다. 그때까지 기준을 잃으면 '답 대기' 인원이 지연 목록에서 통째로
   사라져 아무도 안 쫓게 된다 → 상태값이면 원래 예정일로 판정한다. */
const dueDay = d => { const f = String(d.fixed||'').trim(); return (f && !isFixedState(f) && normDay(f)) ? f : (d.sched||''); };
```

② 1220행: `const i = dayIdx(d.sched), t = dayIdx(TODAY());` → `const i = dayIdx(dueDay(d)), t = dayIdx(TODAY());`

③ 1130행(daysLate): `const i = dayIdx(effDay(d)), t = dayIdx(TODAY());` → `const i = dayIdx(dueDay(d)), t = dayIdx(TODAY());`  (isLate 와 같은 기준을 써야 '지연 목록에 있는데 경과가 오늘'이 안 생긴다. 확정일이 상태값인 행도 실제 경과 일수가 다시 나온다.)

④ 1771행(플랫폼 하위탭 '예정일' 열) — 표시·정렬을 기준일로 통일한다. 이 표에는 확정일 열이 없어 원본 희망일만 보여주면 "7/24 지남"이라는 거짓말이 그대로 남는다:
```js
{ key:'sched', label:'예정일', hideable:true, empty:r=>!dueDay(r), sv:r=>schedKey(dueDay(r)),
  cell:r=> dueDay(r) ? (isLate(r,p)?`<span class="chip needs">${esc(dueDay(r))} 지남</span>`:`<b>${esc(dueDay(r))}</b>`) : `<span class="cmuted">미정</span>` },
```

⑤ 1576~1578행(통합탭)과 1739·1742행(지연 목록)은 '예정일'과 '확정일' 두 열을 나란히 두므로 원본 값 표시를 유지한다. 단 정렬키만 기준일로 맞춘다: 1576행 `sv:r=>schedKey(r.sched)` → `sv:r=>schedKey(dueDay(r))`, 1739행 `sv:r=>schedKey(r.d.sched)` → `sv:r=>schedKey(dueDay(r.d))` (1732행 정렬은 이미 effDay 기준이라 dueDay 로 바꿔 동일 기준으로 맞춰도 좋다).

⑥ (확인용, 코드 변경 아님) 2149행 주석 "예정일(확정일이 있으면 그것)이 지났는데" 는 이 수정 후에야 사실이 된다.

검증: 희망일 7/24 · 확정일 7/30 · 오늘 7/28 인 행 → 지연 아님(칩 없음, 일정 미준수 KPI·연락해야 함 목록·하위탭 배지에서 빠짐). 확정일 7/26 인 같은 행 → 지연 2일. 확정일 '확정메일 발송' 인 행 → 종전대로 7/24 기준 지연 유지.

---

## i=28 · 납품 탭이 기본 상태(통합)에서 통째로 비어 보이고 '인스타'로 오표기된다
- 파일: public/lun8.html:1390
- 심각도: high

### 재현/근거
페이지를 새로 열면 state.plat 은 'all' 이다(boot 는 hasIG() 가 false 일 때만 'tk' 로 내린다). 이 상태에서 사이드바 '납품' 을 누르면 viewDeliver 가 const p = state.plat 로 'all' 을 그대로 쓴다 → rows = D.filter(d=> d.plats.includes('all') ...) 는 항상 빈 배열, pName('all') 은 삼항식 특성상 '인스타'로 떨어진다. 실제로 업로드·검수완료된 건이 있어도 화면은 '인스타 총 조회수 0 · 납품 대상 0건 · 조건에 맞는 계정이 없어요'와 '지금은 인스타 납품 탭'이라는 안내를 띄운다(재현 확인: 업로드 2건이 있는 데이터로도 0건). 팀원이 '납품할 게 없다'고 오판한다. viewUpload·viewGarden 은 'all' 분기가 있는데 viewDeliver 에만 없다.

### 제안
public/lun8.html:1954-1955 — viewDeliver 첫 줄에서 비-플랫폼 값(all/late/hist)을 실제 플랫폼으로 떨어뜨린다. state 를 먼저 바꿔야 같은 함수 끝의 platSubtabs()(`:1980`)가 올바른 칩을 active 로 그린다.

기존:
```js
function viewDeliver(){
  const p = state.plat;
```
수정:
```js
function viewDeliver(){
  // 납품시트는 구글시트에서 플랫폼별로 분리돼 있어 '통합' 상태로는 표가 성립하지 않는다.
  // 'all'(기본값)·'late'·'hist' 로 들어오면 첫 플랫폼으로 떨어뜨리고 서브탭 하이라이트도 같이 맞춘다.
  // 이 줄이 없으면 d.plats.includes('all') 이 항상 false 라 표가 통째로 비고, pName('all') 이 '인스타'로 새어 문구까지 틀린다.
  if(state.plat!=='tk' && state.plat!=='ig') state.plat = platsOn()[0];
  const p = state.plat;
```
(platsOn()[0] 은 `:1062` 로 cfg().plats 의 첫 값 — lun8 은 'tk'. 이 함수 안에서 render() 를 다시 부르지 않으므로 재귀 렌더 위험 없음.)

더 제대로 하려면(선택): viewUploadAll(`:1548`)·viewGardenAll(`:1851`)처럼 사람×플랫폼 pair 를 펴는 viewDeliverAll() 을 만들고 `if(state.plat==='all') return viewDeliverAll();` 로 분기한다. 다만 납품시트 기입 버튼(`:1981`)과 하단 안내 문구가 '플랫폼 하나'를 전제로 쓰여 있어, 통합 뷰를 만들 경우 그 버튼을 플랫폼별 2개로 나누거나 비활성화해야 한다.

같은 함수에서 눈에 띈 별건(이번 수정 범위 밖, 별도 판단 필요): `:1956` 의 D.filter 에는 다른 뷰들과 달리 `inCampaign` 필터가 없어 캠페인을 바꿔도 납품 표가 걸러지지 않는다.

---

## i=30 · 업로드·가드닝·납품·정산 편집 모달의 '저장'이 시트로 가지 않는데 '저장됨'이라고 알린다
- 파일: public/lun8.html:1796
- 심각도: high

### 재현/근거
openRowEdit 의 save() 는 recruit 분기(1769~1776행)만 saveField 를 호출한다. upload(1796)·garden(1813)·deliver(1823)·settle(1837) 분기는 D 객체만 변형하고 서버로 아무것도 안 보낸다. 재현 확인: 업로드 편집에서 콘텐츠① 링크를 넣고 저장 → /api/cell 호출 0건, 토스트는 '가나다 · 업로드 편집 저장됨' → 20초 폴링(loadData)이 D = rows.map(fromApi) 로 통째로 갈아끼우자 링크가 사라짐. 사용자는 저장했다고 믿고 넘어가는데 시트에는 아무 기록이 없다. 조회수·팔로워 보정·개별단가도 전부 같다.

### 제안
public/lun8.html — upload/deliver는 손대지 말 것(이미 정상). garden·settle 두 분기만 고친다.

1) garden 분기 (2493행 한 줄을 교체). 2481~2492의 body 는 그대로 두고, body 직후에 was 스냅샷을 뜨고 save 를 아래로 바꾼다:

```js
    const wasG = { fol: x.fol, memo: x.memo||'' };
    save = ()=>{
      const f=val('reFol'); x.fol = f===''?null:(+f);
      x.inFlight=+val('reInf')||0; d.oddsLow=chk('reOdds'); d.noUpload=chk('reNo'); x.memo=val('rePMemo');
      // 비고는 업로드·납품과 같은 열 — 플랫폼 접두어 필수.
      if(x.memo!==wasG.memo) saveField(d.id, p+'.memo', x.memo);
      // 팔로워 수동 보정은 전용 엔드포인트(src/server.js:355). 스캔값에 되돌려지지 않게 scan-latest 도 같이 갱신해 준다.
      if(x.fol!==wasG.fol && x.fol!=null) saveManualFollowers(d.id, x.fol);
    };
```

그리고 saveField(1023행) 바로 아래에 같은 형태의 헬퍼를 추가:

```js
async function saveManualFollowers(row, followers){
  try{
    const r = await fetch('/api/manual?campaign=lun8', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ row, followers }) });
    const j = await r.json(); if(j.error) throw new Error(j.error);
    toast('저장됨 — <b>팔로워 보정</b>'); return true;
  }catch(e){ toast('저장 실패: ' + esc(e.message)); loadData(); return false; }
}
```

2) 아직 시트 열이 없는 칸은 성공 토스트가 거짓말하지 않게 입력 자체를 막는다. garden body(2487·2489·2490행)의 세 입력에 disabled 를 걸고 안내를 붙인다:
   - `<input class="inp" id="reInf" ... disabled>` → 옆에 `<div class="cmuted" style="font-size:12px">진행중 주문은 주문 기록에서 자동 계산돼요 — 여기선 못 고쳐요.</div>`
   - reOdds·reNo 체크박스 두 개도 `disabled` + `<div class="cmuted" style="font-size:12px">보류 표시는 아직 시트에 못 써요.</div>`
   (save() 안의 x.inFlight/d.oddsLow/d.noUpload 대입도 함께 제거 — disabled면 val()이 빈값이라 0/false로 덮어써 화면 값이 망가진다.)

3) settle 분기 (2513~2525). 되쓰기 열이 하나도 없고 fromApi(931~933)가 매 폴링마다 하드코딩 기본값으로 리셋하므로, 지금 상태로는 저장 버튼이 무조건 거짓말이다. 즉시 적용 가능한 최소 조치:
   - body 최상단에 경고 배너 삽입: `<div class="cmuted" style="border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12.5px;margin-bottom:10px">정산 항목은 아직 시트에 못 써요 — 여기서 고쳐도 20초 뒤 시트 값으로 되돌아갑니다. 시트에서 직접 고쳐 주세요.</div>`
   - 모든 입력(rePay·reOvr·reBest·rePaid·reSetMemo)에 `disabled` 추가.
   - 2528~2530의 openModal 푸터를 정산일 때만 저장 버튼 없이 렌더: `const _foot = (state.view==='settle') ? '<button class="btn ghost" onclick="closeModal()">닫기</button>' : '<button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" id="reSave">저장</button>';` 로 바꾸고, 2531의 `document.getElementById('reSave').addEventListener(...)` 를 `const _sv=document.getElementById('reSave'); if(_sv) _sv.addEventListener(...)` 로 감싼다(정산에선 버튼이 없으므로 null 참조 방지).

4) 저장 토스트가 분기와 무관하게 뜨는 구조 자체를 바꾼다(2531~2534). save() 가 실제로 밀어 올린 개수를 반환하게 하고(각 분기 save 마지막에 `return n`), 0이면 '바뀐 게 없어요' 로 문구를 바꾼다. 최소한 '저장됨' 문구가 아무것도 안 보낸 경우에 뜨지 않게 하는 게 목적이다.

[사람이 정해야 하는 부분] 정산(정산방식·개별단가·입금완료·최우수·정산비고)과 가드닝 보류 플래그를 시트에 실제로 저장할지, 저장한다면 마스터시트에 어떤 열을 새로 만들지는 돈·정책 결정이라 임의로 못 정한다. 특히 최우수는 이미 POST /api/best(src/server.js:492, handle 기준)가 있어 연결만 하면 되지만, 정산 금액 계산과 엮이므로 확인이 필요하다. 확정 전까지는 위 3)의 '못 씀' 표시가 안전한 상태다.

---

## i=31 · '인원 추가'가 브라우저 안에서만 일어나 20초 뒤 사라진다 — 토스트는 시트에 늘어난 것처럼 말한다
- 파일: public/lun8.html:1863
- 심각도: high

### 재현/근거
addPersonSave 는 D.push 만 하고 서버 호출이 전혀 없다(임시 id 는 nextId=100000부터). 재현 확인: 모집 탭에서 틱톡 링크로 추가 → 표에 행이 늘고 '시트에 한 줄 늘리는 것과 같아요' 토스트가 뜸 → loadData() 한 번에 행이 사라짐(3행→2행). 실제 운영에서는 20초마다 자동 갱신되므로 팀원이 등록했다고 믿은 크리에이터가 어디에도 남지 않는다. 게다가 이 임시 행의 '확정메일' 버튼을 누르면 saveField(100000,'notice',…)가 나가 시트 100000행 쓰기를 시도한다(범위 밖 → 저장 실패 토스트).

### 제안
A. 즉시(서버·Apps Script 변경 불필요) — 거짓 기능 제거:
1) public/lun8.html:1516 — `<button class="btn small" id="btnAddPerson">${IC.userplus} 인원 추가</button>` 줄을 삭제. 대신 같은 `addBar` 안(1515행 `#btnRecScan` 옆)에 안내 문구를 둔다: `<span class="daynote">새 크리에이터는 <b>⬇ 모집 가져오기</b>를 쓰거나 마스터시트에 직접 한 줄 추가한 뒤 <b>↻ 새로고침</b> 하세요.</span>`
2) public/lun8.html:1521-1532 의 `addFormHTML` 블록을 `const addFormHTML = '';` 로 대체(1536행의 사용부는 그대로 둬도 됨).
3) public/lun8.html:2544-2557 `addPersonSave()` 함수 삭제, 2772-2774 의 `#btnAddPerson` / `#apCancel` / `#apSave` 세 핸들러 줄 삭제. (`state.addForm`(1060·2729·2847)은 남겨도 무해하나 같이 정리 가능. `handleFromLink`(2538-2543)는 다른 데서 안 쓰면 함께 삭제.)

B. 방어선(임시 행이 시트 100000행을 건드리지 못하게) — A를 해도 넣어둘 것:
4) public/lun8.html:1023 `async function saveField(row, field, value){` 바로 다음 줄에 추가:
   `if(!(row > 1) || row >= 100000){ toast('이 행은 아직 시트에 없어요 — 마스터시트에 추가하고 ↻ 새로고침 해주세요.'); return false; }`
5) src/server.js:383 의 검사 `if (!row || !EDITABLE_FIELDS.includes(baseField))` 앞에 행 범위 검사를 추가:
   `if (!Number.isInteger(row) || row < 2 || row >= 100000) return send(res, 400, { error: '행 번호가 시트 범위 밖이에요: ' + body.row });`
   (같은 검사를 /api/manual, src/server.js:359 `if (!row || !Number.isFinite(followers))` 에도 동일하게 적용.)

C. 진짜 '화면에서 인원 추가'가 필요하면(별도 작업): appsscript/Code.gs `doPost`(585행)에 `body.addPerson` 분기 → 데이터 탭 마지막 행 아래 appendRow, 새 행번호 반환 → src/server.js 에 `/api/person` POST 추가(cloud.js LOCAL_ONLY 포함 여부는 별도 판단) → 프런트는 응답 후 `await loadData()`. Apps Script 재배포가 필요하므로 A/B 를 먼저 적용하고 분리 진행할 것.

---

## i=33 · 가드닝 화면이 진행중 주문(inFlight)을 항상 0으로 읽어, 이미 채워지는 중인 계정을 '가드닝 대상'으로 띄운다
- 파일: public/lun8.html:710
- 심각도: medium

### 재현/근거
서버는 inFlight 를 계정 최상위에만 붙인다(src/server.js:96~98 decorate). 프론트 platBlock 은 플랫폼 묶음(a.tk / a.ig)을 받아 src.inFlight 를 읽으므로 항상 undefined → numOrNull(undefined)||0 = 0 이 된다. 결과적으로 gStat 의 filling 분기가 절대 타지 않는다. 재현 확인: 서버가 inFlight:300 을 준 계정이 화면에서는 '가드닝 대상 · 충전량 400'(틱톡)·'300'(인스타)으로 뜨고 요약줄이 '가드닝 대상 2건 · 충전 합계 700명'이 됐다(D[0].tk.inFlight===0). 실제 돈은 서버 buildPlan 이 inFlight>0 을 걸러 막지만, 대시보드 건수·충전 합계·사이드바 '가드닝' 배지가 전부 부풀려져 중복 집행을 시도하게 만든다.

### 제안
src\server.js:99-105 `decorate()` 를 아래로 교체(서버 한 곳만 고치면 로컬·Vercel 둘 다 해결된다 — api\index.js 가 같은 handler 를 쓴다):

function decorate(accounts, orders, campaign) {
  return (accounts || []).map((a) => {
    const inFlight = inFlightFor(orders, a.handle);
    const c = classify(a.current, { target: campaign.target, min: campaign.min, inFlight });
    // 플랫폼별 진행중 수량 — 화면(public/lun8.html platBlock)은 a.tk/a.ig 묶음만 읽는다.
    // 여기서 안 붙이면 tk.inFlight 가 항상 undefined→0 이 되어 '채워지는 중'이 다시 '가드닝 대상'으로 뜬다.
    // 핸들은 플랫폼마다 다르므로 반드시 그 플랫폼 핸들로 조회한다(없을 때만 최상위 핸들 폴백).
    const plat = (b) => (b ? { ...b, inFlight: inFlightFor(orders, b.handle || a.handle) } : b);
    return { ...a, inFlight, status: c.status, order: c.order, projected: c.projected,
             tk: plat(a.tk), ig: plat(a.ig) };
  });
}

주의/검증 포인트:
- `plat(null)`→null, `plat(undefined)`→undefined 로 그대로 유지되므로 lun8.html:902 `const split = !!(a.tk || a.ig)` 판정과 베이온(단일 플랫폼, split=false → platBlock(a) 로 최상위 inFlight 사용) 경로는 영향 없다.
- 프론트는 수정 불필요하지만, 방어를 하나 더 원하면 lun8.html:903-904 를 `const tk = split ? platBlock(a.tk, a.inFlight) : platBlock(a);` 식으로 최상위 폴백을 넘기는 방법도 있다. 단 ig 에 tk 의 inFlight 가 새는 것을 막으려면 폴백은 tk 에만 줘야 하므로, 서버 수정만 적용하는 쪽을 권한다.
- 검증: 진행중 주문(remains>0, done/abandoned 아님)이 있는 상태에서 /api/data 응답의 accounts[].tk.inFlight 가 최상위 inFlight 와 같은 값으로 나오는지 확인 → 가드닝 탭에서 해당 행이 '채워지는 중 · 진행중 N' 으로 바뀌고 상단 '가드닝 대상 건수/충전 합계/지금 필요한 금액' 이 그만큼 줄어야 한다.

별건(이 수정에 포함하지 말 것, 따로 판단 필요): `tk.current`/`ig.current` 미주입 + ig-scan-latest.json 미병합 → src\server.js:107-113 buildAccounts. 가드닝 '현재 팔로워' 가 스캔 최신값이 아닌 시트 팔로워 열일 수 있으니 별도 확인 권장.

---

## i=39 · 20초 자동 새로고침이 저장되지 않은 편집을 조용히 되돌린다 — '추가됨' 토스트는 거짓말이다
- 파일: public/lun8.html:1867
- 심각도: high

### 재현/근거
lun8.html 이 실제로 부르는 쓰기 API 는 /api/cell 과 /api/feedback 뿐이다. 그런데 ①새 크리에이터 추가(addPersonSave, 1856-1868)는 D 배열에만 push 하고 서버 호출이 없으면서 '추가됨' 토스트를 띄우고, ②정산 지급 토글(1978), ③최우수 체크(2009, /api/best 엔드포인트가 있는데도 호출 안 함), ④정산방식 선택(2008)도 로컬 상태만 바꾼다. 20초마다 loadData() 가 D 를 응답으로 통째로 갈아끼우므로(795-807) 전부 원상복귀된다. 재현: 모집 탭에서 틱톡 링크를 넣고 [추가] → '추가됨' 확인 → 20초 대기 → 그 사람이 목록에서 사라짐. 시트에는 처음부터 안 들어갔으므로 팀은 등록된 줄 알고 놓친다. 같은 이유로 추가 폼에 입력 중 20초 틱이 걸리면 render() 가 #content 를 통째로 다시 그려 입력값과 포커스가 날아간다(매뉴얼 탭 검색창도 동일).

### 제안
A. 자동 새로고침이 편집 중을 덮지 않게 (public/lun8.html:2915-2918)
- `setInterval` 콜백 맨 앞에 조건 추가: `if(!document.getElementById('modal').hidden) return; if(state.addForm) return; if(saving>0) return; if(document.activeElement && document.activeElement.matches('input,textarea,select')) return;`
  (saving 은 1022줄에 이미 있는 카운터. addForm 가드는 추가 폼 입력 유실 방지.)
- 보강: 1521-1528줄 추가 폼 input 에 `value="${esc(state.apDraft?.tk||'')}"` 식으로 초안을 state 에 보관하거나, 위 addForm 가드만으로도 즉시 해결된다.

B. 최우수를 실제 저장 (public/lun8.html:2834-2837)
- 핸들러를 서버 호출로 바꾼다:
  `if(bt){ const d=D.find(x=>x.id===+bt.dataset.best); if(d){ const on = bt.tagName==='SELECT' ? bt.value==='1' : bt.checked; d.settle.best=on; render(); fetch('/api/best?campaign='+state.campaign,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:(d.tk&&d.tk.h||'').replace('@',''), row:d.id, on})}).then(r=>r.json()).then(j=>{ if(j.error) throw new Error(j.error); toast('최우수 저장됨'); }).catch(e=>{ toast('최우수 저장 실패: '+esc(e.message)); loadData(); }); } return; }`
- 동시에 왕복을 맞춘다: src/server.js:492-497 의 `toggleBest(campaign, body.handle, …)` 를 row 도 받도록 하거나(권장: `body.row ?? body.handle` 를 키로 저장), lun8.html:948-953 applyBest 가 핸들 문자열도 매칭하도록 `const hs=new Set(best.filter(b=>typeof b==='string')); D.forEach(d=>{ if(hs.has((d.tk&&d.tk.h||'').replace('@',''))) d.settle.best=true; })` 를 추가한다. 둘 중 하나를 반드시 해야 저장한 최우수가 새로고침 뒤에도 남는다.

C. 입금 토글을 실제 저장 (public/lun8.html:2770 + src/overrides.js:22)
- src/overrides.js:22 EDITABLE_FIELDS 배열에 `'paid'` (필요하면 `'paidDate'` 도) 추가. 브릿지 COL 에 이미 있으므로 열 매핑은 그대로 동작한다.
- 2770줄을 `if(pt){ const d=D.find(x=>x.id===+pt.dataset.paidtog); if(d){ d.settle.paid=!d.settle.paid; render(); saveField(d.id,'paid', d.settle.paid?PAID_MARK:''); } return; }` 로 바꾸고, PAID_MARK 문자열(시트 표기)은 아래 needsUser 결정에 따른다. saveField 는 실패 시 이미 loadData()로 되돌린다(1032-1036줄).

D. 저장 경로가 없는 컨트롤은 '저장됨'이라 말하지 않는다
- public/lun8.html:2833 정산방식: 시트 열이 없으므로 select 를 `disabled` 로 두거나, 토스트를 `정산방식은 아직 시트에 저장되지 않아요 — 마스터시트에서 직접 고쳐주세요` 로 바꾼다.
- public/lun8.html:2544-2557 인원 추가: 시트 append 경로가 생기기 전까지 [추가] 버튼(#apSave / #btnAddPerson)을 비활성화하고, 2556줄 토스트를 `아직 시트에 안 들어갔어요 — '모집 가져오기'(syncRecruit)나 마스터시트에서 추가해 주세요` 로 교체한다. D.push 는 제거(20초 뒤 사라지는 유령 행을 만들 뿐).
- public/lun8.html:2525·2533 정산 탭 모달: save() 가 서버에 안 쓰므로 `편집 저장됨` 토스트를 쓰면 안 된다. paid/best 는 위 B·C 경로로 saveField/api-best 를 부르게 하고, pay·override(개별단가)·정산비고는 저장 열이 정해질 때까지 입력을 disabled 로 두거나 '화면에서만 미리보기' 라고 명시한다.

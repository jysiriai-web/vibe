# F_scan 결함 4건

## i=12 · 업로드 스캔의 시트 쓰기 실패가 반환값에서 누락 — '시트 0칸 반영 ✅'로 표시
- 파일: src/content-core.js:256
- 심각도: high

### 재현/근거
runContentScan 은 pushCellsToSheet 실패를 writeError 에 담지만(250-253), return 객체(256-265)에 writeError 가 없다. pushCellsToSheet 는 '헤더에서 열을 못 찾음(skipped)'·'리다이렉트로 확인 불가'·'updated=0' 을 전부 throw 로 알리도록 공들여 만들어 놨는데(sheet.js:78-90) 그 신호가 여기서 통째로 버려진다. 재현: 마스터 헤더 이름이 하나라도 바뀌어 views/likes 등이 skipped 로 오면 sheet.js 가 throw → written=0 → worker.html:261 이 '업로드 스캔 완료 — 업로드 N개 · 시트 0칸 반영' 을 초록(ok)으로 띄운다. CLI(scripts/scan-content.js:25)도 '시트 0칸 기록'만 찍는다. 2026-07-21 헤더 오매칭 사고(21개 중 16개)가 똑같이 재발해도 화면에는 성공으로 보인다.

### 제안
4곳을 고친다. (인스타 경로 ig-content.js:157 · worker.html:300 과 같은 형태로 맞추는 것)

1) src/content-core.js:263 — runContentScan 의 return 객체에 writeError 추가.
   기존:
     return {
       total: targets.length,
       scanned: targets.length - failedHandles.size,
       up: totalUp,
       newUp,
       written,
   변경: `written,` 바로 다음 줄에 `    writeError,` 를 넣는다. (writeError 는 이미 line 257 에 선언되어 있어 추가 변수 불필요)

2) src/server.js:431 — 완료 콜백이 writeError 를 상태에 실어야 한다.
   기존: `.then((r) => { contentScanState = { running: false, mode: perf ? 'perf' : full ? 'full' : 'upload', done: r.total, total: r.total, up: r.up, written: r.written, failed: r.failed, failedHandles: r.failedHandles, stopped: r.stopped, error: null, ranAt: new Date().toISOString() }; })`
   변경: `written: r.written,` 다음에 `writeError: r.writeError || null,` 를 추가한다.
   (line 409 의 초기화 객체에도 `writeError: null,` 을 넣어 두면 폴링 첫 응답에 키가 빠지는 일이 없다)

3) public/worker.html:334-336 — 완료 분기에서 쓰기 실패를 성공으로 안 보이게.
   기존:
     if (s.stopped) say('⏹ 스캔 중지됨 — 여기까지 ' + (s.written || 0) + '칸 반영 (다시 누르면 남은 계정부터)');
     else if (s.failed) say('업로드 스캔 완료 · ⚠️ ' + s.failed + '개는 못 봤어요 (다시 시도하세요)', 'err');
     else say('업로드 스캔 완료 — 업로드 ' + s.up + '개 · 시트 ' + s.written + '칸 반영', 'ok');
   변경:
     if (s.stopped) say('⏹ 스캔 중지됨 — 여기까지 ' + (s.written || 0) + '칸 반영 (다시 누르면 남은 계정부터)');
     else if (s.writeError) say('⚠️ 업로드 스캔은 끝났지만 시트에 못 썼어요 — ' + s.writeError, 'err');
     else if (s.failed) say('업로드 스캔 완료 · ⚠️ ' + s.failed + '개는 못 봤어요 (다시 시도하세요)', 'err');
     else say('업로드 스캔 완료 — 업로드 ' + s.up + '개 · 시트 ' + s.written + '칸 반영', 'ok');
   (writeError 분기를 failed 보다 앞에 둔다 — 쓰기 실패가 더 조용하고 더 치명적이라 먼저 보여야 한다. stopped 분기 뒤에도 `if (s.writeError) say('⚠️ 시트 쓰기: ' + s.writeError, 'err');` 를 한 줄 더 붙이면 중지+쓰기실패도 놓치지 않는다)

4) scripts/scan-content.js:25 — CLI 도 같은 신호를 낸다.
   기존: `console.log(`\n완료 — 업로드 ${res.up}/${res.total} · 시트 ${res.written}칸 기록.`);`
   변경:
     if (res.writeError) { console.error(`\n⚠️ 시트 쓰기 실패 — ${res.writeError}\n   (업로드 판정 ${res.up}/${res.total} 은 detected.json 에 저장됨)\n`); process.exitCode = 1; }
     else console.log(`\n완료 — 업로드 ${res.up}/${res.total} · 시트 ${res.written}칸 기록.`);

참고(별건, 같이 고치면 좋음): src/content-core.js:54 의 judgeOneLink 도 line 39·41 에서 writeError 를 만들어 놓고 return 객체(`{ uploaded, soundOk, hashtagOk, views, written }`)에서 버린다. 동일하게 `writeError` 를 추가하고 호출부에서 err 로 표시하면 세 경로(전체스캔·단일프로필·수기링크)가 같은 규약이 된다. cells.length>0 && written===0 별도 가드는 불필요 — sheet.js:112-114 가 이미 그 경우 throw 하므로 writeError 로 잡힌다.

---

## i=13 · 틱톡 모집 스캔: 전건 실패·시트 쓰기 실패 모두 삼키고 '완료 N개'
- 파일: src/sync-core.js:45
- 심각도: high

### 재현/근거
① pushFollowersToSheet 실패가 `catch {}` 로 완전히 삼켜지고(45행), 닉네임 되쓰기도 마찬가지(53행). ② scannedCount 는 실제 성공 건수가 아니라 targets.length 라 실패해도 그대로다(72행). ③ fetchProfile 은 봇월에 막히면 throw 하지 않고 {followers:null} 을 돌려주므로(tiktok-videos.js:127-149) 전 계정 차단 시 current 가 전부 null → updates=[] → written 0. 게다가 warmUp 은 사람이 [스캔 시작]을 누르면 인증 통과 여부를 확인하지 않고 신뢰한다(tiktok-videos.js:59). 재현: 인증이 실제로 안 끝난 상태에서 시작 → 48계정 전부 null → /api/scan 은 ok:true·scannedCount:48 만 돌려주고(server.js:514) worker.html:165 가 '모집 스캔 완료 — 48개'를 초록으로 띄운다. 시트 팔로워는 하나도 안 바뀌었고, 화면은 scan-latest.json 의 옛 값을 그대로 보여줘 아무도 눈치채지 못한다.

### 제안
3개 파일 수정.

【1】 C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\sync-core.js

(a) 44-45행 교체:
  let written = 0;
  try { written = await pushFollowersToSheet(campaign.sheet, updates); } catch {}
→
  let written = 0;
  let writeError = '';
  try { written = await pushFollowersToSheet(campaign.sheet, updates); }
  catch (e) { writeError = String((e && e.message) || e).slice(0, 200); console.error('[스캔] 시트 팔로워 되쓰기 실패:', writeError); }

(b) 52-53행 교체:
  let nicksWritten = 0;
  if (nickCells.length) { try { nicksWritten = await pushCellsToSheet(campaign.sheet, nickCells); } catch {} }
→
  let nicksWritten = 0;
  let nickError = '';
  if (nickCells.length) {
    try { nicksWritten = await pushCellsToSheet(campaign.sheet, nickCells); }
    catch (e) { nickError = String((e && e.message) || e).slice(0, 200); console.error('[스캔] 닉네임 되쓰기 실패:', nickError); }
  }

(c) 54행 뒤(병합 블록 앞)에 성공/실패 집계 추가:
  // 실제로 숫자를 받아온 건수. targets.length 는 '시도 수'라 실패해도 줄지 않는다.
  const okCount = scanned.filter((a) => a.current != null).length;
  const failCount = scanned.length - okCount;
  // 대상이 있었는데 한 건도 못 봤다 = 봇월 차단 의심 (content-core 의 failedHandles 와 같은 기준)
  const blocked = targets.length > 0 && okCount === 0;

(d) 66-75행 out 객체에 필드 추가 (scannedCount 는 유지하되 의미를 명시):
  const out = {
    ranAt: new Date().toISOString(),
    target: campaign.target,
    min: campaign.min,
    written,
    writeError,
    nicksWritten,
    nickError,
    scannedCount: targets.length,   // 시도 건수
    okCount,                        // 실제 팔로워를 받아온 건수
    failCount,
    blocked,
    total: accounts.length,
    accounts: mergedAccounts,
  };

【2】 C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\server.js 559행 응답에 새 필드 실어보내기:
  return send(res, 200, { ok: true, scannedAt: scanLatest(campaign).ranAt, scannedCount: sync.scannedCount, nicksWritten: sync.nicksWritten, refill, accounts: ..., orders: markStale(orders) });
→ scannedCount 뒤에 다음을 추가:
  okCount: sync.okCount, failCount: sync.failCount, blocked: sync.blocked, written: sync.written, writeError: sync.writeError, nickError: sync.nickError,

【3】 C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\public\worker.html 235-239행 교체:
  if (!r || r.error) return fail(r, '모집 스캔');
  var msg = '모집 스캔 완료 — ' + (r.scannedCount != null ? r.scannedCount : '?') + '개';
  if (r.nicksWritten) msg += ' · 닉네임 ' + r.nicksWritten + '개 채움';
  if (r.refill && r.refill.requested) msg += ' · ♻️ 리필 ' + r.refill.ok + '/' + r.refill.requested + '건 요청';
  say(msg, 'ok');
→
  if (!r || r.error) return fail(r, '모집 스캔');
  if (r.blocked) {
    say('모집 스캔 실패 — ' + (r.scannedCount || 0) + '개 중 <b>한 건도 못 봤어요(틱톡 차단 의심)</b>. 시트는 그대로예요. VPN/프록시를 바꾸고 다시 눌러주세요.', 'err');
    loadStatus();
    return;
  }
  var msg = '모집 스캔 완료 — ' + (r.okCount != null ? r.okCount : '?') + '/' + (r.scannedCount != null ? r.scannedCount : '?') + '개 확인 · 시트 ' + (r.written || 0) + '칸 기입';
  if (r.failCount) msg += ' · 못 본 계정 ' + r.failCount + '개';
  if (r.nicksWritten) msg += ' · 닉네임 ' + r.nicksWritten + '개 채움';
  if (r.refill && r.refill.requested) msg += ' · ♻️ 리필 ' + r.refill.ok + '/' + r.refill.requested + '건 요청';
  if (r.writeError || r.nickError) {
    say(msg, 'ok');
    say('⚠️ 시트 기입 실패 — ' + esc(String(r.writeError || r.nickError)), 'err');
  } else {
    say(msg, r.failCount ? '' : 'ok');
  }

(worker.html 의 say() 는 kind 로 'ok'/'err' 만 스타일이 있다 — 46-47행. 새 CSS 클래스 추가 없이 위 조합으로 충분.)

---

## i=16 · 콘텐츠 스캔이 인스타 전용 행까지 틱톡으로 긁는다 (plat!=='ig' 필터 누락)
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\content-core.js:120
- 심각도: high

### 재현/근거
sync-core.js:24 와 server.js:597 에는 있는 accounts.filter(a=>a.plat!=='ig') 가 runContentScan 에는 없다. Code.gs readAccounts_ 는 틱톡 링크가 없는 행의 handle 을 인스타 핸들로 채우므로(Code.gs:236), 인스타 전용 46행이 그대로 targets 에 들어간다. processOne 이 tiktok.com/@<인스타핸들> 을 열고 tiktok-videos.js:248 에서 hasUser=false → ok:false → failedHandles 에 적재. 연속 3건이면 content-core.js:172 가 pauseForUser('blocked') 를 호출해 대시보드에 '틱톡이 막았어요, VPN 바꾸고 재개' 라는 거짓 차단 경보가 뜨고 스캔이 멈춘다. 동시에 그 행들이 scan-failures.json 에 실려 업로드 탭에 '스캔 실패'로 하이라이트된다. 게다가 동명의 실제 틱톡 계정이 존재하고 #LUN8 등이 걸려 있으면, contentA/views/likes/comments/shares 를 무접두어로 쓰므로 그 사람의 '틱톡 콘텐츠①·조회수' 열에 남의 영상이 기록된다.

### 제안
1) C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\content-core.js:113 — 한 줄을 아래로 교체(sync-core.js:24 와 동일 규칙):

  const all = await getAccountsFromSheet(campaign.sheet);
  // 틱톡 콘텐츠 스캔은 틱톡 계정만 본다. 인스타 전용(plat==='ig')은 handle 이 인스타 핸들이라
  // tiktok.com/@<인스타핸들> 을 열게 되고 → 실패 누적 → 거짓 '차단' 경보로 스캔이 멈춘다.
  const accounts = all.filter((a) => a.plat !== 'ig');
  const igOnly = all.length - accounts.length;
  if (igOnly) console.log('[콘텐츠 스캔] 인스타 전용 ' + igOnly + '명 제외 (틱톡 계정 없음)');

(이후 accounts 를 쓰는 122행 targets, 200행 upHandles 집계, 248행 재조정 루프가 전부 자동으로 올바르게 바뀐다 — 인스타 전용 행이 틱톡 업로드 수에 섞이거나 tk contentA 백필 대상이 되는 것도 함께 막힌다.)

2) 같은 파일 263-272행 return 객체에 `igOnly,` 를 추가해 화면이 '제외 N명'을 표시할 수 있게 한다.

3) 단건 경로에도 같은 가드 — content-core.js:59 scanOneProfile 시작부와 content-core.js:20 judgeOneLink 시작부에:

  const acc = (await getAccountsFromSheet(campaign.sheet)).find((a) => a.row === row);
  if (acc && acc.plat === 'ig') throw new Error('이 분은 인스타 전용이에요 — 틱톡 스캔 대상이 아닙니다(인스타 업로드 스캔을 쓰세요).');

(getAccountsFromSheet 는 content-core.js:6 에서 이미 import 되어 있다.)

---

## i=24 · 틱톡 업로드 스캔이 인스타 전용 행까지 틱톡 프로필로 긁어 — 연속 실패 3건이면 거짓 '틱톡 차단'으로 스캔이 멈춤
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\content-core.js:120
- 심각도: high

### 재현/근거
Code.gs readAccounts_()는 handle = tkHandle || igHandle 로 채운다(236행) — 인스타 전용 행(plat==='ig')의 handle은 인스타 아이디다. sync-core.js는 22~24행에서 accounts.filter(a => a.plat !== 'ig')로 이걸 걸러내고 server.js의 집행 경로도 597행에서 거른다. 그런데 runContentScan()은 getAccountsFromSheet() 결과를 plat 필터 없이 그대로 targets로 쓴다. 재현: 인스타 46계정은 틱톡 링크가 없으니 절대 '업로드됨'이 안 되어 매 스캔 targets에 전원 포함되고, fetchVideos(ctx, 인스타아이디)가 tiktok.com/@인스타아이디를 연다. 그런 틱톡 계정이 없으면 tiktok-videos.js 248~253행이 hasUser=false → ok:false, error='프로필을 못 열었어요 (차단 의심)'을 돌려주고 failedHandles에 쌓인다. 시트에서 인스타 전용 행이 3연속 나오는 순간 consecFail>=3에 걸려 pauseForUser('blocked')가 호출되고(172행), 워커 콘솔은 '틱톡이 막았어요 — VPN 바꾸고 재개'라고 띄운 채 스캔 전체가 사람을 기다리며 멈춘다. 실제로는 틱톡이 막은 적이 없다. 덤으로 동명 틱톡 계정이 존재하면 남의 계정 영상이 그 행의 판정 근거가 된다.

### 제안
C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\content-core.js:113 — 대상 목록을 sync-core.js:24 와 같은 규칙으로 거른다.

기존(113행):
  const accounts = await getAccountsFromSheet(campaign.sheet);

교체:
  const all = await getAccountsFromSheet(campaign.sheet);
  // 틱톡 스캐너는 틱톡 계정만 본다(sync-core.js:24 와 같은 규칙).
  // 인스타 전용(plat==='ig') 행의 handle 은 인스타 아이디라 tiktok.com/@인스타아이디 를 열게 되고,
  // 그런 프로필이 없으면 ok:false 가 쌓여 연속 3건이면 거짓 '틱톡 차단'으로 스캔이 멈춘다.
  const accounts = all.filter((a) => a && a.plat !== 'ig' && a.handle);
  const igOnly = all.length - accounts.length;
  if (igOnly) console.log('[콘텐츠 스캔] 인스타 전용 ' + igOnly + '명 제외 (틱톡 계정 없음)');

주의/검증 포인트: accounts 는 200행(totalUp 집계)과 248행(재조정 루프)에서도 쓰이는데, 인스타 전용 행은 틱톡 contentA 가 항상 빈칸이라 두 곳 모두 결과가 바뀌지 않는다(회귀 없음). a.plat 이 없는 구버전 브릿지 응답도 undefined !== 'ig' 라 그대로 통과한다.

선택(권장) — 개별 확인 경로도 같은 사고를 막으려면 C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\server.js:481~489 의 /api/scan-one 에서 scanOneProfile 호출 전에 해당 row 의 plat 을 확인해 'ig' 면 '이 행은 인스타 전용이라 틱톡 스캔 대상이 아니에요' 로 400 을 돌려준다(현재는 클라이언트가 준 handle 을 그대로 틱톡에서 연다).

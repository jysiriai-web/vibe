# C_insta 결함 5건

## i=5 · 시트 쓰기 실패해도 uploaded:true 로 저장 → 그 계정은 영원히 재스캔 안 됨
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js:153
- 심각도: critical

### 재현/근거
pushCellsToSheet 가 throw 하면(예: 마스터에 '인스타 콘텐츠①' 헤더가 없어 Code.gs 가 skipped 반환 → sheet.js:79 throw, 또는 POST 리다이렉트 → sheet.js:85 throw, 또는 브릿지 구버전 → sheet.js:89 throw) writeError 에만 담기고, 바로 아래 154행이 detected 를 그대로 ig-detected.json 에 기록한다. 그 안의 항목은 uploaded:true 다. 다음 실행에서 52행 `_targets = accounts.filter(a => !(prev[a.igHandle] && prev[a.igHandle].uploaded))` 가 이 계정들을 전부 건너뛴다. 결과: 인스타 콘텐츠①/해시태그/좋아요 열은 영구히 빈칸인데 스캔은 '업로드 N건'이라고 계속 보고하고, 다시 눌러도 대상이 0건이라 절대 복구되지 않는다. worker.html 은 writeError 를 토스트 한 번만 띄우고 사라진다.

### 제안
■ C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js

(1) 64행 `const cells = [];` 아래에 이번 판에 쓰기를 시도한 핸들 추적용 집합을 추가:
    const wroteHandles = new Set();

(2) 129행 `cells.push({ row: a.row, field: 'ig.contentA', ... });` 바로 앞(= 116행 `if (hits.length) {` 블록 안, detected 대입 직후)에 한 줄 추가:
    wroteHandles.add(a.igHandle);

(3) 144-148행 쓰기 블록을 다음으로 교체 — 쓰기가 실패하면 이번 판에 새로 찍은 항목에 pendingWrite 표식을 남긴다(uploaded 값 자체는 건드리지 않아 화면 표기는 그대로):
    let written = 0, writeError = '';
    if (cells.length) {
      try { written = await pushCellsToSheet(campaign.sheet, cells); }
      catch (e) {
        writeError = e.message;
        // 시트에 못 썼다 = 아직 안 끝난 것. uploaded:true 로 확정하면 54행 필터가 영구히 건너뛴다.
        wroteHandles.forEach((h) => { if (detected[h]) detected[h].pendingWrite = true; });
      }
    }

(4) 54행 필터를 pendingWrite 인 계정은 다시 보도록 교체:
    let _targets = accounts.filter((a) => !(prev[a.igHandle] && prev[a.igHandle].uploaded && !prev[a.igHandle].pendingWrite));
    (다음 실행에서 다시 감지되면 118행이 detected[handle] 을 통째로 새로 대입하므로 pendingWrite 는 자동으로 사라진다.)

(5) (선택, 보고 정확도) 151행 out 객체에 미기입 건수를 실어 화면이 '몇 건이 시트에 안 갔는지' 알게 한다:
    pendingWrite: Object.values(detected).filter((d) => d && d.pendingWrite).length,
  그리고 public\worker.html:300 아래에 한 줄:
    if (r.pendingWrite) say('⚠️ ' + r.pendingWrite + '건은 시트에 안 들어갔어요 — 원인 고친 뒤 업로드 스캔을 다시 누르면 재시도합니다.', 'err');

■ C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-sync.js  (같은 계열, 함께 고쳐야 함)

(6) 12-20행 prevCurrents 를 계정 객체 통째로 돌려주도록 교체:
    function prevAccounts(campaign) {
      const p = join(campaign.dataDir, LATEST);
      if (!existsSync(p)) return {};
      try {
        const m = {};
        (JSON.parse(readFileSync(p, 'utf8')).accounts || []).forEach((a) => { m[a.handle] = a; });
        return m;
      } catch { return {}; }
    }

(7) 35행을 교체:
    const prevA = prevAccounts(campaign);
    const prev = {};
    Object.keys(prevA).forEach((h) => { prev[h] = prevA[h].current; });

(8) 37-39행 증분 필터에 pendingWrite 조건 추가:
    const _targets = full
      ? accounts
      : accounts.filter((a) => prev[a.igHandle] == null || !String((a.ig && a.ig.nick) || '').trim()
          || (prevA[a.igHandle] && prevA[a.igHandle].pendingWrite));

(9) 92행 `const cells = [];` 아래에 추가하고, 94행·101행 push 지점에서 핸들을 담는다:
    const wroteHandles = new Set();
    → 94행: if (r.followers != null) { cells.push({ row: r.row, field: 'ig.followers', value: r.followers }); wroteHandles.add(r.handle); }
    → 101행: if (!String((a.ig && a.ig.nick) || '').trim()) { cells.push({ row: r.row, field: 'ig.nick', value: r.handle }); wroteHandles.add(r.handle); }

(10) 114-119행 merged 매핑에 pendingWrite 를 실어 다음 판이 재시도하게 한다:
    const merged = accounts.map((a) => ({
      row: a.row,
      handle: a.igHandle,
      company: a.company,
      current: got[a.igHandle] != null ? got[a.igHandle] : (a.igHandle in prev ? prev[a.igHandle] : null),
      pendingWrite: !!(writeError && wroteHandles.has(a.igHandle)),
    }));
  (writeError 는 104-108행에서 이미 계산돼 있어 순서상 문제없다.)

---

## i=6 · 해시태그에 이모지·문장부호가 붙으면 캠페인 게시물을 '미업로드'로 판정
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js:19
- 심각도: high

### 재현/근거
실측(node 로 함수 직접 호출): 캡션 '#LUN8✨ #SNEAKERS🔥 #루네이트' → tagsOfCaption 이 'lun8✨','sneakers🔥','루네이트' 를 뱉어 matchPost 결과 {hit:false, matched:['루네이트']}. 태그 3개를 다 넣은 정상 캠페인 게시물이 업로드 0건으로 기록된다. 전각 '＃'(일본어·한국어 IME 기본 입력) 캡션 '＃LUN8 ＃SNEAKERS ＃루네이트' 는 태그가 아예 0개로 잡혀 역시 미업로드. 태그 하나에만 이모지가 붙은 경우는 hit=true 지만 all=false 라 '해시태그 미준수'로 시트에 써져 크리에이터에게 잘못된 수정요청이 나간다.

### 제안
C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js:19 — tagsOfCaption 의 본문 한 줄을 교체한다.

기존 (19행):
  String(caption || '').replace(/#([^\s#@.,!?()[\]{}"'…]+)/g, (_, t) => { out.add(t.toLowerCase()); return ''; });

수정:
  // 전각 ＃(일본어·한국어 IME 기본 입력)를 반각으로 먼저 정규화하고,
  // 태그는 글자·숫자·밑줄만으로 본다 — 인스타 자신도 이모지·기호에서 태그를 끊는다.
  // (이걸 안 하면 '#LUN8✨' 이 'lun8✨' 로 잡혀 정상 게시물이 '미업로드'가 된다)
  String(caption || '').replace(/[＃♯]/g, '#').replace(/#([\p{L}\p{N}_]+)/gu, (_, t) => { out.add(t.toLowerCase()); return ''; });

matchPost(25~32행)의 wanted 정규화는 그대로 둬도 된다 — campaigns.json 의 태그값이 이미 순수 문자/숫자/밑줄이라 같은 문자집합으로 떨어진다.

검증(실행해서 확인함): 위 식으로 '#LUN8✨ #SNEAKERS🔥 #루네이트', '＃LUN8 ＃SNEAKERS ＃루네이트', '#LUN8#SNEAKERS#루네이트', '최고!!#LUN8, #SNEAKERS. #루네이트…' 전부 ['lun8','sneakers','루네이트'] 로 나오고, 밑줄 태그(#Youth_Today)와 @멘션 제외도 기존과 동일하게 동작한다.

---

## i=34 · igHandleOf 가 Code.gs 의 예약경로 가드를 안 거쳐 @reel·@p 계정을 스캔·기입
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-sync.js:24
- 심각도: high

### 재현/근거
igHandleOf 는 브릿지가 이미 정제해 준 a.ig.handle 을 안 쓰고 원본 셀(a.ig.link)을 instagram.js:22 toIgHandle 로 다시 판다. toIgHandle 에는 예약경로 필터가 없다 — 실측: toIgHandle('https://www.instagram.com/reel/C8xYzAbc/') === 'reel', '/p/...' → 'p', '/share/reel/...' → 'share'. Code.gs 의 igHandleFrom_(159행)은 정확히 이 값들을 ''로 걸러낸다(같은 사고를 이미 한 번 맞았다는 뜻). 틱톡 링크가 있는 행(plat='both')의 인스타 칸에 릴스/게시물 링크를 붙여넣으면 readAccounts_ 는 행을 남기고, 스캔은 instagram.com/reel 계정을 긁어 그 행의 '인스타 팔로워'·'인스타 닉네임'에 남의 숫자를 쓰고, ig-content 는 남의 게시물 링크를 '인스타 콘텐츠①'에 쓴다.

### 제안
① src/instagram.js:22-27 — toIgHandle 에 Code.gs igHandleFrom_(Code.gs:163) 과 같은 예약경로 필터를 넣는다(+ Code.gs 에 빠져 있는 share 도 포함):

    const IG_RESERVED = /^(p|reel|reels|stories|story|tv|explore|s|accounts|share|direct|challenge)$/i;
    export function toIgHandle(s) {
      s = String(s || '').trim();
      const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      const h = m ? m[1] : s.replace(/^@/, '').replace(/\/.*$/, '');
      return IG_RESERVED.test(h) ? '' : h;
    }

  (instagram.js:121·189·224 의 호출부는 이미 정제된 핸들을 넣으므로 영향 없음)

② src/ig-sync.js:23-27 — igHandleOf 가 브릿지가 정제해 준 값을 1순위로 쓰게 바꾼다. nick 폴백은 '핸들처럼 생긴 것'(@ 또는 instagram.com 포함)일 때만 허용해 표시이름('Chikara')이 핸들로 통과하는 길을 막는다:

    export function igHandleOf(a) {
      const nickRaw = String((a.ig && a.ig.nick) || a.igNick || '');
      const raw = (a.ig && a.ig.handle) || a.igHandle          // 브릿지가 igHandleFrom_ 로 정제한 값
               || (a.ig && a.ig.link) || a.igLink              // 없으면 원본 링크
               || (/[@]|instagram\.com/i.test(nickRaw) ? nickRaw : '');
      const h = toIgHandle(raw);
      return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
    }

  같은 헬퍼를 ig-content.js:45 도 쓰므로 콘텐츠 오기입도 함께 막힌다.

③ (선택) appsscript/Code.gs:163 의 igHandleFrom_ 정규식에도 share 를 추가해 두 쪽 필터를 일치시킨다.

---

## i=35 · 비공개 계정 하나가 apiDead 를 전역으로 켜고, 자신은 '미업로드'로 기록된다
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js:85
- 심각도: high

### 재현/근거
비공개(비팔로우) 계정은 web_profile_info 가 200 에 is_private=true, edge_owner_to_timeline_media={count:N, edges:[]} 를 준다. 85행 조건(posts 비어있고 postCount>0)이 그대로 걸려 apiDead=true 가 되고, 이 플래그는 판이 끝날 때까지 리셋되지 않는다 → 남은 40여 계정 전부가 계정당 40초짜리 페이지 경로로 내려가 스캔이 30분+로 늘고, 좋아요·댓글·postCount 를 잃는다. 그리고 그 비공개 계정 자신은 페이지 폴백에서도 게시물 0개 → 127행에서 {uploaded:false, postsSeen:0} 으로 기록돼 '안 올린 사람'과 구분이 안 된다. fetchIgProfile 이 isPrivate 를 돌려주는데(instagram.js:175) ig-content 는 이 값을 한 번도 읽지 않는다.

### 제안
파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js

[1] 65행 — 연속 카운터 추가
  기존: `let apiDead = false, stopped = '';`
  변경: `let apiDead = false, stopped = '', emptyStreak = 0;`

[2] 94행 바로 앞(89행 `}` 과 90행 주석 사이)에 비공개 계정 가드 삽입:

        // 비공개(비팔로우) 계정은 200 에 is_private=true + edges:[] 를 준다 — API 가 막힌 게 아니다.
        // 여기서 안 걸러내면 아래 조건에 걸려 apiDead 가 켜지고, 남은 계정 전부가 느린 페이지 경로로 내려간다.
        // 그리고 이 계정 자신도 페이지 폴백에서 게시물 0개 → '미업로드'로 기록돼 안 올린 사람과 구분이 안 된다.
        if (p && p.isPrivate && (!p.posts || !p.posts.length)) {
          const msg = '비공개 계정 — 사람이 확인';
          detected[a.igHandle] = { uploaded: false, scanFailed: true, isPrivate: true, error: msg, checkedAt: new Date().toISOString() };
          if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, failed: true, error: msg });
          await sleep(delayMs); continue;
        }

[3] 94~100행 블록을 '공개 계정인데 edges 가 빈' 경우가 연속 2회일 때만 apiDead 를 켜도록 좁힌다.
  기존:
        if (p && (!p.posts || !p.posts.length) && (p.postCount == null || p.postCount > 0)) {
          if (!apiDead) {
            apiDead = true;
            if (onProgress) onProgress({ note: 'API 가 게시물 목록을 비워 보냅니다 — 프로필을 직접 열어 확인합니다 (느려요)' });
          }
          p = null;
        }
  변경:
        if (p && (!p.posts || !p.posts.length) && (p.postCount == null || p.postCount > 0)) {
          emptyStreak++;
          // 한 계정만 비어 온 건 그 계정 사정일 수 있다. 연속 2회여야 API 가 죽었다고 본다.
          if (!apiDead && emptyStreak >= 2) {
            apiDead = true;
            if (onProgress) onProgress({ note: 'API 가 게시물 목록을 비워 보냅니다 — 프로필을 직접 열어 확인합니다 (느려요)' });
          }
          p = null;   // 이 계정은 어차피 페이지로 다시 본다
        } else if (p) {
          emptyStreak = 0;
        }

주의: [3] 은 p=null 을 유지해야 한다(그 계정 자체는 페이지 폴백으로 한 번 더 확인). apiDead 만 늦게 켜지는 것이 요점이다.

---

## i=36 · 페이지 폴백이 게시물 0개를 봐도 '미업로드'로 조용히 확정
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js:127
- 심각도: high

### 재현/근거
fetchIgPostsViaPage(instagram.js:223)는 프로필이 로그인 월/차단/DOM 변경으로 그리드를 못 그리면 링크 0개를 '정상 반환'한다(각 게시물 실패도 272행에서 삼킨다). 이때 ig-content 는 hits 0 → 127행 {uploaded:false, postsSeen:0} 로 기록하고 진행률은 done/total 로 정상 표기, 최종 토스트는 '업로드 스캔 완료 — 업로드 0건'. API 경로에는 이 조용한 실패를 잡으려 85행 가드를 넣어놨는데 정작 폴백 경로에는 같은 가드가 없다(폴백은 postCount 를 null 로 돌려줘 대조할 값 자체가 없다). 사람은 46명이 아무도 안 올렸다고 읽는다.

### 제안
A. C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\instagram.js — fetchIgPostsViaPage(223행)

A-1. 링크 수집 직후(239행 `}, max);` 다음 줄)에 삽입:
```js
    // 그리드를 못 읽은 것과 '정말 게시물이 없는 것'은 화면상 구분이 안 된다.
    // 여기서 조용히 빈 배열을 돌려주면 호출부가 '미업로드'로 확정해버린다 → 실패로 던진다.
    if (!links.length) { const e = new Error('프로필 페이지에서 게시물 목록을 못 읽음(로그인 월·차단·화면 변경)'); e.code = 'EMPTY'; throw e; }
```

A-2. 게시물 루프의 catch(272행)를 사유 보존으로 바꾸고, 루프 뒤 반환 직전에도 같은 가드를 둔다.
272행 `      } catch { /* 이 게시물만 건너뛴다 — 하나 못 봤다고 계정 전체를 포기하지 않는다 */ }`
→
```js
      } catch (e) { failed.push(l.shortcode); /* 이 게시물만 건너뛴다 */ }
```
241행 `const posts = [];` → `const posts = []; const failed = [];`
276행 `posts.sort(...)` 앞에 삽입:
```js
    if (!posts.length) { const e = new Error(`게시물 ${links.length}개를 못 열었어요(${failed.length}건 실패)`); e.code = 'EMPTY'; throw e; }
```

A-3. 소유자 가드 — 루프 안 info 를 읽은 뒤(250행 `});` 다음)에 삽입:
```js
        // 프로필 페이지에 남의 게시물 링크가 섞일 수 있다(추천·태그된 게시물).
        // og:description 에 @핸들이 적혀 있을 때만 대조한다 — 표기 형식이 일정치 않아
        // 핸들이 안 보이면 버리지 않는다(정상 게시물을 잃는 쪽이 더 나쁘다).
        const owner = (info.desc.match(/\(@([A-Za-z0-9._]+)\)/) || info.desc.match(/-\s*([A-Za-z0-9._]+)\s+on\s/i) || [])[1];
        if (owner && owner.toLowerCase() !== handle.toLowerCase()) { await sleep(700); continue; }
```
(위 continue 는 루프 안이므로 `await sleep(700)` 중복 실행을 피하려면 273행의 sleep 을 그대로 두고 이 줄의 sleep 은 빼도 된다 — 둘 중 하나만.)

B. C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\ig-content.js

B-1. 103-110행 폴백 catch 는 이미 scanFailed 로 기록하므로 A 의 throw 만으로 실패가 잡힌다. 이중 안전으로 110행 `}` 다음(=hits 계산 112행 앞)에 삽입:
```js
        // 폴백이 예외 없이 빈 목록을 돌려준 경우까지 막는다 — '미업로드'로 확정하지 않는다.
        if (via === 'page' && !(p.posts || []).length) {
          detected[a.igHandle] = { uploaded: false, scanFailed: true, error: '게시물 목록을 못 읽음(페이지 폴백)' };
          if (onProgress) onProgress({ done: i + 1, total: targets.length, handle: a.igHandle, failed: true, error: '게시물 목록을 못 읽음' });
          await sleep(delayMs); continue;
        }
```

B-2. 실패를 결과에 노출 — 150행 `const uploadedN = ...` 아래에 추가하고 out 에 싣는다:
```js
  const failures = targets
    .map((a) => [a.igHandle, detected[a.igHandle]])
    .filter(([, d]) => d && d.scanFailed)
    .map(([h, d]) => ({ handle: h, error: d.error || '' }));
```
그리고 out 객체(151-161행)에 `failed: failures.length, failures,` 를 추가한다.

C. C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\server.js:608
`return send(res, 200, { ok: true, ...out, detected: undefined });`
→ 그대로 두되 out 에 failed·failures 가 실리므로 응답에 남는다. 화면 문구는 worker/대시보드에서 `failed > 0` 이면 '완료' 대신 '못 본 계정 N건'으로 표시하도록 붙일 것(인스타 모집 스캔의 실패 표기와 같은 형식).

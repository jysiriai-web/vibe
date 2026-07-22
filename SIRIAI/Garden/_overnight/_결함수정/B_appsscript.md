# B_appsscript 결함 3건

## i=10 · 헤더행 자체를 못 찾으면 '폴백 열에는 쓰지 않는다' 가드가 통째로 무력화된다 — 모든 되쓰기가 베이온 좌표로 나간다
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\appsscript\Code.gs:150
- 심각도: high

### 재현/근거
initCols_ 는 상단 20행 안에서 'link 별칭 + (nick|company) 별칭'이 같이 있는 행만 헤더행으로 인정한다(140~147행). 못 찾으면 149~150행에서 COL=DEFAULT_COL(베이온 좌표)로 되돌리고 _colInfo.fellBack 에 필드명이 아니라 문장 하나만 넣는다: ['(헤더행 자체를 못 찾음 — 전부 폴백)']. 그런데 쓰기 가드(657행)는 `_colInfo.fellBack.indexOf(c.field) >= 0` 로 '필드명'을 찾는다 → 어떤 필드도 이 문장과 일치하지 않으므로 **전부 폴백한 최악의 상황에서 가드가 한 건도 안 걸린다**. 이어 getSheet_(179~192행)는 COL.link(=4)열에 handleFrom_ 이 걸리는 시트를 찾는데, handleFrom_ 은 /@([A-Za-z0-9._]+)/ 라 LUN8 4열의 **이메일 주소('kim@gmail.com' → 'gmail.com')에도 매치**해 LUN8_마스터를 그대로 고른다. 결과: /api/cell·업로드 스캔·수기 판정의 모든 셀 쓰기가 베이온 좌표로 실행된다 — contentA→17열, soundOk→19열, hashtagOk→21열, views/likes/comments/shares→27~30열. src/content-core.js:228 주석이 명시하듯 LUN8에서 그 27~30열 자리는 '인스타 콘텐츠①·②·음원·음원구간'이다 → 인스타 콘텐츠 링크가 조회수 숫자로 덮인다. 게다가 Code.gs 는 updated=n>0 을 돌려주므로 sheet.js 의 skipped/0칸 검사를 전부 통과해 화면엔 '저장됨'이 뜬다. 재현: LUN8_마스터 요약 블록이 커져 헤더행이 21행 아래로 밀리거나, '틱톡 링크' 헤더를 별칭 밖 이름(예 'TikTok URL', '틱톡 계정')으로 바꾼 상태에서 대시보드 검수 셀렉트를 한 번 바꾸면 된다.

### 제안
아래 4개를 appsscript/Code.gs 와 appsscript/lun8/code.gs.js **양쪽 동일하게** 적용(두 파일은 현재 바이트 동일, 줄번호도 같음).

① Code.gs:93 — 헤더행을 찾은 경우에 headerFound 플래그를 세운다.
  기존: `_colInfo = { bound: {}, fellBack: [], headers: headerRow.map(function (h) { return String(h == null ? '' : h).trim(); }) };`
  변경: `_colInfo = { bound: {}, fellBack: [], headers: headerRow.map(function (h) { return String(h == null ? '' : h).trim(); }), headerFound: true };`

② Code.gs:151 — fellBack 배열에 문장을 섞는 방식을 버리고 플래그로 표현한다.
  기존: `_colInfo = { bound: {}, fellBack: ['(헤더행 자체를 못 찾음 — 전부 폴백)'], headers: [] };`
  변경:
```js
  _colInfo = { bound: {}, fellBack: [], headers: [], headerFound: false,
               note: '헤더행 자체를 못 찾음 — COL 은 베이온 기본좌표(추측)' };
  try { console.warn('initCols_: 상단 20행에서 헤더행(link + nick|company)을 못 찾음 — 모든 쓰기를 거부합니다'); } catch (e) {}
```
  (line 90 의 전역 초기값도 `var _colInfo = { bound: {}, fellBack: [], headers: [], headerFound: false };` 로 맞춰 둔다 — initCols_ 이전에 참조돼도 안전측으로 기운다.)

③ Code.gs:596~597 사이 — doPost 의 COL 의존 쓰기 경로 전체를 플래그로 차단. `if (body.state && ...)` 줄 **다음**, `var sh = getSheet_();` **앞**에 삽입:
```js
    // 헤더행을 못 찾았으면 COL 은 베이온 좌표(추측)다. 이 상태의 쓰기는 전부 엉뚱한 열을 덮어쓴다 → 한 칸도 쓰지 않는다.
    // (돈 로그 orders / state / feedback 은 COL 을 안 쓰므로 위 분기에서 이미 통과시킨다)
    if (_colInfo.headerFound === false) {
      return json_({ error: '마스터 헤더행(계정링크 + 닉네임/진행사)을 못 찾아 열 위치를 모릅니다 — 아무것도 쓰지 않았습니다. 시트 상단 20행 안에 헤더행이 있는지, 헤더 이름이 별칭과 맞는지 확인하세요.',
                     headerFound: false, updated: 0,
                     skipped: (body.cells || []).map(function (c) { return (c && c.field) || ('col' + (c && c.col)); }) });
    }
```
  같은 이유로 `if (body.sync)` 분기(591행)도 이 검사 뒤로 내려 syncRecruit_(COL.link·COL.company 로 마스터에 씀)가 폴백 좌표로 돌지 않게 한다. body.deliver(592행)는 자체 헤더 탐색이라 그대로 둬도 된다.
  ※ src/sheet.js:33 의 bridgeCall 이 `data.error` 를 보면 throw 하므로, 이 한 줄만으로 대시보드·워커 양쪽이 조용한 성공 대신 시끄러운 실패를 받는다. 추가 클라이언트 수정 불필요.

④ Code.gs:189 — 이메일을 계정 링크로 오인하지 않게 폴백 탐색 정규식을 좁힌다.
  기존: `if (handleFrom_(col[r][0])) return sheets[i];`
  변경: `if (/(?:tiktok\.com|instagram\.com)\/@?[A-Za-z0-9._]+/i.test(String(col[r][0] || ''))) return sheets[i];`
  (handleFrom_ 자체는 readAccounts_·syncRecruit_ 가 쓰므로 건드리지 않는다 — 여기 탐색 조건만 바꾼다.)

선택(권장): doGet 응답(468·474행)의 colinfo 에 headerFound 가 실리므로, src/sheet.js 의 getAccountsFromSheet(46~49행)에서 `data.colinfo && data.colinfo.headerFound === false` 면 throw 하도록 한 줄 추가하면 읽기 결과도 신뢰하지 않게 된다.

---

## i=17 · '인스타 콘텐츠②(미러/추가)' 헤더가 ig.contentB 로 안 잡혀 인스타 콘텐츠 스캔 배치 전체가 실패로 보고된다
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\appsscript\Code.gs:109
- 심각도: high

### 재현/근거
normH_(Code.gs:78)는 괄호 '문자'만 지우고 괄호 안 글자는 남긴다. lun8_setup.gs:78 이 만든 헤더 '인스타 콘텐츠②(미러/추가)' → '인스타콘텐츠②미러/추가'. resolvePlatCols_ 은 '인스타'+'콘텐츠②' 정확일치를 찾으므로 PLAT_COL.ig.contentB 가 안 생긴다. 결과 ① readPlat_ 이 contentB='' 를 돌려줘 대시보드 인스타 콘텐츠② 칸이 영구히 빈칸. ② 인스타 콘텐츠 스캔에서 해시태그 매칭 게시물이 2건 이상인 계정이 하나라도 있으면 ig-content.js:121 이 field='ig.contentB' 를 담고, Code.gs:650 이 그것만 skipped 로 돌려주는데 sheet.js:78 이 배치 전체를 throw 시킨다. 같은 요청에서 이미 써진 ig.contentA·ig.hashtagOk·ig.likes·ig.comments 는 시트에 남아 있는데 written=0, writeError 로 보고된다(성공한 쓰기를 실패로 오보). 재실행해도 같은 셀이 또 skipped 라 영원히 '실패'.

### 제안
정확일치를 유지한 채 별칭만 추가한다(부분일치로 완화 금지). 시트 헤더는 건드리지 않는다.

1) C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\appsscript\Code.gs:68-72 의 PLAT_SUFFIX 값을 '문자열 또는 별칭 배열' 로 확장 — contentB 만 배열로 바꾼다:
   var PLAT_SUFFIX = {
     nick: '닉네임', link: '링크', followers: '팔로워', gardening: '가드닝',
     contentA: '콘텐츠①', contentB: ['콘텐츠②', '콘텐츠②(미러/추가)'], soundOk: '음원', soundSection: '음원구간',
     hashtagOk: '해시태그', views: '조회수', likes: '좋아요', comments: '댓글', shares: '공유', memo: '비고',
   };

2) 같은 파일 Code.gs:104-116 resolvePlatCols_ 의 108-112행 루프를 별칭 배열 순회로 바꾼다(첫 일치 우선, 정확일치 그대로):
     for (var i = 0; i < PLAT_FIELDS.length; i++) {
       var f = PLAT_FIELDS[i];
       var sfx = PLAT_SUFFIX[f];
       var al = (Object.prototype.toString.call(sfx) === '[object Array]') ? sfx : [sfx];
       for (var a = 0; a < al.length; a++) {
         var idx = norm.indexOf(normH_(PLAT_LABEL[p].pre + al[a]));
         if (idx >= 0) { map[f] = idx + 1; hit++; break; }
       }
     }

3) 클래스프 푸시 미러본에도 동일 변경을 그대로 적용해야 배포에 반영된다: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\appsscript\lun8\code.gs.js 의 같은 두 지점(70행 PLAT_SUFFIX, 104-116행 resolvePlatCols_). 두 파일은 현재 바이트 동일본이다.

4) 배포 후 확인: 브릿지 응답의 _colInfo.plats.ig 열 개수가 1 늘고(기존 대비), 인스타 콘텐츠 스캔에서 ig.contentB 가 skipped 목록에 더 이상 안 뜨는지 본다.

(참고: sheet.js:102-105 가 부분 skipped 에도 배치 전체를 throw 해 이미 써진 셀을 실패로 오보하는 문제는 이 별칭 수정으로 이 케이스는 사라지지만 구조 자체는 남는다 — 별건으로 다룰 것.)

---

## i=19 · 헤더 별칭이 없는 필드는 읽기에서 조용히 베이온 좌표로 폴백한다 — 정산(입금) 표시가 엉뚱한 열
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\appsscript\Code.gs:96
- 심각도: high

### 재현/근거
resolveColsFromHeaders_ 은 별칭을 못 찾으면 DEFAULT_COL(베이온 좌표)로 폴백하고 _colInfo.fellBack 에만 남긴다. doPost 는 fellBack 필드의 '쓰기'만 거부할 뿐(Code.gs:657), readAccounts_ 의 '읽기'에는 그대로 적용된다. LUN8 정산 섹션이 만드는 헤더는 lun8_setup.gs 기준 '정산방식·최우수·개별단가·추천 수·추천 보너스·정산 비고'뿐이라 paid 별칭('정산여부/정산/지급여부/입금여부')·paidDate 별칭('정산일/지급일/입금일')·campaignDone·language 어느 것도 일치하지 않는다 → COL.paid=24, COL.paidDate=25, COL.campaignDone=23, COL.language=11 로 폴백해 LUN8 의 무관한 열을 읽는다. lun8.html:751 paidFlag 는 '비어있지 않으면 지급'이므로, 폴백된 24열에 값이 있는 행(예: 개별단가·추천 보너스 같은 수식 열)은 정산 탭에서 전원 '입금 완료'로 표시되고, 비어 있으면 반대로 실제 입금자도 미입금으로 뜬다. 게다가 브릿지가 응답에 싣는 colmap/colinfo 는 src·public 어디에서도 소비되지 않아(전 저장소 참조 0건) 이 폴백이 화면에 전혀 드러나지 않는다.

### 제안
⚠️ appsscript/Code.gs 와 appsscript/lun8/code.gs.js 는 현재 완전히 동일한 파일이다(diff -q 클린). 아래 ①②를 두 파일에 똑같이 적용할 것.

① 읽기에도 폴백 가드 (핵심·즉시 적용 가능)
Code.gs:102 의 resolveColsFromHeaders_ 닫는 중괄호 바로 뒤에 헬퍼 추가:
```js
// 폴백한 필드 = '어느 열인지 모르는 것'. 쓰기는 이미 거부한다(doPost) — 읽기도 같게 만든다.
// 값을 지어내지 않고 '' 로 둔다. 특히 정산(입금)은 돈이라 오표시가 곧 사고다.
function fellBack_(f) { return !!(_colInfo.fellBack && _colInfo.fellBack.indexOf(f) >= 0); }
function readCol_(row, f) { return (!COL[f] || fellBack_(f)) ? '' : row[COL[f] - 1]; }
```
그리고 readAccounts_ 안의 네 줄을 교체:
- Code.gs:256  `language: String(row[COL.language - 1] || ''),`      → `language: String(readCol_(row, 'language') || ''),`
- Code.gs:265  `campaignDone: String(row[COL.campaignDone - 1] || ''),` → `campaignDone: String(readCol_(row, 'campaignDone') || ''),`
- Code.gs:266  `paid: String(row[COL.paid - 1] || ''),`               → `paid: String(readCol_(row, 'paid') || ''),`
- Code.gs:267  `paidDate: String(row[COL.paidDate - 1] || ''),`       → `paidDate: String(readCol_(row, 'paidDate') || ''),`
(같은 이유로 notice(:257)·memo(:260)·soundOk/soundSection/hashtagOk(:262-264) 도 readCol_ 로 돌리는 게 일관되지만, 이 결함의 최소 수정은 위 네 줄이다. 결과: LUN8 정산 탭이 '전원 입금 완료' 또는 '전원 미입금' 으로 거짓말하는 대신 전원 미입금 = 열이 안 붙었음이 드러난다.)

② 폴백을 화면까지 노출 (지금은 응답에 실려도 전부 버려짐)
- src/sheet.js:47-51 getAccountsFromSheet 가 `return data.accounts || []` 로 colinfo 를 버린다 → `return { accounts: data.accounts || [], colinfo: data.colinfo || null }` 로 바꾸고 호출부(readAll → src/server.js:337 buildAccounts 의 `all.accounts`)를 `all.accounts.accounts` 형태로 맞춘다. 호출부를 안 건드리려면 배열에 프로퍼티만 얹는 방식(`const a = data.accounts || []; a.colinfo = data.colinfo; return a;`)도 가능.
- src/server.js:339-343 /api/data 응답 객체에 `colinfo: all.colinfo || null` 한 줄 추가.
- public/lun8.html: 응답의 colinfo.fellBack 에 'paid'·'paidDate'·'campaignDone'·'language' 중 하나라도 있으면 상단에 경고 배너(예: "시트 헤더에서 입금·지급일 열을 못 찾았어요 — 정산 탭 입금 표시는 비어 있는 상태입니다") 를 띄운다.

③ 사람이 정해야 하는 부분(그래서 needsUser=true)
LUN8_마스터의 입금·지급일 열이 실제로 존재하는지, 존재하면 헤더 문자열이 정확히 무엇인지는 시트를 봐야 안다. 확인 방법: 브릿지 URL 에 `?action=list&token=...` 을 붙여 호출하고 응답의 colinfo.headers / colinfo.fellBack / colinfo.bound.paid 를 눈으로 본다(1분). 확인된 이름을 Code.gs:45-46 FIELD_HEADERS.paid / paidDate 별칭 배열 끝에 추가한다(예: paid 에 '입금', '입금 여부', '정산 여부'). 별칭은 공백·괄호 제거 후 정확일치이므로 '정산방식' 같은 다른 뜻의 열을 별칭에 넣으면 안 된다 — 정산방식(기프트카드 종류)을 paid 로 붙이면 전원 입금 완료로 뜬다.

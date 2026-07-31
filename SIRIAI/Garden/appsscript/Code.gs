/**
 * SIRIAI 캠페인 대시보드 — 확장 브릿지 (4단계 라이프사이클 컬럼까지 읽음)
 * 마스터시트에 붙여 배포하세요. 개인정보(이메일·연락처)는 반환하지 않음.
 *
 * 설치: 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 배포 → 새 배포 → 웹 앱
 *       (실행: 나 / 액세스: 링크 있는 모든 사용자) → 배포 → 웹 앱 URL 복사
 */
/* 브릿지의 유일한 인증. 이것만 있으면 doPost 로 마스터시트 셀 덮어쓰기·인원 추가·납품 기입이
 * 전부 열린다. 그래서 코드에 박아 두지 않는다 — 이 파일은 git 에 올라간다.
 *
 * 넣는 곳: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성 → SHEET_TOKEN
 * (없으면 아래 setBridgeToken('새토큰') 을 편집기에서 한 번 실행해도 된다)
 */
const TOKEN = (function () {
  try { return PropertiesService.getScriptProperties().getProperty('SHEET_TOKEN') || ''; }
  catch (e) { return ''; }
})();
// 편집기에서 한 번 실행해 토큰을 심는다. 실행 후 이 줄의 값은 지우세요(히스토리에 남지 않게).
function setBridgeToken(v) {
  if (!v) throw new Error('토큰을 넣어주세요');
  PropertiesService.getScriptProperties().setProperty('SHEET_TOKEN', String(v).trim());
  return '저장했어요';
}
const MIN_FOLLOWERS = 1000;

// ─── 필드 ↔ 열 매핑 (헤더 기반 자동 인식) ───────────────────────────────────
// 열 번호를 하드코딩하지 않고 마스터 헤더행에서 필드 위치를 찾는다. 열을 추가하거나
// 순서를 바꿔도, 캠페인 레이아웃이 달라도 헤더만 맞으면 그대로 동작.
// 헤더 매칭 실패 시 DEFAULT_COL(베이온 기준)로 폴백 → 기존 캠페인은 무조건 안전.
const DEFAULT_COL = {
  company: 2, nick: 3, link: 4, followers: 5, gardening: 6,
  language: 11, notice: 16, contentA: 17, schedDate: 18,
  soundOk: 19, soundSection: 20, hashtagOk: 21, memo: 22,
  campaignDone: 23, paid: 24, paidDate: 25, contentB: 26,
  views: 27, likes: 28, comments: 29, shares: 30,
  igLink: 0, igNick: 0, fixedDate: 0, creator: 0, mirror: 0, email: 0, refBy: 0, refCount: 0, refBy: 0, refCount: 0,   // 0 = 이 마스터엔 없는 열 → 폴백하지 않고 '없음'으로 둔다(베이온은 틱톡 전용)
};
// 필드 → 헤더 별칭(선호 순서, 정규화 정확일치). 새 캠페인 헤더가 다르면 여기에 별칭만 추가.
// ⚠️ schedDate: 베이온은 '예정일'을 헤더상 '검수 특이사항' 열(18)에 기입 → 그 별칭 포함.
// ⚠️ 별칭은 '공백 제거 후 정확일치'다. 부분일치가 아니다.
//    그래서 멀티플랫폼 마스터(LUN8: '틱톡 팔로워'·'인스타 팔로워')는 '팔로워'로 안 잡히고
//    조용히 DEFAULT_COL(베이온 좌표)로 폴백해 엉뚱한 열을 읽었다(2026-07-21 실측: 21개 중 16개 오매칭).
//    → 플랫폼 접두어가 붙은 이름을 별칭에 넣는다. 계정 모델이 단일 플랫폼이라 '틱톡'을 기준으로 잡는다.
//    순서가 곧 우선순위이므로 베이온의 무접두 이름을 앞에 둔다(기존 캠페인 영향 0).
const FIELD_HEADERS = {
  company: ['진행사', '회사', '소속'],
  nick: ['닉네임', '틱톡닉네임', '크리에이터', '채널명', '이름'],   // '틱톡닉네임'을 '크리에이터'보다 앞에 — 뒤에 두면 사람 이름 열에 잡힌다
  link: ['계정링크', '틱톡링크', '계정', '링크'],
  followers: ['팔로워', '팔로워수', '틱톡팔로워'],
  gardening: ['가드닝대상여부', '가드닝', '가드닝대상', '틱톡가드닝'],
  language: ['언어', '국가'],
  /* 친구추천. 시트에 '추천인'(누가 데려왔나) · '추천 수'(그 사람이 데려와 실제로 올린 수) 열이
     있는데 브릿지가 안 읽어서, 대시보드는 refBy:'' / refCount:0 을 하드코딩하고 있었다.
     그 결과 정산의 '추천 3,000×N' 이 늘 0 이었다 — 화면엔 항목이 있는데 값이 없는 상태다.
     ⚠️ '추천 보너스' 열은 안 읽는다. 그건 시트가 계산한 파생값이고, 금액 계산은 대시보드 몫이다
        (같은 값을 두 곳에서 계산하면 반드시 갈라진다). */
  refBy: ['추천인', '추천출처', '추천'],
  refCount: ['추천수'],
  /* 친구추천. 시트에 '추천인'(누가 데려왔나) · '추천 수'(그 사람이 데려와 실제로 올린 수) 열이
     있는데 브릿지가 안 읽어서, 대시보드는 refBy:'' / refCount:0 을 하드코딩하고 있었다.
     그 결과 정산의 '추천 3,000×N' 이 늘 0 이었다 — 화면엔 항목이 있는데 값이 없는 상태다.
     ⚠️ '추천 보너스' 열은 안 읽는다. 그건 시트가 계산한 파생값이고, 금액 계산은 대시보드 몫이다
        (같은 값을 두 곳에서 계산하면 반드시 갈라진다). */
  refBy: ['추천인', '추천출처', '추천'],
  refCount: ['추천수'],
  notice: ['안내여부', '안내', '공지', '확정메일'],
  contentA: ['콘텐츠', '업로드링크', '콘텐츠1', '콘텐츠①', '영상링크', '틱톡콘텐츠①', '틱톡콘텐츠1'],
  schedDate: ['업로드예정일', '예정일', '검수특이사항'],
  soundOk: ['음원', '틱톡음원'],
  soundSection: ['음원구간', '구간', '틱톡음원구간'],
  hashtagOk: ['해시태그', '해시태그여부', '틱톡해시태그'],
  memo: ['비고', '메모', '틱톡비고'],
  campaignDone: ['캠페인완료', '완료여부'],
  paid: ['정산여부', '정산', '지급여부', '입금여부'],
  paidDate: ['정산일', '지급일', '입금일'],
  contentB: ['콘텐츠2', '콘텐츠②', '추가콘텐츠', '틱톡콘텐츠②', '틱톡콘텐츠2'],
  views: ['조회수', '조회', '틱톡조회수'],
  likes: ['좋아요', '틱톡좋아요'],
  comments: ['댓글', '틱톡댓글'],
  shares: ['공유', '틱톡공유'],
  igLink: ['인스타링크', '인스타그램링크', 'instagram링크'],
  igNick: ['인스타닉네임', '인스타그램닉네임'],
  fixedDate: ['확정일', '업로드확정일'],
  // 사람 이름. nick 은 되쓰기 대상(틱톡 닉네임)이라 표시용 이름을 따로 둔다 — 섞으면 화면에 핸들이 뜬다.
  creator: ['크리에이터'],
  email: ['이메일', '이메일주소', '메일', 'email'],
  mirror: ['미러링여부', '미러링'],   // 예정일=크리에이터 희망, 확정일=합의된 날짜
  // 정산 섹션. 아래 HEADER_ONLY_FIELDS 라서 폴백 좌표가 없다 — 못 찾으면 '없음'.
  pay: ['정산방식'],
  best: ['우수 선정', '최우수'],       // 시트가 '최우수'(옛 체크박스) → '우수 선정'(드롭다운)으로 바뀌는 중이라 둘 다
  override: ['개별단가'],
  settleMemo: ['정산 비고'],
};
// DEFAULT_COL 에 좌표를 두지 않는 필드 — 헤더로만 찾는다.
// 정산 열은 마스터마다 자리가 달라서, 폴백을 주면 돈 관련 값을 엉뚱한 칸에 쓴다.
// 못 찾으면 0(없음)으로 두고 doPost 가 skipped 로 시끄럽게 돌려준다.
var HEADER_ONLY_FIELDS = ['pay', 'best', 'override', 'settleMemo'];
// 플랫폼별로 두 벌 존재하는 항목. 접두어만 갈아끼워 같은 규칙으로 찾는다.
var PLAT_FIELDS = ['nick', 'link', 'followers', 'gardening', 'contentA', 'contentB',
                   'soundOk', 'soundSection', 'hashtagOk', 'views', 'likes', 'comments', 'shares', 'memo'];
// 접두어별 헤더 이름(정규화 전 원문 기준). 예: ig + followers → '인스타 팔로워'
var PLAT_LABEL = {
  tk: { pre: '틱톡', name: '틱톡' },
  ig: { pre: '인스타', name: '인스타' },
};
var PLAT_SUFFIX = {
  nick: '닉네임', link: '링크', followers: '팔로워', gardening: '가드닝',
  contentA: '콘텐츠①', contentB: '콘텐츠②', soundOk: '음원', soundSection: '음원구간',
  hashtagOk: '해시태그', views: '조회수', likes: '좋아요', comments: '댓글', shares: '공유', memo: '비고',
};
var PLAT_COL = {};   // { tk:{field:col}, ig:{field:col} } — 해당 플랫폼 열이 없으면 그 키 자체가 없다
var COL = shallowClone_(DEFAULT_COL); // 런타임에 헤더 기반으로 재해석됨 (initCols_)
var _dataSheet = null;                // 데이터 탭 캐시 (initCols_ 가 채움)

function shallowClone_(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
// 헤더 정규화: 괄호는 안쪽 내용까지 통째로 버리고 → 남은 공백·괄호 제거 + 소문자.
// 괄호 안까지 지우는 이유 — 시트가 헤더에 설명을 덧붙이면('인스타 콘텐츠②(미러/추가)')
// 정확일치 별칭이 안 걸려 그 열이 통째로 없는 것처럼 취급되고, 그 열을 쓰는 배치가 전부 실패로 뒤집혔다.
function normH_(s) {
  return String(s == null ? '' : s).replace(/[（(][^）)]*[）)]/g, '').replace(/[\s()（）]/g, '').toLowerCase();
}
// headerRow(값 배열)에 field 의 별칭이 실제로 존재하는가 (헤더행 판별용)
function headerHasField_(headerRow, field) {
  var norm = headerRow.map(normH_), al = FIELD_HEADERS[field] || [];
  for (var i = 0; i < al.length; i++) if (norm.indexOf(normH_(al[i])) >= 0) return true;
  return false;
}
// headerRow → { field: col }. 별칭 정확일치(선호순), 못 찾으면 DEFAULT_COL 폴백.
// ⚠️ 폴백은 '안전한 기본값'이 아니라 '조용한 오배치'다 — 열 배치가 다른 마스터에서는
//    엉뚱한 열을 읽고 쓴다. 그래서 어떤 필드가 폴백했는지, 실제로 무슨 헤더에 붙었는지를
//    _colInfo 로 남겨 응답에 싣는다. 눈으로 1분이면 검증된다.
// fellBack 에는 '필드명'만 담는다 — 쓰기 가드가 필드명으로 걸러내기 때문에 문장을 섞으면 가드가 헛돈다.
// 사람이 읽을 설명은 note 에 따로 둔다.
var _colInfo = { bound: {}, fellBack: [], missing: [], headers: [], headerFound: false };
function resolveColsFromHeaders_(headerRow) {
  var norm = headerRow.map(normH_), map = {}, fields = [];
  for (var k in DEFAULT_COL) fields.push(k);
  for (var hi = 0; hi < HEADER_ONLY_FIELDS.length; hi++) fields.push(HEADER_ONLY_FIELDS[hi]);
  _colInfo = { bound: {}, fellBack: [], missing: [], headerFound: true,
               headers: headerRow.map(function (h) { return String(h == null ? '' : h).trim(); }) };
  for (var fi = 0; fi < fields.length; fi++) {
    var f = fields[fi];
    var col = 0, al = FIELD_HEADERS[f] || [];
    for (var a = 0; a < al.length && !col; a++) { var idx = norm.indexOf(normH_(al[a])); if (idx >= 0) col = idx + 1; }
    if (!col) {
      col = DEFAULT_COL[f] || 0;
      if (col) _colInfo.fellBack.push(f);
      else if (DEFAULT_COL[f] === undefined) _colInfo.missing.push(f); // 폴백 좌표 자체가 없는 필드 = 헤더로만 찾는 것
    }
    map[f] = col;
    if (col) _colInfo.bound[f] = { col: col, header: _colInfo.headers[col - 1] || '(빈 열)' };
  }
  return map;
}
// 헤더행에서 '틱톡 X' / '인스타 X' 짝을 찾는다. 한 항목도 못 찾으면 그 플랫폼은 없는 것.
function resolvePlatCols_(headerRow) {
  var norm = headerRow.map(normH_), out = {};
  for (var p in PLAT_LABEL) {
    var map = {}, hit = 0;
    for (var i = 0; i < PLAT_FIELDS.length; i++) {
      var f = PLAT_FIELDS[i];
      var idx = norm.indexOf(normH_(PLAT_LABEL[p].pre + PLAT_SUFFIX[f]));
      if (idx >= 0) { map[f] = idx + 1; hit++; }
    }
    if (hit >= 3) out[p] = map;   // 3개 이상 잡혀야 '그 플랫폼이 실재한다'고 본다(오탐 방지)
  }
  return out;
}
// 한 행에서 플랫폼 한 벌 읽기. 열이 없으면 빈 문자열.
function readPlat_(row, p) {
  var m = PLAT_COL[p]; if (!m) return null;
  var g = function (f) { return m[f] ? row[m[f] - 1] : ''; };
  var link = String(g('link') || '');
  var handle = p === 'ig' ? igHandleFrom_(link) : handleFrom_(link);
  if (!handle && !String(g('nick') || '')) return null;   // 이 사람은 이 플랫폼 미참여
  return {
    handle: handle, nick: String(g('nick') || ''), link: link,
    followers: g('followers'), gardening: String(g('gardening') || ''),
    contentA: String(g('contentA') || ''), contentB: String(g('contentB') || ''),
    soundOk: String(g('soundOk') || ''), soundSection: String(g('soundSection') || ''),
    hashtagOk: String(g('hashtagOk') || ''), memo: String(g('memo') || ''),
    views: g('views'), likes: g('likes'), comments: g('comments'), shares: g('shares'),
  };
}

// 데이터 탭 + 헤더행 자동 탐지 → 전역 COL 재설정. doGet/doPost 시작에 1회.
// 헤더행 = 상단 20행 중 link + (nick|company) 별칭이 함께 있는 행 (베이온 1행, LUN8 요약 아래 헤더행 등).
function initCols_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i], last = sh.getLastRow(), lc = sh.getLastColumn();
    if (last < 1 || lc < 1) continue;
    var top = sh.getRange(1, 1, Math.min(last, 20), lc).getValues();
    for (var r = 0; r < top.length; r++) {
      if (headerHasField_(top[r], 'link') && (headerHasField_(top[r], 'nick') || headerHasField_(top[r], 'company'))) {
        _dataSheet = sh; COL = resolveColsFromHeaders_(top[r]); PLAT_COL = resolvePlatCols_(top[r]);
        _colInfo.headerRowNum = r + 1;   // 드롭다운 읽기 등에서 데이터 첫 행을 알아야 한다
        _colInfo.plats = {}; for (var pp in PLAT_COL) _colInfo.plats[pp] = Object.keys(PLAT_COL[pp]).length + '개 열';
        return;
      }
    }
  }
  _dataSheet = null; COL = shallowClone_(DEFAULT_COL); PLAT_COL = {};
  // 헤더행을 못 찾은 상태의 COL 은 '추측'이다. 예전엔 fellBack 에 문장 하나를 넣어뒀는데,
  // 쓰기 가드는 필드명을 찾으므로 최악의 상황에서 한 건도 안 걸렸다 → 플래그로 표시하고 doPost 가 통째로 거부한다.
  _colInfo = { bound: {}, fellBack: [], missing: [], headers: [], headerFound: false,
               note: '헤더행 자체를 못 찾음 — COL 은 베이온 기본좌표(추측)' };
  try { console.warn('initCols_: 상단 20행에서 헤더행(link + nick|company)을 못 찾음 — 모든 쓰기를 거부합니다'); } catch (e) {}
}

// 셀 값이 Date 객체면 M/D 로, 텍스트면 그대로. ("7/8" 이 시트에서 날짜로 파싱돼 Date 로 오는 경우 대비)
function dateStr_(v) {
  if (v instanceof Date) return (v.getMonth() + 1) + '/' + v.getDate();
  return String(v == null ? '' : v).trim();
}

function igHandleFrom_(link) {
  var m = String(link || '').match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  var h = m ? m[1] : '';
  return /^(p|reel|reels|stories|tv|explore|s|accounts)$/i.test(h) ? '' : h;
}
function handleFrom_(link) {
  var m = String(link || '').match(/@([A-Za-z0-9._]+)/);
  return m ? m[1] : '';
}
// 모집시트 셀 → 깨끗한 @핸들. 전각＠·공백 정리 후 추출 (?_r=... 등 뒷부분은 정규식이 자동 제외).
function cleanHandle_(s) {
  s = String(s || '').replace(/＠/g, '@').replace(/\s+/g, '');
  var m = s.match(/@([A-Za-z0-9._]+)/);
  return m ? m[1] : '';
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 데이터 탭 자동 탐지 — D열에 tiktok 링크가 있는 시트
function getSheet_() {
  if (_dataSheet) return _dataSheet; // initCols_ 가 찾은 데이터 탭
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var last = sheets[i].getLastRow();
    if (last < 1) continue;
    var col = sheets[i].getRange(1, COL.link, last, 1).getValues();
    for (var r = 0; r < col.length; r++) {
      // handleFrom_ 은 '@뒤 글자'라 이메일(kim@gmail.com)에도 걸린다 — 계정 링크 도메인까지 확인해야
      // 이메일 열을 링크 열로 착각한 엉뚱한 탭을 데이터 탭으로 고르지 않는다.
      if (/(?:tiktok\.com|instagram\.com)\/@?[A-Za-z0-9._]+/i.test(String(col[r][0] || ''))) return sheets[i];
    }
  }
  return sheets[0];
}

// 의견 탭 — 없으면 만든다. 팀원이 쓸 때마다 탭이 있는지 신경 쓰게 하지 않기 위함.
function feedbackSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('의견');
  if (!sh) {
    sh = ss.insertSheet('의견');
    sh.getRange(1, 1, 1, 5).setValues([['시각', '남긴 사람', '화면 위치', '내용', '상태']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#211A33').setFontColor('#F3EEE2');
    sh.setFrozenRows(1);
    [140, 110, 260, 520, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange(2, 1, sh.getMaxRows() - 1, 5).setVerticalAlignment('top').setWrap(true);
  }
  return sh;
}
function appendFeedback_(who, where, text) {
  var sh = feedbackSheet_();
  var ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM/dd HH:mm');
  sh.appendRow([ts, String(who || '팀원'), String(where || ''), String(text || ''), '']);
}
function readFeedback_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('의견');
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (!String(v[i][2] || '').trim() && !String(v[i][3] || '').trim()) continue;
    out.push({ row: i + 2, at: String(v[i][0] || ''), who: String(v[i][1] || ''),
               where: String(v[i][2] || ''), text: String(v[i][3] || ''), done: !!String(v[i][4] || '').trim() });
  }
  return out;
}

function readAccounts_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 1) return [];
  var v = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var row = v[i];
    var tkHandle = handleFrom_(row[COL.link - 1]);
    var igLink = COL.igLink ? String(row[COL.igLink - 1] || '') : '';
    var igHandle = igLink ? igHandleFrom_(igLink) : '';
    var handle = tkHandle || igHandle;
    if (!handle) continue;                       // 둘 다 없으면 크리에이터 행이 아님(요약·빈 행)
    var plat = tkHandle ? (igHandle ? 'both' : 'tk') : 'ig';
    var c = String(row[COL.contentA - 1] || row[COL.contentB - 1] || '');
    out.push({
      row: i + 1,
      company: String(row[COL.company - 1] || ''),
      nick: String(row[COL.nick - 1] || ''),
      creator: COL.creator ? String(row[COL.creator - 1] || '') : '',
      mirror: COL.mirror ? String(row[COL.mirror - 1] || '') : '',
      email: COL.email ? String(row[COL.email - 1] || '') : '',
      handle: handle,
      link: String(row[COL.link - 1] || ''),
      plat: plat,                                 // tk / ig / both — 프론트가 계정 링크 주소를 고를 때 쓴다
      igHandle: igHandle,
      igNick: COL.igNick ? String(row[COL.igNick - 1] || '') : '',
      igLink: igLink,
      sheetFollowers: row[COL.followers - 1],
      gardening: String(row[COL.gardening - 1] || ''), // 가드닝 대상여부 — 최초 기록 후 불변(읽기 전용)
      language: String(row[COL.language - 1] || ''),
      notice: String(row[COL.notice - 1] || ''),
      schedDate: dateStr_(row[COL.schedDate - 1]),
      fixedDate: COL.fixedDate ? dateStr_(row[COL.fixedDate - 1]) : '',   // 합의된 날짜(있으면 이게 기준) // 업로드 예정일(18열) — 값 있는 계정만 대시보드 '예정일' 탭에 노출
      memo: String(row[COL.memo - 1] || ''), // 계정별 자유 메모(22열) — 각 탭 끝 '비고' 열
      contentLink: c,
      soundOk: String(row[COL.soundOk - 1] || ''),
      soundSection: String(row[COL.soundSection - 1] || ''),
      hashtagOk: String(row[COL.hashtagOk - 1] || ''),
      campaignDone: String(row[COL.campaignDone - 1] || ''),
      paid: String(row[COL.paid - 1] || ''),
      paidDate: String(row[COL.paidDate - 1] || ''),
      // 정산 4칸. 헤더로만 찾으므로(HEADER_ONLY_FIELDS) 열이 없으면 빈 값 — 폴백 좌표는 없다.
      pay: COL.pay ? String(row[COL.pay - 1] || '') : '',
      best: COL.best ? String(row[COL.best - 1] || '') : '',
      priceOverride: COL.override ? row[COL.override - 1] : '',
      settleMemo: COL.settleMemo ? String(row[COL.settleMemo - 1] || '') : '',
      views: row[COL.views - 1],
      likes: row[COL.likes - 1],
      comments: row[COL.comments - 1],
      shares: row[COL.shares - 1],
      // 멀티플랫폼 마스터면 플랫폼별 한 벌씩. 없으면 null → 프론트가 단일 플랫폼으로 그린다.
      tk: readPlat_(row, 'tk'),
      ig: readPlat_(row, 'ig'),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 상태 저장 탭 (호스팅 1단계). 로컬 data/c/<id>/ 의 주문·검수잠금·베스트를 시트로.
//  _orders : 주문(돈) 로그. id 가 유일키, append-only upsert — 행을 절대 지우지 않음.
//            사람이 보는 열 + 마지막 _json 열이 무손실 원본(시트 타입 변환 사고 방지).
//            읽을 때는 _json 만 신뢰(charge 문자열·remains 빈값 그대로 보존).
//  _state  : overrides / best 를 JSON 문자열로 (숨김 탭).
// 쓰기는 LockService 로 직렬화.
// ─────────────────────────────────────────────────────────────────────────────
var ORDERS_SHEET = '_orders';
var STATE_SHEET = '_state';
var ORDER_COLS = ['id', 'handle', 'row', 'service', 'quantity', 'startCount', 'remains', 'charge',
  'status', 'done', 'closed', 'cancelled', 'cancelStuck', 'abandoned', 'placedAt', 'closedAt', '_json'];
var JSON_COL = ORDER_COLS.length; // 마지막 열 = 무손실 원본
// 순수 텍스트로 고정할 열: id(유일키) · charge · placedAt · closedAt · _json
// id 를 텍스트로 두는 이유 — 숫자로 두면 앞자리0/큰수(2^53 초과)에서 String 왕복이 어긋나
// 같은 주문이 새 행으로 append 되거나(중복) 서로 다른 id 가 뭉개져 덮어써질 수 있다.
var TEXT_COLS = [1, 8, 15, 16, 17];

// 텍스트 열 포맷을 현재 그리드 전체에 (재적용 안전·멱등). 행이 늘어난 뒤에도 반드시 다시 부를 것.
function applyTextFormat_(sh) {
  for (var i = 0; i < TEXT_COLS.length; i++) {
    sh.getRange(1, TEXT_COLS[i], sh.getMaxRows(), 1).setNumberFormat('@');
  }
}

// 탭이 없으면 맨 뒤에 생성(데이터 탭 자동탐지 getSheet_ 를 방해하지 않도록 끝에 추가)
function getOrCreateSheet_(name, hidden) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, ss.getNumSheets());
    if (hidden) sh.hideSheet();
  }
  return sh;
}

function ordersSheet_() {
  var sh = getOrCreateSheet_(ORDERS_SHEET, false);
  if (sh.getLastRow() < 1) {
    applyTextFormat_(sh);
    sh.getRange(1, 1, 1, ORDER_COLS.length).setValues([ORDER_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* 주문 한 줄의 유일키. 주문번호가 없는 주문이 있다 —
   수기 집행(다른 패널에서 직접 넣음)과 '패널 확인 필요'(응답을 못 받아 과금 여부 불명).
   예전엔 id 없으면 upsert 가 그냥 건너뛰면서 응답은 성공(upserted:n)이라,
   재주문을 막아야 할 그 기록이 시트에 한 줄도 안 남았다. 로컬 파일에만 있어서
   배포본·팀 화면은 그 계정을 '아직 충전 안 됨'으로 봤다.
   읽기(readOrders_)는 _json 열만 쓰므로 이 키를 바꿔도 복원값은 그대로다. */
function orderKey_(o) {
  if (!o) return '';
  if (o.id != null && String(o.id) !== '') return String(o.id);
  return o.uid ? 'uid:' + String(o.uid) : '';
}

function orderRow_(o) {
  return [
    orderKey_(o), // 유일키는 항상 문자열로 (정밀도·앞자리0 무관하게 매칭 안정)
    o.handle || '',
    o.row == null ? '' : o.row,
    o.service == null ? '' : o.service,
    o.quantity == null ? '' : o.quantity,
    o.startCount == null ? '' : o.startCount,
    o.remains == null ? '' : o.remains, // 불명(null/undefined)은 빈칸 그대로 — 0 으로 만들지 않음
    o.charge == null ? '' : String(o.charge),
    o.status || '',
    !!o.done, !!o.closed, !!o.cancelled, !!o.cancelStuck, !!o.abandoned,
    o.placedAt || '', o.closedAt || '',
    JSON.stringify(o), // 무손실 원본
  ];
}

// id 유일키 upsert. 기존 행은 갱신, 새 id 만 append. 행 삭제 없음.
function upsertOrders_(orders) {
  if (!orders || !orders.length) return { upserted: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ordersSheet_();
    var lastRow = sh.getLastRow();
    var idx = {};
    if (lastRow >= 2) {
      var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) idx[String(ids[i][0])] = i + 2;
    }
    // 새로 추가될 행 수를 먼저 세어 그리드를 확장하고 텍스트 포맷을 다시 입힌다.
    // (기본 1000행을 넘어 auto-expand 되면 새 행은 자동포맷이라 charge/id 가 숫자로 강제변환됨)
    var newCount = 0, seen = {};
    for (var p = 0; p < orders.length; p++) {
      var k = orderKey_(orders[p]);
      if (!k || idx[k] || seen[k]) continue;
      seen[k] = true; newCount++;
    }
    if (newCount > 0) {
      var need = (lastRow + newCount) - sh.getMaxRows();
      if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
      applyTextFormat_(sh);
    }
    var n = 0;
    for (var j = 0; j < orders.length; j++) {
      var o = orders[j];
      var k = orderKey_(o);
      if (!k) continue;   // id·uid 둘 다 없으면 추적이 불가능하다 — 그건 진짜로 건너뛴다
      var row = idx[k];
      if (!row) { lastRow += 1; row = lastRow; idx[k] = row; }
      sh.getRange(row, 1, 1, ORDER_COLS.length).setValues([orderRow_(o)]);
      n++;
    }
    SpreadsheetApp.flush();
    return { upserted: n };
  } finally {
    lock.releaseLock();
  }
}

// _json 만 파싱해서 반환(무손실). 파손되면 조용히 넘기지 않고 에러 — 돈 기록이라 오작동보다 실패가 안전.
function readOrders_() {
  var sh = ordersSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var v = sh.getRange(2, JSON_COL, lastRow - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var raw = String(v[i][0] || '').trim();
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); }
    catch (err) { throw new Error('_orders ' + (i + 2) + '행 _json 파손: ' + err); }
  }
  return out;
}

function stateSheet_() {
  var sh = getOrCreateSheet_(STATE_SHEET, true);
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 2, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, 1, 3, 2).setValues([['key', 'json'], ['overrides', '{}'], ['best', '[]']]);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
  return sh;
}

/* _state 에 저장하는 키 목록. ⚠️ 여기 없는 키는 writeState_ 가 조용히 건너뛰고
   {written:0} 을 200 으로 돌려준다 — 서버는 성공했다고 믿고 값은 사라진다.
   startFol 121건이 이렇게 증발했다. 새 키는 반드시 여기에 먼저 적는다.
     overrides = 사람이 잠근 셀 · best = 최우수 · scans = 마지막 스캔 시각
     startFol  = 계정별 최초 팔로워 · svcPick = 가드닝 서비스 선택 */
var STATE_KEYS = ['overrides', 'best', 'scans', 'startFol', 'svcPick'];

function readState_() {
  var sh = stateSheet_();
  var lastRow = sh.getLastRow();
  var out = { overrides: {}, best: [], scans: {}, startFol: {}, svcPick: null };
  if (lastRow < 2) return out;
  var v = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) {
    var k = String(v[i][0] || '');
    var raw = String(v[i][1] || '').trim();
    if (!k || !raw) continue;
    try {
      if (k === 'overrides') out.overrides = JSON.parse(raw);
      else if (k === 'best') out.best = JSON.parse(raw);
      // 스캔 시각 — 배포본엔 로컬 파일이 없어서(.vercelignore data/) 시트가 유일한 공유 경로다.
      else if (k === 'scans') out.scans = JSON.parse(raw);
      // startFol = 계정별 최초 팔로워. 한 번 적으면 안 덮는다(덮으면 '최초'가 아니게 된다).
      else if (k === 'startFol') out.startFol = JSON.parse(raw);
      // svcPick = 플랫폼별 가드닝 서비스 + 그때의 단가·리필 스냅샷(배포본엔 카탈로그가 없다).
      else if (k === 'svcPick') out.svcPick = JSON.parse(raw);
    } catch (err) { throw new Error('_state ' + k + ' JSON 파손: ' + err); }
  }
  return out;
}

// state = { overrides?, best? } — 준 것만 덮어씀(undefined 는 건드리지 않음)
function writeState_(state) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = stateSheet_();
    var lastRow = sh.getLastRow();
    var idx = {};
    if (lastRow >= 2) {
      var ks = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ks.length; i++) idx[String(ks[i][0])] = i + 2;
    }
    var n = 0;
    // scans = 마지막 스캔 시각. 배포본엔 로컬 파일이 없어 시트가 유일한 공유 경로다.
    var keys = STATE_KEYS;
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (state[k] === undefined) continue;
      var payload = JSON.stringify(state[k]);
      // 구글시트 셀 한 칸 한도 50,000자. 넘으면 setValue 가 예외 → 여기서 명확히 알린다.
      if (payload.length > 45000) {
        throw new Error('_state ' + k + ' JSON 이 너무 큼(' + payload.length + '자, 셀 한도 50000). 분할 저장 필요.');
      }
      var row = idx[k];
      if (!row) { lastRow += 1; row = lastRow; idx[k] = row; sh.getRange(row, 1).setValue(k); }
      sh.getRange(row, 2).setNumberFormat('@').setValue(payload);
      n++;
    }
    SpreadsheetApp.flush();
    return { written: n };
  } finally {
    lock.releaseLock();
  }
}


// 시트에 실제로 걸린 드롭다운(데이터 확인) 목록을 그대로 읽어 준다.
// 화면이 시트와 다른 어휘를 쓰면 사람이 고른 값이 시트에서 튕긴다 —
// 어휘를 코드에 박아두지 말고 여기서 확인해 맞춘다.
function readDropdowns_() {
  var sh = getSheet_();
  var head = _colInfo.headerRowNum || 1;
  var out = {};
  var r = head + 1;
  for (var f in COL) {
    var c = COL[f];
    if (!c) continue;
    try {
      var dv = sh.getRange(r, c).getDataValidation();
      if (!dv) continue;
      var vals = dv.getCriteriaValues();
      var list = (vals && vals[0] && vals[0].length != null) ? vals[0] : null;
      if (!list) continue;
      out[f] = { col: c, header: String(sh.getRange(head, c).getValue() || ''),
                 list: list.map(function (v) { return String(v); }),
                 strict: dv.getAllowInvalid() === false };
    } catch (e) {}
  }
  return out;
}
function doGet(e) {
  try {
    // ⚠️ 토큰이 안 심겼으면 '전부 거부'다. 이 가드가 없으면 (''||'') !== '' 가 false 라
    //    토큰을 아예 안 실은 요청이 그대로 통과한다 — 잠그려던 게 활짝 열린다.
    if (!TOKEN) return json_({ error: 'bridge token not configured' });
    if ((e.parameter.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
    initCols_(); // 헤더 기반으로 열 매핑 해석 (COL 재설정) — colmap 으로 노출해 검증 가능
    var action = e.parameter.action || 'list';
    if (action === 'list') return json_({ accounts: readAccounts_(), colmap: COL, colinfo: _colInfo });
    if (action === 'orders') return json_({ orders: readOrders_() });
    if (action === 'dropdowns') return json_({ dropdowns: readDropdowns_() });
    if (action === 'feedback') return json_({ feedback: readFeedback_() });
    /* 진단용 — 지금 배포된 코드가 어느 판인지, 특정 칸의 데이터 확인 규칙이 무엇인지 그대로 본다.
       배포가 반영됐는지를 밖에서 확인할 방법이 없어 같은 실패를 세 번 반복했다. */
    if (action === 'dvprobe') {
      var out = { ver: 'dv4' };
      try {
        var ss = SpreadsheetApp.openById(e.parameter.sheetId);
        var shs = ss.getSheets();
        out.tabs = [];
        for (var i = 0; i < shs.length; i++) {
          var rr = shs[i].getRange(Number(e.parameter.row || 9), Number(e.parameter.col || 5));
          var info = { name: shs[i].getName(), a1: rr.getA1Notation(), value: String(rr.getValue() || '') };
          try {
            var dv = rr.getDataValidation();
            if (!dv) info.dv = null;
            else {
              info.dv = String(dv.getCriteriaType());
              var args = dv.getCriteriaValues();
              info.argN = args ? args.length : 0;
              info.arg0 = args && args[0] ? (args[0].getValues ? 'RANGE ' + args[0].getA1Notation() : JSON.stringify(args[0])) : null;
            }
          } catch (e2) { info.dvErr = String(e2); }
          out.tabs.push(info);
        }
      } catch (e3) { out.error = String(e3); }
      return json_(out);
    }
    if (action === 'state') return json_(readState_());
    if (action === 'bundle') {
      var s = readState_();
      // scans(마지막 스캔 시각)도 함께 — 배포본엔 로컬 파일이 없어 시트가 유일한 공유 경로다.
      return json_({ accounts: readAccounts_(), orders: readOrders_(), overrides: s.overrides, best: s.best, scans: s.scans || {}, startFol: s.startFol || {}, svcPick: s.svcPick || null, colmap: COL, colinfo: _colInfo });
    }
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

// 모집시트 → 마스터 자동 동기화. 모집시트(sheetId)의 링크열에서 @핸들 추출·정리 →
// 마스터에 없는 것만 해당 진행사(company) 블록의 빈 행에 깨끗한 URL로 채움. (openById = 전체 스프레드시트 접근 스코프 필요)
function syncRecruit_(sheetId, company, linkCol) {
  if (!sheetId || !company || !linkCol) return { error: 'sheetId/company/linkCol 필요' };
  var src;
  try { src = SpreadsheetApp.openById(sheetId); } catch (err) { return { error: '모집시트 열기 실패(접근권한/ID 확인): ' + err }; }
  var ss = src.getSheets()[0];
  var last = ss.getLastRow();
  var rows = last >= 1 ? ss.getRange(1, 1, last, linkCol).getValues() : [];

  var master = getSheet_();
  var mLast = master.getLastRow();
  var need = Math.max(COL.link, COL.company);
  var mv = mLast >= 1 ? master.getRange(1, 1, mLast, need).getValues() : [];
  var existing = {};
  for (var i = 0; i < mv.length; i++) {
    var h0 = handleFrom_(mv[i][COL.link - 1]);
    if (h0) existing[h0.toLowerCase()] = true;
  }
  // 해당 company 블록의 빈 행(핸들 없음) 큐 — 새 계정을 여기부터 채움
  var emptyRows = [];
  for (var i = 0; i < mv.length; i++) {
    if (String(mv[i][COL.company - 1] || '').trim() === company && !handleFrom_(mv[i][COL.link - 1])) emptyRows.push(i + 1);
  }
  var added = [];
  for (var r = 0; r < rows.length; r++) {
    // 링크열 우선, 없으면 바로 앞열(보통 TikTok ID열) 폴백 — 단축링크/전각＠ 대응
    var h = cleanHandle_(rows[r][linkCol - 1]) || cleanHandle_(rows[r][linkCol - 2]);
    if (!h || existing[h.toLowerCase()]) continue;
    existing[h.toLowerCase()] = true;
    var row = emptyRows.shift();
    if (!row) { row = master.getLastRow() + 1; master.getRange(row, COL.company).setValue(company); }
    master.getRange(row, COL.link).setValue('https://www.tiktok.com/@' + h);
    added.push(h);
  }
  return { added: added.length, handles: added };
}

// 검수완료 콘텐츠 → 납품시트(다른 스프레드시트)에 기입. rows = [{nick, link, contentLink, viewNote}].
// 헤더명(채널명·계정링크·업로드 링크·특이사항)으로 열을 자동매칭 → 열 위치가 바뀌어도 안전.
// 계정 핸들 기준 중복 제외. 채널명이 빈 템플릿 행부터 위→아래로 채우고, 모자라면 맨 아래에 append.
/* 드롭다운(데이터 확인)이 걸린 칸에 안전하게 쓴다.
 * 납품시트의 '지원타입' 열에는 '댄스 챌린지' 하나만 허용하는 목록이 걸려 있어서, 우리가 계산한
 * 값('틱톡+인스타')을 넣는 순간 setValue 가 통째로 예외를 던지고 그 행부터 기입이 멈췄다.
 * 값을 우리가 우기지 않고 시트가 정하게 한다:
 *   · 허용 목록에 우리 값이 있으면 그대로 쓴다
 *   · 목록에 하나뿐이면 그 값을 쓴다(시트가 이미 답을 정해 둔 칸이다)
 *   · 둘 이상인데 우리 값이 없으면 안 쓴다 — 아무거나 골라 넣으면 조용한 오기입이 된다
 */
/* ⚠️ 이름을 setCell_ 로 지었다가 통째로 죽었다 — 이 파일 아래쪽에 같은 이름의 함수가
   이미 있었고(시그니처가 다르다), Apps Script 는 나중 선언이 이긴다.
   그래서 아래 검증 로직이 한 번도 안 돌고, 드롭다운 칸에 그대로 써서 예외가 났다. */
function setDeliverCell_(sh, row, col, value) {
  var cell = sh.getRange(row, col);
  var allowed = null;
  try {
    var dv = cell.getDataValidation();
    if (dv) {
      var kind = String(dv.getCriteriaType());
      var args = dv.getCriteriaValues();
      /* 드롭다운은 두 형태다.
         · VALUE_IN_LIST  = 값을 직접 적어 둔 목록
         · VALUE_IN_RANGE = 다른 칸 범위를 가리키는 목록  ← 이걸 안 봐서 규칙을 '없음' 으로 읽고
           우리 값을 그냥 썼다가 setValue 가 통째로 예외를 던졌다(지원타입 열이 이 형태다). */
      if (kind === 'VALUE_IN_LIST' && args && args[0] && args[0].length) {
        allowed = args[0].map(function (v) { return String(v).trim(); });
      } else if (kind === 'VALUE_IN_RANGE' && args && args[0]) {
        var vals = args[0].getValues();
        allowed = [];
        for (var a = 0; a < vals.length; a++) for (var b = 0; b < vals[a].length; b++) {
          var t = String(vals[a][b] || '').trim();
          if (t) allowed.push(t);
        }
        if (!allowed.length) allowed = null;
      }
    }
  } catch (e) { allowed = null; }          // 확인 규칙을 못 읽으면 예전처럼 그냥 쓴다
  /* ⚠️ setValue 는 지연 실행이라 예외가 이 자리에서 안 나고 나중에 터질 수 있다.
     flush() 로 여기서 확정시켜야 try/catch 가 실제로 잡는다 — 안 그러면 칸 하나 때문에
     남은 행이 통째로 안 들어간다(실제로 38행 기입이 2행에서 멈췄다). */
  var put = function (v) {
    try { cell.setValue(v); SpreadsheetApp.flush(); return true; }
    catch (e) { return false; }
  };
  if (!allowed) return put(value);
  var v = String(value).trim();
  if (allowed.indexOf(v) >= 0) return put(value);
  if (allowed.length === 1) return put(allowed[0]);
  return false;                            // 못 고르겠으면 비워 둔다(사람이 채운다)
}

function deliverReviewed_(sheetId, rows, plat) {
  if (!sheetId) return { error: '납품시트 ID 없음(campaigns.json deliverySheetId)' };
  if (!rows || !rows.length) return { added: 0, handles: [] };
  var dst;
  try { dst = SpreadsheetApp.openById(sheetId); } catch (err) { return { error: '납품시트 열기 실패(권한/ID 확인): ' + err }; }
  var norm = function (v) { return String(v || '').replace(/\s+/g, ''); };
  /* 계정 핸들 뽑기. ⚠️ 예전엔 @ 가 있어야만 잡았다 — 틱톡 주소(.../@handle)만 보고 만든 규칙이라
     인스타(instagram.com/handle)는 하나도 안 잡혔고, 인스타 납품이 '대상 27건 · 추가 0행' 으로
     조용히 끝났다(오류도 안 났다). @ 가 없으면 주소의 마지막 경로 조각을 쓴다. */
  var handleOf = function (str) {
    var s = String(str || '').trim();
    var m = s.match(/@([A-Za-z0-9._]+)/);
    if (m) return m[1].toLowerCase();
    /* ⚠️ 마지막 조각을 쓰면 안 된다 — 인스타 계정 링크가 '.../maru_changho/reels/' 처럼
       끝나는 경우가 있어 둘 다 'reels' 로 뭉개졌다(두 계정이 한 사람으로 합쳐져 1건이 누락).
       호스트 다음 첫 조각이 계정이다. reel/p/tv 같은 경로 단어는 건너뛴다. */
    var u = s.split('?')[0].split('#')[0].replace(/^https?:\/\//, '');
    var parts = u.split('/').filter(Boolean);
    if (parts.length && parts[0].indexOf('.') >= 0) parts.shift();   // 호스트 제거
    var SKIP = { reel: 1, reels: 1, p: 1, tv: 1, stories: 1, explore: 1, video: 1 };
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (SKIP[seg.toLowerCase()]) continue;
      if (/^[A-Za-z0-9._]+$/.test(seg)) return seg.toLowerCase();
    }
    return '';
  };
  /* 헤더행(채널명 + 업로드 링크)이 있는 탭을 찾되, 플랫폼이 주어지면 그 플랫폼 탭을 고른다.
     ⚠️ 예전엔 '헤더가 있는 첫 탭' 이라 틱톡·인스타 둘 다 틱톡 탭에 들어갔다.
     탭 이름은 사람이 바꿀 수 있으므로 상단 20행 텍스트에서 tiktok/instagram 을 찾는다
     (제목 셀에 'Lun8_Sneakers_일본_tiktok_...' 처럼 박혀 있다). */
  var want = String(plat || '').toLowerCase();
  var WORDS = { tk: ['tiktok', '틱톡'], ig: ['instagram', '인스타'] };
  var sheets = dst.getSheets(), sh = null, header = null, hRow = -1, fallback = null;
  for (var s = 0; s < sheets.length; s++) {
    var lr = sheets[s].getLastRow(), lc = sheets[s].getLastColumn();
    if (lr < 1) continue;
    var top = sheets[s].getRange(1, 1, Math.min(lr, 20), lc).getValues();
    var hit = null;
    for (var r = 0; r < top.length && !hit; r++) {
      var hv = top[r].map(norm);
      if (hv.indexOf('채널명') >= 0 && hv.indexOf('업로드링크') >= 0) hit = { hv: hv, row: r + 1 };
    }
    if (!hit) continue;
    /* 플랫폼 판정은 '탭 이름 + 헤더 위 머리말' 만 본다.
       ⚠️ 예전엔 상단 20행을 통째로 봤는데 거기엔 데이터 행이 섞인다. 인스타 계정 중에
       'koko.tiktok' 이 있어서 인스타 탭이 '틱톡 얘기도 하는 탭' 으로 판정돼 통째로 거부됐다
       (납품이 '인스타 탭을 못 찾음' 으로 멈췄다). 사람이 쓰는 데이터엔 어떤 단어든 들어갈 수 있다. */
    var head = top.slice(0, Math.max(0, hit.row - 1));
    var flat = head.map(function (row) { return row.join(' '); }).join(' ').toLowerCase()
      + ' ' + String(sheets[s].getName()).toLowerCase();
    if (!fallback) fallback = { sh: sheets[s], hv: hit.hv, row: hit.row };
    if (!want) { sh = sheets[s]; header = hit.hv; hRow = hit.row; break; }
    var mine = (WORDS[want] || []).some(function (w) { return flat.indexOf(w) >= 0; });
    var other = Object.keys(WORDS).filter(function (k) { return k !== want; })
      .some(function (k) { return WORDS[k].some(function (w) { return flat.indexOf(w) >= 0; }); });
    if (mine && !other) { sh = sheets[s]; header = hit.hv; hRow = hit.row; break; }
  }
  /* 플랫폼 탭을 못 찾았으면 '아무 탭' 으로 물러나지 않는다 — 인스타 납품이 틱톡 탭에
     조용히 섞이는 게 정확히 그 사고다. 탭이 하나뿐일 때만 그걸 쓴다. */
  if (!sh && fallback && sheets.length === 1) { sh = fallback.sh; header = fallback.hv; hRow = fallback.row; }
  if (!sh) return { error: want ? ('납품시트에서 ' + want + ' 탭을 못 찾음 — 탭 안에 tiktok/instagram 표기가 필요해요') : '납품시트에서 헤더행(채널명·업로드 링크)을 못 찾음' };
  var col = function (name) { return header.indexOf(name) + 1; }; // 1-based, 없으면 0
  var cName = col('채널명'), cLink = col('계정링크'), cUp = col('업로드링크'), cNo = col('no'), cMemo = col('비고'), cOld = col('특이사항'); // 조회수 노트는 비고에. 특이사항 = 납품 차수.
  // 선정기준 충족여부 3열. 없는 시트면 col()이 0 이라 그냥 안 쓴다.
  var cType = col('지원타입'), cFol = col('팔로워'), cJp = col('일본');
  if (!cName || !cLink || !cUp) return { error: '필수 열(채널명·계정링크·업로드 링크)을 못 찾음' };
  var last = sh.getLastRow(), lastC = sh.getLastColumn(), nData = Math.max(0, last - hRow);
  var body = nData ? sh.getRange(hRow + 1, 1, nData, lastC).getValues() : [];
  var byHandle = {}, maxNo = 0, emptyRows = [];
  for (var i = 0; i < body.length; i++) {
    var abs = hRow + 1 + i;
    var h0 = handleOf(body[i][cLink - 1]);
    if (h0 && !byHandle[h0]) byHandle[h0] = { row: abs, memo: cMemo ? String(body[i][cMemo - 1] || '') : '', old: cOld ? String(body[i][cOld - 1] || '') : '' };
    if (cNo) { var n = Number(body[i][cNo - 1]); if (!isNaN(n) && n > maxNo) maxNo = n; }
    if (!String(body[i][cName - 1] || '').trim()) emptyRows.push(abs); // 채널명 빈 = 채울 후보
  }
  /* 차수는 시트가 정한다. 이미 적힌 'N차' 중 가장 큰 것 + 1 이 이번 차수다.
     ⚠️ 서버가 '1차' 를 박아 보내면 2차 납품 때도 1차라고 적힌다. 사람이 매번 숫자를 고르게
     하는 것도 답이 아니다 — 시트를 보면 답이 이미 거기 있다.
     행이 하나도 없으면 1차. 사람이 손으로 '2차' 라고 적어 두면 다음은 3차가 된다. */
  var maxBatch = 0;
  if (cOld) {
    for (var bi = 0; bi < body.length; bi++) {
      var bt = String(body[bi][cOld - 1] || '').match(/(\d+)\s*차/);
      if (bt) { var bn = Number(bt[1]); if (bn > maxBatch) maxBatch = bn; }
    }
  }
  var nextBatch = (maxBatch + 1) + '차';

  var added = [], updated = 0;
  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    var h = handleOf(row.link) || handleOf(row.contentLink);
    if (!h) continue;
    var ex = byHandle[h];
    if (ex) {
      // 이미 있는 계정 → 채널/링크 그대로. 조회수 노트는 '비고'에 자가보정(수기 메모는 보존).
      if (cMemo) {
        var isAuto = (ex.memo === '' || /조회수/.test(ex.memo)); // 비었거나 조회수 노트일 때만 자동 갱신 대상
        if (row.viewNote) { if (isAuto && ex.memo !== row.viewNote) { sh.getRange(ex.row, cMemo).setValue(row.viewNote); updated++; } } // 1만+ → 갱신
        else if (/조회수/.test(ex.memo)) { sh.getRange(ex.row, cMemo).setValue(''); updated++; } // 1만 미만인데 옛 자동노트 → 지움
      }
      if (cOld && /조회수/.test(ex.old)) { sh.getRange(ex.row, cOld).setValue(''); updated++; ex.old = ''; } // 예전에 특이사항에 넣던 자동노트 제거(비고로 이관)
      // 차수는 비어 있을 때만 적는다 — 이미 1차로 나간 건을 나중에 2차로 덮으면 이력이 사라진다.
      // 깨진 글자(U+FFFD)가 박힌 칸도 '비어 있는 것' 으로 본다 — 인코딩 사고로 들어간 값을 되돌린다.
      var oldTxt = String(ex.old || '');
      if (cOld && (!oldTxt.trim() || oldTxt.indexOf('�') >= 0)) { sh.getRange(ex.row, cOld).setValue(row.batch || nextBatch); updated++; }
      /* 선정기준 칸도 '비어 있을 때만' 채운다. 앞선 시도가 중간에 끊겨 반쯤 만들어진 행이
         영영 빈 채로 남는 걸 막는다. 사람이 적어 둔 값은 건드리지 않는다. */
      var blanks = [[cType, row.applyType], [cFol, row.followers], [cJp, row.japan]];
      for (var q = 0; q < blanks.length; q++) {
        var cc = blanks[q][0], vv = blanks[q][1];
        if (!cc || vv == null || vv === '') continue;
        if (String(sh.getRange(ex.row, cc).getValue() || '').trim()) continue;
        if (setDeliverCell_(sh, ex.row, cc, vv)) updated++;
      }
      continue;
    }
    var target = emptyRows.shift();
    if (!target) target = sh.getLastRow() + 1; // 빈 템플릿 행 소진 시 맨 아래 추가
    maxNo++;
    if (cNo) sh.getRange(target, cNo).setValue(maxNo);
    sh.getRange(target, cName).setValue(row.nick || h);
    sh.getRange(target, cLink).setValue(row.link || ('https://www.tiktok.com/@' + h));
    sh.getRange(target, cUp).setValue(row.contentLink);
    if (cMemo && row.viewNote) sh.getRange(target, cMemo).setValue(row.viewNote);
    if (cType && row.applyType) setDeliverCell_(sh, target, cType, row.applyType);
    if (cFol && row.followers != null && row.followers !== '') setDeliverCell_(sh, target, cFol, row.followers);
    if (cJp && row.japan) setDeliverCell_(sh, target, cJp, row.japan);
    // 특이사항 = 납품 차수. 사람이 적어 둔 메모는 안 덮는다(빈 칸일 때만 쓴다).
    if (cOld) sh.getRange(target, cOld).setValue(row.batch || nextBatch);
    byHandle[h] = { row: target, memo: row.viewNote || '', old: '' };
    added.push(h);
  }
  return { added: added.length, updated: updated, handles: added, batch: nextBatch };
}

// 새 크리에이터 한 줄 추가 — 대시보드 '인원 추가'. 맨 아래에 붙이고 링크를 그대로 넣는다.
// 링크는 반드시 URL 이라야 readAccounts_ 가 핸들을 뽑는다(핸들만 들어가면 그 행이 안 보인다).
/* 새 사람을 넣을 행을 찾는다.
   ⚠️ getLastRow() 는 '어떤 열이든 값이 있는 마지막 행'이라, 시트 아래쪽에 남은 서식·수식·메모
   한 칸 때문에 한참 밑으로 간다. 실제로 마루 14명이 410~423 행에 들어갔다
   (크리에이터 데이터는 61 행에서 끝나는데). 대시보드는 링크 있는 행만 읽어서 멀쩡했지만,
   시트에서는 348 줄짜리 빈 구간이 생기고 정산 수식·교차색이 거기까지 안 간다.
   → 계정 링크가 실제로 있는 마지막 행 다음에 쓴다. 그 자리가 안 비어 있으면
     덮어쓰지 않고 예전 방식(맨 아래)으로 물러난다. */
function nextPersonRow_(sh) {
  var last = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (last < 1) return 1;
  var linkCols = [COL.link, COL.igLink].filter(function (c) { return c; });
  if (!linkCols.length) return last + 1;
  var lastCre = 0;
  var vals = sh.getRange(1, 1, last, lastCol).getValues();
  for (var i = 0; i < vals.length; i++) {
    for (var j = 0; j < linkCols.length; j++) {
      if (String(vals[i][linkCols[j] - 1] || '').trim()) { lastCre = i + 1; break; }
    }
  }
  if (!lastCre) return last + 1;
  var r = lastCre + 1;
  if (r > last) return r;                      // 데이터 바로 아래가 시트 끝 — 그대로 쓴다
  // 그 행에 뭔가 있으면(요약·합계 등) 건드리지 않는다.
  var rowVals = vals[r - 1] || [];
  for (var k = 0; k < rowVals.length; k++) {
    if (String(rowVals[k] || '').trim()) return last + 1;
  }
  return r;
}

function addPerson_(p) {
  p = p || {};
  var tk = String(p.tkLink || '').trim();
  var ig = String(p.igLink || '').trim();
  if (!tk && !ig) return { error: '틱톡 또는 인스타 링크가 하나 이상 필요해요.' };
  if (tk && !handleFrom_(tk)) return { error: '틱톡 링크에서 @핸들을 못 찾았어요: ' + tk };
  if (ig && !igHandleFrom_(ig)) return { error: '인스타 링크가 instagram.com/사용자명 형태가 아니에요: ' + ig };
  var sh = getSheet_();
  var r = nextPersonRow_(sh);
  if (tk && COL.link) sh.getRange(r, COL.link).setValue(tk);
  if (ig && COL.igLink) sh.getRange(r, COL.igLink).setValue(ig);
  if (p.company && COL.company) sh.getRange(r, COL.company).setValue(String(p.company));
  if (p.email && COL.email) sh.getRange(r, COL.email).setValue(String(p.email));
  SpreadsheetApp.flush();
  return { ok: true, row: r };
}

// 셀 하나 쓰기. 실패해도 절대 위로 던지지 않는다 —
// 예전엔 드롭다운(데이터 확인) 규칙에 걸린 값 하나가 요청 전체를 HTML 오류페이지로 만들어
// 화면엔 '브릿지가 JSON이 아닌 응답을 줬어요' 만 떴다. 무엇이 왜 거절됐는지 알 수가 없었다.
function setCell_(sh, row, col, value, field, skipCell) {
  try {
    sh.getRange(row, col).setValue(value);
    return true;
  } catch (err) {
    var m = String((err && err.message) || err);
    if (/validation|유효|확인/i.test(m)) {
      m = '시트의 드롭다운(데이터 확인) 규칙이 이 값을 거부했어요: "' + value + '" — 시트 드롭다운 목록과 글자가 정확히 같아야 해요.';
    }
    skipCell(field, m);
    return false;
  }
}

/* 행 삭제 — 대시보드에서 고른 사람을 마스터에서 지운다.
 *
 * ⚠️ 왜 조심해야 하나: 검수 잠금(_state.overrides)이 **행 번호**를 키로 쓴다. 행을 지우면
 * 그 아래 사람들이 한 칸씩 올라오는데 잠금은 그대로라, 엉뚱한 사람의 칸이 잠긴 채 남는다.
 * 다음 스캔이 그 사람 값을 못 고치고, 아무도 이유를 모른다. 그래서 지운 뒤 잠금도 같이 민다.
 *
 * 안전장치
 *  · 아래에서 위로 지운다 — 위에서부터 지우면 남은 번호가 그때그때 밀려 엉뚱한 행을 지운다.
 *  · 지우기 전에 그 행의 값을 통째로 담아 돌려준다(되돌릴 근거).
 *  · 헤더행 위(요약·헤더)는 절대 안 지운다.
 *  · 한 번에 지울 수 있는 수를 제한한다 — 실수로 전체를 넘기면 캠페인이 통째로 날아간다.
 */
function deleteRows_(rows) {
  var sh = getSheet_();
  var hRow = lun8Head_ ? lun8Head_(sh) : 8;
  var list = (rows || []).map(Number).filter(function (r) { return r > hRow; });
  list = list.filter(function (r, i) { return list.indexOf(r) === i; }).sort(function (a, b) { return b - a; });
  if (!list.length) return { error: '지울 행이 없어요(헤더 위 행은 못 지웁니다)' };
  if (list.length > 30) return { error: '한 번에 30행까지만 지울 수 있어요 — ' + list.length + '행이 들어왔습니다.' };

  var lastCol = sh.getLastColumn();
  var snapshot = [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (r > sh.getLastRow()) continue;
    try { snapshot.push({ row: r, values: sh.getRange(r, 1, 1, lastCol).getValues()[0] }); } catch (e) {}
    sh.deleteRow(r);
  }
  SpreadsheetApp.flush();

  /* 잠금을 같이 민다. 지운 행보다 아래였던 것은 지운 개수만큼 번호가 줄어든다.
     지운 행 자신의 잠금은 버린다 — 그 사람이 없어졌으니 잠글 칸도 없다. */
  var shifted = 0;
  try {
    var st = readState_();
    var ov = st.overrides || {};
    var next = {};
    for (var k in ov) {
      var n = Number(k);
      if (!isFinite(n)) { next[k] = ov[k]; continue; }        // 숫자 아닌 키는 그대로
      if (list.indexOf(n) >= 0) { shifted++; continue; }      // 지운 행의 잠금 — 버린다
      var below = 0;
      for (var j = 0; j < list.length; j++) if (list[j] < n) below++;
      if (below) shifted++;
      next[String(n - below)] = ov[k];
    }
    writeState_({ overrides: next });
  } catch (e) { return { deleted: snapshot.length, rows: list, snapshot: snapshot, overrideError: String(e) }; }

  return { deleted: snapshot.length, rows: list, snapshot: snapshot, overridesShifted: shifted };
}

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
    if (!TOKEN) return json_({ error: 'bridge token not configured' });   // 위 doGet 과 같은 이유
    if ((body.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
    initCols_(); // 헤더 기반 열 매핑 — cells 의 필드명 해석·마스터 쓰기에 사용
    if (body.deleteRows) return json_(deleteRows_(body.deleteRows));   // 대시보드 '선택 삭제'
    if (body.deliver) return json_(deliverReviewed_(body.deliver.sheetId, body.deliver.rows, body.deliver.plat)); // 검수완료 → 납품시트 기입 (자체 헤더 탐색이라 COL 무관)
    // 내용이 있을 때만 분기 — 빈 배열 []/빈 객체 {} 는 truthy 라, 그냥 두면
    // {updates:[...], orders:[]} 같은 요청이 updates 를 조용히 건너뛴다.
    if (Array.isArray(body.orders) && body.orders.length) return json_(upsertOrders_(body.orders)); // 주문(돈) 로그 upsert
    if (body.state && Object.keys(body.state).length) return json_(writeState_(body.state));        // overrides / best
    // 여기서부터는 전부 COL/PLAT_COL 로 마스터에 쓴다. 헤더행을 못 찾았으면 그 좌표는 추측이라
    // 한 칸도 쓰지 않는다 — 조용히 엉뚱한 열을 덮어쓰는 것보다 시끄럽게 실패하는 게 낫다.
    // 단 셋업·의견은 통과시킨다 — 셋업은 이 상태를 고치는 유일한 수단이고(막으면 복구 불가),
    // 의견은 마스터를 안 건드린다. 대신 같은 요청에 실제 쓰기가 섞여 있으면 통과시키지 않는다.
    var wantsColWrite = !!(body.sync || (body.updates && body.updates.length) || (body.cells && body.cells.length));
    if (_colInfo.headerFound === false && (wantsColWrite || !(body.setup || body.feedback || body.feedbackDone))) {
      return json_({ error: '마스터 헤더행(계정링크 + 닉네임/진행사)을 못 찾아 열 위치를 몰라요 — 아무것도 쓰지 않았어요. 시트 상단 20행 안에 헤더행이 있는지, 헤더 이름이 별칭과 맞는지 확인해 주세요.',
                     headerFound: false, updated: 0,
                     skipped: (body.cells || []).map(function (c) { return (c && c.field) || ('col' + (c && c.col)); }) });
    }
    // sync 는 COL.link·COL.company 로 마스터에 쓴다 → 위 검사 뒤에 둔다.
    if (body.sync) return json_(syncRecruit_(body.sync.sheetId, body.sync.company, body.sync.linkCol));
    if (body.addPerson) return json_(addPerson_(body.addPerson)); // 인원 추가 — 맨 아래 한 줄
    var sh = getSheet_();
    var updates = body.updates || [];
    var n = 0;
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      if (!u.row || u.followers == null) continue;
      sh.getRange(u.row, COL.followers).setValue(u.followers).setNumberFormat('#,##0');
      // 가드닝 대상여부(F열)는 '비어 있을 때 한 번'만 기록하고, 값이 있으면 절대 덮어쓰지 않는다.
      // 팔로워 1명 → 가드닝으로 1,001명이 되어도 '원래 대상이었다'는 기록이 남아야 하기 때문.
      // (사람이 손으로 고친 값도 그대로 보존)
      var g = sh.getRange(u.row, COL.gardening);
      if (!String(g.getValue() || '').trim()) {
        // 시트 드롭다운 어휘와 정확히 맞춘다 — 안 맞으면 유효성 경고가 뜨고 집계도 어긋난다.
        g.setValue(u.followers < MIN_FOLLOWERS ? '대상' : '불필요');
      }
      n++;
    }
    // 셋업 작업 실행 — 열 추가·정리처럼 한 번씩 돌리는 것들. 토큰이 있어야 하고, 아래 목록에 있는 것만.
    if (body.setup) {
      var ran = String(body.setup), out = '';
      switch (ran) {
        case 'addLun8ConfirmedDate':    out = addLun8ConfirmedDate(); break;
        case 'restructureLun8Contact':  out = restructureLun8Contact(); break;
        case 'setupLun8':               out = setupLun8(); break;
        case 'buildLun8Docs':           out = buildLun8Docs(); break;
        case 'fixLun8Colors':           out = fixLun8Colors(); break;
        case 'fixLun8Gardening':        out = fixLun8Gardening(); break;
        case 'addLun8Memo':             out = addLun8Memo(); break;
        case 'fixLun8Summary':          out = fixLun8Summary(); break;
        case 'fixLun8Dropdowns':        out = fixLun8Dropdowns(); break;
        // 데이터가 저 아래(410행~)로 떨어진 걸 위로 끌어올린다(일회성 정리).
        case 'compactLun8Rows':         out = compactLun8Rows(); break;
        default: return json_({ error: '허용되지 않은 작업: ' + ran });
      }
      return json_({ ok: true, ran: ran, result: out || '완료', setupRan: true });
    }
    // 의견 남기기 — 팀이 화면에서 남긴 개선 요청. 별도 탭이라 마스터 데이터와 안 섞인다.
    if (body.feedback) {
      var fb = body.feedback;
      appendFeedback_(fb.who, fb.where, fb.text);
      return json_({ ok: true, feedbackSaved: true });   // 표식 — 옛 배포는 이걸 못 주므로 서버가 거짓 성공을 걸러낸다
    }
    if (body.feedbackDone) {   // 처리 완료 표시 (행번호)
      var fsh = feedbackSheet_();
      var fr = Number(body.feedbackDone);
      if (fr > 1 && fr <= fsh.getLastRow()) fsh.getRange(fr, 5).setValue('완료');
      return json_({ ok: true, feedbackSaved: true });
    }
    // 임의 셀 쓰기 [{row, col, value}] — 콘텐츠 링크·검수·조회수 되쓰기용
    var cells = body.cells || [], skipped = [], skipReasons = [];
    // 건너뛴 이유를 같이 실어야 사람이 '왜 안 써졌는지'를 시트를 뒤지지 않고 안다.
    var skipCell = function (field, why) { skipped.push(field); skipReasons.push(field + ' — ' + why); };
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      var col = 0;
      // 'ig.soundOk' 처럼 플랫폼을 지정한 필드 — PLAT_COL 에서 그 플랫폼 열을 찾는다.
      var dot = c.field ? String(c.field).indexOf('.') : -1;
      if (dot > 0) {
        var pf = c.field.slice(0, dot), ff = c.field.slice(dot + 1);
        col = (PLAT_COL[pf] && PLAT_COL[pf][ff]) || 0;
        if (!col) { skipCell(c.field, '이 마스터엔 해당 플랫폼(' + pf + ') 열이 없어요'); continue; }
        if (!c.row) continue;
        if (setCell_(sh, c.row, col, c.value, c.field, skipCell)) n++;
        continue;
      }
      if (c.field) {
        // 헤더에서 못 찾아 폴백한 필드 = 어느 열인지 모르는 것. 쓰면 엉뚱한 열을 덮어쓴다 → 거부.
        if (_colInfo.fellBack && _colInfo.fellBack.indexOf(c.field) >= 0) {
          skipCell(c.field, '헤더에서 못 찾아 기본좌표로 폴백한 필드예요 — 엉뚱한 열을 덮어쓸까 봐 안 썼어요');
          continue;
        }
        col = COL[c.field] || 0;
        if (!col) {
          skipCell(c.field, (_colInfo.missing && _colInfo.missing.indexOf(c.field) >= 0)
            ? '마스터 헤더에 이 열이 없어요(헤더 이름 확인 또는 별칭 추가 필요)'
            : '브릿지가 모르는 필드명이에요');
          continue;
        }
      } else col = c.col;                                 // 옛 호출부 하위호환
      if (!c.row || !col) continue;
      if (setCell_(sh, c.row, col, c.value, c.field || ('col'+col), skipCell)) n++;
    }
    // skipped 를 반드시 올려보낸다 — 안 그러면 '조용히 아무것도 안 써짐'이 성공으로 보인다.
    return json_({ updated: n, skipped: skipped, skipReasons: skipReasons,
                   fellBack: _colInfo.fellBack || [], missing: _colInfo.missing || [], headerFound: true });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

/**
 * SIRIAI 캠페인 대시보드 — 확장 브릿지 (4단계 라이프사이클 컬럼까지 읽음)
 * 마스터시트에 붙여 배포하세요. 개인정보(이메일·연락처)는 반환하지 않음.
 *
 * 설치: 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 배포 → 새 배포 → 웹 앱
 *       (실행: 나 / 액세스: 링크 있는 모든 사용자) → 배포 → 웹 앱 URL 복사
 */
const TOKEN = 'grdn_2f8a91c4e7b3';
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
  igLink: 0, igNick: 0,   // 0 = 이 마스터엔 없는 열 → 폴백하지 않고 '없음'으로 둔다(베이온은 틱톡 전용)
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
  nick: ['닉네임', '크리에이터', '채널명', '이름'],
  link: ['계정링크', '틱톡링크', '계정', '링크'],
  followers: ['팔로워', '팔로워수', '틱톡팔로워'],
  gardening: ['가드닝대상여부', '가드닝', '가드닝대상', '틱톡가드닝'],
  language: ['언어', '국가'],
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
};
var COL = shallowClone_(DEFAULT_COL); // 런타임에 헤더 기반으로 재해석됨 (initCols_)
var _dataSheet = null;                // 데이터 탭 캐시 (initCols_ 가 채움)

function shallowClone_(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
// 헤더 정규화: 공백·괄호 제거 + 소문자. '음원 구간' == '음원구간', '팔로워(명)' == '팔로워'
function normH_(s) { return String(s == null ? '' : s).replace(/[\s()（）]/g, '').toLowerCase(); }
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
var _colInfo = { bound: {}, fellBack: [], headers: [] };
function resolveColsFromHeaders_(headerRow) {
  var norm = headerRow.map(normH_), map = {};
  _colInfo = { bound: {}, fellBack: [], headers: headerRow.map(function (h) { return String(h == null ? '' : h).trim(); }) };
  for (var f in DEFAULT_COL) {
    var col = 0, al = FIELD_HEADERS[f] || [];
    for (var a = 0; a < al.length && !col; a++) { var idx = norm.indexOf(normH_(al[a])); if (idx >= 0) col = idx + 1; }
    if (!col) { col = DEFAULT_COL[f]; if (col) _colInfo.fellBack.push(f); }
    map[f] = col;
    if (col) _colInfo.bound[f] = { col: col, header: _colInfo.headers[col - 1] || '(빈 열)' };
  }
  return map;
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
        _dataSheet = sh; COL = resolveColsFromHeaders_(top[r]); return;
      }
    }
  }
  _dataSheet = null; COL = shallowClone_(DEFAULT_COL);
  _colInfo = { bound: {}, fellBack: ['(헤더행 자체를 못 찾음 — 전부 폴백)'], headers: [] }; // 헤더 못 찾음 → 폴백(getSheet_ 가 예전 방식으로 탭 탐색)
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
      if (handleFrom_(col[r][0])) return sheets[i];
    }
  }
  return sheets[0];
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
      schedDate: dateStr_(row[COL.schedDate - 1]), // 업로드 예정일(18열) — 값 있는 계정만 대시보드 '예정일' 탭에 노출
      memo: String(row[COL.memo - 1] || ''), // 계정별 자유 메모(22열) — 각 탭 끝 '비고' 열
      contentLink: c,
      soundOk: String(row[COL.soundOk - 1] || ''),
      soundSection: String(row[COL.soundSection - 1] || ''),
      hashtagOk: String(row[COL.hashtagOk - 1] || ''),
      campaignDone: String(row[COL.campaignDone - 1] || ''),
      paid: String(row[COL.paid - 1] || ''),
      paidDate: String(row[COL.paidDate - 1] || ''),
      views: row[COL.views - 1],
      likes: row[COL.likes - 1],
      comments: row[COL.comments - 1],
      shares: row[COL.shares - 1],
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

function orderRow_(o) {
  return [
    String(o.id), // 유일키는 항상 문자열로 (정밀도·앞자리0 무관하게 매칭 안정)
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
      var k = String(orders[p].id);
      if (orders[p].id == null || orders[p].id === '' || idx[k] || seen[k]) continue;
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
      if (o.id == null || o.id === '') continue;
      var row = idx[String(o.id)];
      if (!row) { lastRow += 1; row = lastRow; idx[String(o.id)] = row; }
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

function readState_() {
  var sh = stateSheet_();
  var lastRow = sh.getLastRow();
  var out = { overrides: {}, best: [] };
  if (lastRow < 2) return out;
  var v = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) {
    var k = String(v[i][0] || '');
    var raw = String(v[i][1] || '').trim();
    if (!k || !raw) continue;
    try {
      if (k === 'overrides') out.overrides = JSON.parse(raw);
      else if (k === 'best') out.best = JSON.parse(raw);
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
    var keys = ['overrides', 'best'];
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

function doGet(e) {
  try {
    if ((e.parameter.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
    initCols_(); // 헤더 기반으로 열 매핑 해석 (COL 재설정) — colmap 으로 노출해 검증 가능
    var action = e.parameter.action || 'list';
    if (action === 'list') return json_({ accounts: readAccounts_(), colmap: COL, colinfo: _colInfo });
    if (action === 'orders') return json_({ orders: readOrders_() });
    if (action === 'state') return json_(readState_());
    if (action === 'bundle') {
      var s = readState_();
      return json_({ accounts: readAccounts_(), orders: readOrders_(), overrides: s.overrides, best: s.best, colmap: COL, colinfo: _colInfo });
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
function deliverReviewed_(sheetId, rows) {
  if (!sheetId) return { error: '납품시트 ID 없음(campaigns.json deliverySheetId)' };
  if (!rows || !rows.length) return { added: 0, handles: [] };
  var dst;
  try { dst = SpreadsheetApp.openById(sheetId); } catch (err) { return { error: '납품시트 열기 실패(권한/ID 확인): ' + err }; }
  var norm = function (v) { return String(v || '').replace(/\s+/g, ''); };
  var handleOf = function (str) { var m = String(str || '').match(/@([A-Za-z0-9._]+)/); return m ? m[1].toLowerCase() : ''; };
  // 헤더행(채널명 + 업로드 링크가 있는 행)이 있는 탭 찾기 (상단 20행 내)
  var sheets = dst.getSheets(), sh = null, header = null, hRow = -1;
  for (var s = 0; s < sheets.length && !sh; s++) {
    var lr = sheets[s].getLastRow(), lc = sheets[s].getLastColumn();
    if (lr < 1) continue;
    var top = sheets[s].getRange(1, 1, Math.min(lr, 20), lc).getValues();
    for (var r = 0; r < top.length; r++) {
      var hv = top[r].map(norm);
      if (hv.indexOf('채널명') >= 0 && hv.indexOf('업로드링크') >= 0) { sh = sheets[s]; header = hv; hRow = r + 1; break; }
    }
  }
  if (!sh) return { error: '납품시트에서 헤더행(채널명·업로드 링크)을 못 찾음' };
  var col = function (name) { return header.indexOf(name) + 1; }; // 1-based, 없으면 0
  var cName = col('채널명'), cLink = col('계정링크'), cUp = col('업로드링크'), cNo = col('no'), cMemo = col('비고'), cOld = col('특이사항'); // 조회수 노트는 비고에. 특이사항은 옛 노트 이관용.
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
      if (cOld && /조회수/.test(ex.old)) { sh.getRange(ex.row, cOld).setValue(''); updated++; } // 예전에 특이사항에 넣던 자동노트 제거(비고로 이관)
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
    byHandle[h] = { row: target, memo: row.viewNote || '', old: '' };
    added.push(h);
  }
  return { added: added.length, updated: updated, handles: added };
}

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
    if ((body.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
    initCols_(); // 헤더 기반 열 매핑 — cells 의 필드명 해석·마스터 쓰기에 사용
    if (body.sync) return json_(syncRecruit_(body.sync.sheetId, body.sync.company, body.sync.linkCol));
    if (body.deliver) return json_(deliverReviewed_(body.deliver.sheetId, body.deliver.rows)); // 검수완료 → 납품시트 기입
    // 내용이 있을 때만 분기 — 빈 배열 []/빈 객체 {} 는 truthy 라, 그냥 두면
    // {updates:[...], orders:[]} 같은 요청이 updates 를 조용히 건너뛴다.
    if (Array.isArray(body.orders) && body.orders.length) return json_(upsertOrders_(body.orders)); // 주문(돈) 로그 upsert
    if (body.state && Object.keys(body.state).length) return json_(writeState_(body.state));        // overrides / best
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
        g.setValue(u.followers < MIN_FOLLOWERS ? '가드닝 대상' : '가드닝 불필요');
      }
      n++;
    }
    // 임의 셀 쓰기 [{row, col, value}] — 콘텐츠 링크·검수·조회수 되쓰기용
    var cells = body.cells || [];
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      var col = c.field ? (COL[c.field] || 0) : c.col; // 필드명이 오면 현재 열로 해석(헤더 기반), 없으면 기존 col 하위호환
      if (!c.row || !col) continue;
      sh.getRange(c.row, col).setValue(c.value);
      n++;
    }
    return json_({ updated: n });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

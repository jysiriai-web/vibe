/**
 * SIRIAI 캠페인 대시보드 — 확장 브릿지 (4단계 라이프사이클 컬럼까지 읽음)
 * 마스터시트에 붙여 배포하세요. 개인정보(이메일·연락처)는 반환하지 않음.
 *
 * 설치: 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 배포 → 새 배포 → 웹 앱
 *       (실행: 나 / 액세스: 링크 있는 모든 사용자) → 배포 → 웹 앱 URL 복사
 */
const TOKEN = 'grdn_2f8a91c4e7b3';
const MIN_FOLLOWERS = 1000;

// 컬럼 위치(1부터). 마스터 통합시트 헤더 기준.
const COL = {
  company: 2, nick: 3, link: 4, followers: 5, gardening: 6,
  language: 11, notice: 16,
  contentA: 17, reviewNote: 18, soundOk: 19, soundSection: 20, hashtagOk: 21,
  campaignDone: 23, paid: 24, paidDate: 25,
  contentB: 26, views: 27, likes: 28, comments: 29, shares: 30,
};

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
  var v = sh.getRange(1, 1, last, 30).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var row = v[i];
    var handle = handleFrom_(row[COL.link - 1]);
    if (!handle) continue;
    var c = String(row[COL.contentA - 1] || row[COL.contentB - 1] || '');
    out.push({
      row: i + 1,
      company: String(row[COL.company - 1] || ''),
      nick: String(row[COL.nick - 1] || ''),
      handle: handle,
      link: String(row[COL.link - 1] || ''),
      sheetFollowers: row[COL.followers - 1],
      language: String(row[COL.language - 1] || ''),
      notice: String(row[COL.notice - 1] || ''),
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
var TEXT_COLS = [8, 15, 16, 17];  // charge·placedAt·closedAt·_json 은 순수 텍스트로 고정

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
    sh.getRange(1, 1, 1, ORDER_COLS.length).setValues([ORDER_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    for (var i = 0; i < TEXT_COLS.length; i++) {
      sh.getRange(1, TEXT_COLS[i], sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  return sh;
}

function orderRow_(o) {
  return [
    o.id,
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
      var row = idx[k];
      if (!row) { lastRow += 1; row = lastRow; idx[k] = row; sh.getRange(row, 1).setValue(k); }
      sh.getRange(row, 2).setNumberFormat('@').setValue(JSON.stringify(state[k]));
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
    var action = e.parameter.action || 'list';
    if (action === 'list') return json_({ accounts: readAccounts_() });
    if (action === 'orders') return json_({ orders: readOrders_() });
    if (action === 'state') return json_(readState_());
    if (action === 'bundle') {
      var s = readState_();
      return json_({ accounts: readAccounts_(), orders: readOrders_(), overrides: s.overrides, best: s.best });
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

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
    if ((body.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
    if (body.sync) return json_(syncRecruit_(body.sync.sheetId, body.sync.company, body.sync.linkCol));
    if (body.orders) return json_(upsertOrders_(body.orders)); // 주문(돈) 로그 upsert
    if (body.state) return json_(writeState_(body.state));     // overrides / best
    var sh = getSheet_();
    var updates = body.updates || [];
    var n = 0;
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      if (!u.row || u.followers == null) continue;
      sh.getRange(u.row, COL.followers).setValue(u.followers).setNumberFormat('#,##0');
      sh.getRange(u.row, COL.gardening).setValue(u.followers < MIN_FOLLOWERS ? '가드닝 대상' : '가드닝 불필요');
      n++;
    }
    // 임의 셀 쓰기 [{row, col, value}] — 콘텐츠 링크·검수·조회수 되쓰기용
    var cells = body.cells || [];
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      if (!c.row || !c.col) continue;
      sh.getRange(c.row, c.col).setValue(c.value);
      n++;
    }
    return json_({ updated: n });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

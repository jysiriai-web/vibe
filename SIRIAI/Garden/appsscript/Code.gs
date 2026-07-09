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
  language: 11,
  contentA: 17, reviewNote: 18, soundOk: 19, soundSection: 20, hashtagOk: 21,
  campaignDone: 23, paid: 24, paidDate: 25,
  contentB: 26, views: 27, likes: 28, comments: 29, shares: 30,
};

function handleFrom_(link) {
  var m = String(link || '').match(/@([A-Za-z0-9._]+)/);
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

function doGet(e) {
  if ((e.parameter.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
  if ((e.parameter.action || 'list') === 'list') return json_({ accounts: readAccounts_() });
  return json_({ error: 'unknown action' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  if ((body.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
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
}

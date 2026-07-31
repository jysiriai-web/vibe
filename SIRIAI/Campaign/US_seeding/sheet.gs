/**
 * 틱톡 키워드 확인기 — 시트 브릿지 (이 스프레드시트 전용, 1회 설정)
 *
 *  하는 일 딱 두 가지
 *   · action=list : 대상 탭의 B열(Final Confirmed ID) 계정 목록과 지금 O열에 든 값을 넘겨준다
 *   · links       : 찾은 콘텐츠 링크를 O열에 기입한다 (빈 칸에만)
 *
 *  안전장치
 *   · 토큰이 맞아야만 응답한다
 *   · O열에 이미 값이 있으면 절대 덮어쓰지 않는다
 *   · 기입 직전에 그 행 B열이 아직 같은 계정인지 다시 확인한다
 *     (스캔하는 몇 분 사이 누가 행을 삽입하면 행 번호가 밀리기 때문)
 *   · 열 위치는 헤더 이름으로 찾는다 — 열이 추가·이동돼도 따라간다
 *
 *  설치: README.md 참고 (확장 프로그램 → Apps Script → 붙여넣기 → 배포)
 */

var TOKEN = 'rg_usa70_9f3c1b';   // checker/config.json 의 sheet.token 과 같아야 함
var GID = 851028511;             // 대상 탭: USA 70건 배송 및 콘텐츠 업로드
var HEADER_SCAN_ROWS = 40;       // 헤더를 찾을 때 위에서 몇 행까지 훑을지

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (String(p.token || '') !== TOKEN) return json_({ error: '토큰이 맞지 않아요' });
    if (p.action === 'list') return json_(listRows_());
    return json_({ error: '알 수 없는 action: ' + (p.action || '(없음)') });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (String(body.token || '') !== TOKEN) return json_({ error: '토큰이 맞지 않아요' });
    if (body.links) return json_(writeLinks_(body.links));
    return json_({ error: 'links 가 없어요' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// gid 로 탭 찾기 — 탭 이름이 바뀌어도 따라간다.
function sheet_() {
  var all = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < all.length; i++) if (all[i].getSheetId() === GID) return all[i];
  throw new Error('gid ' + GID + ' 탭을 못 찾았어요 (탭이 삭제됐거나 다른 파일에 설치됐는지 확인)');
}

// 헤더 행·열을 이름으로 찾는다. 위쪽에 요약 블록이 몇 줄이든 상관없이 동작.
function header_(sh) {
  var rows = sh.getRange(1, 1, Math.min(HEADER_SCAN_ROWS, sh.getLastRow()), sh.getLastColumn()).getValues();
  for (var r = 0; r < rows.length; r++) {
    var idCol = -1, linkCol = -1;
    for (var c = 0; c < rows[r].length; c++) {
      var v = String(rows[r][c] == null ? '' : rows[r][c]).trim().toLowerCase();
      if (v === 'final confirmed id') idCol = c + 1;
      if (v === 'link of content') linkCol = c + 1;
    }
    if (idCol > 0 && linkCol > 0) return { row: r + 1, idCol: idCol, linkCol: linkCol };
  }
  throw new Error('헤더를 못 찾았어요 (Final Confirmed ID / Link of content 가 있는 행이 필요합니다)');
}

// '@a_x493', 'a_x493', 'https://www.tiktok.com/@a_x493' → 'a_x493'
function cleanHandle_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (m) return m[1].toLowerCase();
  m = s.replace(/^@/, '').match(/^[A-Za-z0-9._]+/);
  return m ? m[0].toLowerCase() : '';
}

function listRows_() {
  var sh = sheet_();
  var h = header_(sh);
  var n = sh.getLastRow() - h.row;
  if (n <= 0) return { tab: sh.getName(), header: h, rows: [] };
  var ids = sh.getRange(h.row + 1, h.idCol, n, 1).getValues();
  var links = sh.getRange(h.row + 1, h.linkCol, n, 1).getValues();
  var rows = [];
  for (var i = 0; i < n; i++) {
    var handle = cleanHandle_(ids[i][0]);
    if (!handle) continue; // 빈 행·합계 행 등은 건너뜀
    rows.push({ row: h.row + 1 + i, handle: handle, link: String(links[i][0] == null ? '' : links[i][0]).trim() });
  }
  return { tab: sh.getName(), header: h, rows: rows };
}

function writeLinks_(items) {
  var sh = sheet_();
  var h = header_(sh);
  var last = sh.getLastRow();
  var updated = 0, skipped = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var row = Number(it.row);
    var link = String(it.link || '').trim();
    var handle = cleanHandle_(it.handle);

    if (!row || row <= h.row || row > last) { skipped.push({ row: row, handle: handle, reason: '행 번호가 범위 밖' }); continue; }
    if (!link) { skipped.push({ row: row, handle: handle, reason: '링크가 비어 있음' }); continue; }

    var cur = cleanHandle_(sh.getRange(row, h.idCol).getValue());
    if (handle && cur !== handle) { skipped.push({ row: row, handle: handle, reason: '그 사이 행이 밀렸어요 (지금 B열=' + cur + ')' }); continue; }

    var cell = sh.getRange(row, h.linkCol);
    if (String(cell.getValue() == null ? '' : cell.getValue()).trim()) { skipped.push({ row: row, handle: handle, reason: '이미 링크가 있어 그대로 뒀어요' }); continue; }

    cell.setValue(link);
    updated++;
  }
  SpreadsheetApp.flush();
  return { updated: updated, skipped: skipped };
}

// ── 설치 확인용 ──────────────────────────────────────────────────────────
// Apps Script 편집기에서 이 함수를 한 번 실행하면 권한 승인 창이 뜨고,
// 실행 로그에 탭 이름·계정 수가 찍힙니다. 배포 전 점검용.
function 설치확인() {
  var r = listRows_();
  var empty = 0;
  for (var i = 0; i < r.rows.length; i++) if (!r.rows[i].link) empty++;
  Logger.log('탭: %s / 헤더 %s행 / 계정 %s건 / O열 빈 곳 %s건', r.tab, r.header.row, r.rows.length, empty);
  Logger.log('B열 = %s열, O열(Link of content) = %s열', r.header.idCol, r.header.linkCol);
}

/**
 * 스캔 에이전트 '신호버스' — 별도 Apps Script 웹앱 (선택 · bus:'sheet' 일 때만).
 *
 * ★ 기존 라이브 브릿지(Code.gs)는 절대 건드리지 않습니다. Apps Script 는 프로젝트당 doGet/doPost 가
 *   하나뿐이라, 이 버스는 '완전히 별도의 새 Apps Script 프로젝트'로 배포합니다(같은 시트에 바인딩 가능).
 *
 * 설치:
 *   1) 마스터 스프레드시트 → 확장 → Apps Script → (+) 새 프로젝트 or 파일에 이 코드 붙여넣기
 *      ※ 기존 Code.gs 와 같은 프로젝트에 두지 말 것(doPost 충돌). 별도 프로젝트 권장.
 *   2) 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 링크 있는 모든 사용자) → URL 복사
 *   3) agent.config.json 에  { "bus": "sheet", "sheet": { "url": "<웹앱URL>", "token": "grdn_worker_x1" } }
 *
 * 만드는 탭:  _worker (작업 큐 · 진행/제어 · 결과요약)  ·  _worker_hb (하트비트 1행)
 * 데이터 열(계정·검수·성과)과 물리적으로 분리된 탭이라 스캔 결과 되쓰기와 경합하지 않습니다.
 */
var WK_TOKEN = 'grdn_worker_x1';                 // ← agent.config.json 의 sheet.token 과 동일하게
var WK_SHEET = '_worker';
var WK_HB = '_worker_hb';
var WK_COLS = ['id', 'type', 'mode', 'campaign', 'attended', 'status', 'source', 'window',
  'enqueuedAt', 'claimedAt', 'finishedAt', 'phase', 'done', 'total', 'blockReason', 'error', '_json'];
var WK_JSONCOL = WK_COLS.length;

function wkJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function wkSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(WK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WK_SHEET, ss.getNumSheets());
    sh.getRange(1, 1, 1, WK_COLS.length).setValues([WK_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@'); // id 텍스트 고정
  }
  return sh;
}
function wkHbSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(WK_HB);
  if (!sh) { sh = ss.insertSheet(WK_HB, ss.getNumSheets()); sh.hideSheet(); sh.getRange(1, 1).setValue('heartbeat_json'); }
  return sh;
}
function wkRow_(o) {
  return [String(o.id), o.type || '', o.mode || '', o.campaign || '', !!o.attended, o.status || '', o.source || '',
    o.window || '', o.enqueuedAt || '', o.claimedAt || '', o.finishedAt || '', o.phase || '',
    o.done == null ? '' : o.done, o.total == null ? '' : o.total, o.blockReason || '', o.error || '', JSON.stringify(o)];
}
function wkReadAll_() {
  var sh = wkSheet_(), last = sh.getLastRow();
  if (last < 2) return { sh: sh, rows: [] };
  var v = sh.getRange(2, WK_JSONCOL, last - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < v.length; i++) {
    var raw = String(v[i][0] || '').trim(); if (!raw) continue;
    try { rows.push({ sheetRow: i + 2, job: JSON.parse(raw) }); } catch (e) {}
  }
  return { sh: sh, rows: rows };
}
function wkWrite_(sh, sheetRow, o) { sh.getRange(sheetRow, 1, 1, WK_COLS.length).setValues([wkRow_(o)]); }

function doGet(e) {
  try {
    if ((e.parameter.token || '') !== WK_TOKEN) return wkJson_({ error: 'unauthorized' });
    var action = e.parameter.action || 'pending';
    var all = wkReadAll_();
    if (action === 'pending') return wkJson_({ jobs: all.rows.filter(function (r) { return r.job.status === 'pending'; }).map(function (r) { return r.job; }) });
    if (action === 'current') { var c = all.rows.filter(function (r) { return r.job.status === 'running'; }); return wkJson_({ job: c.length ? c[c.length - 1].job : null }); }
    if (action === 'recent') {
      var n = Number(e.parameter.n) || 10;
      var done = all.rows.filter(function (r) { return r.job.status !== 'pending' && r.job.status !== 'running'; });
      return wkJson_({ jobs: done.slice(-n).reverse().map(function (r) { return r.job; }) });
    }
    if (action === 'heartbeat') {
      var hb = wkHbSheet_().getRange(2, 1).getValue();
      try { return wkJson_({ heartbeat: hb ? JSON.parse(hb) : null }); } catch (e2) { return wkJson_({ heartbeat: null }); }
    }
    return wkJson_({ error: 'unknown action' });
  } catch (err) { return wkJson_({ error: String((err && err.message) || err) }); }
}

function doPost(e) {
  try {
    var body; try { body = JSON.parse(e.postData.contents); } catch (err) { return wkJson_({ error: 'bad json' }); }
    if ((body.token || '') !== WK_TOKEN) return wkJson_({ error: 'unauthorized' });
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      // 하트비트 — 잦으므로 큐 락 밖에서 처리해도 되지만 단순화 위해 안에서.
      if (body.heartbeat) { wkHbSheet_().getRange(2, 1).setValue(JSON.stringify({ ...body.heartbeat, at: new Date().toISOString() })); return wkJson_({ ok: true }); }

      if (body.enqueue) {
        var job = body.enqueue;
        job.id = String(job.id || (Date.now().toString(36)));
        job.status = 'pending';
        job.enqueuedAt = new Date().toISOString();
        var sh = wkSheet_();
        var r = sh.getLastRow() + 1;
        if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);
        wkWrite_(sh, r, job);
        SpreadsheetApp.flush();
        return wkJson_({ job: job });
      }

      var all = wkReadAll_();
      if (body.claim) {
        var pend = all.rows.filter(function (x) { return x.job.status === 'pending'; });
        if (!pend.length) return wkJson_({ job: null });
        var pick = pend[0];
        pick.job.status = 'running';
        pick.job.claimedAt = new Date().toISOString();
        wkWrite_(all.sh, pick.sheetRow, pick.job);
        SpreadsheetApp.flush();
        return wkJson_({ job: pick.job });
      }
      // update / finish 는 현재 running 행을 대상으로 병합.
      if (body.update || body.finish) {
        var run = all.rows.filter(function (x) { return x.job.status === 'running'; });
        if (!run.length) return wkJson_({ ok: false, error: 'no running job' });
        var cur = run[run.length - 1];
        var patch = body.update || body.finish || {};
        for (var k in patch) cur.job[k] = patch[k];
        if (body.finish) cur.job.finishedAt = new Date().toISOString();
        cur.job.updatedAt = new Date().toISOString();
        wkWrite_(all.sh, cur.sheetRow, cur.job);
        SpreadsheetApp.flush();
        return wkJson_({ ok: true });
      }
      return wkJson_({ error: 'unknown post' });
    } finally { lock.releaseLock(); }
  } catch (err) { return wkJson_({ error: String((err && err.message) || err) }); }
}

/**
 * SIRIAI 오픈 추적 — 메일 본문의 1x1 픽셀이 이 주소를 부르면 '열람기록' 탭에 한 줄 남긴다.
 *
 *   <img src="<웹앱주소>?c=LAN4077" width="1" height="1">
 *
 * 마스터 시트의 어떤 칸도 건드리지 않는다(클릭 열은 실시간 수식이라 덮어쓰면 깨진다).
 * '접속기록'(코드 입장)과 별도 탭에 쌓아 두 신호를 섞지 않는다.
 *
 * 배포: 실행=나 / 액세스=링크가 있는 모든 사용자  ← 아니면 Gmail 프록시가 못 부른다
 */
var SHEET_ID = '1ebBKzcX3dEN77EElLBWn1fHZtBFOLoPz8upDLvdO2kQ';
var TAB = '열람기록';
var HEAD = ['시각(KST)', '코드', 'UA', '비고'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  var code = String(p.c || '').trim().toUpperCase();
  try {
    if (code) logOpen_(code, String(p.ua || ''));
  } catch (err) { /* 기록 실패해도 응답은 돌려준다 */ }
  // 이미지로 렌더되진 않지만(1x1 숨김) 요청 자체가 신호다.
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function logOpen_(code, ua) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(TAB);
    if (!sh) {
      sh = ss.insertSheet(TAB);
      sh.appendRow(HEAD);
      sh.setFrozenRows(1);
    }
    var d = new Date();
    var now = Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    // 같은 코드가 2분 내 다시 오면 무시 — Gmail 프록시가 한 번에 여러 번 부르는 경우가 있다
    var last = sh.getLastRow();
    if (last > 1) {
      var n = Math.min(30, last - 1);
      var recent = sh.getRange(last - n + 1, 1, n, 2).getValues();
      for (var i = recent.length - 1; i >= 0; i--) {
        if (String(recent[i][1]).trim().toUpperCase() !== code) continue;
        var prev = recent[i][0];
        // 셀이 날짜로 자동변환됐으면 Date, 텍스트면 문자열 — 양쪽 다 받는다
        var t = (prev instanceof Date) ? prev.getTime()
                                       : Date.parse(String(prev).replace(' ', 'T'));
        if (t && (d.getTime() - t) >= 0 && (d.getTime() - t) < 120000) return;
        break;
      }
    }
    sh.appendRow([now, code, String(ua).slice(0, 80), '']);
  } finally {
    lock.releaseLock();
  }
}

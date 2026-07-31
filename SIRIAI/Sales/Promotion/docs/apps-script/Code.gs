/**
 * SIRIAI 인터참 — 코드 진입 기록 + O열 열람 횟수 카운트
 *
 * 이 파일 전체를 복사해서 Apps Script 편집기의 Code.gs 에 붙여넣으세요.
 * (마크다운 문서에서 복사하면 코드펜스나 제목 기호가 섞여 들어가 1행 구문 오류가 납니다.)
 *
 * 마스터시트 기준: 헤더 8행 · N열=프로모션 코드 · O열=프로모션 코드 열람 횟수
 */

var SHEET_GID = 507101807;          // '26년 7월 인터참' 탭
var SHEET_NAME = '26년 7월 인터참';   // gid 로 못 찾을 때 대비
var LOG_NAME = '접속기록';
var HEADER_ROW = 8;                 // 헤더 8행 -> 데이터는 9행부터
var COL_CODE = 14;                  // N열
var COL_VIEWS = 15;                 // O열
var SECRET = '';                    // 비워두면 검사 안 함

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);             // 동시 진입 시 카운트 유실 방지
  try {
    var d = JSON.parse(e.postData.contents);
    if (SECRET && d.token !== SECRET) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = targetSheet_(ss);
    var matchedRow = 0;
    var views = null;

    // 성공한 진입만 카운트 (오타 코드는 브랜드에 집계되지 않음)
    if (d.ok && d.code) {
      var n = sh.getLastRow() - HEADER_ROW;
      if (n > 0) {
        var codes = sh.getRange(HEADER_ROW + 1, COL_CODE, n, 1).getValues();
        var want = String(d.code).trim().toUpperCase();
        for (var i = 0; i < codes.length; i++) {
          if (String(codes[i][0]).trim().toUpperCase() === want) {
            matchedRow = HEADER_ROW + 1 + i;
            var cell = sh.getRange(matchedRow, COL_VIEWS);
            views = (Number(cell.getValue()) || 0) + 1;
            cell.setValue(views);
            break;
          }
        }
      }
    }

    appendLog_(ss, d, matchedRow);
    return json_({ ok: true, matchedRow: matchedRow, views: views });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function targetSheet_(ss) {
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getSheetId() === SHEET_GID) return all[i];
  }
  return ss.getSheetByName(SHEET_NAME) || all[0];
}

function appendLog_(ss, d, matchedRow) {
  var log = ss.getSheetByName(LOG_NAME);
  if (!log) {
    log = ss.insertSheet(LOG_NAME);
    log.appendRow(['시각(KST)', '코드', '브랜드', '세그먼트', '구분', '성공', '매칭행']);
    log.setFrozenRows(1);
  }
  var when = d.ts ? new Date(d.ts) : new Date();
  var kst = Utilities.formatDate(when, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  log.appendRow([
    kst,
    d.code || '',
    d.brand || '',
    d.segment || '',
    d.gubun || '',
    d.ok ? 'O' : 'X',
    matchedRow || ''
  ]);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 배포 전 여기서 먼저 눌러 확인용 (실행 -> testPing_).
 * 시트에 실제로 쓰기 때문에, 확인 후 O열 값과 접속기록 행을 되돌려 두세요.
 */
function testPing_() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        ts: new Date().toISOString(),
        code: 'TRE2941',
        brand: 'TREEANNSEA 트리앤씨',
        segment: 'skincare',
        gubun: '스킨케어',
        ok: true,
        token: SECRET
      })
    }
  });
  Logger.log(res.getContent());
}

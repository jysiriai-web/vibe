/**
 * ★ SIRIAI 세일즈 마스터시트 — 유일한 관리 스크립트 (updateMaster)
 * ═══════════════════════════════════════════════════════════════════════════
 * 이 파일 하나만 쓴다. 마스터 탭을 "제자리에서" 고치므로 원본 5개 탭이 없어도 동작하고,
 * 이미 입력한 발송기록·서식·수기 수정도 그대로 보존된다.
 *
 * 하는 일
 *   ① '추가 담당자' 오른쪽에 '프로모션 코드' 열 삽입
 *      (요약 수식·조건부서식·드롭다운 범위는 구글시트가 자동으로 밀어줌)
 *   ② 코드 없는 행에 코드 발급   ABC1234  (영문3글자 + 숫자4자리)
 *   ③ 공식이메일 == 담당자이메일이면 한쪽만 남겨 중복발송 차단 + 사유를 '발송 시 주의사항'에 기입
 *   ④ 요약의 빈 '명함' 라벨 채움
 *
 * 실행: 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 함수 'updateMaster' 선택 → ▶ 실행
 *
 * ★ 몇 번을 돌려도 안전(멱등)
 *   - 열이 이미 있으면 다시 만들지 않음
 *   - ★한 번 발급된 코드는 절대 안 바꿈. 코드 칸이 빈 행에만 새로 발급.
 *     → 나중에 브랜드명을 고치거나, 행을 정렬하거나, 이 스크립트를 다시 돌려도
 *       이미 메일로 나간 코드는 그대로 유지된다.
 *
 * 참고: 원본 5개 탭에서 처음부터 재조립하는 스크립트는 _archive/BuildMaster.gs 에 있다.
 *      (원본 탭이 삭제돼 지금은 못 씀. 백업 CSV = intercharm/data/_source_backup_20260715/)
 */

function updateMaster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = findMasterSheet_(ss);
  if (!sh) throw new Error('마스터 탭을 못 찾음 (헤더에 브랜드명·담당자가 있는 탭 필요).');

  var hr = findHeaderRow_(sh);
  if (hr < 0) throw new Error('헤더행을 못 찾음 (브랜드명 + 담당자 이메일이 있는 행 필요).');

  var lastCol = sh.getLastColumn();
  var head = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x || '').replace(/\s/g, ''); });
  function col(name) { return head.indexOf(String(name).replace(/\s/g, '')) + 1; }  // 1-based, 없으면 0

  var cBrand = col('브랜드명'), cExtra = col('추가담당자');
  if (!cBrand) throw new Error('‘브랜드명’ 열을 못 찾음.');
  if (!cExtra) throw new Error('‘추가 담당자’ 열을 못 찾음.');

  // ── ① 열 삽입 (멱등) ──
  var cCode = col('프로모션코드');
  if (!cCode) {
    sh.insertColumnAfter(cExtra);
    cCode = cExtra + 1;
    // 헤더 셀: 바로 왼쪽(추가 담당자) 서식을 복사해 섹션 색 맞춤
    sh.getRange(hr, cExtra).copyTo(sh.getRange(hr, cCode), { formatOnly: true });
    sh.getRange(hr, cCode).setValue('프로모션 코드');
    sh.setColumnWidth(cCode, 96);
    // 열 삽입으로 헤더 배열이 밀렸으니 다시 읽는다
    lastCol = sh.getLastColumn();
    head = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x || '').replace(/\s/g, ''); });
  }

  var cEmail = col('공식이메일'), cPmail = col('담당자이메일'), cPerson = col('담당자'),
      cHome = col('홈페이지'), cSns = col('인스타'), cCaution = col('발송시주의사항');

  var last = sh.getLastRow();
  var n = last - hr;
  if (n < 1) { SpreadsheetApp.getActive().toast('데이터 행이 없음', 'INTERCHARM', 5); return; }

  var vals = sh.getRange(hr + 1, 1, n, sh.getLastColumn()).getValues();
  var fmls = sh.getRange(hr + 1, 1, n, sh.getLastColumn()).getFormulas();
  function cell(i, c) { return c ? String(vals[i][c - 1] == null ? '' : vals[i][c - 1]).trim() : ''; }
  // 하이퍼링크 셀은 수식 안의 URL을 써야 도메인이 잡힌다
  function urlCell(i, c) {
    if (!c) return '';
    var f = String(fmls[i][c - 1] || '');
    var m = f.match(/HYPERLINK\(\s*"([^"]+)"/i);
    return m ? m[1] : cell(i, c);
  }

  // ── ② 코드 생성 ──
  // ★ 한 번 발급된 코드는 절대 바꾸지 않는다. 코드 칸이 비어있는 행에만 새로 발급.
  //   (브랜드명을 나중에 수정해도, 행을 정렬해도, 스크립트를 몇 번 돌려도 기존 코드 유지)
  var rows = [], used = {}, kept = 0;
  for (var i = 0; i < n; i++) {
    if (!cell(i, cBrand)) { rows.push(null); continue; }
    var have = cell(i, cCode);
    if (have) { used[have] = 1; kept++; }
    rows.push({ i: i, brand: cell(i, cBrand), email: cell(i, cEmail), pmail: cell(i, cPmail),
                home: urlCell(i, cHome), sns: urlCell(i, cSns), code: have });
  }
  var live = rows.filter(function (r) { return r; });
  var need = live.filter(function (r) { return !r.code; });          // 코드 없는 행만
  var order = need.slice().sort(function (a, b) {
    var x = normKeyCode_(a.brand), y = normKeyCode_(b.brand);
    return x < y ? -1 : (x > y ? 1 : a.i - b.i);
  });
  for (var k = 0; k < order.length; k++) {
    var r = order[k];
    var p = prefix3_(codeSource_(r)), num = hash4_(normKeyCode_(r.brand)), c = p + num, g = 0;
    while (used[c] && g++ < 9000) { num = 1000 + ((num - 1000 + 1) % 9000); c = p + num; }  // 기존 코드와도 안 겹치게
    used[c] = 1; r.code = c;
  }
  var issued = order.length;

  // ── ③ 동일 이메일 정리 ──
  var outCode = [], outEmail = [], outPmail = [], outCaution = [], changed = 0;
  for (var i2 = 0; i2 < n; i2++) {
    var rec = rows[i2];
    outCode.push([rec ? rec.code : '']);
    var em = cell(i2, cEmail), pm = cell(i2, cPmail), cau = cell(i2, cCaution);
    if (rec) {
      var A = em.toLowerCase().split(/[\s\/;,]+/).filter(function (x) { return x.indexOf('@') > 0; });
      var B = pm.toLowerCase().split(/[\s\/;,]+/).filter(function (x) { return x.indexOf('@') > 0; });
      if (A.length === 1 && B.length === 1 && A[0] === B[0]) {
        var person = cell(i2, cPerson);
        var hasName = /[가-힣A-Za-z]/.test(person);
        var note = hasName ? ('공식=담당자 메일 동일 → ' + person + '님 앞으로 1회만 발송')
                           : '공식=담당자 메일 동일·담당자명 없음 → 브랜드 공식으로 1회만 발송';
        if (hasName) em = ''; else pm = '';
        if (cau.indexOf('공식=담당자') < 0) cau = cau ? (cau + ' / ' + note) : note;
        changed++;
      }
    }
    outEmail.push([em]); outPmail.push([pm]); outCaution.push([cau]);
  }

  // ── 쓰기 ──
  sh.getRange(hr + 1, cCode, n, 1).setValues(outCode);
  if (cEmail) sh.getRange(hr + 1, cEmail, n, 1).setValues(outEmail);
  if (cPmail) sh.getRange(hr + 1, cPmail, n, 1).setValues(outPmail);
  if (cCaution) sh.getRange(hr + 1, cCaution, n, 1).setValues(outCaution);

  // 코드 열 서식 — 대시보드에 입력하는 키라 고정폭·가운데·굵게
  sh.getRange(hr + 1, cCode, n, 1).setFontFamily('Roboto Mono').setHorizontalAlignment('center')
    .setFontWeight('bold').setFontColor('#3C3357').setVerticalAlignment('top');

  // ── ④ 요약의 빈 '명함' 라벨 채우기 ──
  fixMemoLabel_(sh, hr);

  SpreadsheetApp.getActive().toast(
    '코드 신규발급 ' + issued + '개 · 기존유지 ' + kept + '개 · 동일메일 정리 ' + changed + '건', 'INTERCHARM', 8);
}

/**
 * 중복 행 병합 — mergeDuplicates()
 * 같은 이메일을 쓰는 행 = 같은 회사. 정보가 많은 행을 남기고 나머지를 합쳐 지운다.
 * 남길 행의 빈 칸만 채우므로 기존 값은 절대 덮어쓰지 않음. 명함 쪽 담당자는 그대로 옮겨온다.
 * ⚠️ 이름이 크게 달라 사람 확인이 필요한 3건은 SKIP_MERGE 로 제외(에코마인·ROK·EK COS).
 * 실행 전 시트 사본을 떠두는 걸 권장(행 삭제는 되돌리기 어려움).
 */
var SKIP_MERGE = ['ecomine@ecomine.co.kr', 'global_sales@rokcorp.co.kr',
                  'muldreamofficial@naver.com', 'ek-cosmetics@naver.com'];

function mergeDuplicates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = findMasterSheet_(ss);
  if (!sh) throw new Error('마스터 탭을 못 찾음.');
  var hr = findHeaderRow_(sh);
  if (hr < 0) throw new Error('헤더행을 못 찾음.');

  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow(), n = lastRow - hr;
  if (n < 2) throw new Error('데이터가 없음.');
  var head = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x || '').replace(/\s/g, ''); });
  function C(name) { return head.indexOf(String(name).replace(/\s/g, '')) + 1; }
  var cTrack = C('접점'), cGubun = C('구분'), cBrand = C('브랜드명'), cHome = C('홈페이지'),
      cEmail = C('공식이메일'), cSns = C('인스타'), cPmail = C('담당자이메일'),
      cNote = C('비고'), cIntro = C('브랜드소개'), cNoCol = C('#');
  if (!cBrand || !cEmail || !cPmail) throw new Error('필수 열(브랜드명·공식이메일·담당자이메일)을 못 찾음.');

  var vals = sh.getRange(hr + 1, 1, n, lastCol).getValues();
  function g(i, c) { return c ? String(vals[i][c - 1] == null ? '' : vals[i][c - 1]).trim() : ''; }

  // 이메일 → 행 묶기
  var by = {}, skip = {};
  SKIP_MERGE.forEach(function (e) { skip[e.toLowerCase()] = 1; });
  for (var i = 0; i < n; i++) {
    if (!g(i, cBrand)) continue;
    var set = {};
    [g(i, cEmail), g(i, cPmail)].forEach(function (s) {
      String(s).toLowerCase().split(/[\s\/;,]+/).forEach(function (e) { if (e.indexOf('@') > 0) set[e] = 1; });
    });
    for (var e in set) { (by[e] = by[e] || []).push(i); }
  }

  // 제외 대상에 걸린 행은 아예 병합에서 뺀다(연쇄 오병합 방지)
  var tainted = {};
  for (var e2 in by) if (skip[e2]) by[e2].forEach(function (i) { tainted[i] = 1; });

  // 한 행이 여러 그룹에 걸치면 사람 확인 필요 → 건너뜀
  var groupOf = {};
  var groups = [];
  for (var e3 in by) {
    if (skip[e3] || by[e3].length < 2) continue;
    var rowsG = by[e3].filter(function (i) { return !tainted[i]; });
    if (rowsG.length < 2) continue;
    groups.push({ email: e3, rows: rowsG });
    rowsG.forEach(function (i) { groupOf[i] = (groupOf[i] || 0) + 1; });
  }
  var multi = {};
  for (var k in groupOf) if (groupOf[k] > 1) multi[k] = 1;

  var score = function (i) { return (g(i, cGubun) ? 2 : 0) + (g(i, cHome) ? 1 : 0) + (g(i, cIntro) ? 2 : 0) + (g(i, cSns) ? 1 : 0); };
  var del = {}, merged = 0, skipped = 0, log = [];

  groups.forEach(function (grp) {
    if (grp.rows.some(function (i) { return multi[i] || del[i]; })) { skipped++; return; }
    var sorted = grp.rows.slice().sort(function (a, b) { return score(b) - score(a); });
    var keep = sorted[0], drops = sorted.slice(1);
    var fill = {};   // 남길 행의 빈 칸만 채운다(기존 값은 절대 덮어쓰지 않음)
    function take(c, i) { if (c && !g(keep, c) && fill[c] === undefined && g(i, c)) fill[c] = g(i, c); }
    drops.forEach(function (i) {
      // ★모든 열을 자동 처리 — 나중에 열을 추가해도 값이 유실되지 않는다.
      //  (#=재부여, 접점·비고는 아래 전용 규칙이라 제외)
      for (var c = 1; c <= lastCol; c++) {
        if (c === cNoCol || c === cTrack || c === cNote) continue;
        take(c, i);
      }
      if (cTrack && g(i, cTrack) === '명함') fill[cTrack] = '명함';
      // 명함에 적혀 있던 다른 표기 이름을 비고에 흔적으로 남김(검색·식별용)
      if (cNote) {
        var alt = g(i, cBrand);
        var cur = fill[cNote] !== undefined ? fill[cNote] : g(keep, cNote);
        if (alt && cur.indexOf(alt) < 0) fill[cNote] = cur ? (cur + ' / 명함: ' + alt) : ('명함: ' + alt);
      }
      del[i] = 1;
    });
    for (var c in fill) sh.getRange(hr + 1 + keep, Number(c)).setValue(fill[c]);
    merged++;
    log.push(g(keep, cBrand) + ' ← ' + drops.map(function (i) { return g(i, cBrand); }).join(', '));
  });

  // 아래에서 위로 삭제(행 번호 밀림 방지)
  var rowsToDelete = Object.keys(del).map(Number).sort(function (a, b) { return b - a; });
  rowsToDelete.forEach(function (i) { sh.deleteRow(hr + 1 + i); });

  // # 열 다시 번호 매기기
  var cNo = cNoCol;
  if (cNo) {
    var left = sh.getLastRow() - hr;
    if (left > 0) {
      var seq = [];
      for (var s = 1; s <= left; s++) seq.push([s]);
      sh.getRange(hr + 1, cNo, left, 1).setValues(seq);
    }
  }
  Logger.log(log.join('\n'));
  SpreadsheetApp.getActive().toast(
    '병합 ' + merged + '건 · 삭제 ' + rowsToDelete.length + '행 · 보류 ' + (skipped + SKIP_MERGE.length) + '건', 'INTERCHARM', 10);
}

/**
 * 구분(카테고리) 정리 — normalizeCategories()
 * 5버킷 표준(스킨케어·색조·헤어바디·향수·이너뷰티) + 인터참 전용 6번째 '홈디바이스'.
 *  · 더마 → 스킨케어 (흡수)          · 메이크업/네일/뷰티소품 → 색조
 *  · 헤어/바디/오럴케어 → 헤어바디     · 복합표기(A/B)는 앞쪽 주카테고리 기준
 *  · 홈디바이스는 기기라 제안 내용이 달라 별도 유지
 * 매핑에 없는 값은 건드리지 않고 그대로 둔다(리포트에 표시).
 */
var CAT_MAP = {
  '스킨케어': '스킨케어', '더마': '스킨케어', '코스메슈티컬': '스킨케어',
  '색조': '색조', '메이크업': '색조', '네일': '색조', '뷰티소품': '색조',
  '헤어바디': '헤어바디', '헤어': '헤어바디', '바디': '헤어바디', '오럴케어': '헤어바디',
  '향수': '향수', '프래그런스': '향수',
  '이너뷰티': '이너뷰티',
  '홈디바이스': '홈디바이스', '뷰티디바이스': '홈디바이스', '디바이스': '홈디바이스'
};
function normCat_(v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  if (CAT_MAP[v]) return CAT_MAP[v];
  var primary = v.split(/[\/·,|]/)[0].replace(/\s/g, '').trim();   // 복합표기 → 앞쪽 주카테고리
  return CAT_MAP[primary] || v;
}

function normalizeCategories() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = findMasterSheet_(ss);
  if (!sh) throw new Error('마스터 탭을 못 찾음.');
  var hr = findHeaderRow_(sh);
  if (hr < 0) throw new Error('헤더행을 못 찾음.');
  var head = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (x) { return String(x || '').replace(/\s/g, ''); });
  var cG = head.indexOf('구분') + 1;
  if (!cG) throw new Error('‘구분’ 열을 못 찾음.');

  var n = sh.getLastRow() - hr;
  if (n < 1) return;
  var col = sh.getRange(hr + 1, cG, n, 1).getValues();
  var out = [], changed = 0, unmapped = {}, tally = {};
  for (var i = 0; i < n; i++) {
    var before = String(col[i][0] == null ? '' : col[i][0]).trim();
    var after = normCat_(before);
    if (after !== before) changed++;
    if (after && !CAT_MAP[after]) unmapped[after] = (unmapped[after] || 0) + 1;
    if (after) tally[after] = (tally[after] || 0) + 1;
    out.push([after]);
  }
  sh.getRange(hr + 1, cG, n, 1).setValues(out);
  var lines = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })
    .map(function (k) { return k + ' ' + tally[k]; }).join(' · ');
  Logger.log('정리 후: ' + lines + '\n미매핑: ' + JSON.stringify(unmapped));
  SpreadsheetApp.getActive().toast('구분 정리 ' + changed + '건 변경 · ' + lines, 'INTERCHARM', 10);
}

// ═══════════════════════════════════════════════════════════════════════════
//  클릭 기록소 — doGet()
//  메일의 링크를 이 주소로 바꿔두면, 누르는 순간 시트에 기록하고 원래 페이지로 보낸다.
//  받는 사람은 못 느낀다(0.5초 이내 자동 이동).
//
//  주소 형태:  <웹앱주소>?c=LAN4077&t=price
//     c = 브랜드 코드(누가)   t = 링크 종류(무엇을)
//
//  배포: 확장 프로그램 → Apps Script → 배포 → 새 배포 → 유형=웹 앱
//        실행: 나  /  액세스 권한: 링크가 있는 모든 사용자   ← ★이거 아니면 남들이 못 씀
// ═══════════════════════════════════════════════════════════════════════════
var LINKS = {
  promo:   'https://siriai-2026intercharmkorea-promotion.vercel.app/?code=',   // 뒤에 코드가 붙는다
  deck:    'https://siriai-business.vercel.app/',
  service: 'https://siriai-business.vercel.app/#service',
  price:   'https://siriai-business.vercel.app/#price',
  home:    'https://siriai.co.kr'
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  var code = String(p.c || '').trim().toUpperCase();
  var t = String(p.t || 'deck').trim();
  var dest = LINKS[t] || LINKS.deck;
  if (t === 'promo') dest += encodeURIComponent(code);

  try { if (code) logClick_(code, t); } catch (err) { /* 기록 실패해도 이동은 시킨다 */ }

  // Apps Script 는 302 를 못 보내므로 즉시 이동시키는 페이지를 돌려준다.
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8">' +
    '<meta http-equiv="refresh" content="0;url=' + dest + '">' +
    '<script>location.replace(' + JSON.stringify(dest) + ');</script>' +
    '<p style="font:14px sans-serif;color:#888">이동 중…</p>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 코드로 행을 찾아 클릭을 기록한다. 클릭=완료, 횟수 +1, 무엇을 눌렀는지 비고에 누적.
function logClick_(code, target) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = findMasterSheet_(SpreadsheetApp.getActiveSpreadsheet());
    if (!sh) return;
    var hr = findHeaderRow_(sh);
    if (hr < 0) return;
    var head = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (x) { return String(x || '').replace(/\s/g, ''); });
    function C(n) { return head.indexOf(n) + 1; }
    var cCode = C('프로모션코드'), cClick = C('브랜드클릭'),
        cCount = C('프로모션코드열람횟수'), cNote = C('비고');
    if (!cCode) return;

    var n = sh.getLastRow() - hr;
    var codes = sh.getRange(hr + 1, cCode, n, 1).getValues();
    var row = -1;
    for (var i = 0; i < n; i++) {
      if (String(codes[i][0] || '').trim().toUpperCase() === code) { row = hr + 1 + i; break; }
    }
    if (row < 0) return;

    if (cClick) sh.getRange(row, cClick).setValue('완료');
    if (cCount) {
      var cur = Number(sh.getRange(row, cCount).getValue()) || 0;
      sh.getRange(row, cCount).setValue(cur + 1);
    }
    if (cNote) {                        // 무엇을 눌렀는지 누적(중복은 안 쌓음)
      var note = String(sh.getRange(row, cNote).getValue() || '');
      if (note.indexOf(target) < 0) {
        sh.getRange(row, cNote).setValue(note ? (note + '·' + target) : ('클릭:' + target));
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// ── 마스터 탭/헤더행 찾기 ─────────────────────────────────────────────────
function findMasterSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var md = sheets[i].getDeveloperMetadata();
    for (var j = 0; j < md.length; j++) if (md[j].getKey() === 'intercharm_master') return sheets[i];
  }
  for (var s = 0; s < sheets.length; s++) if (findHeaderRow_(sheets[s]) > 0) return sheets[s];
  return null;
}
function findHeaderRow_(sh) {
  var lr = Math.min(sh.getLastRow(), 20), lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return -1;
  var top = sh.getRange(1, 1, lr, lc).getValues();
  for (var r = 0; r < top.length; r++) {
    var row = top[r].map(function (x) { return String(x || '').replace(/\s/g, ''); });
    if (row.indexOf('브랜드명') >= 0 && (row.indexOf('담당자이메일') >= 0 || row.indexOf('추가담당자') >= 0)) return r + 1;
  }
  return -1;
}
// 요약 KPI 중 값만 있고 라벨이 빈 칸(명함 수)에 라벨 기입
function fixMemoLabel_(sh, hr) {
  for (var r = 1; r < hr - 1; r++) {
    var lab = String(sh.getRange(r, 3).getValue() || '').trim();
    var val = sh.getRange(r + 1, 3).getValue();
    var aLab = String(sh.getRange(r, 1).getValue() || '').trim();
    if (!lab && aLab.indexOf('총') >= 0 && typeof val === 'number' && val > 0) {
      sh.getRange(r, 3).setValue('명함(현장)');
      return;
    }
  }
}

// ── 코드 생성기 (BuildMaster.gs 와 동일 로직) ────────────────────────────
var C_PLAT = /(smartstore|naver|wechat|instagram|facebook|cafe24|imweb|modoo|shopify|alibaba|linktr|youtube|kakao|tistory|blogspot|wixsite|notion)/i;
var C_FREE = /(gmail|naver|daum|hanmail|nate|outlook|hotmail|yahoo|163|qq|kakao)\./i;
var C_LEGAL = /(주식회사|유한회사|\(주\)|\(유\)|㈜|사단법인|재단법인)/g;
var C_STOP = {};
('official korea global cosmetic cosmetics co ltd inc corp company kr beauty the brand group lab labs shop store world main international trading')
  .split(' ').forEach(function (w) { C_STOP[w] = 1; });
var C_CHO = ['G','GG','N','D','DD','R','M','B','BB','S','SS','','J','JJ','C','K','T','P','H'];

function hangulInit_(s) {
  var r = '', t = String(s || '').replace(C_LEGAL, ' ');
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i) - 0xAC00;
    if (c < 0 || c > 11171) continue;
    var x = C_CHO[Math.floor(c / 588)];
    if (x) r += x.charAt(0);
    if (r.length >= 3) break;
  }
  return r;
}
// 이메일 아이디로 자주 쓰이는 일반명사(브랜드 아님) — 후보에서 제외
var C_GENERIC = {};
('info sales contact help cs office master admin marketing global export overseas biz hello support mail team ' +
 'service manager owner ceo shop store order buy trade partner mkt md pr official kr korea main webmaster')
  .split(' ').forEach(function (w) { C_GENERIC[w] = 1; });

// 브랜드 슬러그 후보 뽑기.
// ① 브랜드명에 영문이 있으면 그게 곧 브랜드 → 그대로 사용
// ② 없으면 홈페이지·인스타·이메일아이디·이메일도메인에서 후보를 모아 "다수결"
//    (센티카: scentica@raint.kr + scentica.co.kr + @scentica_official → scentica 3표 > raint 1표 → SCE)
//    (아트페이스: tenzero.com 1표 vs artface/artfacekorea 2표 → ART)
// ③ 아무것도 없으면 한글 초성(=사업자명)
function codeSource_(r) {
  var parts = String(r.brand || '').split(/[\/;·|]|\(|\)/);
  for (var i = 0; i < parts.length; i++) {
    var l = parts[i].replace(/[^A-Za-z0-9 &]/g, ' ').replace(/^\s+|\s+$/g, '');
    var tok = l.split(/\s+/).filter(function (t) { return /[A-Za-z]/.test(t) && t.length >= 2 && !C_STOP[t.toLowerCase()]; });
    if (tok.join('').replace(/[^A-Za-z]/g, '').length >= 3) return tok;
  }
  var cands = [];   // 우선순위 순서대로 담는다(동점 시 앞선 것이 이김)
  function add(raw) {
    if (!raw) return;
    var s = String(raw).toLowerCase().replace(/[^a-z]/g, '');
    if (s.length >= 3 && !C_STOP[s] && !C_GENERIC[s]) cands.push(s);
  }
  var hm = String(r.home || '').match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\./i);
  if (hm && !C_PLAT.test(r.home)) add(hm[1]);
  var ig = String(r.sns || '').match(/@?([A-Za-z0-9._]{3,})/);
  if (ig && !C_PLAT.test(r.sns)) add(String(ig[1]).replace(/[._](official|kr|global|korea|seoul|cosmetic|beauty|co)$/i, ''));
  var mail = String(r.email || r.pmail || '');
  // ⚠️ 도메인을 아이디보다 먼저 — 아이디는 담당자 사람 이름인 경우가 많다(jkhan@misunggc → JKH 방지).
  //    아이디가 진짜 브랜드면 홈페이지·인스타와 겹쳐서 득표로 이긴다(scentica@raint → SCE).
  var dm = mail.match(/@([a-z0-9-]+)\./i); if (dm && !C_FREE.test(dm[0])) add(dm[1]);    // 이메일 도메인
  var lo = mail.match(/([a-z0-9._-]+)@/i); if (lo) add(lo[1].replace(/[._-].*$/, ''));   // 이메일 아이디

  if (cands.length) {
    function share(a, b) {   // 같거나, 4글자 이상 접두사를 공유하면 같은 이름으로 본다
      if (a === b) return true;
      if (a.length >= 4 && b.indexOf(a) === 0) return true;
      if (b.length >= 4 && a.indexOf(b) === 0) return true;
      return false;
    }
    var best = cands[0], bestScore = -1;
    for (var x = 0; x < cands.length; x++) {
      var score = 0;
      for (var y = 0; y < cands.length; y++) if (share(cands[x], cands[y])) score++;
      if (score > bestScore) { bestScore = score; best = cands[x]; }   // 동점이면 먼저 담긴 쪽 유지
    }
    return [best];
  }
  var h = hangulInit_(r.brand);
  return h.length >= 2 ? [h] : [];
}
function prefix3_(tok) {
  var w = tok.filter(function (t) { return /[A-Za-z]/.test(t); });
  if (!w.length) return 'SIR';
  var p = w.length >= 3 ? (w[0].charAt(0) + w[1].charAt(0) + w[2].charAt(0))
        : w.length === 2 ? (w[0].charAt(0) + w[0].charAt(1) + w[1].charAt(0))
        : w[0].slice(0, 3);
  p = p.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return p.length === 3 ? p : (p + 'XX').slice(0, 3);
}
// ⚠️ JS \W 는 한글을 지움 → 한글 보존해서 해시
function normKeyCode_(b) { return String(b || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); }
function hash4_(key) {
  var h = 5381;
  for (var i = 0; i < key.length; i++) h = (((h * 33) ^ key.charCodeAt(i)) >>> 0);
  return 1000 + (h % 9000);
}

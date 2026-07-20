/**
 * LUN8 마스터 셋업 — 시트 상단 'LUN8' 메뉴 → '모집 동기화' 클릭(또는 setupLun8 실행)이면 끝.
 *   ① 구조 패치: 인스타 콘텐츠①/② · 등급삭제 · 틱톡/인스타 비고 · 최우수(체크)·개별단가(숫자) · 확정메일
 *   ② 모집 응답 → 마스터 sync: 소스 시트별로 '진행사' 자동 태깅 · 신규만 추가 · 'no' 순서대로 자동
 *      확정메일은 마스터가 빈 칸일 때만 모집시트 값으로 채움 — 이후엔 마스터에서 직접 기입/수정(모집시트는 임시 소스)
 * 재실행 안전 — 새 모집자 들어오면 또 눌러도 신규만 추가, 진행사·번호 재정리.
 * (목표 50/50 은 요약 수식이라 별도: 요약에서 200→50 · 100→50 · 300→100 직접 수정)
 *
 * ▼ 모집 소스: 시트마다 진행사 다름. 마루 시트 받으면 아래 줄 주석 풀고 id 넣기.
 */
var LUN8_SOURCES = [
  { id: '1Ov0v2JnLH9aLo0cZ8X1GnsNSOGKNJYfNiL8A3rVG9JU', company: 'SIRIAI' },  // 시리아이 모집시트
  // { id: '<마루 모집시트 id>', company: 'MARU' },   // ← 마루 시트 받으면 여기 활성화
];
var LUN8_TARGET = { tiktok: 50, instagram: 50, overbook: 5 };  // 목표(플랫폼별 검수완료) + 오버부킹 허용.
// overbook = 목표 초과분을 몇 건까지 인정·정산할지(캠페인별. 보통 ~10%, LUN8 합의=5). 인정상한 = (tiktok+instagram)+overbook = 105.

// 시트 열면 상단에 'LUN8' 메뉴 버튼 생성
function onOpen() {
  SpreadsheetApp.getUi().createMenu('LUN8')
    .addItem('모집 동기화 (신규 추가·진행사·번호)', 'setupLun8')
    .addItem('색상 고치기 (조건부서식 → 교차색상, 하이라이트 되게)', 'fixLun8Colors')
    .addToUi();
}

function setupLun8() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();

  // 헤더행 탐지 → 헤더명 기준
  var scan = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 12), sh.getMaxColumns()).getValues();
  var hRow = -1;
  for (var r = 0; r < scan.length; r++) {
    var row = scan[r].map(t);
    if (row.indexOf('크리에이터') >= 0 && row.indexOf('틱톡 닉네임') >= 0) { hRow = r + 1; break; }
  }
  if (hRow < 0) throw new Error('헤더행(크리에이터·틱톡 닉네임)을 못 찾음 — LUN8_마스터 탭 맞는지 확인');
  var DS = hRow + 1, MAXR = sh.getMaxRows(), N = Math.max(1, MAXR - DS + 1);
  var col = function (name) {
    var v = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
    for (var i = 0; i < v.length; i++) if (t(v[i]) === name) return i + 1;
    return 0;
  };

  // ───── ① 구조 패치 (idempotent) ─────
  var hdr = function (c, name) { sh.getRange(hRow, c).setValue(name); };
  var addAfter = function (after, name, opt) {
    if (col(name)) return;
    var a = col(after); if (!a) throw new Error('기준 열 없음: ' + after);
    sh.insertColumnAfter(a); var c = a + 1;              // 왼쪽 열 서식(섹션 색) 상속
    hdr(c, name);
    var rg = sh.getRange(DS, c, N, 1);
    if (opt && opt.check) rg.insertCheckboxes(); else rg.clearDataValidations();
    if (opt && opt.fmt) rg.setNumberFormat(opt.fmt);
    if (opt && opt.w) sh.setColumnWidth(c, opt.w);
  };
  var d = col('댄스'); if (d) hdr(d, '인스타 콘텐츠①');
  var g = col('기획'); if (g) hdr(g, '인스타 콘텐츠②(미러/추가)');
  var gr = col('등급'); if (gr) sh.deleteColumn(gr);
  addAfter('틱톡 공유', '틱톡 비고', { w: 160 });
  addAfter('인스타 공유', '인스타 비고', { w: 160 });
  addAfter('정산방식', '최우수', { check: true, w: 70 });
  addAfter('최우수', '개별단가', { fmt: '#,##0"엔"', w: 90 });
  // 확정메일 = 연락 섹션 끝(업로드 예정일 뒤). '연락처 바로 뒤'(6열)는 요약 격자(4~7열) 한가운데를 갈라서 피함.
  addAfter('업로드 예정일', '확정메일', { w: 90 });
  var cGb = col('개별단가');
  if (cGb) {
    var rgGb = sh.getRange(DS, cGb, N, 1); rgGb.clearDataValidations();
    var gv = rgGb.getValues();
    for (var i = 0; i < gv.length; i++) if (gv[i][0] === true || gv[i][0] === false) gv[i][0] = '';
    rgGb.setValues(gv).setNumberFormat('#,##0"엔"');
  }

  // ───── ② 모집 응답 → 마스터 sync ─────
  var cleanUrl = function (u) { u = t(u); return u ? u.split('?')[0].replace(/\/+$/, '') : ''; };
  var tkH = function (u) { var m = t(u).match(/tiktok\.com\/@([A-Za-z0-9._]+)/i); return m ? m[1].toLowerCase() : ''; };
  var igH = function (u) { var m = t(u).match(/instagram\.com\/([A-Za-z0-9._]+)/i); var h = m ? m[1].toLowerCase() : ''; return /^(p|reel|reels|stories|tv|explore|s|accounts)$/.test(h) ? '' : h; }; // 게시물/릴스 링크는 핸들 아님

  var cNo = col('no'), cCre = col('크리에이터'), cCo = col('진행사'), cMail = col('이메일'), cTel = col('연락처'),
      cTkN = col('틱톡 닉네임'), cTkL = col('틱톡 링크'), cIgN = col('인스타 닉네임'), cIgL = col('인스타 링크'),
      cSched = col('업로드 예정일'), cConf = col('확정메일');
  if (!cCre || !cCo || !cTkL || !cIgL) throw new Error('마스터 필수 열(진행사·크리에이터·틱톡/인스타 링크) 못 찾음');

  // 기존 행 인덱스: key → {row, co(진행사)}. + 마지막 데이터행
  var creVals = sh.getRange(DS, cCre, N, 1).getValues();
  var tkVals = sh.getRange(DS, cTkL, N, 1).getValues();
  var igVals = sh.getRange(DS, cIgL, N, 1).getValues();
  var mailVals = sh.getRange(DS, cMail, N, 1).getValues();
  var coVals = sh.getRange(DS, cCo, N, 1).getValues();
  // 중복판정 세트: 틱톡핸들·인스타핸들·이메일 중 하나라도 겹치면 동일인 (플랫폼 다르게 재제출해도 잡음)
  var seenT = {}, seenI = {}, seenM = {}, lastData = DS - 1;
  for (var i = 0; i < creVals.length; i++) {
    if (t(creVals[i][0]) || t(tkVals[i][0]) || t(igVals[i][0])) {
      var rr = DS + i; lastData = rr;
      var ref0 = { row: rr, co: t(coVals[i][0]) };
      var a0 = tkH(tkVals[i][0]), b0 = igH(igVals[i][0]), m0 = t(mailVals[i][0]).toLowerCase();
      if (a0) seenT[a0] = ref0; if (b0) seenI[b0] = ref0; if (m0) seenM[m0] = ref0;
    }
  }

  var added = 0, tagged = 0, confFilled = 0, writeRow = lastData + 1;
  LUN8_SOURCES.forEach(function (src) {
    var rvals;
    try { rvals = SpreadsheetApp.openById(src.id).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('⚠️ 소스 열기 실패 (' + src.company + ', id=' + src.id + '): ' + e.message + ' — 이 소스 건너뜀'); return; }
    var rHead = rvals[0].map(function (v) { return t(v).toLowerCase(); });
    var rc = function (kw) { kw = kw.toLowerCase(); for (var j = 0; j < rHead.length; j++) if (rHead[j].indexOf(kw) >= 0) return j; return -1; };
    var iName = rc('이름'), iMail = rc('이메일'), iTel = rc('연락처'), iTk = rc('tiktok'), iIg = rc('instagram'), iSched = rc('예정'), iConf = rc('확정');
    for (var r2 = 1; r2 < rvals.length; r2++) {
      var row = rvals[r2];
      var tk = iTk >= 0 ? cleanUrl(row[iTk]) : '', ig = iIg >= 0 ? cleanUrl(row[iIg]) : '', mail = iMail >= 0 ? t(row[iMail]) : '';
      var a = tkH(tk), b = igH(ig), m = mail.toLowerCase();
      if (!a && !b && !m) continue;                     // 식별자 하나도 없으면 스킵
      var ex = (a && seenT[a]) || (b && seenI[b]) || (m && seenM[m]);   // 틱톡·인스타·이메일 중 하나라도 겹치면 동일인
      if (ex) {                                          // 이미 있음 → 진행사·예정일·확정메일 비었으면 채움(backfill)
        if (!ex.co) { sh.getRange(ex.row, cCo).setValue(src.company); ex.co = src.company; tagged++; }
        if (iSched >= 0 && cSched) { var sd0 = row[iSched]; if (sd0 !== '' && sd0 != null && !t(sh.getRange(ex.row, cSched).getValue())) sh.getRange(ex.row, cSched).setValue(sd0); }
        // 확정메일: 마스터가 비었을 때만 채움 — 모집시트는 임시 소스라, 마스터에서 고친 값을 되돌리지 않는다.
        if (iConf >= 0 && cConf && t(row[iConf]) && !t(sh.getRange(ex.row, cConf).getValue())) { sh.getRange(ex.row, cConf).setValue(t(row[iConf])); confFilled++; }
        continue;
      }
      var rw = writeRow + added;                         // 신규 append (진행사 태깅)
      sh.getRange(rw, cCo).setValue(src.company);
      if (iName >= 0) sh.getRange(rw, cCre).setValue(t(row[iName]));
      if (mail && cMail) sh.getRange(rw, cMail).setValue(mail);
      if (iTel >= 0 && cTel) sh.getRange(rw, cTel).setValue(t(row[iTel]));
      if (tk) { sh.getRange(rw, cTkL).setValue(tk); if (cTkN) sh.getRange(rw, cTkN).setValue(tkH(tk)); }
      if (ig) { sh.getRange(rw, cIgL).setValue(ig); if (cIgN) sh.getRange(rw, cIgN).setValue(igH(ig)); }
      if (iSched >= 0 && cSched) { var sd = row[iSched]; if (sd !== '' && sd != null) sh.getRange(rw, cSched).setValue(sd); }
      if (iConf >= 0 && cConf && t(row[iConf])) { sh.getRange(rw, cConf).setValue(t(row[iConf])); confFilled++; }
      var ref2 = { row: rw, co: src.company };
      if (a) seenT[a] = ref2; if (b) seenI[b] = ref2; if (m) seenM[m] = ref2;
      added++;
    }
  });

  // ───── ③ no 자동 — 채워진 행 순서대로 1,2,3… (빈 칸은 그대로 둠) ─────
  var lastAll = lastData + added;
  if (cNo && lastAll >= DS) {
    var creAll = sh.getRange(DS, cCre, lastAll - DS + 1, 1).getValues();
    var tkAll = sh.getRange(DS, cTkL, lastAll - DS + 1, 1).getValues();
    var igAll = sh.getRange(DS, cIgL, lastAll - DS + 1, 1).getValues();
    var noRg = sh.getRange(DS, cNo, lastAll - DS + 1, 1), noVals = noRg.getValues(), cnt = 0;
    for (var i = 0; i < noVals.length; i++) {
      if (t(creAll[i][0]) || t(tkAll[i][0]) || t(igAll[i][0])) noVals[i][0] = ++cnt;
    }
    noRg.setValues(noVals);
  }

  // ───── ④ 요약: 목표(50/50) · 모집 계정 · 하단 재배치(검수완료 넓게 + 참여율/미입금 아래) ─────
  // 열: N=14(검수완료 라벨) O=15(값) P=16(참여율 라벨) Q=17(값). 행5=모집/검수완료, 행6=미러링/미입금.
  var summaryMsg = '';
  try {
    var TK = LUN8_TARGET.tiktok, IG = LUN8_TARGET.instagram, TOT = TK + IG, OB = LUN8_TARGET.overbook || 0;
    var reTgt = /\/\s*\d+/;
    // 요약 좌표는 '라벨을 찾아서' 잡는다 — 열을 추가·이동해도 안 깨지게. (예전엔 K3/N3/14 하드코딩이라
    // 앞쪽에 열 하나만 끼워도 엉뚱한 셀에 서식·수식을 써버렸음.)
    var findCol = function (rowNum, re) {
      var to = Math.min(sh.getLastColumn(), 30);
      if (to < 8) return 0;
      var vals = sh.getRange(rowNum, 8, 1, to - 7).getValues()[0];
      for (var i = 0; i < vals.length; i++) if (re.test(t(vals[i]))) return 8 + i;
      return 0;
    };
    // (a) 목표 치환 — 수식/값/서식 어디에 있든 그 숫자만 교체. 못 찾으면 무해(no-op).
    var rep = function (s, from, to) { return s.replace(new RegExp('(?<![0-9.])' + from + '(?![0-9])', 'g'), to); }; // 온전한 토큰만 (1000·$..408 오손 방지)
    var repl = function (rw, cl, from, to) {
      var rg = sh.getRange(rw, cl), f = rg.getFormula();
      if (f) { var f2 = rep(f, from, to); if (f2 !== f) rg.setFormula(f2); }
      else { var v = rg.getValue(); if (typeof v === 'string') { var v2 = rep(v, from, to); if (v2 !== v) rg.setValue(v2); } }
      var nf = rg.getNumberFormat(); if (nf) { var nf2 = rep(nf, from, to); if (nf2 !== nf) rg.setNumberFormat(nf2); }
    };
    // 행3 '🎵 틱톡' / 행4 '📸 인스타' 라벨 기준 +1(값) +2(병합) +4(%) +5(남은 수)
    var aTk = findCol(3, /틱톡/), aIg = findCol(4, /인스타/);
    if (aTk) [1, 2, 4, 5].forEach(function (o) { repl(3, aTk + o, '200', String(TK)); });   // 틱톡 목표
    if (aIg) [1, 2, 4, 5].forEach(function (o) { repl(4, aIg + o, '100', String(IG)); });   // 인스타 목표
    // (b) '모집' → 모집 계정(틱톡/인스타 링크 수)
    var Lc = function (c) { var s = ''; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
    var acctF = '="틱톡 "&COUNTIF($' + Lc(cTkL) + '$' + DS + ':$' + Lc(cTkL) + '$408,"?*")&"  /  인스타 "&COUNTIF($' + Lc(cIgL) + '$' + DS + ':$' + Lc(cIgL) + '$408,"?*")';
    var sArea = sh.getRange(2, 1, 6, 20).getValues();
    for (var sr = 0; sr < sArea.length; sr++) for (var sc = 0; sc < sArea[sr].length; sc++) {
      if (String(sArea[sr][sc]).trim() === '모집') { sh.getRange(2 + sr, 1 + sc).setValue('모집 계정'); sh.getRange(2 + sr, 2 + sc).setFormula(acctF); }
    }
    // (c) 요약 격자(D4:G6) 카운트 범위 $100 → $408 (오버부킹·미러링 여유·확장 대비. 템플릿 400행 커버)
    var grid = sh.getRange(4, 4, 3, 4), gf = grid.getFormulas(), gChanged = false;
    for (var gr = 0; gr < gf.length; gr++) for (var gc = 0; gc < gf[gr].length; gc++) {
      if (gf[gr][gc]) { var g2 = gf[gr][gc].replace(/\$100(?![0-9])/g, '$408'); if (g2 !== gf[gr][gc]) { gf[gr][gc] = g2; gChanged = true; } }
    }
    if (gChanged) grid.setFormulas(gf);
    // (d) 하단 재배치 — '원래 배치'(미입금@N6 & 참여율@P5)일 때만 실행. 이미 됐거나 부분상태면 안 건드림(오손 방지).
    //     행5: cN=검수완료 라벨, cO:cQ 병합=값 | 행6: cN=참여율·cO=값, cP=미입금·cQ=값
    var cN = findCol(5, /^검수완료$/) || 14, cO = cN + 1, cP = cN + 2;   // '검수완료' 라벨 위치가 기준 (재배치 전·후 모두 행5에 있음)
    var origLayout = String(sh.getRange(6, cN).getValue()).trim() === '미입금' && String(sh.getRange(5, cP).getValue()).trim() === '참여율';
    if (origLayout) {
      sh.getRange(5, cN, 2, 4).breakApart();                      // N5:Q6 병합 해제
      sh.getRange(6, cN, 1, 2).copyTo(sh.getRange(6, cP, 1, 2));  // 미입금(N6:O6) → P6:Q6
      sh.getRange(5, cP, 1, 2).copyTo(sh.getRange(6, cN, 1, 2));  // 참여율(P5:Q5) → N6:O6
      sh.getRange(5, cP, 1, 2).clearContent();                    // 옛 참여율 자리 비움
      sh.getRange(5, cO, 1, 3).merge();                           // 검수완료 값 O5:Q5 넓게
    }
    // 검수완료 값칸(cO, 병합됨) 서식: "X / 100 (+5)" — 넓어서 안 넘침. 매번 최신 목표·오버부킹 반영.
    var vc = sh.getRange(5, cO), vf = vc.getFormula();
    if (vf && reTgt.test(vf)) vc.setFormula(vf.replace(reTgt, '/ ' + TOT));
    vc.setNumberFormat('0" / ' + TOT + (OB ? ' (+' + OB + ')' : '') + '"');
    summaryMsg = ' · 요약 목표 ' + TK + '/' + IG + ' · 모집계정 · 검수완료 넓게(+' + OB + ') · 참여율/미입금 재배치';
  } catch (e) { summaryMsg = ' · ⚠️ 요약 자동수정 실패(' + e.message + ') 수동확인'; }

  // ───── ⑤ 확정메일 미발송 집계 — 누가 아직 안 받았는지 실행 즉시 보이게 ─────
  var confMsg = '';
  if (cConf) {
    var lastAll2 = lastData + added, pend = [];
    if (lastAll2 >= DS) {
      var cfAll = sh.getRange(DS, cConf, lastAll2 - DS + 1, 1).getValues();
      var creAll2 = sh.getRange(DS, cCre, lastAll2 - DS + 1, 1).getValues();
      var tkAll2 = sh.getRange(DS, cTkL, lastAll2 - DS + 1, 1).getValues();
      var igAll2 = sh.getRange(DS, cIgL, lastAll2 - DS + 1, 1).getValues();
      for (var ci = 0; ci < cfAll.length; ci++) {
        var live = t(creAll2[ci][0]) || t(tkAll2[ci][0]) || t(igAll2[ci][0]);
        if (live && !t(cfAll[ci][0])) pend.push(t(creAll2[ci][0]) || ('행' + (DS + ci)));
      }
    }
    confMsg = ' · 확정메일 ' + confFilled + '명 채움' + (pend.length ? ' · ⚠️ 미발송 ' + pend.length + '명: ' + pend.join(', ') : ' · 미발송 없음');
  }

  var msg = '✅ LUN8 셋업 완료 — 신규 ' + added + '명 추가, 진행사 ' + tagged + '명 소급 태깅, 번호 재정리' + confMsg + summaryMsg + '.';
  try { ss.toast(msg, 'LUN8', 8); } catch (e) {}
  Logger.log(msg);
}

/**
 * 색상 고치기 — LUN8 메뉴에서 실행.
 * 데이터행(9행~)에 걸린 조건부서식(수동 하이라이트를 덮던 원인)을 제거하고 교차색상(줄무늬)으로 대체.
 * 요약행(1~8) 조건부서식은 보존. 셀에 섹션색(수동)이 깔려있으면 그 위엔 줄무늬가 안 보일 수 있지만 무해 —
 * 핵심은 이제 수동 하이라이트가 먹는다는 것.
 */
function fixLun8Colors() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var scan = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 12), sh.getMaxColumns()).getValues(), hRow = -1;
  for (var r = 0; r < scan.length; r++) {
    var row = scan[r].map(function (v) { return String(v || '').trim(); });
    if (row.indexOf('크리에이터') >= 0 && row.indexOf('틱톡 닉네임') >= 0) { hRow = r + 1; break; }
  }
  if (hRow < 0) throw new Error('헤더행(크리에이터·틱톡 닉네임) 못 찾음 — LUN8_마스터 탭 확인');
  var DS = hRow + 1, maxRow = sh.getMaxRows(), lastCol = sh.getLastColumn();

  // 1. 데이터행에 걸린 조건부서식만 제거 (요약행 규칙 보존)
  var rules = sh.getConditionalFormatRules(), kept = [], removed = 0;
  rules.forEach(function (rl) {
    var hit = rl.getRanges().some(function (rg) { return rg.getLastRow() >= DS; });
    if (hit) removed++; else kept.push(rl);
  });
  sh.setConditionalFormatRules(kept);

  // 2. 데이터행 교차색상 — 기존 밴딩 제거 후 적용 (방어적)
  var applied = false;
  try {
    sh.getBandings().forEach(function (bd) { try { if (bd.getRange().getLastRow() >= DS) bd.remove(); } catch (e) {} });
    sh.getRange(DS, 1, maxRow - DS + 1, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
    applied = true;
  } catch (e) {}

  var msg = '✅ 색상 정리 — 데이터행 조건부서식 ' + removed + '개 제거' + (applied ? ' + 교차색상 적용' : '') + '. 이제 수동 하이라이트 됩니다.';
  try { ss.toast(msg, 'LUN8', 7); } catch (e) {}
  Logger.log(msg);
}

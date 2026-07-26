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
  { id: '1slDXWW_S6HUUptAxRJ6VcgmXPPcO2lJJIOGVFwMOFmY', company: 'MARU' },    // 마루 모집시트(7/23~29 폼)
];
var LUN8_TARGET = { tiktok: 50, instagram: 50, overbook: 5 };  // 목표(플랫폼별 검수완료) + 오버부킹 허용.
var LUN8_REFER_FEE = 3000;   // 친구 1명 소개당 추가 정산(엔). 바뀌면 여기만 고치고 '① 연락열 정리' 재실행.
// overbook = 목표 초과분을 몇 건까지 인정·정산할지(캠페인별. 보통 ~10%, LUN8 합의=5). 인정상한 = (tiktok+instagram)+overbook = 105.

// 시트 열면 상단에 'LUN8' 메뉴 버튼 생성
function onOpen() {
  SpreadsheetApp.getUi().createMenu('LUN8')
    .addItem('① 연락열 정리 (확정메일·추천인) — 처음 한 번', 'restructureLun8Contact')
    .addItem('② 모집 동기화 (신규 추가·진행사·번호·확정메일·추천인)', 'setupLun8')
    .addItem('③ 확정일 열 추가 — 처음 한 번', 'addLun8ConfirmedDate')
    .addItem('④ 일반 비고 열 추가 — 처음 한 번', 'addLun8Memo')
    .addSeparator()
    .addItem('응대 매뉴얼 · 가이드라인 탭 만들기', 'buildLun8Docs')
    .addItem('드롭다운 어휘 맞추기 (미러링·우수 선정)', 'fixLun8Dropdowns')
    .addItem('요약 폭 정리 (합계 H:I · 진행율 당기기)', 'fixLun8Summary')
    .addItem('가드닝 열 정리 (값 통일·색·인스타 오염 청소)', 'fixLun8Gardening')
    .addItem('색상 고치기 (조건부서식 → 교차색상, 하이라이트 되게)', 'fixLun8Colors')
    .addToUi();
}

// 헤더행(크리에이터 + 틱톡 닉네임이 같이 있는 줄) 찾기 — 함수마다 다시 짜지 않게 공용.
function lun8Head_(sh) {
  var scan = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 12), sh.getMaxColumns()).getValues();
  for (var r = 0; r < scan.length; r++) {
    var row = scan[r].map(function (v) { return String(v == null ? '' : v).trim(); });
    if (row.indexOf('크리에이터') >= 0 && row.indexOf('틱톡 닉네임') >= 0) return r + 1;
  }
  throw new Error('헤더행(크리에이터·틱톡 닉네임)을 못 찾음 — LUN8_마스터 탭 맞는지 확인');
}
function lun8Toast_(ss, msg) { try { ss.toast(msg, 'LUN8', 8); } catch (e) {} Logger.log(msg); }

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
  // 확정메일·추천인 열은 '① 연락열 정리'가 만든다 (요약 격자를 안 깨는 순서로 이동·삭제가 필요해서 별도 함수).
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
      cSched = col('업로드 예정일'), cConf = col('확정메일'), cRef = col('추천인');
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

  var added = 0, tagged = 0, confFilled = 0, referred = 0, writeRow = lastData + 1;
  LUN8_SOURCES.forEach(function (src) {
    var rvals;
    try { rvals = SpreadsheetApp.openById(src.id).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('⚠️ 소스 열기 실패 (' + src.company + ', id=' + src.id + '): ' + e.message + ' — 이 소스 건너뜀'); return; }
    var rHead = rvals[0].map(function (v) { return t(v).toLowerCase(); });
    var rc = function (kw) { kw = kw.toLowerCase(); for (var j = 0; j < rHead.length; j++) if (rHead[j].indexOf(kw) >= 0) return j; return -1; };
    /* 여러 이름 중 먼저 걸리는 것. 마루 폼은 헤더가 일본어라 한국어 키워드로는
       한 칸도 못 찾았다 — 그대로 돌리면 0명 추가하고 '성공'이라고 답한다(제일 나쁜 결과). */
    var rcAny = function (list) { for (var i = 0; i < list.length; i++) { var j = rc(list[i]); if (j >= 0) return j; } return -1; };
    var iName  = rcAny(['이름', 'お名前', '名前', 'name']);
    var iMail  = rcAny(['이메일', 'メール', 'mail']);
    var iTel   = rcAny(['연락처', '電話', 'tel']);
    var iSched = rcAny(['예정', '予定']);
    var iConf  = rcAny(['확정', '確定']);
    /* 마루 폼은 틱톡·인스타 열이 따로 없다. '참가 희망 SNS'(TikTok/Instagram)와
       'SNS 링크' 한 칸으로 되어 있어, 링크 하나를 그 선택값에 따라 갈라 넣어야 한다.
       아이디 칸(＠전각 포함)은 링크가 lite.tiktok 단축주소일 때의 대비책이다. */
    var iPlat  = rcAny(['参加を希望するsns', '希望するsns', '플랫폼']);
    var iLink  = rcAny(['リンク', 'url']);
    var iSnsId = rcAny(['id（ユーザー名）', 'ユーザー名', 'sns의 id']);
    var iTk = rc('tiktok'), iIg = rc('instagram');
    // 위 두 칸을 못 찾았고 '선택+링크' 형태면, 행마다 갈라 넣는다(아래 pickLinks).
    var splitMode = (iTk < 0 && iIg < 0 && iLink >= 0 && iPlat >= 0);
    if (splitMode) Logger.log('ℹ️ ' + src.company + ': 플랫폼 선택+링크 한 칸 형식으로 읽습니다.');
    else if (iTk < 0 && iIg < 0) {
      Logger.log('⚠️ ' + src.company + ': 틱톡·인스타 열을 못 찾았어요 — 이 소스 건너뜁니다(헤더 확인 필요).');
      return;
    }
    /* 한 행에서 (틱톡링크, 인스타링크)를 뽑는다.
       링크가 lite.tiktok.com 단축주소면 핸들을 못 뽑으므로 아이디 칸으로 만들어 준다
       (전각 ＠·앞뒤 공백 제거). 실제로 마루 시트에 3건 있었다. */
    var pickLinks = function (row) {
      if (!splitMode) return [iTk >= 0 ? cleanUrl(row[iTk]) : '', iIg >= 0 ? cleanUrl(row[iIg]) : ''];
      var pv = t(row[iPlat]).toLowerCase();
      var isIg = pv.indexOf('instagram') >= 0 || pv.indexOf('インスタ') >= 0;
      var link = cleanUrl(row[iLink]);
      var id = iSnsId >= 0 ? t(row[iSnsId]).replace(/[＠@]/g, '').replace(/\s+/g, '') : '';
      // 단축주소·빈 링크는 아이디로 대체
      var bad = !link || link.indexOf('lite.tiktok.com') >= 0 || !/(tiktok|instagram)\.com/i.test(link);
      if (bad && id) link = isIg ? 'https://www.instagram.com/' + id : 'https://www.tiktok.com/@' + id;
      if (!link) return ['', ''];
      return isIg ? ['', link] : [link, ''];
    };

    // 친구 소개 선반영: '친구N SNS링크/이메일' 칸을 먼저 훑어 (소개받은 사람 → 소개한 사람) 지도를 만든다.
    // 소개받은 쪽이 명단에 먼저 나올 수도 있어서 본 루프 전에 한 번에 모아둔다.
    var refByH = {}, refByM = {};
    for (var p = 1; p < rvals.length; p++) {
      var pr = rvals[p], who = iName >= 0 ? t(pr[iName]) : '';
      if (!who) continue;
      for (var fc = 0; fc < rHead.length; fc++) {
        if (rHead[fc].indexOf('친구') < 0) continue;
        var fv = t(pr[fc]); if (!fv) continue;
        var fh = tkH(fv) || igH(fv);
        if (fh) { if (!refByH[fh]) refByH[fh] = who; continue; }
        var fm = fv.match(/[\w.+-]+@[\w.-]+\.\w+/);           // '메일 보냄' 같은 메모가 섞여 있어 주소만 뽑음
        if (fm && !refByM[fm[0].toLowerCase()]) refByM[fm[0].toLowerCase()] = who;
      }
    }

    for (var r2 = 1; r2 < rvals.length; r2++) {
      var row = rvals[r2];
      var _lk = pickLinks(row);
      var tk = _lk[0], ig = _lk[1], mail = iMail >= 0 ? t(row[iMail]) : '';
      var a = tkH(tk), b = igH(ig), m = mail.toLowerCase();
      if (!a && !b && !m) continue;                     // 식별자 하나도 없으면 스킵
      var ex = (a && seenT[a]) || (b && seenI[b]) || (m && seenM[m]);   // 틱톡·인스타·이메일 중 하나라도 겹치면 동일인
      var refer = (a && refByH[a]) || (b && refByH[b]) || (m && refByM[m]) || '';   // 나를 소개해준 사람
      if (ex) {                                          // 이미 있음 → 진행사·예정일·확정메일 비었으면 채움(backfill)
        if (!ex.co) { sh.getRange(ex.row, cCo).setValue(src.company); ex.co = src.company; tagged++; }
        if (iSched >= 0 && cSched) { var sd0 = row[iSched]; if (sd0 !== '' && sd0 != null && !t(sh.getRange(ex.row, cSched).getValue())) sh.getRange(ex.row, cSched).setValue(sd0); }
        // 확정메일: 마스터가 비었을 때만 채움 — 모집시트는 임시 소스라, 마스터에서 고친 값을 되돌리지 않는다.
        if (iConf >= 0 && cConf && t(row[iConf]) && !t(sh.getRange(ex.row, cConf).getValue())) { sh.getRange(ex.row, cConf).setValue(t(row[iConf])); confFilled++; }
        if (refer && cRef && !t(sh.getRange(ex.row, cRef).getValue())) { sh.getRange(ex.row, cRef).setValue(refer); referred++; }
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
      if (refer && cRef) { sh.getRange(rw, cRef).setValue(refer); referred++; }
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
  if (referred) confMsg += ' · 추천인 ' + referred + '명 자동기입';

  var msg = '✅ LUN8 셋업 완료 — 신규 ' + added + '명 추가, 진행사 ' + tagged + '명 소급 태깅, 번호 재정리' + confMsg + summaryMsg + '.';
  try { ss.toast(msg, 'LUN8', 8); } catch (e) {}
  Logger.log(msg);
}

/**
 * ① 연락열 정리 — 처음 한 번만. 확정메일을 정산 섹션에서 연락 섹션으로 옮기고, 추천 출처/추천 수를 '추천인' 하나로 정리.
 *
 * ⚠️ 왜 '삭제·삽입'이 아니라 '이름 바꾸기'인가:
 *    요약 격자가 4~7열(진행사 × 틱톡/인스타), 합계가 8~9열을 쓴다. 데이터 헤더와 같은 열을 위아래로 공유한다는 뜻.
 *    그래서 7열을 지우면 요약의 '인스타 기획' 칸이 같이 지워지고, 열을 끼우면 격자가 갈라진다.
 *    → 4~17열 안에서는 구조를 절대 안 건드리고 헤더 이름만 바꾼다. 지우는 건 요약 밖(17열 초과)뿐.
 *
 * 결과 배치: 이메일 · 연락처 · 확정메일 · 추천인 · 업로드 예정일   (요청하신 순서에서 추천인↔업로드 예정일만 뒤바뀜 — 위 이유)
 * 정산 섹션엔 '추천 수'(자동 집계) · '추천 보너스'(자동 계산)가 붙는다.
 */
function restructureLun8Contact() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var hRow = lun8Head_(sh), DS = hRow + 1, LASTR = 408, N = Math.max(1, sh.getMaxRows() - DS + 1);
  var col = function (name) {
    var v = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
    for (var i = 0; i < v.length; i++) if (t(v[i]) === name) return i + 1;
    return 0;
  };
  var Lc = function (c) { var s = ''; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
  var hasData = function (c) {
    if (!c) return false;
    var v = sh.getRange(DS, c, N, 1).getValues();
    for (var i = 0; i < v.length; i++) if (t(v[i][0])) return true;
    return false;
  };

  var log = [];
  var cConf0 = col('확정메일'), cSrc = col('추천 출처'), cCnt = col('추천 수');

  // ── 이미 정리됐으면 종료 ──
  if (col('추천인') && cConf0 && cConf0 < 10) { lun8Toast_(ss, '이미 정리돼 있어요. (확정메일 ' + cConf0 + '열 · 추천인 ' + col('추천인') + '열)'); return; }

  // ── 덮어쓸 칸에 값이 있으면 중단 (사람이 뭔가 적어둔 걸 조용히 날리지 않게) ──
  if (hasData(cSrc)) throw new Error("'추천 출처' 열에 값이 들어있어요. 확정메일 자리로 쓰려던 칸이라, 먼저 그 값을 옮기거나 지운 뒤 다시 실행하세요.");
  if (hasData(cCnt)) throw new Error("'추천 수' 열에 값이 들어있어요. 추천인 자리로 쓰려던 칸이라, 먼저 그 값을 옮기거나 지운 뒤 다시 실행하세요.");

  // ── ① 기존 확정메일 값 백업 (정산 섹션에 있던 것) ──
  var keep = null;
  if (cConf0) { keep = sh.getRange(DS, cConf0, N, 1).getValues(); log.push('확정메일 값 ' + cConf0 + '열에서 백업'); }

  // ── ② 제자리 이름 바꾸기: 추천 출처 → 확정메일, 추천 수 → 추천인 ──
  if (cSrc) { sh.getRange(hRow, cSrc).setValue('확정메일'); sh.setColumnWidth(cSrc, 95); log.push('추천 출처 → 확정메일(' + cSrc + '열)'); }
  if (cCnt) { sh.getRange(hRow, cCnt).setValue('추천인'); sh.setColumnWidth(cCnt, 120); log.push('추천 수 → 추천인(' + cCnt + '열)'); }
  var cConf = col('확정메일'), cRef = col('추천인');
  if (!cConf || !cRef) throw new Error('확정메일·추천인 열을 못 만들었어요 — 헤더에 "추천 출처"·"추천 수"가 있는지 확인하세요.');

  // ── ③ 백업한 확정메일 값 복원 + 옛 열 삭제 (옛 열은 요약 밖이라 삭제해도 안전) ──
  if (keep) {
    sh.getRange(DS, cConf, keep.length, 1).setValues(keep);
    var cOld = 0, hv = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
    for (var i = hv.length - 1; i >= 0; i--) if (t(hv[i]) === '확정메일' && (i + 1) !== cConf) { cOld = i + 1; break; }
    if (cOld > 17) { sh.deleteColumn(cOld); log.push('옛 확정메일 열(' + cOld + ') 삭제'); }
    else if (cOld) log.push('⚠️ 옛 확정메일 열이 ' + cOld + '열(요약 영역)이라 안 지움 — 직접 확인 필요');
  }

  // ── ④ 추천인 드롭다운: 크리에이터 목록에서 고르게 (오타로 집계가 어긋나는 걸 막음) ──
  var cCre = col('크리에이터');
  try {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(sh.getRange(DS, cCre, LASTR - DS + 1, 1), true)
      .setAllowInvalid(true)
      .setHelpText('나를 소개해준 사람을 고르세요. 목록에 없으면 직접 입력해도 됩니다.')
      .build();
    sh.getRange(DS, cRef, LASTR - DS + 1, 1).setDataValidation(rule);
    log.push('추천인 드롭다운 적용');
  } catch (e) { log.push('⚠️ 추천인 드롭다운 실패: ' + e.message); }

  // ── ⑤ 정산 섹션: 추천 수(자동 집계) · 추천 보너스(자동 계산) ──
  // A가 B·C를 소개하면 B·C 행의 '추천인'에 A. 그러면 A 행의 추천 수가 저절로 2가 된다. 사람이 세지 않는다.
  var addAfter = function (after, name, w) {
    if (col(name)) return col(name);
    var a = col(after); if (!a) throw new Error('기준 열 없음: ' + after);
    sh.insertColumnAfter(a); var c = a + 1;
    sh.getRange(hRow, c).setValue(name);
    sh.getRange(DS, c, N, 1).clearDataValidations();
    if (w) sh.setColumnWidth(c, w);
    return c;
  };
  var cRc = addAfter('개별단가', '추천 수', 80);
  var cRb = addAfter('추천 수', '추천 보너스', 110);
  var refA = '$' + Lc(cRef) + '$' + DS + ':$' + Lc(cRef) + '$' + LASTR;
  var fc = [], fb = [];
  for (var r = DS; r <= LASTR; r++) {
    var cre = '$' + Lc(cCre) + r;
    fc.push(['=IF(' + cre + '="","",COUNTIF(' + refA + ',' + cre + '))']);
    fb.push(['=IF(' + cre + '="","",' + Lc(cRc) + r + '*' + LUN8_REFER_FEE + ')']);
  }
  sh.getRange(DS, cRc, fc.length, 1).setFormulas(fc);
  sh.getRange(DS, cRb, fb.length, 1).setFormulas(fb).setNumberFormat('#,##0"엔"');
  log.push('정산에 추천 수·추천 보너스(' + LUN8_REFER_FEE.toLocaleString() + '엔/명) 수식 적용');

  lun8Toast_(ss, '✅ 연락열 정리 완료 — ' + log.join(' · ') + '. 이제 ②모집 동기화를 누르세요.');
}

/**
 * ③ 확정일 열 추가 — 처음 한 번만.
 *
 * '업로드 예정일'은 크리에이터가 스스로 적어 낸 희망일이고, '확정일'은 우리와 합의된 날짜다.
 * 둘을 한 칸에 두면 누가 언제 바꿨는지 알 수 없어 독촉·집계 기준이 흔들린다.
 *
 * ⚠️ 요약 블록(2~6행)이 1~17열을 덮고 있어서, 그 안에 열을 끼우면 병합이 한 칸씩 밀린다.
 *    특히 '합계'(8~9열 병합)가 8~10으로 넓어진다 — 값·수식은 자동으로 따라가므로 안 깨지고
 *    칸 너비만 어긋난다. 아래에서 그 병합을 원래 폭으로 되돌린다.
 */
function addLun8ConfirmedDate() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var hRow = lun8Head_(sh), DS = hRow + 1;
  var col = function (name) {
    var v = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
    for (var i = 0; i < v.length; i++) if (t(v[i]) === name) return i + 1;
    return 0;
  };
  if (col('확정일')) { lun8Toast_(ss, '이미 있어요 — 확정일 ' + col('확정일') + '열.'); return; }
  var cSched = col('업로드 예정일');
  if (!cSched) throw new Error("'업로드 예정일' 열을 못 찾았어요.");

  // 넣기 전에 요약의 가로 병합 폭을 기억해둔다(2~6행). 넣고 나서 원래 폭으로 되돌리기 위함.
  var before = [];
  sh.getRange(2, 1, 5, 20).getMergedRanges().forEach(function (r) {
    before.push({ row: r.getRow(), col: r.getColumn(), rows: r.getNumRows(), cols: r.getNumColumns() });
  });

  sh.insertColumnAfter(cSched);
  var c = cSched + 1;
  sh.getRange(hRow, c).setValue('확정일');
  sh.setColumnWidth(c, 90);
  var N = Math.max(1, sh.getMaxRows() - DS + 1);
  sh.getRange(DS, c, N, 1).clearDataValidations().setNumberFormat('m". "d');

  // 삽입 지점보다 오른쪽에서 시작하는 병합은 통째로 밀렸을 뿐이라 그대로 두고,
  // 삽입 지점을 '가로지른' 병합만 원래 폭으로 되돌린다(그것만 한 칸 넓어졌다).
  var fixed = 0;
  before.forEach(function (m) {
    if (!(m.col < c && m.col + m.cols > c)) return;   // 가로지르지 않음 → 손대지 않는다
    var now = sh.getRange(m.row, m.col, m.rows, m.cols + 1);
    try { now.breakApart(); } catch (e) {}
    try { sh.getRange(m.row, m.col, m.rows, m.cols).merge(); fixed++; } catch (e) {}
  });

  lun8Toast_(ss, '✅ 확정일 열 추가 — ' + c + '열(업로드 예정일 옆). 요약 병합 ' + fixed + '개 원래 폭으로 복원. '
    + '예정일은 크리에이터가 낸 희망일, 확정일은 합의된 날짜로 쓰세요.');
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

/**
 * 응대 매뉴얼 · 가이드라인 탭 만들기 — LUN8 메뉴에서 실행.
 * 이미 내용이 있으면 덮어쓰지 않는다(팀이 적어둔 걸 날리지 않게). 서식만 다시 맞춘다.
 *
 * 매뉴얼 = 문의가 오면 그대로 복사해 답장하는 스크립트. 계속 늘어난다 → 팀이 여기에 행을 추가.
 * 가이드라인 = 캠페인 사양. 한 번 쓰고 고정. 이메일을 다시 뒤지지 않는 게 목적.
 * [확인필요] = 아직 안 채운 자리. 그대로 크리에이터에게 보내지 말 것.
 */
var LUN8_MANUAL_ROWS = [
  ['음원', '틱톡에서 지정 음원을 어떻게 찾나요?',
   '안녕하세요! 지정 음원은 아래 링크에서 바로 사용하실 수 있어요.\n\n[확인필요] 음원 링크\n\n링크를 눌러 → 우측 하단 [이 사운드 사용하기] → 촬영/업로드 순으로 진행하시면 됩니다.\n검색으로 찾으실 경우 동명의 다른 음원이 있을 수 있어서, 꼭 위 링크로 들어가 주세요.',
   'こんにちは！指定楽曲は下記のリンクからそのままご使用いただけます。\n\n[확인필요] 音源リンク\n\nリンクを開く → 右下の[この楽曲を使う] → 撮影・アップロードの順で進めてください。\n検索の場合、同名の別音源が出てくることがありますので、必ず上記リンクからお願いいたします。'],
  ['음원', '음원 구간이 정해져 있나요?',
   '네, 지정 구간이 있어요.\n\n[확인필요] 사용 구간\n\n이 구간이 영상에 포함되어야 검수를 통과할 수 있어요. 영상 전체 길이는 자유롭게 하셔도 괜찮습니다.',
   'はい、指定区間がございます。\n\n[확인필요] 使用区間\n\nこの区間が動画に含まれている必要がございます。動画全体の長さは自由で問題ありません。'],
  ['음원', '인스타 릴스에 같은 음원이 안 보여요.',
   '릴스는 계정 종류에 따라 일부 음원이 표시되지 않을 수 있어요.\n\n혹시 비즈니스 계정을 쓰고 계시다면, 크리에이터 계정으로 전환하시면 대부분 해결됩니다.\n그래도 안 보이시면, 업로드 화면 스크린샷을 보내주세요. 저희가 확인 후 대체 방법을 안내드릴게요.',
   'リールズはアカウントの種類によって一部の音源が表示されないことがございます。\n\nビジネスアカウントをご利用の場合、クリエイターアカウントに切り替えると解決することが多いです。\nそれでも表示されない場合は、アップロード画面のスクリーンショットをお送りください。確認のうえ、代替方法をご案内いたします。'],
  ['해시태그', '해시태그는 어디에 넣나요?',
   '아래 해시태그를 캡션(설명글)에 모두 넣어주세요.\n\n#LUN8 #SNEAKERS #루네이트\n\n댓글이 아니라 캡션에 넣어주셔야 검수에 반영됩니다. 순서나 위치는 자유예요.\n※ 한글 입력이 어려우시면 #루네이트 는 빼셔도 괜찮습니다.',
   '下記のハッシュタグをキャプション（説明文）にすべてご記載ください。\n\n#LUN8 #SNEAKERS #루네이트\n\nコメント欄ではなくキャプションに入れていただく必要がございます。順番や位置は自由です。\n※ 韓国語の入力が難しい場合、#루네이트 は省略していただいて構いません。'],
  ['업로드', '언제까지 올려야 하나요?',
   '업로드 기간은 7월 23일(목) ~ 8월 4일(화) 입니다.\n\n신청하실 때 적어주신 예정일에 맞춰 올려주시면 가장 좋고, 사정이 생기시면 미리 알려주세요. 조정 가능합니다.',
   'アップロード期間は7月23日(木)～8月4日(火)です。\n\nお申し込み時にご記入いただいた予定日に合わせてご投稿いただけますと幸いです。ご都合が変わる場合は事前にお知らせください。調整可能です。'],
  ['업로드', '올린 영상을 언제까지 유지해야 하나요?',
   '[확인필요] 유지 기간 동안은 삭제하지 말고 공개 상태로 유지해주세요.\n\n정산 확인과 성과 집계에 필요해서예요. 기간이 지나면 자유롭게 하셔도 됩니다.',
   '[확인필요] 保持期間 の間は、削除せず公開状態のまま保っていただけますようお願いいたします。\n\n精算の確認と成果集計に必要なためです。期間終了後は自由にしていただいて問題ありません。'],
  ['계정', '비공개 계정으로 올려도 되나요?',
   '아니요, 공개 상태로 올려주셔야 해요.\n\n비공개나 친구공개는 저희가 확인할 수 없어서 검수가 안 됩니다. 업로드 후 공개로 설정되어 있는지 한 번만 확인 부탁드려요.',
   'いいえ、公開設定でのご投稿をお願いいたします。\n\n非公開・友達のみ公開の場合、こちらで確認ができず検収ができません。投稿後、公開設定になっているか一度ご確認ください。'],
  ['계정', '팔로워 조건이 있나요?',
   '네, 팔로워 1,000명(1K) 이상이 조건이에요.\n\n업로드하실 계정 기준이며, 조건에 대해 궁금한 점 있으시면 편하게 문의해주세요.',
   'はい、フォロワー1,000人（1K）以上が条件です。\n\nご投稿いただくアカウント基準となります。条件についてご不明な点がございましたら、お気軽にお問い合わせください。'],
  ['정산', '보수는 얼마이고 언제 받나요?',
   '[확인필요] 정산 금액 체계\n\n지급 시점은 [확인필요] 지급 시점 이며, [확인필요] 기프트카드 종류 로 보내드립니다.\n받으시면 확인 회신 한 번만 부탁드려요.',
   '[확인필요] 報酬体系\n\nお支払い時期は [확인필요] 支払い時期 で、[확인필요] ギフトカード種類 にてお送りいたします。\n受け取られましたら、確認のご返信を一度お願いいたします。'],
  ['정산', '친구를 소개하면 추가 보수가 있나요?',
   '네, 있어요. 소개해주신 분이 실제로 참여하시면 1명당 3,000엔이 추가로 지급됩니다.\n\n소개해주실 분의 SNS 링크와 이메일을 알려주시면 저희가 안내 메일을 보내드립니다.\n(상한 등 세부 조건: [확인필요])',
   'はい、ございます。ご紹介いただいた方が実際に参加された場合、お一人につき3,000円が追加で支払われます。\n\nご紹介いただける方のSNSリンクとメールアドレスをお知らせいただければ、こちらからご案内メールをお送りいたします。\n（上限などの詳細条件：[확인필요]）'],
  ['기타', '검수에서 미준수가 나왔다고 연락받았어요.',
   '확인해주셔서 감사합니다. 아래 항목이 조건과 달라서 재업로드가 필요해요.\n\n[확인필요] 해당 항목\n\n수정본은 [확인필요] 재제출 마감 까지 올려주시면 정상적으로 인정됩니다. 번거롭게 해드려 죄송합니다!',
   'ご確認ありがとうございます。下記の項目が条件と異なっており、再投稿が必要です。\n\n[확인필요] 該当項目\n\n修正版は [확인필요] 再提出期限 までにご投稿いただければ、問題なく認定されます。お手数をおかけし申し訳ございません。'],
  ['음원', '음원 링크가 아직 안 왔어요. 언제 주시나요?',
   '음원은 7월 22일(수) 오후 6시에 발매되며, 발매 직후 링크를 보내드릴 예정이에요.\n\n그 전까지는 촬영만 준비해 주시고, 링크를 받으신 뒤 업로드해 주세요.\n챌린지 시작은 7월 23일(목)입니다.',
   '音源は7月22日(水)18時にリリースされ、リリース後すぐにリンクをお送りする予定です。\n\nそれまでは撮影のご準備のみお願いいたします。リンクを受け取られてからご投稿ください。\nチャレンジ開始は7月23日(木)です。'],
  ['해시태그', '#루네이트 가 한글이라 입력이 안 돼요.',
   '괜찮습니다! 한글 입력이 어려우시면 #루네이트 는 빼고 올려주셔도 돼요.\n\n#LUN8 #SNEAKERS 두 개만 캡션에 들어가 있으면 정상적으로 인정됩니다.',
   '問題ございません！韓国語の入力が難しい場合、#루네이트 は省略してご投稿いただいて大丈夫です。\n\n#LUN8 #SNEAKERS の2つがキャプションに入っていれば、問題なく認定されます。'],
  ['업로드', '(우리가 먼저) 업로드 날짜를 옮겨달라고 부탁할 때',
   '안녕하세요! 참여해 주셔서 감사합니다.\n\n말씀해주신 예정일에 업로드가 조금 몰려 있어서, 혹시 가능하시다면 O월 O일로 옮겨주실 수 있을까요?\n챌린지가 특정 날짜에 몰리지 않고 고르게 퍼지는 것이 좋아서 부탁드립니다.\n\n물론 어려우시면 원래 날짜 그대로 진행하셔도 전혀 문제없습니다!',
   'こんにちは！ご参加いただきありがとうございます。\n\nお知らせいただいた予定日に投稿が少し集中しておりまして、もし可能でしたらO月O日に変更していただくことはできますでしょうか？\nチャレンジが特定の日に偏らず、均等に広がるようにしたいためのお願いです。\n\nもちろん難しい場合は、元の日程のままで全く問題ございません！'],
  ['기타', '어떤 영상을 찍어야 하나요? (챌린지 형태)',
   '이번 챌린지는 댄스 영상입니다. 지정된 안무를 지정 음원에 맞춰 춰주시면 돼요.\n\n안무 참고 영상은 아래에서 확인하실 수 있어요.\nhttps://drive.google.com/file/d/1d11ZMFvzbGCYkEVZFjFTa3146SWUFtvq/view\n\n리액션·리뷰·언박싱 등 다른 형태는 이번 캠페인에서는 인정되지 않습니다.',
   '今回のチャレンジはダンス動画です。指定の振り付けを指定楽曲に合わせて踊っていただければ大丈夫です。\n\n振り付けの参考動画は下記からご確認いただけます。\nhttps://drive.google.com/file/d/1d11ZMFvzbGCYkEVZFjFTa3146SWUFtvq/view\n\nリアクション・レビュー・開封動画などの他の形式は、今回のキャンペーンでは認定されませんのでご注意ください。'],
];

var LUN8_GUIDE_ROWS = [
  ['개요', '캠페인', 'LUN8 · SNEAKERS 댄스 챌린지 · 시리아이 × 마루'],
  ['개요', '기간', '7/23(목) ~ 8/4(화)'],
  ['개요', '플랫폼', '틱톡 + 인스타 릴스'],
  ['개요', '요청 수량', '틱톡 50명 + 인스타 50명 · 정산 인정 상한 105건 (오버부킹 5)'],
  ['개요', '조건', '팔로워 1K 이상 · 댄스 only'],
  ['일정', '1주차', '7/23(목) ~ 7/28(화)'],
  ['일정', '2주차', '7/29(수) ~ 8/4(화)'],
  ['일정', '물량 배분', '1주차 60% / 2주차 40% — 마루 표현으로 "정확한 비율일 필요는 없습니다"'],
  ['일정', '쏠림 금지', '특정 날짜에 몰아서 업로드하지 말 것. 고르게 퍼지도록 크리에이터에게 가이드 (계약 요청사항)'],
  ['일정', '⚠️ 현재 상태', '예정일 기준 7/23·7/24 이틀에 26건(전체 31%) 쏠림, 7/29는 0건. 비율(58:42)은 맞으나 쏠림이 어긋남 — 옮길 사람 찾아 연락할 것'],
  ['지정 음원', '전달 시점', '7/22(수) 18:00 발매 후 전달 예정 — 캠페인 시작 전날 저녁에야 링크가 나옴'],
  ['지정 음원', '틱톡 음원 링크', '[확인필요] — 발매 후 여기 채울 것'],
  ['지정 음원', '인스타 음원 링크', '[확인필요] — 릴스에 같은 음원이 있는지부터 확인 필요'],
  ['지정 음원', '사용 구간', '[확인필요]'],
  ['지정 음원', '주의', '릴스는 지정 음원을 써도 표기가 "오리지널 오디오"로 바뀌는 경우가 있어 화면만으로 판정이 안 될 수 있음. 애매하면 업로드 화면 스크린샷을 요청할 것.'],
  ['댄스 동작', '챌린지 형태', '댄스 only. 리액션·리뷰·언박싱 등 다른 형태는 불인정'],
  ['댄스 동작', '안무 참고 영상', 'https://drive.google.com/file/d/1d11ZMFvzbGCYkEVZFjFTa3146SWUFtvq/view'],
  ['댄스 동작', '⚠️ 링크 권한', '드라이브 링크가 "링크가 있는 모든 사용자"인지 확인할 것. 아니면 일본 크리에이터가 못 엶 — 안내 나가기 전에 로그아웃 상태로 열어볼 것'],
  ['댄스 동작', '변형 허용 범위', '[확인필요] — 어디까지 바꿔도 인정인지'],
  ['해시태그', '필수 해시태그', '#LUN8 #SNEAKERS #루네이트'],
  ['해시태그', '위치', '캡션에 넣어야 인정. 댓글은 불인정.'],
  ['해시태그', '한글 예외', '한글 입력 불가 시 #루네이트 제외 가능(마루 명시). 일본 크리에이터가 많아 자주 발생 → #LUN8 #SNEAKERS 두 개만 있어도 통과로 판정할 것'],
  ['검수', '통과 조건', '음원 · 음원구간 · 해시태그 3개가 모두 "준수"여야 검수완료'],
  ['검수', '판정값', '준수 / 미준수 / 미확인 — 이 셋만 사용. 자유롭게 적으면 집계가 안 됨'],
  ['검수', '해시태그 판정', '#루네이트 누락을 미준수로 잡지 말 것 (위 한글 예외 참고)'],
  ['검수', '미준수 처리', '판정한 날 바로 통보. 재제출 마감을 넘기면 인정 불가'],
  ['팔로워', '기준', '1,000명(1K) 이상 — 마루 계약 조건'],
  ['팔로워', '플랫폼별 적용', '[확인필요] — 플랫폼별로 각각 1K인지, 한쪽만 넘으면 되는지 (양쪽 참여자가 많아 실제로 갈림)'],
  ['팔로워', '미달 시', '가드닝(팔로워 보충) 대상. 가드닝 집행은 대표님 PC에서만 가능'],
  ['계약 단가', '⚠️ 대외비', '아래는 마루가 우리에게 주는 단가. 크리에이터 응대에 절대 쓰지 말 것'],
  ['계약 단가', '원고료', '인당 15만원'],
  ['계약 단가', '⚠️ 미확정', '"인당"이 사람 기준인지 건 기준인지 미확정. 한 명이 양 플랫폼을 하면 15만원인지 30만원인지가 갈리고 매출이 두 배 차이남 — 마루에 확인 필요'],
  ['정산', '크리에이터 금액 체계', '[확인필요] — 단건 / 양 플랫폼 / 최우수'],
  ['정산', '추천 보너스', '소개한 친구 1명당 3,000엔. 소개받은 사람 행의 "추천인"에 소개자 이름을 넣으면 자동 집계됨'],
  ['정산', '지급 수단', '[확인필요] — 아마존·구글·애플 중 무엇, 어느 나라 스토어'],
  ['정산', '지급 시점', '[확인필요]'],
  ['정산', '주의', '기프트카드 코드는 한 번 나가면 회수 불가. 수령 확인 회신을 반드시 기록에 남길 것'],
  ['응대 원칙', '애매하면', '임의로 답하지 말고 비고란에 적고 대표님께'],
  ['응대 원칙', '일관성', '금액·기간·인정 여부는 팀원마다 답이 달라지면 그 자체가 사고. 반드시 응대 매뉴얼 문구를 그대로 복사해서 사용'],
  ['응대 원칙', '새 질문', '매뉴얼에 없는 질문이 오면, 답한 뒤 그 문답을 응대 매뉴얼 탭에 추가할 것'],
];

function buildLun8Docs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var made = [], kept = [];

  var build = function (name, headers, rows, widths) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() <= 1) {                    // 비어 있을 때만 내용을 넣는다 (팀이 적은 걸 안 지움)
      sh.clear();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
      made.push(name);
    } else kept.push(name);

    // 서식은 매번 다시 맞춰도 안전 (값은 안 건드림)
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#211A33').setFontColor('#F3EEE2').setVerticalAlignment('middle');
    sh.setRowHeight(1, 34);
    sh.setFrozenRows(1);
    for (var i = 0; i < widths.length; i++) sh.setColumnWidth(i + 1, widths[i]);
    var last = Math.max(sh.getLastRow(), 2);
    var body = sh.getRange(2, 1, last - 1, headers.length);
    body.setVerticalAlignment('top').setWrap(true);
    try { sh.getBandings().forEach(function (b) { b.remove(); }); } catch (e) {}
    try { body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); } catch (e) {}
    return sh;
  };

  // ── 응대 매뉴얼 ──
  var m = build('응대 매뉴얼', ['분류', '질문', '답변 (한국어)', '답변 (일본어)'], LUN8_MANUAL_ROWS, [90, 260, 480, 480]);
  // 분류는 드롭다운으로 고정 — 자유 입력이면 대시보드 필터 버튼이 무한정 늘어난다
  try {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['음원', '해시태그', '업로드', '계정', '정산', '기타'], true).setAllowInvalid(true).build();
    m.getRange(2, 1, Math.max(m.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  } catch (e) {}
  try { m.getRange(2, 2, Math.max(m.getLastRow() - 1, 1), 1).setFontWeight('bold'); } catch (e) {}

  // ── 가이드라인 ──
  build('가이드라인', ['구분', '항목', '내용'], LUN8_GUIDE_ROWS, [110, 160, 720]);

  lun8Toast_(ss, '✅ 문서 탭 — ' +
    (made.length ? '새로 만듦: ' + made.join(', ') : '') +
    (made.length && kept.length ? ' / ' : '') +
    (kept.length ? '이미 내용이 있어 그대로 둠: ' + kept.join(', ') : '') +
    '. [확인필요] 자리를 채우면 완성입니다.');
}

/**
 * 가드닝 열 정리 — 값 통일 + 색. LUN8 메뉴 또는 원격(setup) 실행.
 *  ① '가드닝 대상/불필요'(옛 표기) → '대상/불필요'(드롭다운 어휘)
 *  ② 드롭다운을 대상/불필요로 재설정
 *  ③ 조건부서식: 대상=빨강, 불필요=초록
 *  ④ 인스타 전용(틱톡 링크 없음)인데 스캔이 잘못 채운 틱톡 닉네임/팔로워/가드닝을 비운다
 *     — 틱톡 스캐너가 인스타 핸들로 긁어 엉뚱한 값을 넣었던 흔적.
 */
function fixLun8Gardening() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var hRow = lun8Head_(sh), DS = hRow + 1, LAST = 408;
  var hv = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = function (n) { for (var i = 0; i < hv.length; i++) if (t(hv[i]) === n) return i + 1; return 0; };

  var out = [];
  ['틱톡 가드닝', '인스타 가드닝'].forEach(function (name) {
    var c = col(name); if (!c) return;
    var rg = sh.getRange(DS, c, LAST - DS + 1, 1), v = rg.getValues(), n = 0;
    for (var i = 0; i < v.length; i++) {
      var x = t(v[i][0]); if (!x) continue;
      var w = /불필요/.test(x) ? '불필요' : /대상/.test(x) ? '대상' : x;
      if (w !== x) { v[i][0] = w; n++; }
    }
    if (n) rg.setValues(v);
    // 드롭다운 재설정 — 값과 어휘가 어긋나면 유효성 경고가 뜬다
    try {
      rg.setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(['대상', '불필요'], true).setAllowInvalid(true).build());
    } catch (e) {}
    out.push(name + ' ' + n + '건 정리');
  });

  // 조건부서식 — 가드닝 열에만. 기존 같은 규칙은 걷어내고 다시 건다(중복 방지).
  var rules = sh.getConditionalFormatRules(), keep = [], targets = [];
  ['틱톡 가드닝', '인스타 가드닝'].forEach(function (name) { var c = col(name); if (c) targets.push(c); });
  rules.forEach(function (r) {
    var hit = r.getRanges().some(function (g) { return targets.indexOf(g.getColumn()) >= 0 && g.getLastRow() >= DS; });
    if (!hit) keep.push(r);
  });
  targets.forEach(function (c) {
    var rg = sh.getRange(DS, c, LAST - DS + 1, 1);
    keep.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('대상')
      .setBackground('#FDECEC').setFontColor('#C1272D').setRanges([rg]).build());
    keep.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('불필요')
      .setBackground('#E6F7F1').setFontColor('#067A52').setRanges([rg]).build());
  });
  sh.setConditionalFormatRules(keep);
  out.push('색 규칙 ' + (targets.length * 2) + '개');

  // 인스타 전용인데 틱톡 열이 채워진 행 청소
  var cTkL = col('틱톡 링크'), cTkN = col('틱톡 닉네임'), cTkF = col('틱톡 팔로워'), cTkG = col('틱톡 가드닝');
  var cIgL = col('인스타 링크'), cleaned = 0;
  if (cTkL && cIgL) {
    var n2 = LAST - DS + 1;
    var tkL = sh.getRange(DS, cTkL, n2, 1).getValues(), igL = sh.getRange(DS, cIgL, n2, 1).getValues();
    for (var i = 0; i < n2; i++) {
      if (t(tkL[i][0]) || !t(igL[i][0])) continue;   // 틱톡 링크가 있거나 인스타도 없으면 대상 아님
      [cTkN, cTkF, cTkG].forEach(function (c) { if (c && t(sh.getRange(DS + i, c).getValue())) { sh.getRange(DS + i, c).setValue(''); cleaned++; } });
    }
  }
  out.push('인스타 전용 오염 ' + cleaned + '칸 청소');

  lun8Toast_(ss, '✅ 가드닝 정리 — ' + out.join(' · '));
}

/**
 * 일반 비고 열 추가 — 연락 섹션(확정일 뒤). 처음 한 번.
 * 지금은 모집탭 비고가 '틱톡 비고'에 써진다 — 크리에이터 전반 메모와 틱톡 콘텐츠 메모가 한 칸을 쓴다.
 * 비고가 들어갈 자리는 넷이고 각자 달라야 한다: 일반 / 틱톡 / 인스타 / 정산.
 * ⚠️ 요약 블록(2~6행)이 1~17열을 덮어서 그 안에 열을 끼우면 병합이 한 칸 밀린다 →
 *    삽입 지점을 가로지른 병합만 원래 폭으로 되돌린다(확정일 추가 때와 같은 방식).
 */
function addLun8Memo() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var hRow = lun8Head_(sh), DS = hRow + 1;
  var hv = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = function (n) { for (var i = 0; i < hv.length; i++) if (t(hv[i]) === n) return i + 1; return 0; };
  if (col('비고')) { lun8Toast_(ss, '이미 있어요 — 비고 ' + col('비고') + '열.'); return; }
  var after = col('확정일') || col('업로드 예정일');
  if (!after) throw new Error("'확정일'/'업로드 예정일' 열을 못 찾았어요.");

  var before = [];
  sh.getRange(2, 1, 5, 20).getMergedRanges().forEach(function (r) {
    before.push({ row: r.getRow(), col: r.getColumn(), rows: r.getNumRows(), cols: r.getNumColumns() });
  });

  sh.insertColumnAfter(after);
  var c = after + 1;
  sh.getRange(hRow, c).setValue('비고');
  sh.setColumnWidth(c, 200);
  sh.getRange(DS, c, Math.max(1, sh.getMaxRows() - DS + 1), 1).clearDataValidations().setWrap(true);

  var fixed = 0;
  before.forEach(function (m) {
    if (!(m.col < c && m.col + m.cols > c)) return;
    try { sh.getRange(m.row, m.col, m.rows, m.cols + 1).breakApart(); } catch (e) {}
    try { sh.getRange(m.row, m.col, m.rows, m.cols).merge(); fixed++; } catch (e) {}
  });
  lun8Toast_(ss, '✅ 비고 열 추가 — ' + c + '열(확정일 옆). 요약 병합 ' + fixed + '개 복원. '
    + '일반 비고 / 틱톡 비고 / 인스타 비고 / 정산 비고가 이제 각자 칸을 씁니다.');
}

/**
 * 요약 폭 정리 — 열을 추가할 때마다 '합계' 병합이 한 칸씩 넓어져 J·K까지 먹었다.
 * (열 삽입은 그 지점을 가로지르는 병합을 자동으로 늘린다)
 * 합계는 H:I 두 칸으로 되돌리고, 오른쪽 '진행율·현황' 블록을 J부터 시작하게 당긴다.
 */
function fixLun8Summary() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var R1 = 2, R2 = 6, NR = R2 - R1 + 1;
  var SUM_C = 8, SUM_W = 2;            // 합계 = H:I
  var DEST = SUM_C + SUM_W;            // 진행율 블록이 시작할 자리 = J(10)

  // 오른쪽 블록이 지금 어디서 시작하는지 — '진행율'이 적힌 칸을 찾는다
  var wide = Math.min(sh.getLastColumn(), 30);
  var vals = sh.getRange(R1, 1, NR, wide).getValues();
  var src = 0;
  for (var r = 0; r < NR && !src; r++)
    for (var c = SUM_C; c < wide; c++)
      if (t(vals[r][c]).indexOf('진행율') >= 0) { src = c + 1; break; }
  if (!src) throw new Error("요약에서 '진행율' 칸을 못 찾았어요.");
  if (src === DEST) { lun8Toast_(ss, '이미 정리돼 있어요 — 합계 H:I, 진행율 ' + DEST + '열.'); return; }

  // 블록의 오른쪽 끝 = 내용이 있는 마지막 열
  var last = src;
  for (var r2 = 0; r2 < NR; r2++)
    for (var c2 = src - 1; c2 < wide; c2++) if (t(vals[r2][c2])) last = c2 + 1;

  // 병합을 먼저 전부 풀어야 옮길 수 있다(병합된 채 이동하면 겹침 오류)
  var rows = sh.getRange(R1, SUM_C, NR, last - SUM_C + 1);
  var merges = [];
  rows.getMergedRanges().forEach(function (m) {
    merges.push({ row: m.getRow(), col: m.getColumn(), rows: m.getNumRows(), cols: m.getNumColumns() });
  });
  merges.forEach(function (m) { try { sh.getRange(m.row, m.col, m.rows, m.cols).breakApart(); } catch (e) {} });

  // 진행율 블록을 왼쪽으로 당긴다(서식·수식 함께)
  var shift = src - DEST;
  var block = sh.getRange(R1, src, NR, last - src + 1);
  block.moveTo(sh.getRange(R1, DEST, NR, last - src + 1));

  // 합계는 H:I 로 다시 묶고, 옮긴 블록의 병합은 같은 폭으로 shift 만큼 당겨 복원
  merges.forEach(function (m) {
    if (m.col < DEST) {                       // 합계 쪽 병합 → H:I 폭으로
      if (m.col <= SUM_C && m.col + m.cols > SUM_C) {
        try { sh.getRange(m.row, SUM_C, m.rows, SUM_W).merge(); } catch (e) {}
      }
      return;
    }
    try { sh.getRange(m.row, m.col - shift, m.rows, m.cols).merge(); } catch (e) {}
  });

  lun8Toast_(ss, '✅ 요약 정리 — 합계 H:I(2칸), 진행율 블록 ' + src + '열 → ' + DEST + '열로 ' + shift + '칸 당김.');
}

/**
 * 드롭다운 어휘 맞추기 — 화면과 시트가 다른 말을 쓰면 사람이 고른 값과 스캔이 쓴 값이 갈린다.
 *  · 미러링 여부: 미러링 / 오리지널 / 미확인
 *  · 우수 선정: 우수 / (빈칸)   ← 체크박스를 드롭다운으로 바꾸면서 시트도 맞춘다
 */
function fixLun8Dropdowns() {
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LUN8_마스터') || ss.getActiveSheet();
  var HEAD_ROW = lun8Head_(sh);   // 헤더행은 요약 블록 아래라 고정값을 쓰면 안 된다
  var head = sh.getRange(HEAD_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return t(v).replace(/\s+/g, ''); });
  var find = function (kw) { for (var i = 0; i < head.length; i++) if (head[i].indexOf(kw) >= 0) return i + 1; return 0; };
  var last = sh.getLastRow(), n = last - HEAD_ROW;
  if (n < 1) { lun8Toast_(ss, '데이터 행이 없어요.'); return; }
  var log = [];

  // 미러링 — '별개' 로 적혀 있던 값을 '오리지널' 로 옮긴다(뜻은 같고 이름만 바뀐다).
  var cMir = find('미러링');
  if (cMir) {
    var rg = sh.getRange(HEAD_ROW + 1, cMir, n, 1);
    var vals = rg.getValues(), moved = 0;
    for (var i = 0; i < vals.length; i++) if (t(vals[i][0]) === '별개') { vals[i][0] = '오리지널'; moved++; }
    if (moved) rg.setValues(vals);
    rg.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['미러링', '오리지널', '미확인'], true).setAllowInvalid(false).build());
    log.push('미러링 드롭다운' + (moved ? ' (별개→오리지널 ' + moved + '건)' : ''));
  }

  // 우수 선정 — 없으면 만들고, 있으면 드롭다운만 다시 건다.
  var cBest = find('우수');
  if (!cBest) {
    var cPaid = find('입금') || find('정산');
    var at = cPaid || sh.getLastColumn();
    sh.insertColumnAfter(at);
    cBest = at + 1;
    sh.getRange(HEAD_ROW, cBest).setValue('우수 선정')
      .setFontWeight('bold').setHorizontalAlignment('center');
    log.push('우수 선정 열 추가(' + cBest + ')');
  }
  var rb = sh.getRange(HEAD_ROW + 1, cBest, n, 1);
  rb.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['우수', ''], true).setAllowInvalid(false).build());
  // 고른 것만 눈에 걸리게. 빈칸은 조용히 둔다.
  var rules = sh.getConditionalFormatRules().filter(function (r) {
    return r.getRanges().every(function (x) { return x.getColumn() !== cBest; });
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('우수')
    .setBackground('#FFF8E1').setFontColor('#8A6100').setBold(true).setRanges([rb]).build());
  sh.setConditionalFormatRules(rules);
  log.push('우수 선정 드롭다운');

  lun8Toast_(ss, '✅ ' + log.join(' · '));
  return log.join(' · ');
}

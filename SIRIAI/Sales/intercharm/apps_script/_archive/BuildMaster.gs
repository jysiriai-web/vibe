/**
 * INTERCHARM 마스터시트 통합 빌더 v2 — buildMaster()
 * ───────────────────────────────────────────────────────────────────────────
 * 5개 원본 탭을 읽어 '★마스터' 탭 1장으로 통합. (원본 미변경, 재실행 시 ★마스터만 교체)
 *   ① 인터참 대상 리스트  ② 인터참_구  ③ 인터참_검토필요  ④ 2026 명함  ⑤ 2025 명함
 * 접점(명함/사전조사)·브랜드↔담당자 매칭·직급 상위2명·담당자 한글명·전화 010통일·연도 26우선.
 * 상단 요약(≤K열)·발송 트래킹(브랜드/담당자 각각)·3섹션 헤더색·밴딩·상태색·링크·드롭다운.
 *
 * 실행: 확장 프로그램 → Apps Script → 이 파일 전체 붙여넣기 → 함수 'buildMaster' 선택 → 실행.
 * 통합 코어는 로컬(Node)에서 전수 검증됨.
 */
var MASTER_TAB = '★마스터';

function resolveSources_(ss) {
  var sheets = ss.getSheets();
  function pick(pred) { for (var i = 0; i < sheets.length; i++) if (pred(sheets[i].getName())) return sheets[i]; return null; }
  function vals(sh) { return sh ? sh.getDataRange().getValues() : []; }
  var target = pick(function (n) { return n.indexOf('대상') >= 0; });
  var gu     = pick(function (n) { return n.indexOf('인터참') >= 0 && n.indexOf('구') >= 0 && n.indexOf('검토') < 0 && n.indexOf('대상') < 0; });
  var review = pick(function (n) { return n.indexOf('검토') >= 0; });
  var c2026  = pick(function (n) { return n.indexOf('2026') >= 0 && n.indexOf('명함') >= 0; });
  var c2025  = pick(function (n) { return n.indexOf('2025') >= 0 && n.indexOf('명함') >= 0; });
  return { target: vals(target), gu: vals(gu), review: vals(review), cards2026: vals(c2026), cards2025: vals(c2025) };
}

function buildMaster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = resolveSources_(ss);
  if (!src.target.length) throw new Error("‘인터참 대상 리스트’ 탭을 못 찾음 — 탭 이름 확인 필요.");
  var recs = consolidate(src);
  writeMaster_(ss, recs);
  SpreadsheetApp.getActive().toast(recs.length + '개 브랜드 통합 완료 → ' + MASTER_TAB, 'INTERCHARM', 8);
}

// ═══════════════════════════════════════════════════════════════════════════
//  통합 코어 (consolidate.js 와 동일 — Node 검증본)
// ═══════════════════════════════════════════════════════════════════════════
var SUFFIX = /(주식회사|\(주\)|㈜|\(유\)|유한회사|co\.?,?\s*ltd\.?|co\.?ltd|inc\.?|corp\.?|corporation|company|limited|코스메틱스|코스메틱|컴퍼니|코퍼레이션)/ig;
var STOP_L = {};
('cosmetic cosmetics brands brand total beauty global korea company since the and official co ltd inc group lab labs ' +
 'oem odm oemodm odmoem kbeauty bio pack packaging package trading trade intl international tech technology industrial ' +
 'solution solutions biotech medical derma skincare makeup perfume hair body spa nail nails design corporation limited'
).split(' ').forEach(function (w) { STOP_L[w] = 1; });
var STOP_H = { '생산제조': 1, '화장품': 1, '주식회사': 1, '코스메틱': 1, '코스메틱스': 1 };

function aliases(raw) {
  raw = raw || '';
  var parts = raw.split(/[\/;·|]| - |／/), out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], m, re = /[（(]([^（()）]*)[）)]/g;
    while ((m = re.exec(p)) !== null) out.push(m[1]);
    out.push(p.replace(/[（(][^（()）]*[）)]/g, ' '));
  }
  var seen = {}, res = [];
  for (var j = 0; j < out.length; j++) { var a = out[j].trim(); if (a && !seen[a.toLowerCase()]) { seen[a.toLowerCase()] = 1; res.push(a); } }
  return res;
}
function keys(raw) {
  var ks = {}, al = aliases(raw);
  for (var i = 0; i < al.length; i++) {
    var b = al[i].replace(SUFFIX, ' '), h = b.replace(/[^가-힣]/g, ''), l = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h.length >= 2 && !STOP_H[h]) ks['h:' + h] = 1;
    if (l.length >= 3 && !STOP_L[l]) ks['l:' + l] = 1;
  }
  return Object.keys(ks).sort();
}
function T(row, i) { return (row && i >= 0 && i < row.length && row[i] != null) ? String(row[i]).trim() : ''; }
function normH(s) { return String(s == null ? '' : s).replace(/[\s()（）\/]/g, '').toLowerCase(); }
function findHeader(values, mustHave) {
  var lim = Math.min(values.length, 20);
  for (var r = 0; r < lim; r++) {
    var norm = values[r].map(normH), ok = true;
    for (var k = 0; k < mustHave.length; k++) if (norm.indexOf(normH(mustHave[k])) < 0) { ok = false; break; }
    if (ok) return r;
  }
  return -1;
}
function colMap(headerRow) {
  var norm = headerRow.map(normH);
  return { idx: function () { for (var a = 0; a < arguments.length; a++) { var i = norm.indexOf(normH(arguments[a])); if (i >= 0) return i; } return -1; } };
}
function parseHome(sns) {
  if (!sns) return ['', ''];
  var home = '', insta = '';
  var m = sns.match(/(https?:\/\/[^\s/]+\.[^\s]+|www\.[^\s/]+\.[^\s]+|[a-z0-9\-]+\.(?:com|co\.kr|kr|net|us|io|shop)[^\s]*)/i);
  if (m) home = m[1];
  var mi = sns.match(/(?:instagram|IG|인스타)[:\s]*@?([A-Za-z0-9._]+)/i) || sns.match(/@([A-Za-z0-9._]+)/);
  if (mi) insta = '@' + mi[1];
  return [home, insta];
}
function koreanName(name) {
  if (!name) return '';
  var m = name.match(/[가-힣]+(?:\s+[가-힣]+)*/g);
  if (m) { m.sort(function (a, b) { return b.replace(/\s/g, '').length - a.replace(/\s/g, '').length; }); return m[0].replace(/\s+/g, ' ').trim(); }
  var s = name.replace(/\s*[（(][^）)]*[）)]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return s || name.trim();
}
function normPhone(s) {
  if (!s) return '';
  return s.split('/').map(function (t) {
    t = t.trim(); if (!t) return '';
    t = t.replace(/\(0\)/g, '').replace(/\(\+82\)/g, '+82').replace(/\s{2,}/g, ' ').trim();
    if (/^\+?82\D?\d/.test(t)) t = t.replace(/^\+?82[\s.\-]?/, '0');
    if (/^0/.test(t)) t = t.replace(/[.\s]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return t;
  }).filter(Boolean).join(' / ');
}
var RANKS = [
  [/회장|chairman/i, 100], [/부사장|vice\s*president/i, 92],
  [/대표이사|대표|c\.?e\.?o|president|founder/i, 96], [/사장/i, 90],
  [/전무/i, 85], [/상무|c\.?o\.?o|c\.?t\.?o|c\.?f\.?o|c\.?m\.?o/i, 82],
  [/부문장|본부장/i, 78], [/실장/i, 76], [/이사|director/i, 74], [/부장|general\s*manager/i, 68],
  [/수석/i, 66], [/차장|deputy/i, 62], [/팀장|team\s*lead|team\s*leader|\blead\b/i, 60],
  [/과장|\bmanager\b/i, 55], [/매니저/i, 54], [/대리|assistant\s*manager/i, 50],
  [/주임|associate/i, 45], [/사원|\bstaff\b/i, 40]
];
function rankScore(title) { var t = title || '', best = 42; for (var i = 0; i < RANKS.length; i++) if (RANKS[i][0].test(t)) best = Math.max(best, RANKS[i][1]); return best; }

function consolidate(sources) {
  var records = [], keyIndex = {}, seq = 0;
  function newrec() { return { track_card: false, gubun: '', brand: '', home: '', email: '', sns: '', contacts: [], note: '', intro: '', years: {}, mailcau: '', source: '', _keys: {}, _brands: [] }; }
  function findRec(b) { var ks = keys(b); for (var i = 0; i < ks.length; i++) if (keyIndex[ks[i]]) return keyIndex[ks[i]]; return null; }
  function addKeys(rec, b) { var ks = keys(b); for (var i = 0; i < ks.length; i++) { rec._keys[ks[i]] = 1; if (!keyIndex[ks[i]]) keyIndex[ks[i]] = rec; } }

  (function () {
    var v = sources.target || [];
    var hr = findHeader(v, ['브랜드명', '홈페이지']); if (hr < 0) hr = findHeader(v, ['브랜드명', '연락처']); if (hr < 0) return;
    var c = colMap(v[hr]);
    var iB = c.idx('브랜드명'), iG = c.idx('구분'), iE = c.idx('연락처'), iH = c.idx('홈페이지'), iS = c.idx('인스타'), iM = c.idx('메일주의');
    for (var r = hr + 1; r < v.length; r++) {
      var brand = T(v[r], iB); if (!brand) continue;
      var rec = findRec(brand); if (!rec) { rec = newrec(); records.push(rec); }
      rec.brand = rec.brand || brand; rec.gubun = rec.gubun || T(v[r], iG); rec.email = rec.email || T(v[r], iE);
      rec.home = rec.home || T(v[r], iH); rec.sns = rec.sns || T(v[r], iS); rec.mailcau = rec.mailcau || T(v[r], iM);
      rec._brands.push(brand); addKeys(rec, brand);
    }
  })();
  (function () {
    var v = sources.gu || [];
    var hr = findHeader(v, ['브랜드명', '판단근거']); if (hr < 0) hr = findHeader(v, ['브랜드명', '연락처']); if (hr < 0) return;
    var c = colMap(v[hr]);
    var iB = c.idx('브랜드명'), iG = c.idx('구분'), iE = c.idx('연락처'), iIntro = c.idx('판단근거'), iWeb = c.idx('웹사이트'), iS = c.idx('인스타');
    for (var r = hr + 1; r < v.length; r++) {
      var brand = T(v[r], iB); if (!brand) continue;
      var intro = T(v[r], iIntro), ex = findRec(brand);
      if (ex) { if (intro && !ex.intro) ex.intro = intro; if (!ex.home) ex.home = T(v[r], iWeb); }
      else { var rec = newrec(); records.push(rec); rec.brand = brand; rec.gubun = T(v[r], iG); rec.email = T(v[r], iE);
        rec.home = T(v[r], iWeb); rec.sns = T(v[r], iS); rec.intro = intro; rec._brands.push(brand); addKeys(rec, brand); }
    }
  })();
  (function () {
    var v = sources.review || [];
    var hr = findHeader(v, ['회사명', '이메일']); if (hr < 0) return;
    var c = colMap(v[hr]);
    var iB = c.idx('회사명'), iE = c.idx('이메일'), iW = c.idx('웹사이트'), iCat = c.idx('카테고리');
    for (var r = hr + 1; r < v.length; r++) {
      var brand = T(v[r], iB); if (!brand) continue;
      var em = T(v[r], iE), web = T(v[r], iW), ex = findRec(brand);
      if (ex) { if (em && !ex.email) ex.email = em; if (web && !ex.home) ex.home = web; }
      else if (T(v[r], iCat).indexOf('대상') === 0) { var rec = newrec(); records.push(rec); rec.brand = brand; rec.email = em; rec.home = web; rec._brands.push(brand); addKeys(rec, brand); }
    }
  })();
  function attachCards(values, year) {
    var hr = findHeader(values, ['브랜드/회사명', '담당자']); if (hr < 0) return;
    var c = colMap(values[hr]);
    var iBrand = c.idx('브랜드/회사명'), iPerson = c.idx('담당자'), iTitle = c.idx('직책'), iMobile = c.idx('휴대폰'), iMail = c.idx('이메일'), iSns = c.idx('웹사이트/SNS', '웹사이트');
    for (var r = hr + 1; r < values.length; r++) {
      var brand = T(values[r], iBrand); if (!brand) continue;
      var person = T(values[r], iPerson), title = T(values[r], iTitle), mobile = T(values[r], iMobile), pmail = T(values[r], iMail), sns = T(values[r], iSns), ph = parseHome(sns), home = ph[0], insta = ph[1];
      var ex = findRec(brand);
      if (ex === null) { ex = newrec(); records.push(ex); ex.brand = brand; ex._brands.push(brand); addKeys(ex, brand); if (!ex.home && home) ex.home = home; if (!ex.sns && insta) ex.sns = insta; }
      ex.track_card = true; ex.years[year] = 1;
      if (!ex.home && home) ex.home = home; if (!ex.sns && insta) ex.sns = insta;
      if (person || pmail) ex.contacts.push({ name: person, title: title, mobile: mobile, mail: pmail, year: year, seq: seq++ });
    }
  }
  attachCards(sources.cards2025 || [], 2025);
  attachCards(sources.cards2026 || [], 2026);

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    rec.track = rec.track_card ? '명함' : '사전조사';
    rec.year = rec.years[2026] ? '2026' : (rec.years[2025] ? '2025' : '');
    rec.source = '인터참';
    var uniq = [], seen = {};
    for (var j = 0; j < rec.contacts.length; j++) {
      var ct = rec.contacts[j], key = (koreanName(ct.name).replace(/\s/g, '').toLowerCase() || '') + '|' + (ct.mail || '').toLowerCase();
      if (key === '|') continue; if (seen[key]) continue; seen[key] = 1; uniq.push(ct);
    }
    uniq.sort(function (a, b) { var sa = rankScore(a.title), sb = rankScore(b.title); if (sa !== sb) return sb - sa; if (a.year !== b.year) return b.year - a.year; return a.seq - b.seq; });
    var top = uniq.slice(0, 2), p = top[0];
    rec.person = p ? koreanName(p.name) : ''; rec.title = p ? p.title : ''; rec.mobile = p ? normPhone(p.mobile) : ''; rec.pmail = p ? p.mail : '';
    rec.extra = top[1] ? [koreanName(top[1].name), top[1].title, normPhone(top[1].mobile), top[1].mail].filter(function (x) { return x; }).join(' / ') : '';
    rec.note = '';
  }
  var prio = { '명함': 0, '사전조사': 1 };
  records.sort(function (a, b) {
    if (prio[a.track] !== prio[b.track]) return prio[a.track] - prio[b.track];
    var ga = a.gubun || '힣', gb = b.gubun || '힣'; if (ga !== gb) return ga < gb ? -1 : 1;
    var na = a.brand.toLowerCase(), nb = b.brand.toLowerCase(); return na < nb ? -1 : (na > nb ? 1 : 0);
  });
  for (var k = 0; k < records.length; k++) records[k].num = k + 1;
  resolveSameEmail_(records);   // 공식=담당자 메일 동일 → 한쪽만 남김(중복발송 차단)
  assignCodes_(records);        // 프로모션 코드(대시보드 접근 키) 부여
  return records;
}

// ═══════════════════════════════════════════════════════════════════════════
//  마스터 탭 쓰기 + 서식
// ═══════════════════════════════════════════════════════════════════════════
var HEADERS = ['#', '접점', '연도', '구분', '브랜드명', '홈페이지',
  '공식 이메일', '인스타', '담당자', '직책', '담당자 직통', '담당자 이메일', '추가 담당자', '프로모션 코드', '비고', '브랜드 소개',
  '브랜드 발송', '브랜드 클릭', '브랜드 회신', '담당자 발송', '담당자 클릭', '담당자 회신', '관심도', '미팅', '성사', '발송 시 주의사항', '출처'];
var NC = HEADERS.length;   // 27
var HROW = 8, DROW = 9;
var INK = '#211A33', PAPER = '#F3EEE2';
var SEC = { c1: '#211A33', c2: '#2C3A4A', c3: '#4A3B2E' };   // 3섹션 헤더색
var GRP1 = 7, GRP2 = 17;   // 섹션 경계(공식이메일=G, 브랜드발송=Q)

function urlify_(u) { u = String(u || '').trim(); if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; return 'https://' + u.replace(/^\/+/, ''); }
function homeCell_(home) {
  if (!home) return '';
  var m = home.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9\-]+\.(?:com|co\.kr|kr|net|us|io|shop|biz|org|jp|cn)[^\s]*)/i);
  if (!m) return home;
  var url = urlify_(m[1]), disp = home.length > 40 ? home.slice(0, 38) + '…' : home;
  return '=HYPERLINK("' + url.replace(/"/g, '""') + '","' + disp.replace(/"/g, '""') + '")';
}
function instaCell_(sns) {
  if (!sns) return '';
  var h = sns.match(/@([A-Za-z0-9._]+)/);
  if (h) return '=HYPERLINK("https://www.instagram.com/' + h[1] + '","@' + h[1] + '")';
  var m = sns.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (m) return '=HYPERLINK("' + urlify_(m[1]).replace(/"/g, '""') + '","' + sns.slice(0, 30).replace(/"/g, '""') + '")';
  return sns;
}

// ═══════════════════════════════════════════════════════════════════════════
//  프로모션 코드(대시보드 접근 키) — 영문3글자 + 결정론적 숫자4자리 (예: BAT1764)
//  · 브랜드 우선: 영문 브랜드명 → 이메일도메인 → 홈페이지 → 한글초성(=사업자명)
//  · 숫자는 브랜드명 해시 → 재실행해도 코드 불변(이미 발송한 코드가 죽지 않음)
// ═══════════════════════════════════════════════════════════════════════════
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
function codeSource_(r) {
  var parts = String(r.brand || '').split(/[\/;·|]|\(|\)/);
  for (var i = 0; i < parts.length; i++) {
    var l = parts[i].replace(/[^A-Za-z0-9 &]/g, ' ').replace(/^\s+|\s+$/g, '');
    var tok = l.split(/\s+/).filter(function (t) { return /[A-Za-z]/.test(t) && t.length >= 2 && !C_STOP[t.toLowerCase()]; });
    if (tok.join('').replace(/[^A-Za-z]/g, '').length >= 3) return tok;
  }
  var em = String(r.email || r.pmail || '').match(/@([a-z0-9-]+)\./i);
  if (em && !C_FREE.test(em[0]) && !C_STOP[em[1].toLowerCase()] && em[1].replace(/[^a-z]/gi, '').length >= 3) return [em[1]];
  var hm = String(r.home || '').match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\./i);
  if (hm && !C_PLAT.test(r.home) && !C_STOP[hm[1].toLowerCase()] && hm[1].replace(/[^a-z]/gi, '').length >= 3) return [hm[1]];
  var ig = String(r.sns || '').match(/@?([A-Za-z]{3,})/);
  if (ig && !C_PLAT.test(r.sns)) return [ig[1]];
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
// ⚠️ JS \W 는 한글을 지움 → 한글 보존해서 해시(안 그러면 한글 브랜드가 전부 같은 숫자)
function normKeyCode_(b) { return String(b || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); }
function hash4_(key) {
  var h = 5381;
  for (var i = 0; i < key.length; i++) h = (((h * 33) ^ key.charCodeAt(i)) >>> 0);
  return 1000 + (h % 9000);
}
function assignCodes_(records) {
  var used = {};
  // 브랜드명 정렬 순서로 결정론적 배정(충돌 시에도 재실행 결과 동일)
  var idx = records.map(function (r, i) { return i; }).sort(function (a, b) {
    var x = normKeyCode_(records[a].brand), y = normKeyCode_(records[b].brand);
    return x < y ? -1 : (x > y ? 1 : a - b);
  });
  for (var k = 0; k < idx.length; k++) {
    var r = records[idx[k]];
    var p = prefix3_(codeSource_(r)), n = hash4_(normKeyCode_(r.brand)), c = p + n, guard = 0;
    while (used[c] && guard++ < 9000) { n = 1000 + ((n - 1000 + 1) % 9000); c = p + n; }
    used[c] = 1; r.promo = c;
  }
}

// 공식메일 == 담당자메일이면 한쪽만 남겨 중복발송 차단 (담당자명 있으면 담당자로 1회)
function resolveSameEmail_(records) {
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var A = String(r.email || '').toLowerCase().split(/[\s\/;,]+/).filter(function (x) { return x.indexOf('@') > 0; });
    var B = String(r.pmail || '').toLowerCase().split(/[\s\/;,]+/).filter(function (x) { return x.indexOf('@') > 0; });
    if (A.length !== 1 || B.length !== 1 || A[0] !== B[0]) continue;
    var note;
    var hasName = /[가-힣A-Za-z]/.test(r.person || '');   // '-' 같은 자리표시자는 이름 아님
    if (hasName) { r.email = ''; note = '공식=담당자 메일 동일 → ' + r.person + '님 앞으로 1회만 발송'; }
    else { r.pmail = ''; note = '공식=담당자 메일 동일·담당자명 없음 → 브랜드 공식으로 1회만 발송'; }
    r.mailcau = r.mailcau ? (r.mailcau + ' / ' + note) : note;
  }
}

// 마스터 탭 찾기: 숨은 마커(개발자 메타데이터) 우선 → 이름 폴백.
// 마커가 심겨 있으면 탭 이름을 뭘로 바꾸든/옮기든 재실행이 그 탭을 교체(중복 안 생김).
function findMaster_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var md = sheets[i].getDeveloperMetadata();
    for (var j = 0; j < md.length; j++) if (md[j].getKey() === 'intercharm_master') return sheets[i];
  }
  return ss.getSheetByName(MASTER_TAB);   // 폴백: 기본 이름
}

function writeMaster_(ss, recs) {
  var old = findMaster_(ss);
  var tabName = MASTER_TAB, pos = 0;
  if (old) { tabName = old.getName(); pos = Math.max(0, old.getIndex() - 1); ss.deleteSheet(old); } // 이름·위치 유지
  var sh = ss.insertSheet(tabName, pos);
  sh.addDeveloperMetadata('intercharm_master', '1');   // 다음 실행이 이름 무관하게 찾도록 태깅
  sh.setHiddenGridlines(true);
  var needCol = NC - sh.getMaxColumns(); if (needCol > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCol);
  var needRow = (DROW + recs.length + 2) - sh.getMaxRows(); if (needRow > 0) sh.insertRowsAfter(sh.getMaxRows(), needRow);

  var rows = recs.map(function (r) {
    return [r.num, r.track, r.year, r.gubun, r.brand, homeCell_(r.home),
      r.email, instaCell_(r.sns), r.person, r.title, r.mobile, r.pmail, r.extra, r.promo || '', '', r.intro,
      '', '', '', '', '', '', '', '', '', r.mailcau || '', r.source];
  });
  var last = DROW + rows.length - 1;
  if (rows.length) sh.getRange(DROW, 1, rows.length, NC).setValues(rows);

  // 헤더 (3섹션 색)
  sh.getRange(HROW, 1, 1, NC).setValues([HEADERS]).setFontColor(PAPER).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true).setHorizontalAlignment('center');
  sh.getRange(HROW, 1, 1, GRP1 - 1).setBackground(SEC.c1);
  sh.getRange(HROW, GRP1, 1, GRP2 - GRP1).setBackground(SEC.c2);
  sh.getRange(HROW, GRP2, 1, NC - GRP2 + 1).setBackground(SEC.c3);
  sh.setRowHeight(HROW, 36);

  buildSummary_(sh);

  // 밴딩
  if (rows.length) {
    sh.getRange(DROW, 1, rows.length, NC).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#FFFFFF').setSecondRowColor('#F7F3EC');
  }
  sh.setConditionalFormatRules(chipStatusRules_(sh, rows.length));

  // 열 너비
  // 1~13 정보 · 14 프로모션코드 · 15 비고 · 16 브랜드소개 · 17~25 트래킹 · 26 주의사항 · 27 출처
  var W = { 1: 30, 2: 74, 3: 52, 4: 66, 5: 200, 6: 190, 7: 195, 8: 130, 9: 92, 10: 132, 11: 128, 12: 195,
    13: 220, 14: 96, 15: 150, 16: 300, 17: 70, 18: 62, 19: 62, 20: 74, 21: 66, 22: 66, 23: 58, 24: 48, 25: 48,
    26: 170, 27: 66 };
  for (var col in W) sh.setColumnWidth(Number(col), W[col]);

  if (rows.length) {
    var body = sh.getRange(DROW, 1, rows.length, NC);
    body.setVerticalAlignment('top').setFontSize(10);
    sh.getRange(DROW, 13, rows.length, 4).setWrap(true);            // 추가담당자·프로모코드·비고·브랜드소개
    sh.getRange(DROW, 16, rows.length, 1).setFontColor('#666666');  // 브랜드 소개
    sh.getRange(DROW, 1, rows.length, 1).setHorizontalAlignment('center').setFontColor('#B0A894'); // #
    sh.getRange(DROW, 2, rows.length, 3).setHorizontalAlignment('center');   // 접점·연도·구분
    sh.getRange(DROW, GRP2, rows.length, NC - GRP2 + 1).setHorizontalAlignment('center'); // 트래킹
    // 섹션 세로 구분선
    [GRP1, GRP2].forEach(function (c) { sh.getRange(HROW, c, rows.length + 1, 1).setBorder(null, true, null, null, null, null, '#B9AE97', SpreadsheetApp.BorderStyle.SOLID_MEDIUM); });
  }

  addValidation_(sh, rows.length);
  sh.setFrozenRows(HROW);
  sh.getRange(HROW, 1, Math.max(rows.length, 1) + 1, NC).createFilter();

  var maxC = sh.getMaxColumns(); if (maxC > NC) sh.deleteColumns(NC + 1, maxC - NC);
  var maxR = sh.getMaxRows(); if (maxR > last + 2) sh.deleteRows(last + 3, maxR - (last + 2));
  sh.getRange(1, 1, last, NC).setFontFamily('Arial');
  // 프로모션 코드(14열) — 대시보드에 입력하는 키라서 고정폭·가운데·굵게 (전체 폰트 지정 이후에 적용)
  if (rows.length) {
    sh.getRange(DROW, 14, rows.length, 1).setFontFamily('Roboto Mono')
      .setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#3C3357');
  }
}

function buildSummary_(sh) {
  sh.getRange('A1:K1').merge().setValue('INTERCHARM 세일즈 마스터  ·  브랜드 ↔ 담당자 통합')
    .setBackground(INK).setFontColor(PAPER).setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1, 30);
  sh.getRange('A2').setValue('📌 월/회차').setFontWeight('bold').setBackground('#EDE7D9');
  sh.getRange('B2:C2').merge().setBackground('#FFF7E0').setNote('예: 2026-07 (이 탭을 복제해 월별로 사용)');
  sh.getRange('D2').setValue('메모').setFontWeight('bold').setBackground('#EDE7D9');
  sh.getRange('E2:K2').merge().setBackground('#FFFDF7');

  var D = DROW;
  var kpi1 = [
    ['A', '총 브랜드', '=COUNTA(E' + D + ':E)'],
    ['C', '명함(현장)', '=COUNTIF(B' + D + ':B,"명함")'],
    ['E', '사전조사', '=COUNTIF(B' + D + ':B,"사전조사")'],
    ['G', '공식메일 보유', '=COUNTIF(G' + D + ':G,"?*")'],
    ['I', '담당자 보유', '=COUNTIF(I' + D + ':I,"?*")']
  ];
  var kpi2 = [
    ['A', '브랜드 발송', '=COUNTIF(Q' + D + ':Q,"완료")'],
    ['C', '담당자 발송', '=COUNTIF(T' + D + ':T,"완료")'],
    ['E', '총 클릭', '=COUNTIF(R' + D + ':R,"O")+COUNTIF(U' + D + ':U,"O")'],
    ['G', '회신', '=COUNTIF(S' + D + ':S,"O")+COUNTIF(V' + D + ':V,"O")'],
    ['I', '회신율', '=IFERROR((COUNTIF(S' + D + ':S,"O")+COUNTIF(V' + D + ':V,"O"))/(COUNTIF(Q' + D + ':Q,"완료")+COUNTIF(T' + D + ':T,"완료")),"-")']
  ];
  function drawKPI(lr, vr, arr) {
    arr.forEach(function (k) {
      var col = k[0], next = String.fromCharCode(col.charCodeAt(0) + 1);
      sh.getRange(col + lr + ':' + next + lr).merge().setValue(k[1]).setFontSize(9).setFontColor('#8A8069')
        .setFontWeight('bold').setBackground('#EFE9DB').setHorizontalAlignment('center').setVerticalAlignment('middle');
      var vc = sh.getRange(col + vr + ':' + next + vr).merge().setFormula(k[2]).setFontWeight('bold').setFontSize(16)
        .setFontColor(INK).setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#FFFFFF');
      if (k[1] === '회신율') vc.setNumberFormat('0.0%');
      sh.getRange(col + lr + ':' + next + vr).setBorder(true, true, true, true, false, false, '#D8CFBE', SpreadsheetApp.BorderStyle.SOLID);
    });
    sh.setRowHeight(vr, 28); sh.setRowHeight(lr, 18);
  }
  drawKPI(3, 4, kpi1); drawKPI(5, 6, kpi2);

  sh.getRange('A7:K7').merge()
    .setValue('접점  🔴명함 = 현장서 명함 받음(담당자 있음·수작업 발송) · 🔵사전조사 = 사전수집(공식메일 콜드)   │   발송·클릭·회신은 브랜드/담당자 각각(P~U), 관심도·미팅·성사(V~X). 담당자 2명↑은 M열.')
    .setFontSize(9).setFontColor('#6B6455').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(7, 28);
}

// 접점 칩 + 연도 + 상태값 색상
function chipStatusRules_(sh, nrows) {
  var n = Math.max(nrows, 1);
  function col(c) { return sh.getRange(DROW, c, n, 1); }
  function eq(range, text, bg, fg) { return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setBold(true).setRanges([range]).build(); }
  var R = [];
  var B = col(2); R.push(eq(B, '명함', '#F6C9B4', '#8A2D0A')); R.push(eq(B, '사전조사', '#C9DCF3', '#1F4E8A'));
  var Y = col(3); R.push(eq(Y, '2026', '#E5EFE0', '#3C6B3A')); R.push(eq(Y, '2025', '#ECE6DA', '#8A8069'));
  [17, 20].forEach(function (c) { var r = col(c); R.push(eq(r, '완료', '#CFE7CE', '#1E6B2E')); R.push(eq(r, '예정', '#FBEFC6', '#8A6D1A')); R.push(eq(r, '보류', '#ECDFDC', '#9A5B52')); });
  [18, 19, 21, 22, 24, 25].forEach(function (c) { var r = col(c); R.push(eq(r, 'O', '#CFE7CE', '#1E6B2E')); R.push(eq(r, 'X', '#F3D9D9', '#9A3B3B')); });
  var Z = col(23); R.push(eq(Z, '상', '#F6C9B4', '#8A2D0A')); R.push(eq(Z, '중', '#FBEFC6', '#8A6D1A')); R.push(eq(Z, '하', '#E4DFD4', '#5F5849'));
  return R;
}

function addValidation_(sh, nrows) {
  if (!nrows) return;
  function dv(list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build(); }
  var contact = dv(['명함', '사전조사']), year = dv(['2026', '2025']), send = dv(['완료', '예정', '보류', '-']), ox = dv(['O', 'X']), interest = dv(['상', '중', '하']);
  sh.getRange(DROW, 2, nrows, 1).setDataValidation(contact);   // 접점
  sh.getRange(DROW, 3, nrows, 1).setDataValidation(year);      // 연도
  [17, 20].forEach(function (c) { sh.getRange(DROW, c, nrows, 1).setDataValidation(send); });   // 발송
  [18, 19, 21, 22, 24, 25].forEach(function (c) { sh.getRange(DROW, c, nrows, 1).setDataValidation(ox); }); // 클릭·회신·미팅·성사
  sh.getRange(DROW, 23, nrows, 1).setDataValidation(interest); // 관심도
}

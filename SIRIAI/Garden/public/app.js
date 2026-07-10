const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const STATUS = { ok: '충족', needs: '가드닝 필요', filling: '채워지는 중', error: '미확인' };
const cleanName = (n) => String(n || '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
const num = (n) => { if (n == null || n === '') return null; const v = Number(String(n).replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : null; };
const has = (v) => !!(v && String(v).trim());
const uploaded = (a) => has(a.contentLink);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// 검수 상태 판정 — 시트 텍스트("사용 확인"/"음원 다름"/"확인 완료"/"미준수"…) → pass/fail/none
function revState(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 'none';
  if (/다름|누락|미준수|미사용|불가|없음|✗|✘/i.test(s)) return 'fail';
  if (/확인|준수|사용|완료|ok|pass|✓|✔|^[oy]$/i.test(s)) return 'pass';
  return 'pass'; // 값은 있는데 애매 → 판정된 것으로 간주
}
// 검수 열별 카노니컬 값 (수동 편집 시 시트에 쓰는 문자열, 자동값 포맷과 통일)
const REVIEW = {
  19: { label: '음원', pass: '사용 확인', fail: '음원 다름' },
  20: { label: '음원구간', pass: '확인 완료', fail: '미준수' },
  21: { label: '해시태그', pass: '확인 완료', fail: '해시태그 누락' },
};
const revValOf = (a, col) => (col === 19 ? a.soundOk : col === 20 ? a.soundSection : a.hashtagOk);
// 검수 완료 = 업로드됨 + 음원·음원구간·해시태그 모두 판정됨(none 아님)
const reviewed = (a) => uploaded(a) && [19, 20, 21].every((c) => revState(revValOf(a, c)) !== 'none');
const reviewPending = (a) => uploaded(a) && !reviewed(a); // 업로드됐는데 검수 미완
const noticeSent = (a) => has(a.notice); // 확정안내 발송여부 (col 16 진행안내여부)

let state = { campaigns: [], campaign: null, krw: 1508.79, services: [], best: [], data: null, tab: 'recruit', sub: 'needs', fCo: 'all', fStatus: 'all', fUp: 'all', fNotice: 'all', fOrder: 'all', sortKey: 'v', sortDir: 'desc', bestOnly: false, pending: {}, unpicked: new Set() };
// unpicked: 가드닝 집행에서 사용자가 명시적으로 체크 해제한 handle. 재렌더(백그라운드 폴링)가 선택을 되돌려 해제한 계정까지 집행하는 것 방지.
// 편집 열 ↔ 계정 필드 매핑. 낙관적 저장·병합에 공용.
const COL_FIELD = { 3: 'nick', 4: 'link', 16: 'notice', 17: 'contentLink', 19: 'soundOk', 20: 'soundSection', 21: 'hashtagOk' };
const LOCK_COLS = [17, 19, 20, 21]; // 자동스캔이 건드리는 검수/콘텐츠 열 (서버 OVERRIDE_COLS 와 일치)

const won = (usd) => (usd == null ? '—' : '₩' + Math.round(Number(usd) * state.krw).toLocaleString());
const rateOf = () => Number(state.data?.config?.service?.rate || 0);

function timeAgo(iso) {
  if (!iso) return '아직 스캔 안 함';
  const d = new Date(iso), diff = (Date.now() - d) / 60000;
  if (diff < 1) return '방금'; if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}
async function api(path, opts) { return (await fetch(path, opts)).json(); }

async function init() {
  const [c, s] = await Promise.all([api('/api/campaigns'), api('/api/services')]);
  state.campaigns = c.campaigns || []; state.krw = c.krwPerUsd || state.krw; state.services = s.services || [];
  state.campaign = state.campaigns[0]?.id || null;
  renderCampaigns();
  if (!state.campaign) { $('#content').innerHTML = '<div class="empty">표시할 캠페인이 아직 없어요.<br>캠페인 설정을 추가하면 여기 나타나요.</div>'; return; }
  overlay(true, '불러오는 중…'); // 최초 로드: 시트 fetch(1~3초) 동안 빈 화면 대신 스피너
  try { await loadData(); } finally { overlay(false); }
}
async function loadData() {
  if (!state.campaign) return;
  state.data = await api(`/api/data?campaign=${state.campaign}`);
  if (state.data.config?.krwPerUsd) state.krw = state.data.config.krwPerUsd;
  state.best = state.data.best || [];
  reapplyPending(); // 아직 시트에 안 박힌 낙관적 편집을 서버 응답 위에 다시 얹음 (동시 loadData가 되돌리는 것 방지)
  render();
}
// 미확정 낙관적 쓰기 재적용 — 서버값이 이미 일치하면 해제(자가 치유)
function reapplyPending() {
  const accts = state.data.accounts || [];
  for (const k of Object.keys(state.pending)) {
    const [row, col] = k.split(':').map(Number);
    const a = accts.find((x) => Number(x.row) === row);
    if (!a) { delete state.pending[k]; continue; }
    if (String(a[COL_FIELD[col]] ?? '') === String(state.pending[k] ?? '')) { delete state.pending[k]; continue; }
    applyLocalTo(a, col, state.pending[k]);
  }
}

function renderCampaigns() {
  const sel = $('#campaignSelect');
  const groups = {};
  state.campaigns.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  sel.innerHTML = Object.entries(groups).map(([g, cs]) =>
    `<optgroup label="${g}">` + cs.map((c) => `<option value="${c.id}">${c.name}</option>`).join('') + '</optgroup>').join('');
  sel.value = state.campaign || '';
}

function render() {
  const d = state.data; if (!d) return;
  if (d.campaign?.id) $('#campaignSelect').value = d.campaign.id;
  $('#balance').textContent = won(d.balance);
  $('#scannedAt').textContent = timeAgo(d.scannedAt);
  $('#service').textContent = d.config?.service ? `#${d.config.service.id}` : '—';

  const accts = d.accounts || [], orders = d.orders || [];
  $('#cnt-recruit').textContent = accts.length;
  $('#cnt-upload').textContent = accts.filter(uploaded).length;
  const gardenN = accts.filter((a) => a.status === 'needs').length;
  $('#cnt-garden').textContent = gardenN;
  $('#cnt-garden').classList.toggle('warn', gardenN > 0); // 처리할 게 있을 때만 빨간 배지
  $('#cnt-deliver').textContent = accts.filter(uploaded).length;

  $$('.tab').forEach((t) => { const on = t.dataset.tab === state.tab; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  // 정산 탭은 독립 시뮬레이터 → 스캔 버튼·계정 통계 무의미하니 숨김 (딱 필요한 것만 노출)
  const isSettle = state.tab === 'settle';
  $('#scanBtn').hidden = isSettle;
  $('#contentScanBtn').hidden = isSettle;
  const st = $('.stats'); if (st) st.hidden = isSettle;
  const c = $('#content');
  if (state.tab === 'recruit') c.innerHTML = viewRecruit(accts);
  else if (state.tab === 'upload') c.innerHTML = viewUpload(accts);
  else if (state.tab === 'garden') c.innerHTML = viewGarden(accts, orders);
  else if (state.tab === 'deliver') c.innerHTML = viewDeliver(accts);
  else c.innerHTML = viewSettle();
  // 넓은 표는 자체 가로 스크롤 (좁은 창에서 페이지 전체가 밀리는 것 방지)
  c.querySelectorAll('table').forEach((t) => {
    const p = t.parentElement;
    if (p && !p.classList.contains('tscroll')) { const w = document.createElement('div'); w.className = 'tscroll'; p.insertBefore(w, t); w.appendChild(t); }
  });
  wire();
}

const chip = (s) => `<span class="chip ${s}">${STATUS[s] || s}</span>`;
const link = (h) => `<a href="https://www.tiktok.com/@${h}" target="_blank">@${h}</a>`;
const coChip = (c) => (c ? `<span class="co co-${c === 'MARU' ? 'maru' : c === 'SIRIAI' ? 'siriai' : 'x'}">${c}</span>` : '');
// 검수 드롭다운. col=19 음원 / 20 음원구간 / 21 해시태그. 선택 즉시 저장(낙관적 반영).
function revChip(a, col) {
  const st = revState(revValOf(a, col));
  const manual = a.manualCols && a.manualCols.includes(String(col));
  const title = manual ? '수동 지정됨' : (col !== 20 && a.autoDetected ? '자동 판정됨' : '');
  const opts = [['none', '미확인'], ['pass', '준수'], ['fail', '미준수']];
  return `<select class="rev-sel rev-${st}" data-row="${a.row}" data-col="${col}" title="${title}" aria-label="${REVIEW[col] ? REVIEW[col].label : '검수'} 검수 @${a.handle}">${opts.map(([v, l]) => `<option value="${v}"${st === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}

// ── KPI 카드 (아이콘 + 라벨 + 큰 숫자 + 보조) ──
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const IC = {
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  split: svg('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'),
  target: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  mail: svg('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  video: svg('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'),
  check: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  card: svg('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  userplus: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'),
  wallet: svg('<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  heart: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
  trophy: svg('<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>'),
};
function kpi(label, value, o = {}) {
  return `<div class="kpi">
    <div class="kpi-top">${o.ic ? `<span class="kpi-ic">${o.ic}</span>` : ''}<span class="lab">${label}</span></div>
    <div class="big"${o.accent ? ` style="color:${o.accent}"` : ''}>${value}</div>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}
  </div>`;
}
const ofTot = (n, tot) => `${n}<span class="of"> / ${tot}</span>`;

// ── 필터 (진행사 / 상태 / 업로드 / 확정안내) ──
const applyCo = (accts) => (state.fCo === 'all' ? accts : accts.filter((a) => (a.company || '') === state.fCo));
const applyFStatus = (accts) => (state.fStatus === 'all' ? accts : accts.filter((a) => a.status === state.fStatus));
function applyFUp(accts) {
  if (state.fUp === 'notup') return accts.filter((a) => !uploaded(a));
  if (state.fUp === 'up') return accts.filter(uploaded);
  if (state.fUp === 'pending') return accts.filter(reviewPending);
  return accts;
}
const applyFNotice = (accts) => (state.fNotice === 'unsent' ? accts.filter((a) => !noticeSent(a)) : accts);
// counts(선택): {옵션키: 개수} — 각 칩에 개수 표시. 다른 활성필터를 반영한 faceted 카운트.
function fbar(flab, cls, cur, opts, counts) {
  return `<div class="filterbar"><span class="flab">${flab}</span>${opts.map(([k, l]) => `<button class="fbtn ${cls} ${cur === k ? 'active' : ''}" data-k="${k}" aria-pressed="${cur === k}">${l}${counts && counts[k] != null ? ` <span class="fct">${counts[k]}</span>` : ''}</button>`).join('')}</div>`;
}
const coBar = (c) => fbar('진행사', 'co-f', state.fCo, [['all', '전체'], ['MARU', 'MARU'], ['SIRIAI', 'SIRIAI']], c);
const statusBar = (c) => fbar('상태', 'st-f', state.fStatus, [['all', '전체'], ['needs', '가드닝 필요'], ['filling', '채워지는 중'], ['ok', '충족'], ['error', '미확인']], c);
const upBar = (c) => fbar('업로드', 'up-f', state.fUp, [['all', '전체'], ['notup', '미업로드'], ['up', '업로드'], ['pending', '검수대기']], c);
const noticeBar = (c) => fbar('확정안내', 'nt-f', state.fNotice, [['all', '전체'], ['unsent', '미발송만']], c);
// 필터 옵션별 개수 (특정 리스트 기준). faceted = 다른 필터 적용된 리스트를 넘기면 됨.
const coCounts = (l) => ({ all: l.length, MARU: l.filter((a) => a.company === 'MARU').length, SIRIAI: l.filter((a) => a.company === 'SIRIAI').length });
const upCounts = (l) => ({ all: l.length, notup: l.filter((a) => !uploaded(a)).length, up: l.filter(uploaded).length, pending: l.filter(reviewPending).length });
const statusCounts = (l) => ({ all: l.length, needs: l.filter((a) => a.status === 'needs').length, filling: l.filter((a) => a.status === 'filling').length, ok: l.filter((a) => a.status === 'ok').length, error: l.filter((a) => a.status === 'error').length });
const noticeCounts = (l) => ({ all: l.length, unsent: l.filter((a) => !noticeSent(a)).length });
const filterRow = (...bars) => `<div class="filters">${bars.join('')}</div>`;

const showNotice = () => !!(state.data && state.data.config && state.data.config.confirmNotice);
// 확정안내 칩 (발송 ↔ 미발송 토글). col 16.
const noticeCell = (a) => `<td><button class="notice ${noticeSent(a) ? 'sent' : 'unsent'}" data-row="${a.row}" aria-pressed="${noticeSent(a)}">${noticeSent(a) ? '발송' : '미발송'}</button></td>`;

// ① 모집
function viewRecruit(accts) {
  if (!accts.length) return emptyScan();
  const maru = accts.filter((a) => a.company === 'MARU').length;
  const siriai = accts.filter((a) => a.company === 'SIRIAI').length;
  const over1k = accts.filter((a) => (a.current || 0) >= 1000).length;
  const nt = showNotice();
  let list = applyFStatus(applyCo(accts));
  if (nt) list = applyFNotice(list);
  const unsent = accts.filter((a) => !noticeSent(a)).length;
  const rows = list.map((a) => `<tr${nt && !noticeSent(a) ? ' class="row-alert"' : ''}>
    <td>${coChip(a.company)}</td>
    <td class="nick">${a.nick ? esc(a.nick) : '<span class="muted">—</span>'} <button class="cell-edit${a.nick ? '' : ' prompt'}" data-kind="nick" data-row="${a.row}" data-val="${esc(a.nick || '')}">${a.nick ? '✎' : '입력'}</button></td>
    <td class="handle">${link(a.handle)} <button class="cell-edit" data-kind="link" data-row="${a.row}" data-val="${esc(a.link || ('https://www.tiktok.com/@' + a.handle))}">✎</button></td>
    <td class="num">${a.current == null ? '' : fmt(a.current)} <button class="cell-edit${a.current == null ? ' prompt' : ''}" data-kind="fol" data-row="${a.row}" data-val="${a.current ?? ''}">${a.current == null ? '입력' : '✎'}</button></td>
    <td>${chip(a.status)}</td>${nt ? noticeCell(a) : ''}</tr>`).join('');
  return `<div class="cards">
      ${kpi('모집 계정', accts.length, { ic: IC.users })}
      ${kpi('MARU / SIRIAI', `${maru} / ${siriai}`, { ic: IC.split })}
      ${kpi('팔로워 1,000+ 충족', ofTot(over1k, accts.length), { ic: IC.target })}
      ${nt ? kpi('확정안내 미발송', unsent, { ic: IC.mail, accent: 'var(--needs)' }) : ''}
    </div>
    ${filterRow(coBar(coCounts((nt ? applyFNotice : (x) => x)(applyFStatus(accts)))), statusBar(statusCounts((nt ? applyFNotice : (x) => x)(applyCo(accts)))), nt ? noticeBar(noticeCounts(applyFStatus(applyCo(accts)))) : '')}
    <div class="bar"><button class="btn small" id="syncRecruitBtn">📥 모집시트 동기화</button><span class="sub" style="margin:0">모집시트(마루 등)의 새 계정 URL을 정리해서 마스터에 자동 추가</span></div>
    <table><thead><tr><th>진행사</th><th>닉네임</th><th>계정</th><th class="num">팔로워</th><th>상태</th>${nt ? '<th>확정안내</th>' : ''}</tr></thead><tbody>${rows || emptyRow(nt ? 6 : 5)}</tbody></table>`;
}

// ② 업로드
function viewUpload(accts) {
  if (!accts.length) return emptyScan();
  const up = accts.filter(uploaded);
  const rev = accts.filter(reviewed);
  const list = applyFUp(applyCo(accts));
  const rows = list.map((a) => `<tr${reviewPending(a) ? ' class="row-alert"' : ''}>
    <td>${coChip(a.company)}</td>
    <td class="handle">${link(a.handle)}</td>
    <td>${uploaded(a) ? (reviewPending(a) ? '<span class="chip needs">검수대기</span>' : '<span class="chip ok">업로드</span>') : '<span class="chip error">미업로드</span>'}</td>
    <td>${uploaded(a) ? `<a href="${esc(a.contentLink)}" target="_blank">영상 보기</a> <button class="cell-edit" data-kind="content" data-row="${a.row}" data-val="${esc(a.contentLink)}">✎</button>` : `<button class="cell-edit prompt" data-kind="content" data-row="${a.row}" data-val="">링크 달기</button>`}</td>
    <td>${revChip(a, 19)}</td>
    <td>${revChip(a, 20)}</td>
    <td>${revChip(a, 21)}</td></tr>`).join('');
  return `<div class="cards">
      ${kpi('업로드 완료', ofTot(up.length, accts.length), { ic: IC.video })}
      ${kpi('검수 완료', ofTot(rev.length, up.length || accts.length), { ic: IC.check })}
      ${kpi('검수대기', accts.filter(reviewPending).length, { ic: IC.clock, accent: 'var(--needs)' })}
    </div>
    ${filterRow(coBar(coCounts(applyFUp(accts))), upBar(upCounts(applyCo(accts))))}
    <table><thead><tr><th>진행사</th><th>계정</th><th>업로드</th><th>콘텐츠</th><th>음원</th><th>음원구간</th><th>해시태그</th></tr></thead><tbody>${rows || emptyRow(7)}</tbody></table>
    <div class="note"><b>음원·해시태그</b>는 스캔이 자동 판정, <b>음원구간</b>은 사람이 영상 보고 판정해요. 드롭다운에서 <b>준수·미준수</b>로 고치면 재스캔해도 유지(수동 우선), <b>미확인</b>으로 되돌리면 자동 판정에 다시 맡겨요.</div>`;
}

// ③ 가드닝 (하위 탭)
function viewGarden(accts, orders) {
  const subs = [['needs', '가드닝 필요'], ['orders', '집행 내역'], ['cost', '비용']];
  const bar = `<div class="subtabs">${subs.map(([k, l]) => `<button class="subtab ${state.sub === k ? 'active' : ''}" data-sub="${k}" aria-pressed="${state.sub === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (state.sub === 'needs') body = viewNeeds(accts);
  else if (state.sub === 'orders') body = viewOrders(orders);
  else body = viewCost(orders, state.data.balance);
  return bar + body;
}
function viewNeeds(accts) {
  const fa = applyCo(accts);
  const needs = fa.filter((a) => a.status === 'needs');
  const filling = fa.filter((a) => a.status === 'filling');
  if (!needs.length) return coBar(coCounts(accts.filter((a) => a.status === 'needs'))) + `<div class="empty">✅ 지금 가드닝 필요한 계정이 없어요.</div>${filling.length ? fillingNote(filling) : ''}`;
  const rate = rateOf();
  const allPicked = needs.every((a) => !state.unpicked.has(a.handle));
  const rows = needs.map((a) => `<tr>
    <td><input type="checkbox" class="pick" data-h="${a.handle}" aria-label="집행 선택 @${a.handle}"${state.unpicked.has(a.handle) ? '' : ' checked'}></td>
    <td class="handle">${link(a.handle)}</td><td class="num">${fmt(a.current)}</td><td class="num">${fmt(a.order)}</td><td class="num">${won((a.order / 1000) * rate)}</td></tr>`).join('');
  return coBar(coCounts(accts.filter((a) => a.status === 'needs'))) + `<div class="bar"><div class="summary">가드닝 필요 <b>${needs.length}</b>개 · 선택 <b id="selQty">0</b>명 · 예상 <b id="selCost">₩0</b></div><div class="spacer"></div><button class="btn danger" id="execBtn">선택 집행</button></div>
    <table><thead><tr><th><input type="checkbox" id="pickAll" aria-label="전체 선택"${allPicked ? ' checked' : ''}></th><th>계정</th><th class="num">현재</th><th class="num">충전량</th><th class="num">예상비용</th></tr></thead><tbody>${rows}</tbody></table>${filling.length ? fillingNote(filling) : ''}`;
}
const fillingNote = (filling) => `<div class="note"><b>⏳ 채워지는 중 (재주문 안 함):</b> ${filling.map((f) => `@${f.handle} (현재 ${fmt(f.current)}+진행중 ${fmt(f.inFlight)}=${fmt(f.projected)})`).join(', ')}</div>`;
const CANCEL_ST = ['Canceled', 'Cancelled', 'Refunded'];
// 주문 상태 분류 (필터·요약·칩 공용). active 진행중 / done 완료 / canceled 취소·종료 / stuck 오류
function orderClass(o) {
  if (o.cancelStuck) return 'stuck';
  if (o.done && CANCEL_ST.includes(o.status)) return 'canceled';
  if (o.closed) return 'canceled';
  if (o.done) return 'done';
  return 'active';
}
function viewOrders(orders) {
  if (!orders.length) return `<div class="empty">아직 집행 내역이 없어요.</div>`;
  const cnt = { all: orders.length, active: 0, done: 0, canceled: 0, stuck: 0 };
  orders.forEach((o) => cnt[orderClass(o)]++);
  const shown = state.fOrder === 'all' ? orders : orders.filter((o) => orderClass(o) === state.fOrder);
  const rows = [...shown].reverse().map((o) => {
    const delivered = o.quantity - (Number(o.remains) || 0), pct = o.quantity ? Math.round((delivered / o.quantity) * 100) : 0;
    let st;
    if (o.cancelStuck) st = '<span class="chip needs">⚠️ 오류</span>';
    else if (o.done && CANCEL_ST.includes(o.status)) st = '<span class="chip stale">취소됨</span>';
    else if (o.done && o.status === 'Partial') st = '<span class="chip ok">부분완료</span>';
    else if (o.done) st = '<span class="chip ok">완료</span>';
    else if (o.closed) st = '<span class="chip stale">종료·취소요청</span>';
    else if (o.stale) st = '<span class="chip stale">정체 의심</span>';
    else st = '<span class="chip filling">진행중</span>';
    const canClose = (!o.done && !o.closed) || o.cancelStuck;
    return `<tr><td class="company">#${o.id}${o.service ? ` · s${o.service}` : ''}</td><td class="handle">${link(o.handle)}</td><td class="num">${fmt(o.quantity)}</td>
      <td><div class="progress"><span style="width:${pct}%"></span></div></td><td class="num">${delivered}/${o.quantity}</td><td>${st}</td>
      <td class="num">${won(o.charge != null ? Number(o.charge) : o.cost)}</td><td class="company">${timeAgo(o.placedAt)}</td>
      <td>${canClose ? `<button class="btn small close-order" data-id="${o.id}">${o.cancelStuck ? '다시 종료' : '종료 처리'}</button>` : ''}</td></tr>`;
  }).join('');
  const staleN = orders.filter((o) => o.stale && orderClass(o) === 'active').length;
  const bar = filterRow(fbar('상태', 'ord-f', state.fOrder, [['all', '전체'], ['active', '진행중'], ['done', '완료'], ['canceled', '취소·종료'], ['stuck', '오류']], cnt));
  return `<div class="bar"><div class="summary">총 <b>${orders.length}</b>건 · 진행중 <b>${cnt.active}</b>${cnt.stuck ? ` · <b style="color:var(--needs)">오류 ${cnt.stuck}</b>` : ''}${staleN ? ` · <b style="color:var(--warn)">정체 의심 ${staleN}</b>` : ''}</div></div>
  ${bar}
  <table><thead><tr><th>주문#</th><th>계정</th><th class="num">수량</th><th>배송</th><th class="num">진행</th><th>상태</th><th class="num">비용</th><th>시각</th><th></th></tr></thead><tbody>${rows || emptyRow(9, '이 상태의 주문이 없어요.')}</tbody></table>
  ${cnt.stuck ? `<div class="note"><b style="color:var(--needs)">⚠️ 오류</b> = 종료 처리했는데 smmkings에서 취소가 안 먹히고 계속 배송 중인 주문이에요(종료 후 1시간 지나도 배송 중). <b>다시 종료</b>로 재시도할 수 있고, 그 사이 진행중으로 잡혀 재가드닝을 막아요.</div>` : ''}
  ${staleN ? `<div class="note"><b style="color:var(--warn)">⚠️ 정체 의심</b> = ${state.data.config.staleDays}일 넘게 안 끝난 주문. 멈춰있으면 <b>종료 처리</b>로 취소하고, 그 계정을 다시 가드닝하면 돼요.</div>` : ''}`;
}
function viewCost(orders, balance) {
  const byH = {};
  orders.forEach((o) => { byH[o.handle] = byH[o.handle] || { handle: o.handle, qty: 0, cost: 0, n: 0 }; byH[o.handle].qty += o.quantity; byH[o.handle].cost += (o.charge != null ? Number(o.charge) : (o.cost || 0)); byH[o.handle].n += 1; });
  const rows = Object.values(byH).sort((a, b) => b.cost - a.cost);
  const curId = state.data.config?.service?.id;
  const svcOpts = state.services.map((s) => `<option value="${s.id}" ${s.id == curId ? 'selected' : ''}>#${s.id} · ${cleanName(s.name)} · ₩${Math.round(Number(s.rate) * state.krw).toLocaleString()}/1k</option>`).join('');
  return `<div class="cards">
      ${kpi('총 지출', won(rows.reduce((s, r) => s + r.cost, 0)), { ic: IC.card })}
      ${kpi('넣은 팔로워 합계', fmt(rows.reduce((s, r) => s + r.qty, 0)), { ic: IC.userplus })}
      ${kpi('현재 잔액', won(balance), { ic: IC.wallet })}
      <div class="kpi wide"><div class="lab">환율 · 실시간 시장환율 자동</div><div class="big">₩${Math.round(state.krw).toLocaleString()} / $1</div>
        <div class="rate-box" style="margin-top:10px"><span class="sub">smmkings 잔액과 다르면 →</span><input class="rate" id="rateInput" placeholder="현재 잔액 ₩"><button class="btn small" id="rateSave">재보정</button></div></div>
      <div class="kpi wide"><div class="lab">가드닝 서비스</div><select class="svc" id="svcSelect" aria-label="가드닝 서비스 선택">${svcOpts}</select><div class="sub">지난 주문은 각자 산 서비스로 기록(집행 내역 s번호).</div></div>
    </div>
    ${rows.length ? `<table><thead><tr><th>계정</th><th class="num">넣은 팔로워</th><th class="num">주문</th><th class="num">비용</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="handle">${link(r.handle)}</td><td class="num">${fmt(r.qty)}</td><td class="num">${r.n}회</td><td class="num">${won(r.cost)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 집행 내역이 없어요.</div>'}`;
}

// ④ 납품 (성과)
function viewDeliver(accts) {
  const content = applyCo(accts).filter(uploaded);
  const withPerf = content.map((a) => ({ ...a, v: num(a.views), l: num(a.likes), c: num(a.comments), sh: num(a.shares) }));
  const totalViews = withPerf.reduce((s, a) => s + (a.v || 0), 0);
  const totalLikes = withPerf.reduce((s, a) => s + (a.l || 0), 0);
  const hero = [...withPerf].sort((a, b) => (b.v || 0) - (a.v || 0))[0];
  const heroOn = hero && hero.v ? hero : null;
  const noPerf = totalViews === 0 && totalLikes === 0;
  if (!content.length) return coBar(coCounts(accts.filter(uploaded))) + `<div class="empty">아직 업로드된 콘텐츠가 없어요.<br>업로드가 되면 여기서 성과를 봐요.</div>`;
  // 베스트만 필터 → 정렬(헤더 클릭)
  let list = state.bestOnly ? withPerf.filter((a) => state.best.includes(a.handle)) : withPerf;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => ((a[state.sortKey] || 0) - (b[state.sortKey] || 0)) * dir);
  const arrow = (k) => (state.sortKey === k ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const th = (k, l) => `<th class="num sortable${state.sortKey === k ? ' sorted' : ''}" data-sort="${k}" tabindex="0" role="button" aria-sort="${state.sortKey === k ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="클릭하면 이 열로 정렬">${l}${arrow(k)}</th>`;
  const rows = list.map((a) => `<tr>
    <td><button class="star ${state.best.includes(a.handle) ? 'on' : ''}" data-h="${a.handle}" title="SIRIAI 베스트" aria-pressed="${state.best.includes(a.handle)}" aria-label="SIRIAI 베스트 @${a.handle}">★</button></td>
    <td class="handle">${link(a.handle)}</td>
    <td class="num">${a.v == null ? '—' : fmt(a.v)}</td><td class="num">${a.l == null ? '—' : fmt(a.l)}</td>
    <td class="num">${a.c == null ? '—' : fmt(a.c)}</td><td class="num">${a.sh == null ? '—' : fmt(a.sh)}</td>
    <td><a href="${esc(a.contentLink)}" target="_blank">영상</a></td></tr>`).join('');
  const bestCount = withPerf.filter((a) => state.best.includes(a.handle)).length;
  return coBar(coCounts(accts.filter(uploaded))) + `<div class="cards">
      ${kpi('총 조회수', fmt(totalViews), { ic: IC.eye })}
      ${kpi('총 좋아요', fmt(totalLikes), { ic: IC.heart })}
      ${kpi('업로드 콘텐츠', content.length, { ic: IC.video })}
      ${heroOn ? `<div class="kpi wide"><div class="kpi-top"><span class="kpi-ic">${IC.trophy}</span><span class="lab">히어로 콘텐츠 · 최고 조회수</span></div><div class="big" style="font-size:20px">@${heroOn.handle} · ${fmt(heroOn.v)} 조회</div><div class="sub"><a href="${esc(heroOn.contentLink)}" target="_blank">영상 보기</a></div></div>` : ''}
    </div>
    <div class="filters"><div class="filterbar"><button class="fbtn best-f ${state.bestOnly ? 'active' : ''}" aria-pressed="${state.bestOnly}">★ 베스트만 (${bestCount})</button></div></div>
    ${noPerf ? '<div class="note"><b>아직 조회수 데이터가 비어있어요.</b> 시트의 조회수·좋아요 칸을 채우면 여기 자동으로 집계돼요. 지금도 ★로 <b>SIRIAI 베스트 콘텐츠</b>는 미리 찍어둘 수 있어요.</div>' : ''}
    <table><thead><tr><th>★</th><th>계정</th>${th('v', '조회수')}${th('l', '좋아요')}${th('c', '댓글')}${th('sh', '공유')}<th>콘텐츠</th></tr></thead><tbody>${rows || emptyRow(7, state.bestOnly ? '★ 베스트로 찍은 콘텐츠가 없어요.' : '조건에 맞는 콘텐츠가 없어요.')}</tbody></table>`;
}

// ⑤ 정산 — 비용·마진 시뮬레이터. 테두리 없는 iframe을 내용 높이만큼 자동 확장(이중 스크롤·액자 제거).
function viewSettle() {
  return `<iframe class="sim-frame" src="/bayonn_margin_simulator.html" title="정산 시뮬레이터"
    onload="try{var d=this.contentWindow.document;var fit=()=>{this.style.height=(d.documentElement.scrollHeight+24)+'px';};fit();setTimeout(fit,500);setTimeout(fit,1500);}catch(e){this.style.height='1600px';}"></iframe>`;
}

const emptyScan = () => `<div class="empty">아직 데이터가 없어요.<br><br><button class="btn primary" onclick="scan()">지금 스캔하기</button></div>`;
// 필터 결과가 0행일 때 표 안에 넣는 빈 상태 (헤더만 남은 빈 표 방지). rows가 비면 이걸로 대체.
const emptyRow = (cols, msg = '조건에 맞는 계정이 없어요.') => `<tr class="empty-tr"><td colspan="${cols}">${msg}</td></tr>`;

function updateSel() {
  const needs = (state.data.accounts || []).filter((a) => a.status === 'needs');
  const picked = $$('.pick:checked').map((c) => c.dataset.h);
  const sel = needs.filter((a) => picked.includes(a.handle));
  const qty = sel.reduce((s, a) => s + a.order, 0);
  if ($('#selQty')) $('#selQty').textContent = fmt(qty);
  if ($('#selCost')) $('#selCost').textContent = won((qty / 1000) * rateOf());
  if ($('#execBtn')) $('#execBtn').disabled = !sel.length;
}
function wire() {
  $$('.subtab').forEach((b) => b.addEventListener('click', () => { state.sub = b.dataset.sub; render(); }));
  $$('.pick').forEach((c) => c.addEventListener('change', () => { state.unpicked[c.checked ? 'delete' : 'add'](c.dataset.h); updateSel(); }));
  if ($('#pickAll')) $('#pickAll').addEventListener('change', (e) => { $$('.pick').forEach((c) => { c.checked = e.target.checked; state.unpicked[e.target.checked ? 'delete' : 'add'](c.dataset.h); }); updateSel(); });
  if ($('#execBtn')) $('#execBtn').addEventListener('click', openExecute);
  if ($('#rateSave')) $('#rateSave').addEventListener('click', recalibrate);
  if ($('#rateInput')) $('#rateInput').addEventListener('blur', (e) => { const x = num(e.target.value); e.target.value = x == null ? '' : fmt(x); }); // 잔액 입력칸: 벗어나면 천단위 콤마
  if ($('#svcSelect')) $('#svcSelect').addEventListener('change', changeService);
  if ($('#syncRecruitBtn')) $('#syncRecruitBtn').addEventListener('click', syncRecruit);
  $$('.close-order').forEach((b) => b.addEventListener('click', () => closeOrder(b.dataset.id)));
  $$('.star').forEach((b) => b.addEventListener('click', () => toggleBest(b.dataset.h)));
  $$('.cell-edit').forEach((b) => b.addEventListener('click', () => startCellEdit(b)));
  $$('.rev-sel').forEach((s) => s.addEventListener('change', () => setReview(Number(s.dataset.row), Number(s.dataset.col), s.value)));
  $$('.notice').forEach((b) => b.addEventListener('click', () => toggleNotice(Number(b.dataset.row), b.classList.contains('sent'))));
  $$('.co-f').forEach((b) => b.addEventListener('click', () => { state.fCo = b.dataset.k; render(); }));
  $$('.st-f').forEach((b) => b.addEventListener('click', () => { state.fStatus = b.dataset.k; render(); }));
  $$('.up-f').forEach((b) => b.addEventListener('click', () => { state.fUp = b.dataset.k; render(); }));
  $$('.nt-f').forEach((b) => b.addEventListener('click', () => { state.fNotice = b.dataset.k; render(); }));
  $$('.ord-f').forEach((b) => b.addEventListener('click', () => { state.fOrder = b.dataset.k; render(); }));
  $$('.best-f').forEach((b) => b.addEventListener('click', () => { state.bestOnly = !state.bestOnly; render(); }));
  const doSort = (h) => {
    const k = h.dataset.sort;
    if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortKey = k; state.sortDir = 'desc'; }
    render();
  };
  $$('th.sortable').forEach((h) => {
    h.addEventListener('click', () => doSort(h));
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(h); } });
  });
  updateSel();
}

// ── 인라인 편집 (팝업 대신 셀 안에서 바로 입력) ──
function startCellEdit(btn) {
  const td = btn.closest('td');
  if (!td || td.querySelector('input')) return;
  const kind = btn.dataset.kind, row = Number(btn.dataset.row), value = btn.dataset.val || '';
  const cfg = {
    nick: { ph: '닉네임', save: (v) => saveCell(row, 3, v) },
    link: { ph: '틱톡 계정 링크', validate: (v) => /@[A-Za-z0-9._]+/.test(v), verr: '계정 링크에 @사용자명이 있어야 해요 (예: tiktok.com/@user). 없으면 계정이 목록에서 사라져요.', save: (v) => saveCell(row, 4, v) },
    content: { ph: '영상 링크 붙여넣기', save: (v) => saveCell(row, 17, v) },
    fol: { ph: '팔로워 수', num: true, save: (v) => saveFollowers(row, v) },
  }[kind];
  if (!cfg) return;
  const shown = (cfg.num && num(value) != null) ? fmt(num(value)) : value; // 숫자칸은 콤마 붙여 보여줌
  td.innerHTML = `<input class="inline-input" type="text" value="${esc(shown)}" placeholder="${cfg.ph}">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const v = inp.value.trim();
    const unchanged = cfg.num ? (num(v) === num(String(value))) : (v === String(value).trim());
    if (unchanged) return render(); // 변화 없음 → 원복 (숫자칸은 콤마 무시하고 비교)
    if (cfg.num && v !== '' && num(v) == null) { toast('숫자만 넣을 수 있어요'); return render(); }
    if (cfg.validate && !cfg.validate(v)) { toast(cfg.verr); return render(); } // 검증 실패 → 취소
    await cfg.save(v);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); done = true; render(); }
  });
  inp.addEventListener('blur', commit);
}
// 검수 드롭다운 선택 → 저장
function setReview(row, col, next) {
  if (!REVIEW[col]) return;
  const value = next === 'pass' ? REVIEW[col].pass : next === 'fail' ? REVIEW[col].fail : '';
  saveCell(row, col, value);
}
// 확정안내 발송 토글 (col 16)
function toggleNotice(row, isSent) {
  saveCell(row, 16, isSent ? '' : '안내완료');
}
// 로컬 상태에 셀 값 즉시 반영 (낙관적 UI — 시트 응답 안 기다림)
function applyLocalTo(a, col, value) {
  if (COL_FIELD[col]) a[COL_FIELD[col]] = value;
  if (LOCK_COLS.includes(col)) { // 수동 잠금 열 → manualCols 갱신
    const set = new Set(a.manualCols || []);
    if (value && String(value).trim()) set.add(String(col)); else set.delete(String(col));
    a.manualCols = [...set];
  }
}
function applyLocal(row, col, value) {
  const a = (state.data.accounts || []).find((x) => Number(x.row) === Number(row));
  if (a) applyLocalTo(a, col, value);
}
// 셀 되쓰기 (/api/cell) — 낙관적: 로컬 먼저 반영·렌더 후 백그라운드 저장.
// 값 유지 필요한 쓰기(준수/미준수 등)는 pending 추적해 동시 loadData가 되돌리지 못하게 함.
// 링크(col4)·검수 미확인(잠금열 공란=자동반환)은 서버 진실이 정답이라 저장 후 재조회.
async function saveCell(row, col, value) {
  applyLocal(row, col, value);
  render();
  const blank = !String(value).trim();
  const reconcile = col === 4 || (LOCK_COLS.includes(col) && blank);
  const key = row + ':' + col;
  if (!reconcile) state.pending[key] = value;
  const r = await api(`/api/cell?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, col, value }) }).catch(() => ({ error: '네트워크 오류' }));
  if (r.error) { delete state.pending[key]; toast('저장 실패: ' + r.error); await loadData(); return; }
  if (reconcile) await loadData(); // 링크 재계산 / 미확인 자동반환 → 서버 진실 반영
}
// 팔로워 되쓰기 (/api/manual — 가드닝 대상여부·상태도 갱신되므로 저장 후 새로고침)
async function saveFollowers(row, v) {
  const n = num(v);
  if (n == null) return render(); // 빈값/잘못된 값 → 취소
  const a = (state.data.accounts || []).find((x) => Number(x.row) === Number(row));
  if (a) { a.current = n; a.sheetFollowers = n; render(); } // 즉시 숫자 반영
  const r = await api(`/api/manual?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, followers: n }) }).catch(() => ({ error: '네트워크 오류' }));
  if (r.error) { toast('저장 실패: ' + r.error); await loadData(); return; }
  loadData(); // 상태(가드닝 필요 등) 서버 재계산 반영 (백그라운드)
}

async function toggleBest(handle) {
  const on = !state.best.includes(handle);
  const r = await api(`/api/best?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, on }) });
  if (r.best) state.best = r.best;
  render();
}
async function recalibrate() {
  const v = num($('#rateInput').value);
  if (!v || v <= 0) return toast('현재 smmkings 잔액(₩)을 숫자로 넣어주세요');
  const r = await api('/api/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ krwBalance: v }) });
  if (r.error) return toast('오류: ' + r.error);
  state.krw = r.krwPerUsd; toast(`환율 재보정 완료 (₩${Math.round(r.krwPerUsd).toLocaleString()}/$1)`); render();
}
async function changeService(e) {
  const r = await api(`/api/service?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: e.target.value }) });
  if (r.error) return toast('오류: ' + r.error);
  toast(`서비스 #${e.target.value} 로 변경`); await loadData();
}
async function closeOrder(id) {
  if (!confirm(`주문 #${id} 을 종료 처리할까요?\nsmmkings 취소를 시도하고 완료 처리해요. 이후 이 계정은 다시 가드닝할 수 있어요.`)) return;
  overlay(true, '종료 처리 중…');
  const r = await api(`/api/order/close?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('실패: ' + r.error);
  if (r.cancelled) toast('취소·환불 요청됨 · 종료 완료');
  else toast('⚠️ 취소는 안 됐어요(이 서비스는 자동취소 미지원) — 이 주문은 계속 배송될 수 있어 배송 끝나야 재가드닝돼요');
  await loadData();
}
async function openExecute() {
  const picked = $$('.pick:checked').map((c) => c.dataset.h);
  if (!picked.length) return;
  overlay(true, '계획 확인 중…');
  const plan = await api(`/api/plan?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handles: picked }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (plan.error) return toast('오류: ' + plan.error);
  if (!plan.toOrder || !plan.toOrder.length) return toast('주문할 게 없어요');
  const pwReq = !!state.data.config?.execPwRequired;
  $('#modalBody').innerHTML = plan.toOrder.map((o) => `<div class="plan-row"><span>@${o.handle} <span style="color:var(--muted)">(현재 ${fmt(o.current)})</span></span><span class="mono">${fmt(o.qty)}명 · ${won(o.cost)}</span></div>`).join('') +
    `<div class="plan-total"><span>총 ${plan.toOrder.length}개 · ${fmt(plan.totalQty)}명</span><span>${won(plan.totalCost)}</span></div><div class="note">서비스 #${plan.service?.id} · 잔액 ${won(plan.balance)} · 집행 직전 최신 팔로워로 재확인 후 주문돼요.</div>` +
    (pwReq ? `<div class="pw-row"><label for="execPw">집행 비번</label><input type="password" id="execPw" inputmode="numeric" autocomplete="off" placeholder="돈 나가는 확정 — 비번 입력"></div>` : '');
  $('#modal').hidden = false;
  (pwReq ? $('#execPw') : $('#modalCancel')).focus(); // 비번 필요하면 비번칸, 아니면 취소로 포커스
  $('#modalConfirm').onclick = () => doExecute(picked);
  if (pwReq) $('#execPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doExecute(picked); } });
}
async function doExecute(handles) {
  const password = $('#execPw') ? $('#execPw').value : '';
  if (state.data.config?.execPwRequired && !password) { toast('집행 비번을 입력해 주세요'); $('#execPw') && $('#execPw').focus(); return; } // 모달 유지
  $('#modal').hidden = true; overlay(true, '주문 넣는 중…');
  const r = await api(`/api/execute?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handles, confirm: true, password }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('실패: ' + r.error);
  toast((r.placed || []).length ? `✅ ${r.placed.length}개 주문 완료` : '주문할 게 없었어요');
  state.tab = 'garden'; state.sub = 'orders'; await loadData();
}
async function syncRecruit() {
  overlay(true, '모집시트에서 새 계정 가져오는 중…');
  const r = await api(`/api/sync-recruit?campaign=${state.campaign}`, { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('동기화 실패: ' + r.error);
  if (!r.added) return toast('새로 추가할 계정이 없어요 (이미 다 있음)');
  const sample = (r.handles || []).slice(0, 3).map((h) => '@' + h).join(', ');
  toast(`✅ 새 계정 ${r.added}개 추가${sample ? ' — ' + sample + (r.added > 3 ? ' 외' : '') : ''}`);
  await loadData();
}
async function scan() {
  overlay(true, '전체 계정 팔로워 확인 중… (크롬 창이 떠요 — 그대로 두세요)');
  const r = await api(`/api/scan?campaign=${state.campaign}&full=1`, { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('스캔 실패: ' + r.error);
  toast(`스캔 완료 (${r.scannedCount != null ? r.scannedCount : ''}개)` + (r.nicksWritten ? ` · 닉네임 ${r.nicksWritten}개 채움` : '')); await loadData();
}

async function contentScan(full) {
  const btn = $('#contentScanBtn');
  if (btn.disabled) return; // 이미 스캔 중이면 재진입 막기 (중복 스캔·중복 폴링 방지)
  btn.disabled = true; // 느린 초기 왕복 동안 더블클릭 방지 — await 전에 잠금
  const r = await api(`/api/content-scan?campaign=${state.campaign}${full ? '&full=1' : ''}`, { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  if (r.error) { btn.disabled = false; return toast('오류: ' + r.error); }
  toast('콘텐츠 스캔 시작 — 크롬 창이 떠요. 그대로 두세요 (~4분)');
  const poll = setInterval(async () => {
    let s;
    try { s = await api('/api/content-scan/status'); } catch { return; }
    if (s.error) { clearInterval(poll); btn.disabled = false; btn.textContent = '업로드 스캔'; return toast('스캔 실패: ' + s.error); }
    if (s.running) { btn.textContent = `스캔 중… ${s.done}/${s.total || '?'}`; return; }
    clearInterval(poll); btn.disabled = false; btn.textContent = '업로드 스캔';
    toast(`콘텐츠 스캔 완료 — 업로드 ${s.up}개 · 시트 ${s.written}칸 반영`);
    await loadData();
  }, 3000);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 3400); }
function overlay(show, msg) { $('#overlay').hidden = !show; if (msg) $('#overlayMsg').textContent = msg; }

$$('.tab').forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; render(); }));
$('#campaignSelect').addEventListener('change', (e) => { state.campaign = e.target.value; state.tab = 'recruit'; state.pending = {}; state.unpicked = new Set(); overlay(true, '불러오는 중…'); loadData().finally(() => overlay(false)); });
$('#scanBtn').addEventListener('click', scan);
$('#contentScanBtn').addEventListener('click', (e) => contentScan(e.shiftKey));
function closeModal() { $('#modal').hidden = true; }
$('#modalCancel').addEventListener('click', closeModal);
// 돈 나가는 확정 다이얼로그 — Esc로 닫기(취소), 바깥 배경 클릭도 취소
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
window.scan = scan;
init();

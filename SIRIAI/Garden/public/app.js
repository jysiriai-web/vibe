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

let state = { campaigns: [], campaign: null, krw: 1508.79, services: [], best: [], data: null, tab: 'recruit', sub: 'needs', fCo: 'all', fStatus: 'all', fUp: 'all', fNotice: 'all', sortKey: 'v', sortDir: 'desc', bestOnly: false, pending: {} };
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
  await loadData();
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
  const groups = {};
  state.campaigns.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  const nav = $('#campaignNav');
  nav.innerHTML = Object.entries(groups).map(([g, cs]) =>
    `<div class="group">${g}</div>` + cs.map((c) => `<button class="camp ${c.id === state.campaign ? 'active' : ''}" data-c="${c.id}">${c.name}</button>`).join('')).join('');
  $$('.camp', nav).forEach((b) => b.addEventListener('click', () => { state.campaign = b.dataset.c; state.tab = 'recruit'; state.pending = {}; renderCampaigns(); loadData(); }));
}

function render() {
  const d = state.data; if (!d) return;
  $('#campTitle').textContent = d.campaign?.name || '—';
  $('#balance').textContent = won(d.balance);
  $('#scannedAt').textContent = timeAgo(d.scannedAt);
  $('#service').textContent = d.config?.service ? `#${d.config.service.id}` : '—';

  const accts = d.accounts || [], orders = d.orders || [];
  $('#cnt-recruit').textContent = accts.length;
  $('#cnt-upload').textContent = accts.filter(uploaded).length;
  $('#cnt-garden').textContent = accts.filter((a) => a.status === 'needs').length;
  $('#cnt-deliver').textContent = accts.filter(uploaded).length;

  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
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
  return `<select class="rev-sel rev-${st}" data-row="${a.row}" data-col="${col}" title="${title}">${opts.map(([v, l]) => `<option value="${v}"${st === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}

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
function fbar(flab, cls, cur, opts) {
  return `<div class="filterbar"><span class="flab">${flab}</span>${opts.map(([k, l]) => `<button class="fbtn ${cls} ${cur === k ? 'active' : ''}" data-k="${k}">${l}</button>`).join('')}</div>`;
}
const coBar = () => fbar('진행사', 'co-f', state.fCo, [['all', '전체'], ['MARU', 'MARU'], ['SIRIAI', 'SIRIAI']]);
const statusBar = () => fbar('상태', 'st-f', state.fStatus, [['all', '전체'], ['needs', '가드닝 필요'], ['filling', '채워지는 중'], ['ok', '충족'], ['error', '미확인']]);
const upBar = () => fbar('업로드', 'up-f', state.fUp, [['all', '전체'], ['notup', '미업로드'], ['up', '업로드'], ['pending', '검수대기']]);
const noticeBar = () => fbar('확정안내', 'nt-f', state.fNotice, [['all', '전체'], ['unsent', '미발송만']]);
const filterRow = (...bars) => `<div class="filters">${bars.join('')}</div>`;

const showNotice = () => !!(state.data && state.data.config && state.data.config.confirmNotice);
// 확정안내 칩 (발송 ↔ 미발송 토글). col 16.
const noticeCell = (a) => `<td><button class="notice ${noticeSent(a) ? 'sent' : 'unsent'}" data-row="${a.row}" data-cur="${esc(a.notice || '')}">${noticeSent(a) ? '발송' : '미발송'}</button></td>`;

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
    <td>${a.nick ? esc(a.nick) : '<span class="muted">—</span>'} <button class="cell-edit" data-kind="nick" data-row="${a.row}" data-val="${esc(a.nick || '')}">${a.nick ? '✎' : '입력'}</button></td>
    <td class="handle">${link(a.handle)} <button class="cell-edit" data-kind="link" data-row="${a.row}" data-val="${esc(a.link || ('https://www.tiktok.com/@' + a.handle))}">✎</button></td>
    <td class="num">${a.current == null ? '' : fmt(a.current)} <button class="cell-edit" data-kind="fol" data-row="${a.row}" data-val="${a.current ?? ''}">${a.current == null ? '입력' : '✎'}</button></td>
    <td>${chip(a.status)}</td>${nt ? noticeCell(a) : ''}</tr>`).join('');
  return `<div class="cards">
      <div class="kpi"><div class="lab">모집 계정</div><div class="big">${accts.length}</div></div>
      <div class="kpi"><div class="lab">MARU / SIRIAI</div><div class="big">${maru} / ${siriai}</div></div>
      <div class="kpi"><div class="lab">팔로워 1,000+ 충족</div><div class="big">${over1k}<span style="font-size:16px;color:var(--muted)"> / ${accts.length}</span></div></div>
      ${nt ? `<div class="kpi"><div class="lab">확정안내 미발송</div><div class="big" style="color:var(--needs)">${unsent}</div></div>` : ''}
    </div>
    ${filterRow(coBar(), statusBar(), nt ? noticeBar() : '')}
    <div class="bar"><button class="btn small" id="syncRecruitBtn">📥 모집시트 동기화</button><span class="sub" style="margin:0">모집시트(마루 등)의 새 계정 URL을 정리해서 마스터에 자동 추가</span></div>
    <table><thead><tr><th>진행사</th><th>닉네임</th><th>계정</th><th class="num">팔로워</th><th>상태</th>${nt ? '<th>확정안내</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
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
    <td>${uploaded(a) ? `<a href="${esc(a.contentLink)}" target="_blank">영상 보기</a> <button class="cell-edit" data-kind="content" data-row="${a.row}" data-val="${esc(a.contentLink)}">✎</button>` : `<button class="cell-edit btn small" data-kind="content" data-row="${a.row}" data-val="">링크 달기</button>`}</td>
    <td>${revChip(a, 19)}</td>
    <td>${revChip(a, 20)}</td>
    <td>${revChip(a, 21)}</td></tr>`).join('');
  return `<div class="cards">
      <div class="kpi"><div class="lab">업로드 완료</div><div class="big">${up.length}<span style="font-size:16px;color:var(--muted)"> / ${accts.length}</span></div></div>
      <div class="kpi"><div class="lab">검수 완료</div><div class="big">${rev.length}<span style="font-size:16px;color:var(--muted)"> / ${up.length || accts.length}</span></div></div>
      <div class="kpi"><div class="lab">검수 대기</div><div class="big" style="color:var(--needs)">${accts.filter(reviewPending).length}</div></div>
    </div>
    ${filterRow(coBar(), upBar())}
    <table><thead><tr><th>진행사</th><th>계정</th><th>업로드</th><th>콘텐츠</th><th>음원</th><th>음원구간</th><th>해시태그</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="note"><b>음원·해시태그</b>는 스캔이 자동 판정, <b>음원구간</b>은 사람이 영상 보고 판정해요. 드롭다운에서 <b>준수·미준수</b>로 고치면 재스캔해도 유지(수동 우선), <b>미확인</b>으로 되돌리면 자동 판정에 다시 맡겨요.</div>`;
}

// ③ 가드닝 (하위 탭)
function viewGarden(accts, orders) {
  const subs = [['needs', '가드닝 필요'], ['orders', '집행 내역'], ['cost', '비용']];
  const bar = `<div class="subtabs">${subs.map(([k, l]) => `<button class="subtab ${state.sub === k ? 'active' : ''}" data-sub="${k}">${l}</button>`).join('')}</div>`;
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
  if (!needs.length) return coBar() + `<div class="empty">✅ 지금 가드닝 필요한 계정이 없어요.</div>${filling.length ? fillingNote(filling) : ''}`;
  const rate = rateOf();
  const rows = needs.map((a) => `<tr>
    <td><input type="checkbox" class="pick" data-h="${a.handle}" checked></td>
    <td class="handle">${link(a.handle)}</td><td class="num">${fmt(a.current)}</td><td class="num">${fmt(a.order)}</td><td class="num">${won((a.order / 1000) * rate)}</td></tr>`).join('');
  return coBar() + `<div class="bar"><div class="summary">가드닝 필요 <b>${needs.length}</b>개 · 선택 <b id="selQty">0</b>명 · 예상 <b id="selCost">₩0</b></div><div class="spacer"></div><button class="btn danger" id="execBtn">선택 집행</button></div>
    <table><thead><tr><th><input type="checkbox" id="pickAll" checked></th><th>계정</th><th class="num">현재</th><th class="num">충전량</th><th class="num">예상비용</th></tr></thead><tbody>${rows}</tbody></table>${filling.length ? fillingNote(filling) : ''}`;
}
const fillingNote = (filling) => `<div class="note"><b>⏳ 채워지는 중 (재주문 안 함):</b> ${filling.map((f) => `@${f.handle} (현재 ${fmt(f.current)}+진행중 ${fmt(f.inFlight)}=${fmt(f.projected)})`).join(', ')}</div>`;
function viewOrders(orders) {
  if (!orders.length) return `<div class="empty">아직 집행 내역이 없어요.</div>`;
  const rows = [...orders].reverse().map((o) => {
    const delivered = o.quantity - (Number(o.remains) || 0), pct = o.quantity ? Math.round((delivered / o.quantity) * 100) : 0;
    let st;
    if (o.closed) st = '<span class="chip stale">종료·취소요청</span>';
    else if (o.status === 'Partial') st = '<span class="chip stale">부분완료</span>';
    else if (o.done) st = '<span class="chip ok">완료</span>';
    else if (o.stale) st = '<span class="chip stale">정체 의심</span>';
    else st = `<span class="chip filling">${o.status || '진행중'}</span>`;
    return `<tr><td class="company">#${o.id}${o.service ? ` · s${o.service}` : ''}</td><td class="handle">${link(o.handle)}</td><td class="num">${fmt(o.quantity)}</td>
      <td><div class="progress"><span style="width:${pct}%"></span></div></td><td class="num">${delivered}/${o.quantity}</td><td>${st}</td>
      <td class="num">${won(o.charge != null ? Number(o.charge) : o.cost)}</td><td class="company">${timeAgo(o.placedAt)}</td>
      <td>${(!o.done && !o.closed) ? `<button class="btn small close-order" data-id="${o.id}">종료 처리</button>` : ''}</td></tr>`;
  }).join('');
  const staleN = orders.filter((o) => o.stale).length;
  return `<div class="bar"><div class="summary">총 <b>${orders.length}</b>건 · 진행중 <b>${orders.filter((o) => !o.done && !o.closed).length}</b>건${staleN ? ` · <b style="color:var(--warn)">정체 의심 ${staleN}</b>` : ''}</div></div>
  <table><thead><tr><th>주문#</th><th>계정</th><th class="num">수량</th><th>배송</th><th class="num">진행</th><th>상태</th><th class="num">비용</th><th>시각</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  ${staleN ? `<div class="note"><b style="color:var(--warn)">⚠️ 정체 의심</b> = ${state.data.config.staleDays}일 넘게 안 끝난 주문. 멈춰있으면 <b>종료 처리</b>로 취소·완료하고, 그 계정을 다시 가드닝하면 돼요.</div>` : ''}`;
}
function viewCost(orders, balance) {
  const byH = {};
  orders.forEach((o) => { byH[o.handle] = byH[o.handle] || { handle: o.handle, qty: 0, cost: 0, n: 0 }; byH[o.handle].qty += o.quantity; byH[o.handle].cost += (o.charge != null ? Number(o.charge) : (o.cost || 0)); byH[o.handle].n += 1; });
  const rows = Object.values(byH).sort((a, b) => b.cost - a.cost);
  const curId = state.data.config?.service?.id;
  const svcOpts = state.services.map((s) => `<option value="${s.id}" ${s.id == curId ? 'selected' : ''}>#${s.id} · ${cleanName(s.name)} · ₩${Math.round(Number(s.rate) * state.krw).toLocaleString()}/1k</option>`).join('');
  return `<div class="cards">
      <div class="kpi"><div class="lab">총 지출</div><div class="big">${won(rows.reduce((s, r) => s + r.cost, 0))}</div></div>
      <div class="kpi"><div class="lab">넣은 팔로워 합계</div><div class="big">${fmt(rows.reduce((s, r) => s + r.qty, 0))}</div></div>
      <div class="kpi"><div class="lab">현재 잔액</div><div class="big">${won(balance)}</div></div>
      <div class="kpi wide"><div class="lab">환율 · 실시간 시장환율 자동</div><div class="big">₩${Math.round(state.krw).toLocaleString()} / $1</div>
        <div class="rate-box" style="margin-top:10px"><span class="sub">smmkings 잔액과 다르면 →</span><input class="rate" id="rateInput" placeholder="현재 잔액 ₩"><button class="btn small" id="rateSave">재보정</button></div></div>
      <div class="kpi wide"><div class="lab">가드닝 서비스</div><select class="svc" id="svcSelect">${svcOpts}</select><div class="sub">지난 주문은 각자 산 서비스로 기록(집행 내역 s번호).</div></div>
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
  if (!content.length) return coBar() + `<div class="empty">아직 업로드된 콘텐츠가 없어요.<br>업로드가 되면 여기서 성과를 봐요.</div>`;
  // 베스트만 필터 → 정렬(헤더 클릭)
  let list = state.bestOnly ? withPerf.filter((a) => state.best.includes(a.handle)) : withPerf;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => ((a[state.sortKey] || 0) - (b[state.sortKey] || 0)) * dir);
  const arrow = (k) => (state.sortKey === k ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const th = (k, l) => `<th class="num sortable${state.sortKey === k ? ' sorted' : ''}" data-sort="${k}">${l}${arrow(k)}</th>`;
  const rows = list.map((a) => `<tr>
    <td><button class="star ${state.best.includes(a.handle) ? 'on' : ''}" data-h="${a.handle}" title="SIRIAI 베스트">★</button></td>
    <td class="handle">${link(a.handle)}</td>
    <td class="num">${a.v == null ? '—' : fmt(a.v)}</td><td class="num">${a.l == null ? '—' : fmt(a.l)}</td>
    <td class="num">${a.c == null ? '—' : fmt(a.c)}</td><td class="num">${a.sh == null ? '—' : fmt(a.sh)}</td>
    <td><a href="${esc(a.contentLink)}" target="_blank">영상</a></td></tr>`).join('');
  const bestCount = withPerf.filter((a) => state.best.includes(a.handle)).length;
  return coBar() + `<div class="cards">
      <div class="kpi"><div class="lab">총 조회수</div><div class="big">${fmt(totalViews)}</div></div>
      <div class="kpi"><div class="lab">총 좋아요</div><div class="big">${fmt(totalLikes)}</div></div>
      <div class="kpi"><div class="lab">업로드 콘텐츠</div><div class="big">${content.length}</div></div>
      ${heroOn ? `<div class="kpi wide"><div class="lab">🏆 히어로 콘텐츠 (최고 조회수)</div><div class="big" style="font-size:20px">@${heroOn.handle} · ${fmt(heroOn.v)} 조회</div><div class="sub"><a href="${esc(heroOn.contentLink)}" target="_blank">영상 보기</a></div></div>` : ''}
    </div>
    <div class="filters"><div class="filterbar"><button class="fbtn best-f ${state.bestOnly ? 'active' : ''}">★ 베스트만 (${bestCount})</button></div></div>
    ${noPerf ? '<div class="note"><b>아직 조회수 데이터가 비어있어요.</b> 시트의 조회수·좋아요 칸을 채우면 여기 자동으로 집계돼요. 지금도 ★로 <b>SIRIAI 베스트 콘텐츠</b>는 미리 찍어둘 수 있어요.</div>' : ''}
    <table><thead><tr><th>★</th><th>계정</th>${th('v', '조회수')}${th('l', '좋아요')}${th('c', '댓글')}${th('sh', '공유')}<th>콘텐츠</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ⑤ 정산 — 비용·마진 시뮬레이터. 테두리 없는 iframe을 내용 높이만큼 자동 확장(이중 스크롤·액자 제거).
function viewSettle() {
  return `<iframe class="sim-frame" src="/beiyon_margin_simulator.html" title="정산 시뮬레이터"
    onload="try{var d=this.contentWindow.document;var fit=()=>{this.style.height=(d.documentElement.scrollHeight+24)+'px';};fit();setTimeout(fit,500);setTimeout(fit,1500);}catch(e){this.style.height='1600px';}"></iframe>`;
}

const emptyScan = () => `<div class="empty">아직 데이터가 없어요.<br><br><button class="btn primary" onclick="scan()">지금 스캔하기</button></div>`;

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
  $$('.pick').forEach((c) => c.addEventListener('change', updateSel));
  if ($('#pickAll')) $('#pickAll').addEventListener('change', (e) => { $$('.pick').forEach((c) => (c.checked = e.target.checked)); updateSel(); });
  if ($('#execBtn')) $('#execBtn').addEventListener('click', openExecute);
  if ($('#rateSave')) $('#rateSave').addEventListener('click', recalibrate);
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
  $$('.best-f').forEach((b) => b.addEventListener('click', () => { state.bestOnly = !state.bestOnly; render(); }));
  $$('th.sortable').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.sort;
    if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortKey = k; state.sortDir = 'desc'; }
    render();
  }));
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
  td.innerHTML = `<input class="inline-input" type="text" value="${esc(value)}" placeholder="${cfg.ph}">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (v === String(value).trim()) return render(); // 변화 없음 → 원복
    if (cfg.num && v !== '' && num(v) == null) { toast('숫자를 입력하세요'); return render(); }
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
  if (!v || v <= 0) return toast('현재 smmkings 잔액(₩)을 숫자로 입력하세요');
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
  const r = await api(`/api/order/close?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id }) });
  overlay(false);
  if (r.error) return toast('실패: ' + r.error);
  if (r.cancelled) toast('취소·환불 요청됨 · 종료 완료');
  else toast('⚠️ 취소는 안 됐어요(패널 미지원) — 이 주문은 계속 배송될 수 있어 배송 끝나야 재가드닝돼요');
  await loadData();
}
async function openExecute() {
  const picked = $$('.pick:checked').map((c) => c.dataset.h);
  if (!picked.length) return;
  overlay(true, '계획 확인 중…');
  const plan = await api(`/api/plan?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handles: picked }) });
  overlay(false);
  if (plan.error) return toast('오류: ' + plan.error);
  if (!plan.toOrder || !plan.toOrder.length) return toast('주문할 게 없어요');
  $('#modalBody').innerHTML = plan.toOrder.map((o) => `<div class="plan-row"><span>@${o.handle} <span style="color:var(--muted)">(현재 ${fmt(o.current)})</span></span><span class="mono">${fmt(o.qty)}명 · ${won(o.cost)}</span></div>`).join('') +
    `<div class="plan-total"><span>총 ${plan.toOrder.length}개 · ${fmt(plan.totalQty)}명</span><span>${won(plan.totalCost)}</span></div><div class="note">서비스 #${plan.service?.id} · 잔액 ${won(plan.balance)} · 집행 직전 최신 팔로워로 재확인 후 주문돼요.</div>`;
  $('#modal').hidden = false;
  $('#modalConfirm').onclick = () => doExecute(picked);
}
async function doExecute(handles) {
  $('#modal').hidden = true; overlay(true, '주문 넣는 중…');
  const r = await api(`/api/execute?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handles, confirm: true }) });
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
  overlay(true, '전체 계정 팔로워 확인 중… (크롬 창 뜸 — 건드리지 마세요)');
  const r = await api(`/api/scan?campaign=${state.campaign}&full=1`, { method: 'POST' });
  overlay(false);
  if (r.error) return toast('스캔 실패: ' + r.error);
  toast(`스캔 완료 (${r.scannedCount != null ? r.scannedCount : ''}개)` + (r.nicksWritten ? ` · 닉네임 ${r.nicksWritten}개 채움` : '')); await loadData();
}

async function contentScan(full) {
  const btn = $('#contentScanBtn');
  const r = await api(`/api/content-scan?campaign=${state.campaign}${full ? '&full=1' : ''}`, { method: 'POST' });
  if (r.error) return toast('오류: ' + r.error);
  toast('콘텐츠 스캔 시작 — 크롬 창이 떠요. 건드리지 말고 두세요 (~4분)');
  btn.disabled = true;
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
$('#scanBtn').addEventListener('click', scan);
$('#contentScanBtn').addEventListener('click', (e) => contentScan(e.shiftKey));
$('#modalCancel').addEventListener('click', () => ($('#modal').hidden = true));
window.scan = scan;
init();

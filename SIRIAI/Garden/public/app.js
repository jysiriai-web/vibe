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
const NEXT_REV = { none: 'pass', pass: 'fail', fail: 'none' };
// 검수 완료 = 업로드됨 + 음원·음원구간·해시태그 모두 판정됨(none 아님)
const reviewed = (a) => uploaded(a) && [19, 20, 21].every((c) => revState(revValOf(a, c)) !== 'none');

let state = { campaigns: [], campaign: null, krw: 1508.79, services: [], best: [], data: null, tab: 'recruit', sub: 'needs', fCo: 'all', fStatus: 'all' };

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
  render();
}

function renderCampaigns() {
  const groups = {};
  state.campaigns.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  const nav = $('#campaignNav');
  nav.innerHTML = Object.entries(groups).map(([g, cs]) =>
    `<div class="group">${g}</div>` + cs.map((c) => `<button class="camp ${c.id === state.campaign ? 'active' : ''}" data-c="${c.id}">${c.name}</button>`).join('')).join('');
  $$('.camp', nav).forEach((b) => b.addEventListener('click', () => { state.campaign = b.dataset.c; state.tab = 'recruit'; renderCampaigns(); loadData(); }));
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
  $('#cnt-deliver').textContent = fmt(accts.reduce((s, a) => s + (num(a.views) || 0), 0));

  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  const c = $('#content');
  if (state.tab === 'recruit') c.innerHTML = viewRecruit(accts);
  else if (state.tab === 'upload') c.innerHTML = viewUpload(accts);
  else if (state.tab === 'garden') c.innerHTML = viewGarden(accts, orders);
  else c.innerHTML = viewDeliver(accts);
  wire();
}

const chip = (s) => `<span class="chip ${s}">${STATUS[s] || s}</span>`;
const link = (h) => `<a href="https://www.tiktok.com/@${h}" target="_blank">@${h}</a>`;
const coChip = (c) => (c ? `<span class="co co-${c === 'MARU' ? 'maru' : c === 'SIRIAI' ? 'siriai' : 'x'}">${c}</span>` : '');
// 검수 칩 (클릭 시 미확인→준수→미준수 순환). col=19 음원 / 20 음원구간 / 21 해시태그.
function revChip(a, col) {
  const st = revState(revValOf(a, col));
  const txt = st === 'pass' ? '준수' : st === 'fail' ? '미준수' : '—';
  const manual = a.manualCols && a.manualCols.includes(String(col));
  const title = manual ? '수동 지정됨 · 클릭해서 변경' : (col !== 20 && a.autoDetected ? '자동 판정됨 · 클릭해서 수동 변경' : '클릭: 미확인 → 준수 → 미준수');
  return `<button class="rev rev-${st}" data-row="${a.row}" data-col="${col}" title="${title}">${txt}</button>`;
}

// ── 필터 (진행사 / 상태) ──
const applyCo = (accts) => (state.fCo === 'all' ? accts : accts.filter((a) => (a.company || '') === state.fCo));
const applyFStatus = (accts) => (state.fStatus === 'all' ? accts : accts.filter((a) => a.status === state.fStatus));
function coBar() {
  const opts = [['all', '전체'], ['MARU', 'MARU'], ['SIRIAI', 'SIRIAI']];
  return `<div class="filterbar"><span class="flab">진행사</span>${opts.map(([k, l]) => `<button class="fbtn co-f ${state.fCo === k ? 'active' : ''}" data-fco="${k}">${l}</button>`).join('')}</div>`;
}
function statusBar() {
  const opts = [['all', '전체'], ['needs', '가드닝 필요'], ['filling', '채워지는 중'], ['ok', '충족'], ['error', '미확인']];
  return `<div class="filterbar"><span class="flab">상태</span>${opts.map(([k, l]) => `<button class="fbtn st-f ${state.fStatus === k ? 'active' : ''}" data-fst="${k}">${l}</button>`).join('')}</div>`;
}
const filterRow = (withStatus) => `<div class="filters">${coBar()}${withStatus ? statusBar() : ''}</div>`;

// ① 모집
function viewRecruit(accts) {
  if (!accts.length) return emptyScan();
  const maru = accts.filter((a) => a.company === 'MARU').length;
  const siriai = accts.filter((a) => a.company === 'SIRIAI').length;
  const over1k = accts.filter((a) => (a.current || 0) >= 1000).length;
  const list = applyFStatus(applyCo(accts));
  const rows = list.map((a) => `<tr>
    <td>${coChip(a.company)}</td>
    <td>${a.nick ? esc(a.nick) : '<span class="muted">—</span>'} <button class="cell-edit" data-kind="nick" data-row="${a.row}" data-val="${esc(a.nick || '')}">${a.nick ? '✎' : '입력'}</button></td>
    <td class="handle">${link(a.handle)}</td>
    <td class="num">${a.current == null ? '' : fmt(a.current)} <button class="cell-edit" data-kind="fol" data-row="${a.row}" data-val="${a.current ?? ''}">${a.current == null ? '입력' : '✎'}</button></td>
    <td>${chip(a.status)}</td></tr>`).join('');
  return `<div class="cards">
      <div class="kpi"><div class="lab">모집 계정</div><div class="big">${accts.length}</div></div>
      <div class="kpi"><div class="lab">MARU / SIRIAI</div><div class="big">${maru} / ${siriai}</div></div>
      <div class="kpi"><div class="lab">팔로워 1,000+ 충족</div><div class="big">${over1k}<span style="font-size:16px;color:var(--muted)"> / ${accts.length}</span></div></div>
    </div>
    ${filterRow(true)}
    <table><thead><tr><th>진행사</th><th>닉네임</th><th>계정</th><th class="num">팔로워</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ② 업로드
function viewUpload(accts) {
  if (!accts.length) return emptyScan();
  const up = accts.filter(uploaded);
  const rev = accts.filter(reviewed);
  const list = applyCo(accts);
  const rows = list.map((a) => `<tr>
    <td>${coChip(a.company)}</td>
    <td class="handle">${link(a.handle)}</td>
    <td>${uploaded(a) ? '<span class="chip ok">업로드</span>' : '<span class="chip error">대기</span>'}</td>
    <td>${uploaded(a) ? `<a href="${esc(a.contentLink)}" target="_blank">영상 보기</a> <button class="cell-edit" data-kind="content" data-row="${a.row}" data-val="${esc(a.contentLink)}">✎</button>` : `<button class="cell-edit btn small" data-kind="content" data-row="${a.row}" data-val="">링크 달기</button>`}</td>
    <td>${revChip(a, 19)}</td>
    <td>${revChip(a, 20)}</td>
    <td>${revChip(a, 21)}</td></tr>`).join('');
  return `<div class="cards">
      <div class="kpi"><div class="lab">업로드 완료</div><div class="big">${up.length}<span style="font-size:16px;color:var(--muted)"> / ${accts.length}</span></div></div>
      <div class="kpi"><div class="lab">검수 완료</div><div class="big">${rev.length}<span style="font-size:16px;color:var(--muted)"> / ${up.length || accts.length}</span></div></div>
      <div class="kpi"><div class="lab">업로드 대기</div><div class="big">${accts.length - up.length}</div></div>
    </div>
    ${filterRow(false)}
    <table><thead><tr><th>진행사</th><th>계정</th><th>업로드</th><th>콘텐츠</th><th>음원</th><th>음원구간</th><th>해시태그</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="note"><b>음원·해시태그</b>는 스캔이 자동 판정, <b>음원구간</b>은 사람이 영상 보고 판정해요. 칩 클릭 = <b>미확인 → 준수 → 미준수</b> 순환. 손으로 고치면 재스캔해도 그 값이 유지돼요(수동 우선).</div>`;
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
  const sorted = [...withPerf].sort((a, b) => (b.v || 0) - (a.v || 0));
  const hero = sorted[0] && sorted[0].v ? sorted[0] : null;
  const noPerf = totalViews === 0 && totalLikes === 0;
  if (!content.length) return coBar() + `<div class="empty">아직 업로드된 콘텐츠가 없어요.<br>업로드가 되면 여기서 성과를 봐요.</div>`;
  const rows = sorted.map((a) => `<tr>
    <td><button class="star ${state.best.includes(a.handle) ? 'on' : ''}" data-h="${a.handle}" title="SIRIAI 베스트">★</button></td>
    <td class="handle">${link(a.handle)}</td>
    <td class="num">${a.v == null ? '—' : fmt(a.v)}</td><td class="num">${a.l == null ? '—' : fmt(a.l)}</td>
    <td class="num">${a.c == null ? '—' : fmt(a.c)}</td><td class="num">${a.sh == null ? '—' : fmt(a.sh)}</td>
    <td><a href="${esc(a.contentLink)}" target="_blank">영상</a></td></tr>`).join('');
  return coBar() + `<div class="cards">
      <div class="kpi"><div class="lab">총 조회수</div><div class="big">${fmt(totalViews)}</div></div>
      <div class="kpi"><div class="lab">총 좋아요</div><div class="big">${fmt(totalLikes)}</div></div>
      <div class="kpi"><div class="lab">업로드 콘텐츠</div><div class="big">${content.length}</div></div>
      ${hero ? `<div class="kpi wide"><div class="lab">🏆 히어로 콘텐츠 (최고 조회수)</div><div class="big" style="font-size:20px">@${hero.handle} · ${fmt(hero.v)} 조회</div><div class="sub"><a href="${esc(hero.contentLink)}" target="_blank">영상 보기</a></div></div>` : ''}
    </div>
    ${noPerf ? '<div class="note"><b>아직 조회수 데이터가 비어있어요.</b> 시트의 조회수·좋아요 칸을 채우면 여기 자동으로 집계돼요. 지금도 ★로 <b>SIRIAI 베스트 콘텐츠</b>는 미리 찍어둘 수 있어요.</div>' : ''}
    <table><thead><tr><th>★</th><th>계정</th><th class="num">조회수</th><th class="num">좋아요</th><th class="num">댓글</th><th class="num">공유</th><th>콘텐츠</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  $$('.close-order').forEach((b) => b.addEventListener('click', () => closeOrder(b.dataset.id)));
  $$('.star').forEach((b) => b.addEventListener('click', () => toggleBest(b.dataset.h)));
  $$('.cell-edit').forEach((b) => b.addEventListener('click', () => startCellEdit(b)));
  $$('.rev').forEach((b) => b.addEventListener('click', () => cycleReview(Number(b.dataset.row), Number(b.dataset.col))));
  $$('.co-f').forEach((b) => b.addEventListener('click', () => { state.fCo = b.dataset.fco; render(); }));
  $$('.st-f').forEach((b) => b.addEventListener('click', () => { state.fStatus = b.dataset.fst; render(); }));
  updateSel();
}

// ── 인라인 편집 (팝업 대신 셀 안에서 바로 입력) ──
function startCellEdit(btn) {
  const td = btn.closest('td');
  if (!td || td.querySelector('input')) return;
  const kind = btn.dataset.kind, row = Number(btn.dataset.row), value = btn.dataset.val || '';
  const cfg = {
    nick: { ph: '닉네임', save: (v) => saveCell(row, 3, v) },
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
    await cfg.save(v);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); done = true; render(); }
  });
  inp.addEventListener('blur', commit);
}
// 검수 칩 순환 (미확인 → 준수 → 미준수 → 미확인)
async function cycleReview(row, col) {
  const a = (state.data.accounts || []).find((x) => Number(x.row) === row);
  if (!a || !REVIEW[col]) return;
  const next = NEXT_REV[revState(revValOf(a, col))];
  const value = next === 'pass' ? REVIEW[col].pass : next === 'fail' ? REVIEW[col].fail : '';
  await saveCell(row, col, value, { quiet: true });
}
// 일반 셀 되쓰기 (/api/cell — 검수/콘텐츠 열은 수동 잠금 기록됨)
async function saveCell(row, col, value, { quiet } = {}) {
  if (!quiet) overlay(true, '시트에 기록 중…');
  const r = await api(`/api/cell?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, col, value }) });
  if (!quiet) overlay(false);
  if (r.error) { toast('실패: ' + r.error); return render(); }
  if (!quiet) toast('시트에 기록됨');
  await loadData();
}
// 팔로워 되쓰기 (/api/manual — 가드닝 대상여부도 같이 갱신)
async function saveFollowers(row, v) {
  const n = num(v);
  if (n == null) return render(); // 빈값/잘못된 값 → 취소
  overlay(true, '시트에 기록 중…');
  const r = await api(`/api/manual?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, followers: n }) });
  overlay(false);
  if (r.error) { toast('실패: ' + r.error); return render(); }
  toast('팔로워 시트에 기록됨'); await loadData();
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
  toast(r.cancelled ? '취소·환불 요청됨 · 종료 완료' : '종료 처리 완료'); await loadData();
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
async function scan(full) {
  overlay(true, (full ? '전체 계정' : '미완료·가드닝 계정') + ' 팔로워 확인 중… (크롬 창 뜸 — 건드리지 마세요)');
  const r = await api(`/api/scan?campaign=${state.campaign}${full ? '&full=1' : ''}`, { method: 'POST' });
  overlay(false);
  if (r.error) return toast('스캔 실패: ' + r.error);
  const n = r.scannedCount != null ? r.scannedCount : '';
  toast((full ? '전체 스캔 완료' : `스캔 완료 (${n}개)`) + (r.nicksWritten ? ` · 닉네임 ${r.nicksWritten}개 채움` : '')); await loadData();
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
$('#scanBtn').addEventListener('click', (e) => scan(e.shiftKey));
$('#contentScanBtn').addEventListener('click', (e) => contentScan(e.shiftKey));
$('#modalCancel').addEventListener('click', () => ($('#modal').hidden = true));
window.scan = scan;
init();

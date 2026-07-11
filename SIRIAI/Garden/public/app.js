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
  if (/다름|누락|미준수|미사용|불가|없음|이슈|문제|✗|✘/i.test(s)) return 'fail';
  if (/확인|준수|사용|완료|ok|pass|✓|✔|^[oy]$/i.test(s)) return 'pass';
  return 'none'; // 모르는 글자를 '준수'로 단정하면 안 된다 ('이슈' 가 통과로 뒤집혔던 적 있음)
}
// 검수 열별 카노니컬 값 (수동 편집 시 시트에 쓰는 문자열, 자동값 포맷과 통일)
const REVIEW = {
  19: { label: '음원', pass: '사용 확인', fail: '음원 다름' },
  20: { label: '음원구간', pass: '확인 완료', fail: '미준수' },
  21: { label: '해시태그', pass: '확인 완료', fail: '해시태그 누락' },
};
const revValOf = (a, col) => (col === 19 ? a.soundOk : col === 20 ? a.soundSection : a.hashtagOk);
// 그 칸의 값이 '시트에 저장된 것'이 아니라 스캔의 추정값인가 (검수로 세면 안 됨)
const isAuto = (a, col) => !!(a.autoCols && a.autoCols.includes(String(col)));
// ⚠️ 검수 완료 = 세 검수칸(음원19·음원구간20·해시태그21)이 모두 판정된 것 = 미확인이 하나도 없음.
//    음원구간(20)은 사람이 영상 보고 판정, 음원·해시태그는 스캔이 자동 판정.
//    한 칸이라도 '미확인'이면 검수대기 — 화면 드롭다운과 상태가 어긋나지 않게(미확인인데 검수완료 방지).
const REV_COLS = [19, 20, 21];
const reviewed = (a) => uploaded(a) && REV_COLS.every((c) => revState(revValOf(a, c)) !== 'none');
const reviewPending = (a) => uploaded(a) && !reviewed(a); // 업로드됐는데 검수 미완(미확인 칸 있음)
const noticeSent = (a) => has(a.notice); // 확정안내 발송여부 (col 16 진행안내여부)

let state = { campaigns: [], campaign: null, krw: 1508.79, services: [], best: [], data: null, tab: 'recruit', sub: 'needs', fCo: 'all', fStatus: 'all', fUp: 'all', fNotice: 'all', fOrder: 'all', sort: {}, bestOnly: false, pending: {}, unpicked: new Set() };
// unpicked: 가드닝 집행에서 사용자가 명시적으로 체크 해제한 handle. 재렌더(백그라운드 폴링)가 선택을 되돌려 해제한 계정까지 집행하는 것 방지.
// 편집 열 ↔ 계정 필드 매핑. 낙관적 저장·병합에 공용.
const COL_FIELD = { 3: 'nick', 4: 'link', 16: 'notice', 17: 'contentLink', 19: 'soundOk', 20: 'soundSection', 21: 'hashtagOk' };
const LOCK_COLS = [17, 19, 20, 21]; // 자동스캔이 건드리는 검수/콘텐츠 열 (서버 OVERRIDE_COLS 와 일치)

const won = (usd) => (usd == null ? '—' : '₩' + Math.round(Number(usd) * state.krw).toLocaleString());
const rateOf = () => Number(state.data?.config?.service?.rate || 0);
// 팀 공유(클라우드) 화면인가 — 돈·스캔 조작은 숨기고 보기만 허용. 서버도 501 로 막고 있음(이중 방어).
const isCloud = () => !!state.data?.config?.cloud;

function timeAgo(iso) {
  if (!iso) return '아직 스캔 안 함';
  const d = new Date(iso), diff = (Date.now() - d) / 60000;
  if (diff < 1) return '방금'; if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}
// 팀 URL 은 비번 없이 열린다. 남은 게이트는 배포 설정 누락(503)뿐.
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (r.status === 503) { const b = await r.json().catch(() => ({})); if (b.configError) { showSetup(b.error); throw new Error('__setup__'); } }
  return r.json();
}

// 배포 설정이 덜 된 경우 (Vercel 환경변수 누락) — 뭐가 빠졌는지 그대로 보여준다.
function showSetup(msg) {
  document.body.innerHTML = `<div class="login-wrap"><div class="login-card">
      <div class="login-brand"><span class="leaf">🌱</span> SIRIAI <span>댄스 챌린지</span></div>
      <p class="login-msg">배포 설정이 아직 덜 됐어요.</p>
      <pre class="setup-msg">${String(msg || '').replace(/</g, '&lt;')}</pre>
    </div></div>`;
}

async function init() {
  const [c, s] = await Promise.all([api('/api/campaigns'), api('/api/services')]);
  state.campaigns = c.campaigns || []; state.krw = c.krwPerUsd || state.krw; state.services = s.services || [];
  state.campaign = state.campaigns[0]?.id || null;
  renderCampaigns();
  if (!state.campaign) { $('#content').innerHTML = '<div class="empty">표시할 캠페인이 아직 없어요.<br>캠페인 설정을 추가하면 여기 나타나요.</div>'; return; }
  overlay(true, '불러오는 중…'); // 최초 로드: 시트 fetch(1~3초) 동안 빈 화면 대신 스피너
  try { await loadData(); } finally { overlay(false); }
}
// 설정 안내 화면으로 빠지는 경우 조용히 종료 (api() 가 __setup__ 을 던짐)
const bootstrap = () => init().catch((e) => { if (e && e.message !== '__setup__') console.error(e); });
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
  // 클라우드(팀 공유)에서는 스캔·집행 '버튼'만 숨긴다. 가드닝 탭 자체는 보여줌(보기 전용).
  const cloud = !!d.config?.cloud;
  // 정산 탭은 독립 시뮬레이터 → 스캔 버튼·계정 통계 무의미하니 숨김 (딱 필요한 것만 노출)
  const isSettle = state.tab === 'settle';
  $('#scanBtn').hidden = isSettle || cloud;
  $('#contentScanBtn').hidden = isSettle || cloud;
  if ($('#exitIpBtn')) $('#exitIpBtn').hidden = isSettle || cloud;
  const st = $('.stats'); if (st) st.hidden = isSettle || cloud; // 클라우드엔 잔액·스캔시각이 없음
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
// 핸들은 시트에서 오므로 이스케이프한다(속성 인젝션 방지). 정상 핸들엔 변화 없음.
const link = (h) => `<a href="https://www.tiktok.com/@${encodeURIComponent(String(h ?? ''))}" target="_blank">@${esc(h)}</a>`;
const coChip = (c) => (c ? `<span class="co co-${c === 'MARU' ? 'maru' : c === 'SIRIAI' ? 'siriai' : 'x'}">${c}</span>` : '');
// 검수 드롭다운. col=19 음원 / 20 음원구간 / 21 해시태그. 선택 즉시 저장(낙관적 반영).
function revChip(a, col) {
  const st = revState(revValOf(a, col));
  const manual = a.manualCols && a.manualCols.includes(String(col));
  const auto = !manual && isAuto(a, col); // 스캔 추정값 — 시트에 저장돼 있지 않음
  const title = manual ? '수동 지정됨' : auto ? '스캔이 자동 판정한 값 (시트에 저장 안 됨)' : '';
  const opts = [['none', '미확인'], ['pass', '준수'], ['fail', '미준수']];
  return `<select class="rev-sel rev-${st}${auto ? ' rev-auto' : ''}" data-row="${a.row}" data-col="${col}" title="${title}" aria-label="${REVIEW[col] ? REVIEW[col].label : '검수'} 검수 @${a.handle}">${opts.map(([v, l]) => `<option value="${v}"${st === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
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
// 모집탭 '가드닝 필요' = 아직 1,000명이 안 된 계정 전부.
// 주문을 넣어 채워지는 중이든(filling), 팔로워를 아직 모르든(error) 손이 더 가야 하는 건 똑같다.
// (가드닝탭의 집행 대상은 이것과 별개로 status==='needs' 만 쓴다 — 진행중 계정 재주문 방지)
const unfilled = (a) => a.status !== 'ok';
const applyFStatus = (accts) =>
  state.fStatus === 'all' ? accts
    : state.fStatus === 'needs' ? accts.filter(unfilled)
      : accts.filter((a) => a.status === state.fStatus);
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

// ── 표 정렬 (열 헤더 클릭 → 오름/내림). 표마다 독립: state.sort[tableId] = {key, dir}. ──
function sortOf(tableId, defKey, defDir = 'desc') {
  if (!state.sort[tableId]) state.sort[tableId] = { key: defKey, dir: defDir };
  return state.sort[tableId];
}
const sortNull = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
function cmpVals(a, b) {
  const na = sortNull(a), nb = sortNull(b);
  if (na && nb) return 0;
  if (na) return 1; // 빈 값은 방향과 무관하게 항상 뒤로
  if (nb) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ko');
}
// 정렬 가능한 헤더 셀. num=우측정렬 숫자열. defKey=이 표의 기본 정렬열(초기 화살표 표시용).
function sortTh(tableId, key, label, { num = false, defKey } = {}) {
  const s = sortOf(tableId, defKey ?? key);
  const active = s.key === key;
  const arrow = active ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="sortable${num ? ' num' : ''}${active ? ' sorted' : ''}" data-sort="${key}" data-table="${tableId}" tabindex="0" role="button" aria-sort="${active ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="클릭하면 이 열로 정렬 (다시 누르면 반대로)">${label}${arrow}</th>`;
}
// 리스트 정렬. accessors: { key: (row)=>비교값 }. 헤더보다 먼저 호출해 기본 정렬을 확정한다.
// 빈값(null·''·NaN)은 방향과 무관하게 항상 뒤로 — dir 을 곱하지 않는다(예전 *dir 이 null 을 위로 뒤집었음).
function sortList(tableId, list, accessors, defKey, defDir = 'desc') {
  const s = sortOf(tableId, defKey, defDir);
  const get = accessors[s.key] || accessors[defKey];
  if (!get) return list;
  const dir = s.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = get(a), vb = get(b);
    const na = sortNull(va), nb = sortNull(vb);
    if (na && nb) return 0;
    if (na) return 1;  // 빈값은 항상 아래로
    if (nb) return -1;
    return cmpVals(va, vb) * dir; // 실제 값만 방향 적용
  });
}
const statusRank = (s) => ({ needs: 0, filling: 1, error: 2, ok: 3 }[s] ?? 9); // 상태 정렬 순서
const coBar = (c) => fbar('진행사', 'co-f', state.fCo, [['all', '전체'], ['MARU', 'MARU'], ['SIRIAI', 'SIRIAI']], c);
const statusBar = (c) => fbar('상태', 'st-f', state.fStatus, [['all', '전체'], ['needs', '가드닝 필요'], ['filling', '채워지는 중'], ['ok', '충족'], ['error', '미확인']], c);
const upBar = (c) => fbar('업로드', 'up-f', state.fUp, [['all', '전체'], ['notup', '미업로드'], ['up', '업로드'], ['pending', '검수대기']], c);
const noticeBar = (c) => fbar('확정안내', 'nt-f', state.fNotice, [['all', '전체'], ['unsent', '미발송만']], c);
// 필터 옵션별 개수 (특정 리스트 기준). faceted = 다른 필터 적용된 리스트를 넘기면 됨.
const coCounts = (l) => ({ all: l.length, MARU: l.filter((a) => a.company === 'MARU').length, SIRIAI: l.filter((a) => a.company === 'SIRIAI').length });
const upCounts = (l) => ({ all: l.length, notup: l.filter((a) => !uploaded(a)).length, up: l.filter(uploaded).length, pending: l.filter(reviewPending).length });
const statusCounts = (l) => ({ all: l.length, needs: l.filter(unfilled).length, filling: l.filter((a) => a.status === 'filling').length, ok: l.filter((a) => a.status === 'ok').length, error: l.filter((a) => a.status === 'error').length });
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
  list = sortList('recruit', list, {
    company: (a) => a.company || '', nick: (a) => a.nick || '', handle: (a) => a.handle || '',
    followers: (a) => (a.current == null ? null : Number(a.current)), status: (a) => statusRank(a.status),
  }, 'followers', 'desc');
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
    <table><thead><tr>${sortTh('recruit', 'company', '진행사', { defKey: 'followers' })}${sortTh('recruit', 'nick', '닉네임', { defKey: 'followers' })}${sortTh('recruit', 'handle', '계정', { defKey: 'followers' })}${sortTh('recruit', 'followers', '팔로워', { num: true, defKey: 'followers' })}${sortTh('recruit', 'status', '상태', { defKey: 'followers' })}${nt ? '<th>확정안내</th>' : ''}</tr></thead><tbody>${rows || emptyRow(nt ? 6 : 5)}</tbody></table>`;
}

// ② 업로드
// 지난 스캔에서 못 본 계정 중, 사용자가 아직 안 지운 것 (클릭하면 하이라이트 사라짐 → localStorage)
function scanFailedSet() {
  const fails = (state.data && state.data.scanFailures && state.data.scanFailures.handles) || [];
  const dismissed = dismissedFails();
  const set = new Set();
  for (const f of fails) { const h = typeof f === 'string' ? f : f.handle; if (h && !dismissed.has(h) && !uploadedByHandle(h)) set.add(h); }
  return set;
}
function dismissKey() { return `garden_scanfail_dismissed_${state.campaign}`; }
function dismissedFails() { try { return new Set(JSON.parse(localStorage.getItem(dismissKey()) || '[]')); } catch { return new Set(); } }
function dismissFail(handle) { const s = dismissedFails(); s.add(handle); localStorage.setItem(dismissKey(), JSON.stringify([...s])); render(); }
function uploadedByHandle(h) { const a = (state.data.accounts || []).find((x) => x.handle === h); return a ? uploaded(a) : false; }

function viewUpload(accts) {
  if (!accts.length) return emptyScan();
  const up = accts.filter(uploaded);
  const rev = accts.filter(reviewed);
  const failed = scanFailedSet(); // 스캔이 못 본 계정 = 하이라이트
  const upRank = (a) => (!uploaded(a) ? 0 : reviewPending(a) ? 1 : 2); // 미업로드<검수대기<검수완료
  const revRank = (a, col) => ({ none: 0, fail: 1, pass: 2 }[revState(revValOf(a, col))] ?? 0);
  const list = sortList('upload', applyFUp(applyCo(accts)), {
    company: (a) => a.company || '', handle: (a) => a.handle || '', state: (a) => upRank(a),
    s19: (a) => revRank(a, 19), s20: (a) => revRank(a, 20), s21: (a) => revRank(a, 21),
  }, 'state', 'desc');
  const rows = list.map((a) => {
    const isFail = failed.has(a.handle);
    const cls = [reviewPending(a) ? 'row-alert' : '', isFail ? 'scan-failed' : ''].filter(Boolean).join(' ');
    return `<tr${cls ? ` class="${cls}"` : ''}${isFail ? ` data-failh="${esc(a.handle)}" title="지난 스캔에서 이 계정을 못 봤어요 (틱톡 차단). 확인했으면 클릭해서 표시를 지우세요."` : ''}>
    <td>${coChip(a.company)}</td>
    <td class="handle">${link(a.handle)}${isFail ? ' <span class="chip warn scanfail-tag">스캔 실패</span>' : ''}</td>
    <td>${uploaded(a) ? (reviewPending(a) ? '<span class="chip needs">검수대기</span>' : '<span class="chip ok">검수완료</span>') : '<span class="chip error">미업로드</span>'}</td>
    <td>${uploaded(a)
      ? `<a href="${esc(a.contentLink)}" target="_blank">영상 보기</a> <button class="cell-edit" data-kind="content" data-row="${a.row}" data-val="${esc(a.contentLink)}">✎</button>${isCloud() ? '' : ` <button class="btn small judge-link" data-row="${a.row}" data-h="${esc(a.handle)}" data-link="${esc(a.contentLink)}" title="이 영상 한 장만 열어 음원·해시태그·조회수 판정 (스캔이 막힐 때 대체)">🔍 판정</button>`}`
      : `<button class="cell-edit prompt" data-kind="content" data-row="${a.row}" data-val="">링크 달기</button>`}</td>
    <td>${revChip(a, 19)}</td>
    <td>${revChip(a, 20)}</td>
    <td>${revChip(a, 21)}</td></tr>`;
  }).join('');
  const failN = failed.size;
  const failBanner = failN ? `<div class="scanfail-banner">⚠️ 지난 업로드 스캔에서 <b>${failN}개</b> 계정을 못 봤어요 (틱톡이 막음). 아래 <b>노란 줄</b>이 그 계정이에요 — 업로드했는데 안 잡혔을 수 있으니 <b>다시 스캔</b>하거나 직접 확인하세요. 확인한 계정은 <b>줄을 클릭</b>하면 표시가 사라져요.</div>` : '';
  return `<div class="cards">
      ${kpi('업로드 완료', ofTot(up.length, accts.length), { ic: IC.video })}
      ${kpi('검수 완료', ofTot(rev.length, up.length || accts.length), { ic: IC.check, sub: '세 칸 모두 판정' })}
      ${kpi('검수대기', accts.filter(reviewPending).length, { ic: IC.clock, accent: 'var(--needs)' })}
    </div>
    ${failBanner}
    ${filterRow(coBar(coCounts(applyFUp(accts))), upBar(upCounts(applyCo(accts))))}
    <table><thead><tr>${sortTh('upload', 'company', '진행사', { defKey: 'state' })}${sortTh('upload', 'handle', '계정', { defKey: 'state' })}${sortTh('upload', 'state', '상태', { defKey: 'state' })}<th>콘텐츠</th>${sortTh('upload', 's19', '음원', { defKey: 'state' })}${sortTh('upload', 's20', '음원구간', { defKey: 'state' })}${sortTh('upload', 's21', '해시태그', { defKey: 'state' })}</tr></thead><tbody>${rows || emptyRow(7)}</tbody></table>
    <div class="note"><b>검수 완료</b>는 <b>음원·음원구간·해시태그 세 칸이 모두 판정</b>됐을 때예요. 한 칸이라도 <b>미확인</b>이면 <b>검수대기</b>입니다. 음원구간은 사람이 영상 보고, 음원·해시태그는 스캔이 자동 판정해요. 드롭다운에서 <b>준수·미준수</b>로 고치면 재스캔해도 유지(수동 우선), <b>미확인</b>으로 되돌리면 자동 판정에 다시 맡겨요. 점선 테두리는 <b>시트에 저장되지 않은 자동 추정값</b>이에요.</div>`;
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
  const cost = (a) => (rate > 0 ? won((a.order / 1000) * rate) : '—'); // 클라우드엔 단가표가 없어 ₩0 대신 —
  const allPicked = needs.every((a) => !state.unpicked.has(a.handle));
  const sortedNeeds = sortList('needs', needs, {
    handle: (a) => a.handle || '', current: (a) => num(a.current), order: (a) => num(a.order),
    cost: (a) => (rate > 0 ? (a.order / 1000) * rate : 0),
  }, 'order', 'desc');
  const rows = sortedNeeds.map((a) => `<tr>
    ${isCloud() ? '' : `<td><input type="checkbox" class="pick" data-h="${a.handle}" aria-label="집행 선택 @${a.handle}"${state.unpicked.has(a.handle) ? '' : ' checked'}></td>`}
    <td class="handle">${link(a.handle)}</td><td class="num">${fmt(a.current)}</td><td class="num">${fmt(a.order)}</td><td class="num">${cost(a)}</td></tr>`).join('');
  const bar = isCloud()
    ? `<div class="bar"><div class="summary">가드닝 필요 <b>${needs.length}</b>개</div></div>`
    : `<div class="bar"><div class="summary">가드닝 필요 <b>${needs.length}</b>개 · 선택 <b id="selQty">0</b>명 · 예상 <b id="selCost">₩0</b></div><div class="spacer"></div><button class="btn danger" id="execBtn">선택 집행</button></div>`;
  return coBar(coCounts(accts.filter((a) => a.status === 'needs'))) + bar +
    `<table><thead><tr>${isCloud() ? '' : `<th><input type="checkbox" id="pickAll" aria-label="전체 선택"${allPicked ? ' checked' : ''}></th>`}${sortTh('needs', 'handle', '계정', { defKey: 'order' })}${sortTh('needs', 'current', '현재', { num: true, defKey: 'order' })}${sortTh('needs', 'order', '충전량', { num: true, defKey: 'order' })}${sortTh('needs', 'cost', '예상비용', { num: true, defKey: 'order' })}</tr></thead><tbody>${rows}</tbody></table>${filling.length ? fillingNote(filling) : ''}${localOnlyNote('팔로워를 실제로 사는 <b>집행</b>')}`;
}
// 팀원 화면(클라우드)에서 돈·스캔이 왜 없는지 알려주는 안내
const localOnlyNote = (what) => (isCloud() ? `<div class="note">🔒 ${what}은 대표님 PC의 대시보드에서만 할 수 있어요. 여기서는 <b>보기만</b> 됩니다.</div>` : '');
const fillingNote = (filling) => `<div class="note"><b>⏳ 채워지는 중 (재주문 안 함):</b> ${filling.map((f) => `@${f.handle} (현재 ${fmt(f.current)}+진행중 ${fmt(f.inFlight)}=${fmt(f.projected)})`).join(', ')}</div>`;
const CANCEL_ST = ['Canceled', 'Cancelled', 'Refunded'];
// 주문 상태 분류 (필터·요약·칩 공용). active 진행중 / done 완료 / canceled 취소·종료 / stuck 오류
function orderClass(o) {
  if (o.abandoned) return 'canceled'; // 포기함 = 취소·종료 카테고리(더 이상 진행중 아님)
  if (o.cancelStuck) return 'stuck';
  if (o.done && CANCEL_ST.includes(o.status)) return 'canceled';
  if (o.closed) return 'canceled';
  if (o.done) return 'done';
  return 'active';
}
// 포기한 주문 중 '미전달분(안 들어온 팔로워)'이 있는 것 = 환불 문의 대상.
// 주문번호를 콤마로 묶어 한 번에 복사 → smmkings 문의에 붙여넣게. (문의 API 는 없어서 수기)
function refundBox(orders) {
  const refundable = (orders || []).filter((o) => o.abandoned && Number(o.undelivered) > 0);
  if (!refundable.length) return '';
  const ids = refundable.map((o) => o.id).join(',');
  const totalUndel = refundable.reduce((s, o) => s + Number(o.undelivered || 0), 0);
  const lines = refundable
    .map((o) => `#${o.id} @${o.handle} — ${fmt(o.undelivered)}명 미전달 (${fmt(o.delivered)}/${fmt(o.quantity)})`)
    .join('<br>');
  return `<div class="refund-box">
      <div class="refund-head"><b>환불 문의용</b> · 포기 주문 중 미전달 <b>${refundable.length}건</b> · 안 들어온 팔로워 합계 <b>${fmt(totalUndel)}명</b></div>
      <div class="refund-list">${lines}</div>
      <div class="refund-copyrow">
        <code class="refund-ids" id="refundIds">${ids}</code>
        <button class="btn small copy-refund" data-ids="${ids}">📋 주문번호 복사</button>
      </div>
      <div class="sub">이 번호들을 smmkings 문의에 붙여넣어 미전달분 환불을 요청하세요. (리필 없는 서비스라 자동은 안 돼요)</div>
    </div>`;
}
function viewOrders(orders) {
  if (!orders.length) return `<div class="empty">아직 집행 내역이 없어요.</div>`;
  const cnt = { all: orders.length, active: 0, done: 0, canceled: 0, stuck: 0 };
  orders.forEach((o) => cnt[orderClass(o)]++);
  const shown = state.fOrder === 'all' ? orders : orders.filter((o) => orderClass(o) === state.fOrder);
  const sortedOrders = sortList('orders', shown, {
    id: (o) => Number(o.id) || 0, handle: (o) => o.handle || '', quantity: (o) => Number(o.quantity) || 0,
    delivered: (o) => (Number(o.quantity) || 0) - (Number(o.remains) || 0),
    cost: (o) => (o.charge != null ? Number(o.charge) : (o.cost || 0)),
    placedAt: (o) => (o.placedAt ? new Date(o.placedAt).getTime() : 0),
  }, 'placedAt', 'desc');
  const rows = sortedOrders.map((o) => {
    // remains 를 모르면(패널이 누락) 전달량을 0으로 오인해 '100% 완료'로 보이지 않게 — 서버의 null-안전 값 사용.
    const known = o.delivered != null; // markStale 가 remains 불명이면 delivered=null 로 내려줌
    const delivered = known ? o.delivered : null;
    const pct = known && o.quantity ? Math.round((delivered / o.quantity) * 100) : 0;
    let st;
    if (o.abandoned) st = '<span class="chip stale">포기함</span>';
    else if (o.cancelStuck) st = '<span class="chip needs">⚠️ 오류</span>';
    else if (o.done && CANCEL_ST.includes(o.status)) st = '<span class="chip stale">취소됨</span>';
    else if (o.done && o.status === 'Partial') st = '<span class="chip ok">부분완료</span>';
    else if (o.done) st = '<span class="chip ok">완료</span>';
    else if (o.closed) st = '<span class="chip stale">종료·취소요청</span>';
    else if (o.stale) st = '<span class="chip stale">정체 의심</span>';
    else st = '<span class="chip filling">진행중</span>';
    // 빠진 팔로워를 자동 리필 요청한 주문 표시 (30일 리필 서비스만 해당)
    if (o.refillId) st += ' <span class="chip ok" title="빠진 팔로워를 리필 요청함">♻️ 리필</span>';
    else if (o.refillError) st += ` <span class="chip stale" title="리필 요청이 거절됨: ${esc(o.refillError)}">♻️ 리필 거절</span>`;
    // 버튼: 활성=종료 처리 / 종료했는데 아직 배송중(유예·오류)=[다시 종료]+[포기(재주문 허용)] / 포기·완료=없음
    // 클라우드(팀 화면)에서는 아무 버튼도 안 보인다 — 보기 전용.
    let btns = '';
    if (!isCloud()) {
      if (!o.abandoned && !o.done) {
        if (!o.closed) btns += `<button class="btn small close-order" data-id="${o.id}">종료 처리</button>`;
        else btns += `${o.cancelStuck ? `<button class="btn small close-order" data-id="${o.id}">다시 종료</button>` : ''}<button class="btn small ghost abandon-order" data-id="${o.id}" title="이 주문을 접고 이 계정을 다시 가드닝할 수 있게 해요">포기</button>`;
      }
      // 리필 되는 서비스(3693 등)·30일 안·포기 안 한 주문엔 수동 리필 버튼(빠진 팔로워 되채움).
      if (o.refillable) btns += `<button class="btn small refill-order" data-id="${o.id}" title="빠진 팔로워를 지금 리필 요청해요 (30일 리필 서비스)">♻️ 리필</button>`;
    }
    return `<tr><td class="company">#${o.id}${o.service ? ` · s${o.service}` : ''}</td><td class="handle">${link(o.handle)}</td><td class="num">${fmt(o.quantity)}</td>
      <td><div class="progress"><span style="width:${pct}%"></span></div></td><td class="num">${known ? fmt(delivered) : '?'}/${fmt(o.quantity)}</td><td>${st}</td>
      <td class="num">${won(o.charge != null ? Number(o.charge) : o.cost)}</td><td class="company">${timeAgo(o.placedAt)}</td>
      <td class="ord-btns">${btns}</td></tr>`;
  }).join('');
  const staleN = orders.filter((o) => o.stale && orderClass(o) === 'active').length;
  const abandonedN = orders.filter((o) => o.abandoned).length;
  const closedActiveN = orders.filter((o) => o.closed && !o.done && !o.abandoned).length;
  const bar = filterRow(fbar('상태', 'ord-f', state.fOrder, [['all', '전체'], ['active', '진행중'], ['done', '완료'], ['canceled', '취소·종료'], ['stuck', '오류']], cnt));
  return `<div class="bar"><div class="summary">총 <b>${orders.length}</b>건 · 진행중 <b>${cnt.active}</b>${cnt.stuck ? ` · <b style="color:var(--needs)">오류 ${cnt.stuck}</b>` : ''}${staleN ? ` · <b style="color:var(--warn)">정체 의심 ${staleN}</b>` : ''}</div></div>
  ${bar}
  <table><thead><tr>${sortTh('orders', 'id', '주문#', { defKey: 'placedAt' })}${sortTh('orders', 'handle', '계정', { defKey: 'placedAt' })}${sortTh('orders', 'quantity', '수량', { num: true, defKey: 'placedAt' })}<th>배송</th>${sortTh('orders', 'delivered', '진행', { num: true, defKey: 'placedAt' })}<th>상태</th>${sortTh('orders', 'cost', '비용', { num: true, defKey: 'placedAt' })}${sortTh('orders', 'placedAt', '시각', { defKey: 'placedAt' })}<th></th></tr></thead><tbody>${rows || emptyRow(9, '이 상태의 주문이 없어요.')}</tbody></table>
  ${cnt.stuck ? `<div class="note"><b style="color:var(--needs)">⚠️ 오류</b> = 종료했는데 smmkings에서 취소가 안 먹히고 계속 배송 중이에요(종료 후 1시간 지나도). <b>다시 종료</b>로 재시도하거나, 급하면 <b>포기</b>로 이 주문을 접고 그 계정을 바로 다시 가드닝할 수 있어요.</div>` : ''}
  ${closedActiveN && !cnt.stuck ? `<div class="note"><b>종료·취소요청</b> = 종료를 눌러 취소 요청한 주문이에요. 급해서 바로 다른 서비스로 재주문하려면 <b>포기</b>를 누르면 이 계정을 다시 가드닝할 수 있어요(포기한 주문의 팔로워는 들어올 수도 있어요).</div>` : ''}
  ${abandonedN ? `<div class="note"><b>포기함</b> = 접은 주문이에요(비용은 기록에 남음). 이 계정은 다시 가드닝할 수 있어요 — <b>비용 탭</b>에서 서비스를 바꾼 뒤 가드닝하면 다른 서비스로 새로 주문돼요.</div>` : ''}
  ${refundBox(orders)}
  ${staleN ? `<div class="note"><b style="color:var(--warn)">⚠️ 정체 의심</b> = ${state.data.config.staleDays}일 넘게 안 끝난 주문. 멈춰있으면 <b>종료 처리</b>로 취소하고, 그 계정을 다시 가드닝하면 돼요.</div>` : ''}
  ${localOnlyNote('주문 <b>종료·포기</b>')}`;
}
function viewCost(orders, balance) {
  const byH = {};
  orders.forEach((o) => { byH[o.handle] = byH[o.handle] || { handle: o.handle, qty: 0, cost: 0, n: 0 }; byH[o.handle].qty += o.quantity; byH[o.handle].cost += (o.charge != null ? Number(o.charge) : (o.cost || 0)); byH[o.handle].n += 1; });
  const rows = sortList('cost', Object.values(byH), {
    handle: (r) => r.handle || '', qty: (r) => r.qty, n: (r) => r.n, cost: (r) => r.cost,
  }, 'cost', 'desc');
  const curId = state.data.config?.service?.id;
  const svcOpts = state.services.map((s) => `<option value="${s.id}" ${s.id == curId ? 'selected' : ''}>#${s.id} · ${cleanName(s.name)} · ₩${Math.round(Number(s.rate) * state.krw).toLocaleString()}/1k</option>`).join('');
  // 클라우드(팀 화면): 잔액·환율 재보정·서비스 변경은 대표님 PC 전용 → 총지출·팔로워 합계만 보여준다.
  const cards = isCloud()
    ? `${kpi('총 지출', won(rows.reduce((s, r) => s + r.cost, 0)), { ic: IC.card })}
       ${kpi('넣은 팔로워 합계', fmt(rows.reduce((s, r) => s + r.qty, 0)), { ic: IC.userplus })}`
    : `${kpi('총 지출', won(rows.reduce((s, r) => s + r.cost, 0)), { ic: IC.card })}
       ${kpi('넣은 팔로워 합계', fmt(rows.reduce((s, r) => s + r.qty, 0)), { ic: IC.userplus })}
       ${kpi('현재 잔액', won(balance), { ic: IC.wallet })}
       <div class="kpi wide"><div class="lab">환율 · 실시간 시장환율 자동</div><div class="big">₩${Math.round(state.krw).toLocaleString()} / $1</div>
         <div class="rate-box" style="margin-top:10px"><span class="sub">smmkings 잔액과 다르면 →</span><input class="rate" id="rateInput" placeholder="현재 잔액 ₩"><button class="btn small" id="rateSave">재보정</button></div></div>
       <div class="kpi wide"><div class="lab">가드닝 서비스</div><select class="svc" id="svcSelect" aria-label="가드닝 서비스 선택">${svcOpts}</select><div class="sub">지난 주문은 각자 산 서비스로 기록(집행 내역 s번호).</div></div>`;
  return `<div class="cards">${cards}</div>
    ${rows.length ? `<table><thead><tr>${sortTh('cost', 'handle', '계정', { defKey: 'cost' })}${sortTh('cost', 'qty', '넣은 팔로워', { num: true, defKey: 'cost' })}${sortTh('cost', 'n', '주문', { num: true, defKey: 'cost' })}${sortTh('cost', 'cost', '비용', { num: true, defKey: 'cost' })}</tr></thead><tbody>${rows.map((r) => `<tr><td class="handle">${link(r.handle)}</td><td class="num">${fmt(r.qty)}</td><td class="num">${r.n}회</td><td class="num">${won(r.cost)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 집행 내역이 없어요.</div>'}
    ${localOnlyNote('<b>환율 재보정</b>·<b>서비스 변경</b>')}`;
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
  list = sortList('deliver', list, {
    handle: (a) => a.handle || '', v: (a) => a.v, l: (a) => a.l, c: (a) => a.c, sh: (a) => a.sh,
  }, 'v', 'desc');
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
    <table><thead><tr><th>★</th>${sortTh('deliver', 'handle', '계정', { defKey: 'v' })}${sortTh('deliver', 'v', '조회수', { num: true, defKey: 'v' })}${sortTh('deliver', 'l', '좋아요', { num: true, defKey: 'v' })}${sortTh('deliver', 'c', '댓글', { num: true, defKey: 'v' })}${sortTh('deliver', 'sh', '공유', { num: true, defKey: 'v' })}<th>콘텐츠</th></tr></thead><tbody>${rows || emptyRow(7, state.bestOnly ? '★ 베스트로 찍은 콘텐츠가 없어요.' : '조건에 맞는 콘텐츠가 없어요.')}</tbody></table>`;
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
  $$('.abandon-order').forEach((b) => b.addEventListener('click', () => abandonOrder(b.dataset.id)));
  $$('.refill-order').forEach((b) => b.addEventListener('click', () => refillOrder(b.dataset.id)));
  $$('.copy-refund').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.ids, `주문번호 ${b.dataset.ids.split(',').length}개 복사됨`)));
  $$('.star').forEach((b) => b.addEventListener('click', () => toggleBest(b.dataset.h)));
  $$('.cell-edit').forEach((b) => b.addEventListener('click', () => startCellEdit(b)));
  $$('.judge-link').forEach((b) => b.addEventListener('click', () => judgeLink(b.dataset.row, b.dataset.h, b.dataset.link)));
  $$('.rev-sel').forEach((s) => s.addEventListener('change', () => setReview(Number(s.dataset.row), Number(s.dataset.col), s.value)));
  // 스캔 실패 하이라이트: 그 줄을 클릭하면(검수 드롭다운·편집 버튼 제외) 표시가 사라진다.
  $$('tr[data-failh]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('select, .cell-edit')) return; dismissFail(tr.dataset.failh); }));
  $$('.notice').forEach((b) => b.addEventListener('click', () => toggleNotice(Number(b.dataset.row), b.classList.contains('sent'))));
  $$('.co-f').forEach((b) => b.addEventListener('click', () => { state.fCo = b.dataset.k; render(); }));
  $$('.st-f').forEach((b) => b.addEventListener('click', () => { state.fStatus = b.dataset.k; render(); }));
  $$('.up-f').forEach((b) => b.addEventListener('click', () => { state.fUp = b.dataset.k; render(); }));
  $$('.nt-f').forEach((b) => b.addEventListener('click', () => { state.fNotice = b.dataset.k; render(); }));
  $$('.ord-f').forEach((b) => b.addEventListener('click', () => { state.fOrder = b.dataset.k; render(); }));
  $$('.best-f').forEach((b) => b.addEventListener('click', () => { state.bestOnly = !state.bestOnly; render(); }));
  const doSort = (h) => {
    const t = h.dataset.table || '_';
    const k = h.dataset.sort;
    const s = state.sort[t] || (state.sort[t] = { key: k, dir: 'desc' });
    if (s.key === k) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
    else { s.key = k; s.dir = 'desc'; }
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
  if (r.cancelled) toast('패널이 취소를 받아줬어요 · 종료 완료');
  else toast(`⚠️ 취소가 안 됐어요${r.cancelError ? ` (${r.cancelError})` : ''} — 배송은 계속됩니다. 급하면 [포기]로 접고 다른 서비스로 재주문하세요`);
  await loadData();
}
// 주문 포기 — 취소가 안 먹혀도 이 주문을 접고 계정을 재가드닝 가능하게(돈 안 나감, 재주문은 별도).
async function abandonOrder(id) {
  if (!confirm(`주문 #${id} 을 포기할까요?\n이 주문을 접고 이 계정을 다시 가드닝할 수 있게 해요.\n\n· 이미 주문한 팔로워는 계속 들어올 수 있어요(환불 안 될 수 있음).\n· 급하면 비용 탭에서 서비스를 바꾼 뒤 새로 주문하세요.`)) return;
  overlay(true, '포기 처리 중…');
  const r = await api(`/api/order/abandon?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('실패: ' + r.error);
  toast('포기 완료 · 이 계정을 다시 가드닝할 수 있어요');
  await loadData();
}
// 수동 리필 — 버튼 딸깍. 빠진 팔로워를 지금 리필 요청(30일 리필 서비스). 돈 안 나감.
async function refillOrder(id) {
  if (!confirm(`주문 #${id} 의 빠진 팔로워를 리필 요청할까요?\n30일 리필 서비스만 돼요. 돈은 안 나가요.`)) return;
  overlay(true, '리필 요청 중…');
  const r = await api(`/api/order/refill?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error && !('ok' in r)) return toast('실패: ' + r.error);
  if (r.ok) toast(`♻️ 리필 요청됨 (리필번호 ${r.refillId})`);
  else toast(`리필이 안 됐어요${r.error ? ` (${r.error})` : ''} — 이미 리필 중이거나 빠진 게 없을 수 있어요`);
  await loadData();
}
// 클립보드 복사 (구형 브라우저 폴백 포함).
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }
  toast(okMsg || '복사됨');
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
  overlay(true, '크롬 창이 떴어요. 로봇 인증이 보이면 통과시켜 주세요 — 그다음 팔로워를 확인합니다');
  const r = await api(`/api/scan?campaign=${state.campaign}&full=1`, { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (r.error) return toast('스캔 실패: ' + r.error);
  let msg = `스캔 완료 (${r.scannedCount != null ? r.scannedCount : ''}개)` + (r.nicksWritten ? ` · 닉네임 ${r.nicksWritten}개 채움` : '');
  // 빠진 팔로워를 감지해 리필을 자동 요청했으면 알린다.
  if (r.refill && r.refill.requested) {
    const names = (r.refill.results || []).filter((x) => x.ok).map((x) => '@' + x.handle).slice(0, 3).join(', ');
    msg += ` · ♻️ 리필 ${r.refill.ok}/${r.refill.requested}건 요청${names ? ' (' + names + ')' : ''}`;
  }
  toast(msg);
  await loadData();
}

async function contentScan(full) {
  const btn = $('#contentScanBtn');
  if (btn.disabled) return; // 이미 스캔 중이면 재진입 막기 (중복 스캔·중복 폴링 방지)
  btn.disabled = true; // 느린 초기 왕복 동안 더블클릭 방지 — await 전에 잠금
  const r = await api(`/api/content-scan?campaign=${state.campaign}${full ? '&full=1' : ''}`, { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  if (r.error) { btn.disabled = false; return toast('오류: ' + r.error); }
  toast('크롬 창이 하나 떠요 — 로봇 인증을 끝낸 뒤 [스캔 시작]을 눌러 주세요');
  const poll = setInterval(async () => {
    let s;
    try { s = await api('/api/content-scan/status'); } catch { return; }
    if (s.error) { clearInterval(poll); scanPanel(null); btn.disabled = false; btn.textContent = '업로드 스캔'; return toast('스캔 실패: ' + s.error); }
    if (s.running) {
      if (s.phase === 'confirm') { btn.textContent = '인증 대기 중…'; scanPanel('confirm'); }
      else if (s.phase === 'blocked') { btn.textContent = '막힘 — 재개 대기'; scanPanel('blocked', s); }
      else { btn.textContent = `스캔 중… ${s.done}/${s.total || '?'}`; scanPanel('scan', s); }
      return;
    }
    clearInterval(poll); scanPanel(null); btn.disabled = false; btn.textContent = '업로드 스캔';
    toast(s.stopped
      ? `⏹ 스캔 중지됨 — 여기까지 업로드 ${s.up || 0}개 반영 (다시 스캔하면 남은 계정부터)`
      : s.failed
        ? `업로드 스캔 완료 — 업로드 ${s.up}개 · ⚠️ ${s.failed}개는 못 봤어요 (업로드 탭에 표시됨)`
        : `업로드 스캔 완료 — 업로드 ${s.up}개 · 시트 ${s.written}칸 반영`);
    await loadData();
  }, 2000);
}
// 수기 대체 — 링크 한 장만 열어 판정 (스캔이 막힐 때). 프로필 목록 대신 영상 페이지 하나라 훨씬 안 막힘.
async function judgeLink(row, handle, link) {
  if (!link || !/\/video\/\d+/.test(link)) return toast('영상 링크가 필요해요 (…/video/숫자). 먼저 링크를 달아주세요.');
  overlay(true, '이 영상 하나만 열어 판정 중… (크롬 창이 잠깐 떠요)');
  const r = await api(`/api/judge-link?campaign=${state.campaign}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row: Number(row), handle, link }) }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (!r.ok) return toast('판정 실패: ' + (r.error || ''));
  toast(`✅ 판정 완료 — 음원 ${r.soundOk ? '준수' : '미준수'} · 해시태그 ${r.hashtagOk ? '준수' : '미준수'} · 조회수 ${fmt(r.views || 0)}`);
  await loadData();
}
// 스캔 하단 패널 — 모드에 따라 인증대기 / 스캔중(중지) / 막힘(재개·중지) 를 보여준다.
function scanPanel(mode, info = {}) {
  let el = $('#scanConfirm');
  if (!mode) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'scanConfirm'; document.body.appendChild(el); }
  // 스캔중 모드는 카운트만 갱신(패널 재생성 안 함 → 클릭 방해 X)
  if (mode === 'scan' && el.dataset.mode === 'scan') { const c = $('#scanCount'); if (c) c.textContent = `${info.done || 0}/${info.total || '?'}`; return; }
  if (el.dataset.mode === mode && mode !== 'scan') return;
  el.dataset.mode = mode;
  const on = (id, fn) => { const b = $('#' + id); if (b) b.addEventListener('click', fn); };
  if (mode === 'confirm') {
    el.innerHTML = `<div class="sc-card"><div class="sc-msg"><b>크롬 창에서 로봇 인증을 끝내셨나요?</b><br>인증(사람입니다 등)을 통과한 뒤 [스캔 시작]을 누르면 시작돼요.</div><button class="btn primary" id="scanGo">스캔 시작</button></div>`;
    on('scanGo', async () => { $('#scanGo').disabled = true; $('#scanGo').textContent = '시작하는 중…'; await api('/api/content-scan/confirm', { method: 'POST' }).catch(() => {}); });
  } else if (mode === 'scan') {
    el.innerHTML = `<div class="sc-card"><div class="sc-msg"><b>스캔 중…</b> <span id="scanCount">${info.done || 0}/${info.total || '?'}</span><br>크롬 창에 콘텐츠가 안 보이면 <b>[중지]</b> → VPN 바꾸고 <b>[재개]</b> 하세요.</div><button class="btn" id="scanPause">■ 중지</button></div>`;
    on('scanPause', async () => { $('#scanPause').disabled = true; $('#scanPause').textContent = '멈추는 중…'; await api('/api/content-scan/pause', { method: 'POST' }).catch(() => {}); });
  } else if (mode === 'blocked') {
    el.innerHTML = `<div class="sc-card blocked"><div class="sc-msg"><b>⚠️ 틱톡이 막는 것 같아요</b> (${info.done || 0}/${info.total || '?'}까지 함)<br><b>VPN을 바꾼 뒤</b> [재개]를 누르면 멈춘 데서 이어가요.</div><button class="btn primary" id="scanResume">▶ 재개</button><button class="btn ghost" id="scanStop">■ 중지</button></div>`;
    on('scanResume', async () => { $('#scanResume').disabled = true; $('#scanResume').textContent = '재개 중…'; await api('/api/content-scan/resume', { method: 'POST' }).catch(() => {}); });
    on('scanStop', async () => { $('#scanStop').disabled = true; await api('/api/content-scan/stop', { method: 'POST' }).catch(() => {}); });
  }
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 3400); }
function overlay(show, msg) { $('#overlay').hidden = !show; if (msg) $('#overlayMsg').textContent = msg; }

$$('.tab').forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; render(); }));
$('#campaignSelect').addEventListener('change', (e) => { state.campaign = e.target.value; state.tab = 'recruit'; state.pending = {}; state.unpicked = new Set(); overlay(true, '불러오는 중…'); loadData().finally(() => overlay(false)); });
$('#scanBtn').addEventListener('click', scan);
$('#contentScanBtn').addEventListener('click', (e) => contentScan(e.shiftKey));
if ($('#exitIpBtn')) $('#exitIpBtn').addEventListener('click', checkExitCountry);
// 스캐너가 지금 어느 나라 IP로 나가는지 — VPN/프록시 적용 확인용.
async function checkExitCountry() {
  overlay(true, '스캐너 출구 국가 확인 중… (크롬 창이 잠깐 떠요)');
  const r = await api('/api/exit-ip', { method: 'POST' }).catch(() => ({ error: '네트워크 오류' }));
  overlay(false);
  if (!r || !r.ok) return toast('확인 실패: ' + ((r && r.error) || ''));
  const where = [r.country, r.region, r.city].filter(Boolean).join(' · ') || '알 수 없음';
  toast(`🌐 스캔이 지금 [${where}] 로 나가요 (IP ${r.ip || '?'})${r.proxied ? ' · 프록시 적용됨' : ''}`);
}
function closeModal() { $('#modal').hidden = true; }
$('#modalCancel').addEventListener('click', closeModal);
// 돈 나가는 확정 다이얼로그 — Esc로 닫기(취소), 바깥 배경 클릭도 취소
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
window.scan = scan;
bootstrap();

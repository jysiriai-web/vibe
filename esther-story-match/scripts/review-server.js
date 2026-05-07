require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { exec } = require('child_process');

const MATCHES_PATH = path.resolve(__dirname, '../data/matches.json');
const MASTER_PATH  = path.resolve(__dirname, '../data/parsed-master.json');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PORT = 3001;

// ─── 마스터 리스트 (no_match 재계산용) ────────────────────────────────
let masterList = [];
try { masterList = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8')); } catch {}

function normalize(h) { return h.toLowerCase().replace(/[._]/g, ''); }
function similarity(a, b) {
  a = a.toLowerCase().replace(/\s/g, '');
  b = b.toLowerCase().replace(/\s/g, '');
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return 0;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}
function findCandidates(extracted, topN = 5) {
  const norm = normalize(extracted);
  return masterList
    .filter(p => p.matchable && p.handle)
    .map(p => ({ ...p, score: normalize(p.handle) === norm ? 1.0 : similarity(extracted, p.handle) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── 상태 로드 / 저장 ────────────────────────────────────────────────
function loadState() {
  if (!fs.existsSync(MATCHES_PATH)) return { confirmed: [], review_queue: [], no_match: [], processed_files: [] };
  return JSON.parse(fs.readFileSync(MATCHES_PATH, 'utf-8'));
}
function saveState(state) {
  fs.writeFileSync(MATCHES_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── HTML ─────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>에스더버니 스토리 매칭 검수</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
         background: #f5f5f3; color: #1a1a1a; min-height: 100vh; }

  /* ── 헤더 ── */
  header {
    position: sticky; top: 0; z-index: 100;
    background: #fff; border-bottom: 1px solid #e8e8e8;
    padding: 16px 32px; display: flex; align-items: center; justify-content: space-between;
  }
  .logo { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; color: #1a1a1a; }
  .logo span { color: #999; font-weight: 400; margin-left: 8px; }
  .progress-wrap { display: flex; align-items: center; gap: 16px; }
  .progress-label { font-size: 13px; color: #666; }
  .badge { display: inline-flex; align-items: center; justify-content: center;
           background: #1a1a1a; color: #fff; font-size: 12px; font-weight: 600;
           border-radius: 20px; padding: 3px 12px; min-width: 40px; }

  /* ── 본문 ── */
  main { max-width: 900px; margin: 40px auto; padding: 0 24px 80px; }

  .done-state {
    text-align: center; padding: 80px 0;
  }
  .done-state h2 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  .done-state p  { font-size: 14px; color: #888; }

  /* ── 검수 카드 ── */
  .card {
    background: #fff; border-radius: 16px; overflow: hidden;
    margin-bottom: 24px; border: 1px solid #ebebeb;
    transition: box-shadow .2s;
  }
  .card:hover { box-shadow: 0 4px 24px rgba(0,0,0,.06); }

  .card-header {
    padding: 16px 24px; border-bottom: 1px solid #f0f0f0;
    display: flex; align-items: center; gap: 12px;
  }
  .card-index { font-size: 12px; color: #999; }
  .extracted-handle {
    font-size: 15px; font-weight: 700; font-family: 'SF Mono', monospace;
    background: #f5f5f3; padding: 3px 10px; border-radius: 6px;
  }
  .card-note { font-size: 12px; color: #aaa; margin-left: auto; }

  .card-body { display: grid; grid-template-columns: 220px 1fr; }

  /* ── 이미지 영역 ── */
  .img-wrap {
    background: #f0f0f0; display: flex; align-items: center; justify-content: center;
    min-height: 240px; overflow: hidden;
  }
  .img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .img-placeholder { font-size: 12px; color: #bbb; text-align: center; padding: 16px; }

  /* ── 후보 목록 ── */
  .candidates { padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; }
  .section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
                   color: #aaa; text-transform: uppercase; margin-bottom: 4px; }

  .candidate-btn {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 16px; border-radius: 10px; border: 1.5px solid #e8e8e8;
    background: #fff; cursor: pointer; text-align: left;
    transition: all .15s; width: 100%;
  }
  .candidate-btn:hover { border-color: #1a1a1a; background: #fafafa; }
  .candidate-btn.selected { border-color: #1a1a1a; background: #1a1a1a; color: #fff; }

  .cand-score {
    font-size: 11px; font-weight: 700; font-family: monospace;
    background: #f0f0f0; color: #555; padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
  }
  .candidate-btn.selected .cand-score { background: rgba(255,255,255,.15); color: #fff; }

  .cand-info { flex: 1; }
  .cand-name { font-size: 14px; font-weight: 600; }
  .cand-handle { font-size: 12px; color: #888; font-family: monospace; margin-top: 1px; }
  .candidate-btn.selected .cand-handle { color: rgba(255,255,255,.6); }
  .cand-badge {
    font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
    background: #f0f0ef; color: #555;
  }
  .candidate-btn.selected .cand-badge { background: rgba(255,255,255,.15); color: #fff; }
  .cand-badge.influencer { background: #e8f0fe; color: #3c6bc9; }
  .candidate-btn.selected .cand-badge.influencer { background: rgba(255,255,255,.2); color: #fff; }

  /* ── 액션 버튼 ── */
  .actions { display: flex; gap: 10px; margin-top: 16px; }
  .btn-confirm {
    flex: 1; padding: 12px; border-radius: 10px; border: none;
    background: #1a1a1a; color: #fff; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: opacity .15s;
  }
  .btn-confirm:hover { opacity: .8; }
  .btn-confirm:disabled { opacity: .35; cursor: not-allowed; }
  .btn-fail {
    padding: 12px 20px; border-radius: 10px;
    border: 1.5px solid #e0e0e0; background: #fff;
    font-size: 13px; color: #999; cursor: pointer; transition: all .15s;
  }
  .btn-fail:hover { border-color: #e55; color: #e55; }

  /* ── no_match 섹션 ── */
  .section-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 40px 0 20px; font-size: 12px; font-weight: 600;
    letter-spacing: 0.08em; color: #aaa; text-transform: uppercase;
  }
  .section-divider::before, .section-divider::after {
    content: ''; flex: 1; height: 1px; background: #e8e8e8;
  }
  .card.no-match-card { border-color: #f0ece6; }
  .card.no-match-card .card-header { background: #fdfaf6; }
  .no-match-label {
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
    background: #fef3e2; color: #c47d17;
  }
  .btn-unregistered {
    padding: 12px 16px; border-radius: 10px;
    border: 1.5px solid #e0e0e0; background: #fff;
    font-size: 13px; color: #999; cursor: pointer; transition: all .15s;
  }
  .btn-unregistered:hover { border-color: #aaa; color: #555; }

  /* ── 실행 버튼 ── */
  .run-btns { display: flex; gap: 8px; }
  .btn-run {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 8px; border: 1.5px solid #e0e0e0;
    background: #fff; font-size: 12px; font-weight: 600; color: #444;
    cursor: pointer; transition: all .15s;
  }
  .btn-run:hover { border-color: #1a1a1a; color: #1a1a1a; }
  .btn-run:disabled { opacity: .4; cursor: not-allowed; }
  .btn-run.running { border-color: #f5a623; color: #f5a623; }
  .btn-run .dot {
    width: 7px; height: 7px; border-radius: 50%; background: currentColor;
    animation: pulse 1s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  /* ── 토스트 ── */
  #toast {
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: #1a1a1a; color: #fff; padding: 12px 24px;
    border-radius: 100px; font-size: 13px; font-weight: 500;
    opacity: 0; transition: all .25s; pointer-events: none; white-space: nowrap;
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>

<header>
  <div class="logo">에스더버니 스토리 매칭 <span>검수 UI</span></div>
  <div style="display:flex;align-items:center;gap:20px;">
    <div class="run-btns">
      <button class="btn-run" id="btn-parse" onclick="runScript('parse')">
        📂 CSV 파싱
      </button>
      <button class="btn-run" id="btn-match" onclick="runScript('match')">
        ▶ 매칭 실행
      </button>
    </div>
    <div class="progress-wrap">
      <span class="progress-label">검수 대기</span>
      <span class="badge" id="badge-count">-</span>
    </div>
  </div>
</header>

<main id="main">
  <div class="done-state" style="display:none" id="done">
    <h2>모든 검수 완료</h2>
    <p>matches.json이 업데이트되었습니다.</p>
  </div>
</main>

<div id="toast"></div>

<script>
let queue = [];
let currentIdx = 0;
let selectedCandidateIdx = null;

async function loadQueue() {
  const res = await fetch('/api/queue');
  const data = await res.json();
  queue = data;
  document.getElementById('badge-count').textContent = queue.length;
  renderAll();
}

function renderAll() {
  const main = document.getElementById('main');
  const done = document.getElementById('done');

  if (queue.length === 0) {
    done.style.display = '';
    return;
  }

  done.style.display = 'none';
  queue.forEach((item, idx) => {
    if (!document.getElementById('card-' + idx)) {
      main.appendChild(buildCard(item, idx));
    }
  });
}

function buildCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'card-' + idx;

  // 헤더
  const hdr = document.createElement('div');
  hdr.className = 'card-header';
  hdr.innerHTML = \`
    <span class="card-index">#\${idx + 1}</span>
    <span class="extracted-handle">@\${item.extracted_handle}</span>
    <span class="card-note">Vision API 추출 결과 · 수동 확인 필요</span>
  \`;
  card.appendChild(hdr);

  // 바디
  const body = document.createElement('div');
  body.className = 'card-body';

  // 이미지
  const imgWrap = document.createElement('div');
  imgWrap.className = 'img-wrap';
  if (item.capture_file) {
    const img = document.createElement('img');
    img.src = '/image?file=' + encodeURIComponent(item.capture_file);
    img.alt = item.extracted_handle;
    img.onerror = () => { imgWrap.innerHTML = '<div class="img-placeholder">이미지를 불러올 수 없습니다</div>'; };
    imgWrap.appendChild(img);
  } else {
    imgWrap.innerHTML = '<div class="img-placeholder">이미지 없음</div>';
  }
  body.appendChild(imgWrap);

  // 후보 목록
  const cands = document.createElement('div');
  cands.className = 'candidates';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = '매칭 후보';
  cands.appendChild(label);

  let selectedIdx = null;

  item.candidates.forEach((c, ci) => {
    const btn = document.createElement('button');
    btn.className = 'candidate-btn';
    btn.dataset.ci = ci;
    const isInf = c.type === '인플루언서';
    const pct = Math.round(c.score * 100);
    btn.innerHTML = \`
      <span class="cand-score">\${pct}%</span>
      <div class="cand-info">
        <div class="cand-name">\${c.name}</div>
        <div class="cand-handle">@\${c.handle}</div>
      </div>
      <span class="cand-badge \${isInf ? 'influencer' : ''}">\${c.type}</span>
    \`;
    btn.addEventListener('click', () => {
      cands.querySelectorAll('.candidate-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedIdx = ci;
      confirmBtn.disabled = false;
    });
    cands.appendChild(btn);
  });

  // 액션
  const actions = document.createElement('div');
  actions.className = 'actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-confirm';
  confirmBtn.textContent = '선택한 후보로 확정';
  confirmBtn.disabled = true;
  confirmBtn.addEventListener('click', async () => {
    if (selectedIdx === null) return;
    confirmBtn.disabled = true;
    await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_file: item.capture_file, candidate_idx: selectedIdx }),
    });
    card.style.transition = 'opacity .3s';
    card.style.opacity = '0';
    setTimeout(() => { card.remove(); updateBadge(); }, 300);
    showToast('✓ ' + item.candidates[selectedIdx].name + ' 확정');
  });

  const failBtn = document.createElement('button');
  failBtn.className = 'btn-fail';
  failBtn.textContent = '매칭 실패';
  failBtn.addEventListener('click', async () => {
    await fetch('/api/skip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_file: item.capture_file }),
    });
    card.style.transition = 'opacity .3s';
    card.style.opacity = '0';
    setTimeout(() => { card.remove(); updateBadge(); }, 300);
    showToast('매칭 실패로 처리');
  });

  actions.appendChild(confirmBtn);
  actions.appendChild(failBtn);
  cands.appendChild(actions);
  body.appendChild(cands);
  card.appendChild(body);
  return card;
}

function updateBadge() {
  const remaining = document.querySelectorAll('.card').length;
  document.getElementById('badge-count').textContent = remaining;
  if (remaining === 0) {
    document.getElementById('done').style.display = '';
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

async function loadNoMatch() {
  const res = await fetch('/api/no_match_queue');
  const items = await res.json();
  const main = document.getElementById('main');

  document.getElementById('no-match-section')?.remove();
  if (items.length === 0) return;

  const section = document.createElement('div');
  section.id = 'no-match-section';

  const divider = document.createElement('div');
  divider.className = 'section-divider';
  divider.textContent = '매칭 실패 — 수동 확인 필요 (' + items.length + '건)';
  section.appendChild(divider);

  items.forEach((item, idx) => {
    section.appendChild(buildNoMatchCard(item, idx));
  });

  main.appendChild(section);
}

function buildNoMatchCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'card no-match-card';
  card.id = 'nm-card-' + idx;

  const hdr = document.createElement('div');
  hdr.className = 'card-header';
  hdr.innerHTML = \`
    <span class="card-index">#\${idx + 1}</span>
    <span class="extracted-handle">@\${item.extracted_handle ?? '?'}</span>
    <span class="no-match-label">매칭 실패</span>
    <span class="card-note" style="margin-left:auto">수동으로 후보를 선택하거나 미등록 처리</span>
  \`;
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'card-body';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'img-wrap';
  if (item.capture_file) {
    const img = document.createElement('img');
    img.src = '/image?file=' + encodeURIComponent(item.capture_file);
    img.alt = item.extracted_handle;
    img.onerror = () => { imgWrap.innerHTML = '<div class="img-placeholder">이미지 없음</div>'; };
    imgWrap.appendChild(img);
  } else {
    imgWrap.innerHTML = '<div class="img-placeholder">이미지 없음</div>';
  }
  body.appendChild(imgWrap);

  const cands = document.createElement('div');
  cands.className = 'candidates';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = '유사 후보 (낮은 정확도)';
  cands.appendChild(label);

  let selectedIdx = null;

  (item.candidates || []).forEach((c, ci) => {
    const btn = document.createElement('button');
    btn.className = 'candidate-btn';
    const pct = Math.round(c.score * 100);
    const isInf = c.type === '인플루언서';
    btn.innerHTML = \`
      <span class="cand-score">\${pct}%</span>
      <div class="cand-info">
        <div class="cand-name">\${c.name}</div>
        <div class="cand-handle">@\${c.handle}</div>
      </div>
      <span class="cand-badge \${isInf ? 'influencer' : ''}">\${c.type}</span>
    \`;
    btn.addEventListener('click', () => {
      cands.querySelectorAll('.candidate-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedIdx = ci;
      confirmBtn.disabled = false;
    });
    cands.appendChild(btn);
  });

  const actions = document.createElement('div');
  actions.className = 'actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-confirm';
  confirmBtn.textContent = '선택한 후보로 확정';
  confirmBtn.disabled = true;
  confirmBtn.addEventListener('click', async () => {
    if (selectedIdx === null) return;
    confirmBtn.disabled = true;
    await fetch('/api/no_match/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_file: item.capture_file, candidate_idx: selectedIdx, candidates: item.candidates }),
    });
    card.style.transition = 'opacity .3s';
    card.style.opacity = '0';
    setTimeout(() => { card.remove(); }, 300);
    showToast('✓ ' + item.candidates[selectedIdx].name + ' 확정 (수동)');
  });

  const unregBtn = document.createElement('button');
  unregBtn.className = 'btn-unregistered';
  unregBtn.textContent = '미등록';
  unregBtn.addEventListener('click', async () => {
    await fetch('/api/no_match/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_file: item.capture_file }),
    });
    card.style.transition = 'opacity .3s';
    card.style.opacity = '0';
    setTimeout(() => { card.remove(); }, 300);
    showToast('미등록 처리');
  });

  actions.appendChild(confirmBtn);
  actions.appendChild(unregBtn);
  cands.appendChild(actions);
  body.appendChild(cands);
  card.appendChild(body);
  return card;
}

async function runScript(name) {
  const btn = document.getElementById('btn-' + name);
  btn.disabled = true;
  btn.classList.add('running');
  const label = name === 'parse' ? 'CSV 파싱' : '매칭';
  btn.innerHTML = '<span class="dot"></span> ' + label + ' 중...';

  try {
    const res = await fetch('/api/run/' + name, { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? '✓ ' + label + ' 완료' : '오류: ' + data.error);
    if (data.ok && name === 'match') {
      queue = [];
      document.querySelectorAll('.card').forEach(c => c.remove());
      await loadQueue();
      await loadNoMatch();
    }
  } catch (e) {
    showToast('실행 실패');
  } finally {
    btn.disabled = false;
    btn.classList.remove('running');
    btn.innerHTML = name === 'parse' ? '📂 CSV 파싱' : '▶ 매칭 실행';
  }
}

loadQueue();
loadNoMatch();
</script>
</body>
</html>`;

// ─── 서버 ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// CORS — Vercel 페이지에서 localhost:3001 호출 허용
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => res.send(HTML));

// 검수 큐 반환
app.get('/api/queue', (req, res) => {
  const state = loadState();
  res.json(state.review_queue ?? []);
});

// 이미지 파일 서빙
app.get('/image', (req, res) => {
  const rel = req.query.file;
  if (!rel) return res.status(400).send('file 파라미터 필요');
  const abs = path.resolve(PROJECT_ROOT, rel);
  if (!abs.startsWith(PROJECT_ROOT)) return res.status(403).send('접근 거부');
  if (!fs.existsSync(abs)) return res.status(404).send('파일 없음');
  res.sendFile(abs);
});

// 확정 처리
app.post('/api/confirm', (req, res) => {
  const { capture_file, candidate_idx } = req.body;
  const state = loadState();

  const itemIdx = state.review_queue.findIndex(i => i.capture_file === capture_file);
  if (itemIdx === -1) return res.status(404).json({ error: '항목 없음' });

  const item = state.review_queue[itemIdx];
  const cand = item.candidates[candidate_idx];
  if (!cand) return res.status(400).json({ error: '후보 인덱스 오류' });

  state.confirmed.push({
    person_id:         cand.person_id,
    name:              cand.name,
    handle:            cand.handle,
    type:              cand.type,
    visit_date:        cand.visit_date,
    linked_influencer: cand.linked_influencer ?? null,
    capture_file,
    extracted_handle:  item.extracted_handle,
    confidence:        cand.score,
    matched_at:        new Date().toISOString(),
    review:            true,
  });

  state.review_queue.splice(itemIdx, 1);
  saveState(state);
  res.json({ ok: true });
});

// 매칭 실패 처리
app.post('/api/skip', (req, res) => {
  const { capture_file } = req.body;
  const state = loadState();

  const itemIdx = state.review_queue.findIndex(i => i.capture_file === capture_file);
  if (itemIdx === -1) return res.status(404).json({ error: '항목 없음' });

  const item = state.review_queue.splice(itemIdx, 1)[0];
  state.no_match.push({ capture_file, extracted_handle: item.extracted_handle, review: true });
  saveState(state);
  res.json({ ok: true });
});

// no_match 큐 반환 (후보 재계산 포함)
app.get('/api/no_match_queue', (req, res) => {
  const state = loadState();
  const items = (state.no_match || [])
    .filter(i => !i.dismissed && i.extracted_handle)
    .map(i => ({
      capture_file:     i.capture_file,
      extracted_handle: i.extracted_handle,
      candidates:       findCandidates(i.extracted_handle),
    }));
  res.json(items);
});

// no_match → 확정
app.post('/api/no_match/confirm', (req, res) => {
  const { capture_file, candidate_idx, candidates } = req.body;
  const state = loadState();
  const cand  = candidates[candidate_idx];
  if (!cand) return res.status(400).json({ error: '후보 없음' });

  state.confirmed.push({
    person_id:         cand.id,
    name:              cand.name,
    handle:            cand.handle,
    type:              cand.type,
    visit_date:        cand.visit_date,
    linked_influencer: cand.linked_influencer ?? null,
    capture_file,
    confidence:        cand.score,
    matched_at:        new Date().toISOString(),
    review:            true,
  });
  const idx = state.no_match.findIndex(i => i.capture_file === capture_file);
  if (idx !== -1) state.no_match.splice(idx, 1);
  saveState(state);
  res.json({ ok: true });
});

// no_match → 미등록 처리
app.post('/api/no_match/dismiss', (req, res) => {
  const { capture_file } = req.body;
  const state = loadState();
  const item = state.no_match.find(i => i.capture_file === capture_file);
  if (item) item.dismissed = true;
  saveState(state);
  res.json({ ok: true });
});

// 매칭 + 빌드 + 배포 (비동기 실행, 즉시 응답)
app.post('/api/deploy', (req, res) => {
  res.json({ ok: true, message: '시작됨 — 터미널에서 진행상황 확인' });
  exec('npm run update', { cwd: PROJECT_ROOT, timeout: 600000 }, (err, stdout, stderr) => {
    console.log('\n─── 배포 결과 ───');
    if (err) console.error(stderr || err.message);
    else { console.log(stdout); console.log('✓ 배포 완료\n'); }
  });
});

// 스크립트 실행
app.post('/api/run/:script', (req, res) => {
  const allowed = { parse: 'parseCSV.js', match: 'match.js' };
  const file = allowed[req.params.script];
  if (!file) return res.status(400).json({ error: '알 수 없는 스크립트' });

  const scriptPath = path.resolve(__dirname, file);
  exec(`node "${scriptPath}"`, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, error: stderr || err.message });
    res.json({ ok: true, output: stdout });
  });
});

// ─── 시작 ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`검수 서버 시작: ${url}`);
  console.log('종료: Ctrl+C\n');

  // 브라우저 자동 열기 (Windows)
  exec(`start ${url}`);
});

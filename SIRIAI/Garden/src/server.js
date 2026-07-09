// 가드닝 대시보드 서버 — 캠페인 기반. Node 내장 http (의존성 0). 127.0.0.1 만.
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { createSmm } from './smm.js';
import { classify } from './garden.js';
import { loadOrders, saveOrders, refreshOrders, inFlightFor } from './orders.js';
import { getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet, syncRecruitToSheet } from './sheet.js';
import { scanAccounts, buildPlan, placeOrders, findService } from './execute-core.js';
import { runSync } from './sync-core.js';
import { runContentScan } from './content-core.js';
import { listCampaigns, getCampaign, getFx, setCalibration, setFallbackRate, getStaleDays, setService } from './campaigns.js';
import { getMarketUsdKrw } from './fx.js';
import { loadOverrides, setOverride, clearOverride, EDITABLE_COLS, OVERRIDE_COLS } from './overrides.js';

loadEnv();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PUB = join(root, 'public');
const PORT = Number(process.env.DASHBOARD_PORT || 3737);
const key = process.env.SMMKINGS_API_KEY;
const smm = key ? createSmm(key) : null;
let contentScanState = { running: false, done: 0, total: 0, up: 0, written: 0, error: null, ranAt: null };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function catalog() {
  const p = join(root, 'data', 'smm-services.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}
const serviceOf = (c) => findService(catalog(), c.serviceId);

function tiktokFollowerServices() {
  return catalog()
    .filter((s) => {
      const t = `${s.name} ${s.category || ''}`.toLowerCase();
      return t.includes('tiktok') && t.includes('follow');
    })
    .map((s) => ({ id: s.service, name: s.name, rate: s.rate, min: s.min, max: s.max }))
    .sort((a, b) => Number(a.rate) - Number(b.rate));
}

async function effectiveRate() {
  const fx = getFx();
  const market = await getMarketUsdKrw();
  return market ? market * fx.calibration : fx.fallbackRate;
}

function scanLatest(campaign) {
  const p = join(campaign.dataDir, 'scan-latest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { accounts: [], ranAt: null };
}
const parseNum = (n) => { if (n == null || n === '') return null; const v = Number(String(n).replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : null; };

function decorate(accounts, orders, campaign) {
  return (accounts || []).map((a) => {
    const inFlight = inFlightFor(orders, a.handle);
    const c = classify(a.current, { target: campaign.target, min: campaign.min, inFlight });
    return { ...a, inFlight, status: c.status, order: c.order, projected: c.projected };
  });
}
// 시트 라이브 목록(라이프사이클 컬럼 포함) + scan-latest 현재값 병합
async function buildAccounts(campaign, orders) {
  const latest = scanLatest(campaign);
  const cur = {};
  (latest.accounts || latest.results || []).forEach((a) => { cur[a.handle] = a.current; });
  let list;
  try {
    const live = await getAccountsFromSheet(campaign.sheet);
    // current = 스크랩값 우선, 없으면 시트 팔로워값(스캔 전에도 모집 뷰에 보이게)
    list = live.map((a) => ({ ...a, current: (a.handle in cur ? cur[a.handle] : null) ?? parseNum(a.sheetFollowers) }));
  } catch {
    list = (latest.accounts || latest.results || []).map((a) => ({ ...a, current: a.current }));
  }
  // 콘텐츠·검수·성과 병합 — 우선순위: 수동잠금(overrides) > 시트값 > 자동감지(detected).
  // 시트는 텍스트 상태("사용 확인"/"음원 다름" 등)를 그대로 보존(프론트가 판정).
  const det = loadDetected(campaign);
  const ov = loadOverrides(campaign.dataDir);
  const hasV = (v) => !!(v != null && String(v).trim());
  list = list.map((a) => {
    const m = { ...a };
    const d = det[a.handle];
    if (d && d.uploaded) {
      // 시트값이 비었을 때만 자동감지로 채움 (content-scan이 시트에 이미 썼다면 시트값 유지).
      if (!hasV(m.contentLink)) m.contentLink = d.contentLink;
      if (!hasV(m.soundOk)) m.soundOk = d.soundOk ? '사용 확인' : '음원 다름';
      if (!hasV(m.hashtagOk)) m.hashtagOk = d.hashtagOk ? '확인 완료' : '해시태그 누락';
      if (!hasV(m.views)) { m.views = d.views; m.likes = d.likes; m.comments = d.comments; m.shares = d.shares; }
      m.autoDetected = true;
    }
    // 수동 잠금값 최우선 (닉 제외 검수/콘텐츠 열). 로컬 저장이라 시트 재배포 전에도 즉시 반영.
    const rowOv = ov[String(a.row)];
    if (rowOv) {
      if ('17' in rowOv) m.contentLink = rowOv['17'];
      if ('19' in rowOv) m.soundOk = rowOv['19'];
      if ('20' in rowOv) m.soundSection = rowOv['20'];
      if ('21' in rowOv) m.hashtagOk = rowOv['21'];
      m.manualCols = Object.keys(rowOv); // 프론트 툴팁: 수동 지정된 열 구분
    }
    return m;
  });
  return decorate(list, orders, campaign);
}

// SIRIAI 베스트 콘텐츠 마킹 (캠페인별 로컬 저장)
function bestFile(campaign) { return join(campaign.dataDir, 'best.json'); }
function loadBest(campaign) { const f = bestFile(campaign); if (!existsSync(f)) return []; try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return []; } }
function saveBest(campaign, arr) { mkdirSync(campaign.dataDir, { recursive: true }); writeFileSync(bestFile(campaign), JSON.stringify(arr)); }
// 자동 감지 결과 로드 (scan-content.js 가 저장)
function loadDetected(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
}
// 주문에 정체(stale) 플래그 부여 — 응답 전용
function markStale(orders) {
  const cutoff = getStaleDays() * 86400000;
  const now = Date.now();
  return orders.map((o) => ({ ...o, stale: !o.done && !o.closed && o.placedAt ? now - new Date(o.placedAt).getTime() > cutoff : false }));
}

function send(res, code, body, type = 'application/json') {
  const t = type + (type.startsWith('text') || type === 'application/json' ? '; charset=utf-8' : '');
  res.writeHead(code, { 'Content-Type': t });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

// 뷰어(팀 공유) 모드 — 쓰기/집행/스캔/편집 차단. VIEWER=1 로 켜고 터널로 공유하면 팀원이 실수로 돈 쓰거나 스캔 못 함.
const VIEWER = process.env.VIEWER === '1';
const VIEWER_BLOCK = new Set(['/api/scan', '/api/content-scan', '/api/execute', '/api/cell', '/api/manual', '/api/best', '/api/rate', '/api/service', '/api/order/close', '/api/sync-recruit']);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const campId = url.searchParams.get('campaign');
  try {
    if (VIEWER && req.method === 'POST' && VIEWER_BLOCK.has(path)) {
      return send(res, 403, { error: '팀 공유(보기 전용) 모드예요 — 스캔·집행·편집은 운영자 로컬에서만 돼요.' });
    }
    if (path === '/api/campaigns' && req.method === 'GET') {
      return send(res, 200, { campaigns: listCampaigns().map((c) => ({ id: c.id, name: c.name, group: c.group })), krwPerUsd: await effectiveRate() });
    }
    if (path === '/api/services' && req.method === 'GET') {
      return send(res, 200, { services: tiktokFollowerServices() });
    }

    const campaign = campId ? getCampaign(campId) : listCampaigns()[0];
    if (!campaign) return send(res, 404, { error: '캠페인 없음' });

    if (path === '/api/data' && req.method === 'GET') {
      let orders = loadOrders(campaign.dataDir);
      if (smm) { try { orders = await refreshOrders(smm, orders); saveOrders(campaign.dataDir, orders); } catch {} }
      let balance = null;
      if (smm) { try { balance = Number((await smm.balance()).balance); } catch {} }
      const svc = serviceOf(campaign);
      const accounts = await buildAccounts(campaign, orders);
      return send(res, 200, {
        campaign: { id: campaign.id, name: campaign.name, group: campaign.group },
        config: { target: campaign.target, min: campaign.min, krwPerUsd: await effectiveRate(), staleDays: getStaleDays(), hasKey: !!smm, confirmNotice: !!campaign.confirmNotice, viewer: VIEWER,
          service: svc ? { id: svc.service, name: svc.name, rate: svc.rate } : { id: campaign.serviceId, name: `#${campaign.serviceId}`, rate: 0 } },
        balance, scannedAt: scanLatest(campaign).ranAt, accounts, orders: markStale(orders), best: loadBest(campaign),
      });
    }

    // 수기 팔로워 입력 → 시트에 되쓰기 (스크래핑 안 되는 계정용, 예: @kotanissy)
    if (path === '/api/manual' && req.method === 'POST') {
      const body = await readBody(req);
      const row = Number(body.row);
      const followers = Number(body.followers);
      if (!row || !Number.isFinite(followers)) return send(res, 400, { error: 'row/followers 필요' });
      try {
        const updated = await pushFollowersToSheet(campaign.sheet, [{ row, followers }]);
        return send(res, 200, { ok: true, updated });
      } catch (e) {
        return send(res, 500, { error: '시트 쓰기 실패: ' + e.message });
      }
    }

    // 셀 수기 편집 → 시트 되쓰기 + 검수/콘텐츠 열이면 수동 잠금 기록(수동 우선)
    if (path === '/api/cell' && req.method === 'POST') {
      const body = await readBody(req);
      const row = Number(body.row);
      const col = Number(body.col);
      const value = body.value == null ? '' : String(body.value);
      if (!row || !EDITABLE_COLS.includes(col)) return send(res, 400, { error: `row/col(${EDITABLE_COLS.join('·')}) 필요` });
      // 계정 링크(4)는 @핸들이 있어야 함 — 없으면 시트 읽을 때 그 행이 통째로 사라짐(계정 소실 방지)
      if (col === 4 && !/@[A-Za-z0-9._]+/.test(value)) return send(res, 400, { error: '계정 링크에 @사용자명이 필요합니다 (예: tiktok.com/@user)' });
      try {
        await pushCellsToSheet(campaign.sheet, [{ row, col, value }]);
        // 검수/콘텐츠 열: 값 있으면 수동 잠금, '미확인'(빈값)이면 잠금 해제(자동 관리에 반환). 닉3은 잠금 무관.
        if (OVERRIDE_COLS.includes(col) && !value.trim()) clearOverride(campaign.dataDir, row, col);
        else setOverride(campaign.dataDir, row, col, value);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 500, { error: '시트 쓰기 실패: ' + e.message });
      }
    }

    // 콘텐츠 스캔 (대시보드 버튼) — 백그라운드 Playwright, 진행상황은 status 폴링
    if (path === '/api/content-scan' && req.method === 'POST') {
      if (contentScanState.running) return send(res, 200, { running: true });
      const full = url.searchParams.get('full') === '1';
      contentScanState = { running: true, done: 0, total: 0, up: 0, written: 0, error: null, ranAt: null };
      runContentScan(campaign, { full, onProgress: (p) => { contentScanState.done = p.done; contentScanState.total = p.total; } })
        .then((r) => { contentScanState = { running: false, done: r.total, total: r.total, up: r.up, written: r.written, error: null, ranAt: new Date().toISOString() }; })
        .catch((e) => { contentScanState = { running: false, done: 0, total: 0, up: 0, written: 0, error: e.message, ranAt: null }; });
      return send(res, 200, { started: true });
    }
    if (path === '/api/content-scan/status' && req.method === 'GET') {
      return send(res, 200, contentScanState);
    }

    // SIRIAI 베스트 콘텐츠 토글
    if (path === '/api/best' && req.method === 'POST') {
      const body = await readBody(req);
      let best = loadBest(campaign);
      if (body.on) { if (!best.includes(body.handle)) best.push(body.handle); }
      else { best = best.filter((h) => h !== body.handle); }
      saveBest(campaign, best);
      return send(res, 200, { ok: true, best });
    }

    // 모집시트(마루 등) → 마스터 자동 동기화: 계정 URL 추출·정리 후 새 계정만 마스터에 추가
    if (path === '/api/sync-recruit' && req.method === 'POST') {
      const sheets = campaign.recruitSheets || [];
      if (!sheets.length) return send(res, 400, { error: '이 캠페인엔 모집시트 설정이 없어요 (campaigns.json recruitSheets)' });
      let added = 0;
      const handles = [];
      for (const s of sheets) {
        const r = await syncRecruitToSheet(campaign.sheet, s); // 실패 시 throw → 아래 catch가 500
        if (r.added === undefined) return send(res, 400, { error: '브릿지에 동기화 기능이 없어요 — Apps Script(Code.gs) 재배포가 필요합니다' });
        added += Number(r.added) || 0;
        if (Array.isArray(r.handles)) handles.push(...r.handles);
      }
      return send(res, 200, { ok: true, added, handles });
    }

    if (path === '/api/scan' && req.method === 'POST') {
      const sync = await runSync(campaign, { full: url.searchParams.get('full') === '1' });
      let orders = loadOrders(campaign.dataDir);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      return send(res, 200, { ok: true, scannedAt: scanLatest(campaign).ranAt, scannedCount: sync.scannedCount, nicksWritten: sync.nicksWritten, accounts: await buildAccounts(campaign, orders), orders: markStale(orders) });
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const svc = serviceOf(campaign);
      let orders = loadOrders(campaign.dataDir);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      const body = await readBody(req);
      let accs = (scanLatest(campaign).accounts || scanLatest(campaign).results || []);
      if (Array.isArray(body.handles)) accs = accs.filter((a) => body.handles.includes(a.handle));
      const plan = buildPlan(accs, orders, { target: campaign.target, min: campaign.min, service: svc });
      let balance = null;
      if (smm) { try { balance = Number((await smm.balance()).balance); } catch {} }
      return send(res, 200, { ...plan, balance, krwPerUsd: await effectiveRate(), service: svc ? { id: svc.service, name: svc.name, rate: svc.rate } : null });
    }

    if (path === '/api/execute' && req.method === 'POST') {
      if (!smm) return send(res, 400, { error: 'SMM 키가 .env 에 없습니다.' });
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: 'confirm=true 필요' });
      const svc = serviceOf(campaign);
      if (!svc) return send(res, 400, { error: '서비스 정보 없음' });
      let orders = loadOrders(campaign.dataDir);
      orders = await refreshOrders(smm, orders);
      let accounts = await getAccountsFromSheet(campaign.sheet);
      if (Array.isArray(body.handles)) accounts = accounts.filter((a) => body.handles.includes(a.handle));
      const scanned = await scanAccounts(accounts);
      const plan = buildPlan(scanned, orders, { target: campaign.target, min: campaign.min, service: svc });
      const balance = Number((await smm.balance()).balance);
      if (plan.totalCost > balance) return send(res, 400, { error: `잔액 부족: 필요 $${plan.totalCost.toFixed(2)} > 잔액 $${balance}` });
      const placed = await placeOrders(smm, orders, plan.toOrder, svc);
      saveOrders(campaign.dataDir, orders);
      return send(res, 200, { ok: true, placed, filling: plan.filling, orders: markStale(orders) });
    }

    // 환율 재보정 — 현재 smmkings 잔액(₩) 입력 → 보정계수 재계산
    if (path === '/api/rate' && req.method === 'POST') {
      if (!smm) return send(res, 400, { error: 'SMM 키 없음' });
      const body = await readBody(req);
      const krwBal = Number(body.krwBalance);
      if (!krwBal || krwBal <= 0) return send(res, 400, { error: '유효한 잔액(₩) 필요' });
      const usd = Number((await smm.balance()).balance);
      if (!usd) return send(res, 400, { error: 'USD 잔액 조회 실패' });
      const smmRate = krwBal / usd;
      const market = await getMarketUsdKrw();
      if (market) setCalibration(smmRate / market);
      setFallbackRate(smmRate);
      return send(res, 200, { krwPerUsd: await effectiveRate() });
    }

    // 캠페인 서비스 변경
    if (path === '/api/service' && req.method === 'POST') {
      const body = await readBody(req);
      const ok = setService(campaign.id, body.serviceId);
      return send(res, 200, { ok });
    }

    // 정체 주문 종료 처리 (취소 시도 + 완료처리 → 재가드닝 가능)
    if (path === '/api/order/close' && req.method === 'POST') {
      if (!smm) return send(res, 400, { error: 'SMM 키 없음' });
      const body = await readBody(req);
      let orders = loadOrders(campaign.dataDir);
      const o = orders.find((x) => String(x.id) === String(body.orderId));
      if (!o) return send(res, 404, { error: '주문 없음' });
      // 현재 배송 상태 스냅샷 (실제 배송량·과금 보존 — remains=0 으로 덮지 않음)
      try {
        const st = (await smm.multiStatus([o.id]))[String(o.id)];
        if (st && !st.error) { o.remains = Number(st.remains); o.startCount = Number(st.start_count); o.charge = st.charge; o.status = st.status; }
      } catch {}
      let cancelled = false;
      try { await smm.cancel([o.id]); cancelled = true; } catch {}
      o.closed = true; // 재가드닝 가능(inFlight 제외). done 은 SMM 상태로 자연 갱신.
      o.closedAt = new Date().toISOString();
      saveOrders(campaign.dataDir, orders);
      return send(res, 200, { ok: true, cancelled });
    }

    // 정적 파일
    const file = (path === '/' ? '/index.html' : path).replace(/^\/+/, '');
    const fp = join(PUB, file);
    if (fp.startsWith(PUB) && existsSync(fp)) {
      return send(res, 200, readFileSync(fp), MIME[extname(fp)] || 'application/octet-stream');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n❌ 포트 ${PORT} 가 이미 사용 중이에요. 대시보드가 이미 켜져 있는지 확인하세요.\n`);
  else console.error('\n❌ 서버 오류:', e.message, '\n');
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🌱 가드닝 대시보드 실행 중: http://localhost:${PORT}`);
  console.log(`   (이 창을 닫으면 대시보드가 꺼져요. 종료: Ctrl+C)\n`);
  if (process.platform === 'win32' && !process.env.NO_OPEN) exec(`start "" "http://localhost:${PORT}"`);
});

// 가드닝 대시보드 서버 — 캠페인 기반. Node 내장 http (의존성 0). 127.0.0.1 만.
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { createSmm } from './smm.js';
import { classify } from './garden.js';
import { refreshOrders, inFlightFor } from './orders.js';
import { getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet, syncRecruitToSheet } from './sheet.js';
import { scanAccounts, buildPlan, placeOrders, findService } from './execute-core.js';
import { runSync } from './sync-core.js';
import { runContentScan } from './content-core.js';
import { listCampaigns, getCampaign, getFx, setCalibration, setFallbackRate, getStaleDays, setService } from './campaigns.js';
import { getMarketUsdKrw } from './fx.js';
import { EDITABLE_COLS, OVERRIDE_COLS } from './overrides.js';
// 상태 계층 — GARDEN_STATE=sheet 면 시트가 진실, 기본(local)은 지금까지처럼 로컬 파일.
import { CLOUD, isLocalOnly, authed, authRequired, passwordMatches, makeToken, cookieHeader, cloudConfigError, tokenValid } from './cloud.js';
import { mode as stateMode, readOrders, writeOrders, readOverrides, setOverrideStore, clearOverrideStore, readBest, toggleBest, readAll, pendingState } from './store.js';

loadEnv();
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PUB = join(root, 'public');
const PORT = Number(process.env.DASHBOARD_PORT || 3737);
const key = CLOUD ? null : process.env.SMMKINGS_API_KEY; // 클라우드엔 키를 두지 않는다(돈 라우트 차단)
const smm = key ? createSmm(key) : null;
// 집행(돈) 비번 — .env EXECUTE_PASSWORD 에만 둠(코드·git 노출 X). 비어있으면 게이트 미적용.
const EXEC_PW = process.env.EXECUTE_PASSWORD || '';
function pwMatch(input) {
  const a = Buffer.from(String(input ?? '')), b = Buffer.from(EXEC_PW);
  return a.length === b.length && timingSafeEqual(a, b); // 상수시간 비교(길이 다르면 즉시 false)
}
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
// 수기 팔로워 입력 시 scan-latest 의 해당 계정 current 도 갱신 → buildAccounts 가 stale 스캔값으로 되돌리는 것 방지.
function setScanLatestFollowers(campaign, row, followers) {
  const p = join(campaign.dataDir, 'scan-latest.json');
  if (!existsSync(p)) return;
  try {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    const a = (d.accounts || []).find((x) => Number(x.row) === Number(row));
    if (a) { a.current = followers; writeFileSync(p, JSON.stringify(d, null, 2)); }
  } catch {}
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
// pre = { accounts?, overrides? } — 이미 읽어둔 값이 있으면 재조회하지 않는다(시트 왕복 절약).
async function buildAccounts(campaign, orders, pre = {}) {
  const latest = scanLatest(campaign);
  const cur = {};
  (latest.accounts || latest.results || []).forEach((a) => { cur[a.handle] = a.current; });
  let list;
  try {
    const live = pre.accounts || (await getAccountsFromSheet(campaign.sheet));
    // current = 스크랩값 우선, 없으면 시트 팔로워값(스캔 전에도 모집 뷰에 보이게)
    list = live.map((a) => ({ ...a, current: (a.handle in cur ? cur[a.handle] : null) ?? parseNum(a.sheetFollowers) }));
  } catch {
    list = (latest.accounts || latest.results || []).map((a) => ({ ...a, current: a.current }));
  }
  // 콘텐츠·검수·성과 병합 — 우선순위: 수동잠금(overrides) > 시트값 > 자동감지(detected).
  // 시트는 텍스트 상태("사용 확인"/"음원 다름" 등)를 그대로 보존(프론트가 판정).
  const det = loadDetected(campaign);
  const ov = pre.overrides || (await readOverrides(campaign));
  const hasV = (v) => !!(v != null && String(v).trim());
  list = list.map((a) => {
    const m = { ...a };
    const d = det[a.handle];
    if (d && d.uploaded) {
      // 시트값이 비었을 때만 자동감지로 채움 (content-scan이 시트에 이미 썼다면 시트값 유지).
      // autoCols = '시트에 저장된 값이 아니라 스캔의 추정값'인 열. 프론트가 검수로 세지 않도록 구분용.
      const autoCols = [];
      if (!hasV(m.contentLink)) m.contentLink = d.contentLink;
      if (!hasV(m.soundOk)) { m.soundOk = d.soundOk ? '사용 확인' : '음원 다름'; autoCols.push('19'); }
      if (!hasV(m.hashtagOk)) { m.hashtagOk = d.hashtagOk ? '확인 완료' : '해시태그 누락'; autoCols.push('21'); }
      if (!hasV(m.views)) { m.views = d.views; m.likes = d.likes; m.comments = d.comments; m.shares = d.shares; }
      m.autoDetected = true;
      if (autoCols.length) m.autoCols = autoCols;
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

// SIRIAI 베스트 콘텐츠 마킹 — store.js 가 로컬/시트를 알아서 처리(readBest/writeBest)
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
  if (req.body !== undefined && req.body !== null) return Promise.resolve(typeof req.body === 'string' ? (()=>{try{return JSON.parse(req.body)}catch{return {}}})() : req.body);
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

// 요청 핸들러 — 로컬(http 서버)과 Vercel(서버리스 함수)이 같은 함수를 쓴다.
export async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const campId = url.searchParams.get('campaign');
  try {
    // ── 진단: 환경변수가 '들어왔는지'만 알려준다(값은 절대 노출 안 함). 배포 문제 해결용. ──
    if (path === '/api/health') {
      return send(res, 200, {
        ok: true,
        cloud: CLOUD,
        stateMode: stateMode(),
        campaigns: listCampaigns().length,
        env: {
          GARDEN_STATE: process.env.GARDEN_STATE || null, // 비밀 아님
          TEAM_PASSWORD: !!process.env.TEAM_PASSWORD,
          SESSION_SECRET: !!process.env.SESSION_SECRET,
          CAMPAIGNS_JSON: !!process.env.CAMPAIGNS_JSON,
          CAMPAIGNS_JSON_parsed: (() => { try { return !!JSON.parse(process.env.CAMPAIGNS_JSON || 'null'); } catch { return 'JSON 형식 오류'; } })(),
          SMMKINGS_API_KEY: !!process.env.SMMKINGS_API_KEY, // 클라우드엔 없어야 정상
        },
        configError: cloudConfigError(),
      });
    }
    // ── 안전장치: 클라우드에서 필수 환경변수가 빠지면 아무것도 열지 않는다. ──
    //    (TEAM_PASSWORD 없이 열리면 시트 데이터가 인터넷에 공개됨)
    if (CLOUD) {
      const ce = cloudConfigError();
      if (ce) return send(res, 503, { error: ce, configError: true });
    }

    // ── 팀 초대 링크: /api/enter?t=<서명토큰> → 쿠키 심고 대시보드로. 비번 입력 화면을 안 봐도 됨.
    //    토큰은 SESSION_SECRET 으로 서명돼 있어 위조 불가. 링크를 가진 사람만 들어온다.
    if (path === '/api/enter' && req.method === 'GET') {
      const t = url.searchParams.get('t') || '';
      if (!tokenValid(t)) return send(res, 401, { error: '초대 링크가 유효하지 않거나 만료됐어요.' });
      res.setHeader('Set-Cookie', cookieHeader(t));
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    // ── 팀 접속 비번 (TEAM_PASSWORD 설정 시에만 켜짐. 로컬은 미설정 → 그대로 열림) ──
    if (path === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      if (!passwordMatches(b.password)) return send(res, 401, { error: '비번이 틀렸어요' });
      res.setHeader('Set-Cookie', cookieHeader(makeToken()));
      return send(res, 200, { ok: true });
    }
    if (path.startsWith('/api/') && !authed(req)) {
      return send(res, 401, { error: '로그인이 필요해요', login: true });
    }

    // ── 팀 초대 링크 발급 (로그인한 사람만). 서버가 SESSION_SECRET 으로 직접 서명하므로
    //    비밀값을 밖에서 알 필요가 없다. 이 링크를 팀원에게 주면 비번 없이 들어온다.
    if (path === '/api/invite' && req.method === 'GET') {
      const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const link = `${proto}://${host}/api/enter?t=${makeToken()}`;
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return send(res, 200, `<!doctype html><meta charset="utf-8"><title>팀 초대 링크</title>
<style>body{font-family:'Pretendard',-apple-system,Arial,sans-serif;background:#f5f6f8;color:#15171a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.c{background:#fff;border:1px solid #e9ebef;border-radius:18px;padding:32px;max-width:640px;width:100%;box-shadow:0 10px 30px rgba(20,20,35,.06)}
h1{font-size:19px;margin:0 0 6px}p{color:#697180;font-size:14px;margin:0 0 18px;line-height:1.6}
input{width:100%;font-size:13px;padding:12px 14px;border:1.5px solid #e9ebef;border-radius:10px;background:#f7f8fa;color:#15171a}
button{margin-top:12px;font-size:15px;font-weight:700;padding:11px 18px;border-radius:10px;border:none;background:#5b4ff5;color:#fff;cursor:pointer}
small{display:block;margin-top:16px;color:#8a4f06;background:#fdf2e0;padding:10px 12px;border-radius:8px;font-size:12.5px;line-height:1.6}</style>
<div class="c"><h1>🌱 팀 초대 링크</h1>
<p>이 링크를 팀원에게 보내세요. 누르면 <b>비밀번호 없이 바로</b> 대시보드로 들어갑니다. (1년 유지)</p>
<input id="l" value="${esc(link)}" readonly onclick="this.select()">
<button onclick="navigator.clipboard.writeText(document.getElementById('l').value);this.textContent='복사됨 ✓'">링크 복사</button>
<small>이 링크를 가진 사람은 누구나 들어올 수 있어요. 외부에 공개된 곳(공개 문서·SNS)엔 올리지 마세요.<br>유출되면 Vercel 에서 <b>SESSION_SECRET</b> 값만 바꾸면 기존 링크가 전부 무효가 됩니다.</small></div>`, 'text/html');
    }

    // ── 클라우드에서 못 하는 것: 스캔·집행 등은 대표님 PC 대시보드 전용 ──
    if (isLocalOnly(path)) {
      return send(res, 501, { error: '이 기능은 대표님 PC의 대시보드에서만 할 수 있어요.', localOnly: true });
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
      // 시트 모드면 계정+주문+검수잠금+베스트를 한 번에 (왕복 1회)
      const all = await readAll(campaign);
      let orders = all.orders;
      // 상태 폴링이 실제로 값을 바꿨을 때만 저장 — 매 페이지로드마다 시트에 쓰지 않도록.
      if (smm) {
        try {
          const before = JSON.stringify(orders);
          orders = await refreshOrders(smm, orders);
          if (JSON.stringify(orders) !== before) { const w = await writeOrders(campaign, orders); if (w.sheet === 'fail') console.error("[상태폴링] 시트 기록 실패(로컬엔 저장됨):", w.sheetError); }
        } catch {}
      }
      let balance = null;
      if (smm) { try { balance = Number((await smm.balance()).balance); } catch {} }
      const svc = serviceOf(campaign);
      const accounts = await buildAccounts(campaign, orders, { accounts: all.accounts, overrides: all.overrides });
      return send(res, 200, {
        campaign: { id: campaign.id, name: campaign.name, group: campaign.group },
        config: { target: campaign.target, min: campaign.min, krwPerUsd: await effectiveRate(), staleDays: getStaleDays(), hasKey: !!smm, confirmNotice: !!campaign.confirmNotice, execPwRequired: !!EXEC_PW, stateMode: stateMode(), cloud: CLOUD,
          service: svc ? { id: svc.service, name: svc.name, rate: svc.rate } : { id: campaign.serviceId, name: `#${campaign.serviceId}`, rate: 0 } },
        balance, scannedAt: scanLatest(campaign).ranAt, accounts, orders: markStale(orders), best: all.best,
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
        setScanLatestFollowers(campaign, row, followers); // 스캔값에 되돌려지지 않게 scan-latest 도 갱신
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
        const w = (OVERRIDE_COLS.includes(col) && !value.trim())
          ? await clearOverrideStore(campaign, row, col)
          : await setOverrideStore(campaign, row, col, value);
        // 잠금이 어디에도 안 남으면 스캔이 이 셀을 덮어쓸 수 있다 → 조용히 넘기지 않는다.
        if (w && w.durable === false) { console.error('[검수잠금] 기록 실패:', w.localError || w.sheetError); return send(res, 500, { error: '수정은 됐지만 잠금 기록에 실패했어요. 다음 스캔이 이 칸을 덮어쓸 수 있어요.' }); }
        if (w && w.sheet === 'fail') console.error('[검수잠금] 시트 기록 실패(로컬엔 저장됨):', w.sheetError);
        return send(res, 200, { ok: true, sheetWarn: w && w.sheet === 'fail' ? '잠금이 시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
      } catch (e) {
        return send(res, 500, { error: '시트 쓰기 실패: ' + e.message });
      }
    }

    // 콘텐츠 스캔 (대시보드 버튼) — 백그라운드 Playwright, 진행상황은 status 폴링
    if (path === '/api/content-scan' && req.method === 'POST') {
      if (contentScanState.running) return send(res, 200, { running: true });
      const full = url.searchParams.get('full') === '1';
      contentScanState = { running: true, done: 0, total: 0, up: 0, written: 0, failed: 0, error: null, ranAt: null };
      runContentScan(campaign, { full, onProgress: (p) => { contentScanState.done = p.done; contentScanState.total = p.total; } })
        .then((r) => { contentScanState = { running: false, done: r.total, total: r.total, up: r.up, written: r.written, failed: r.failed, failedHandles: r.failedHandles, error: null, ranAt: new Date().toISOString() }; })
        .catch((e) => { contentScanState = { running: false, done: 0, total: 0, up: 0, written: 0, failed: 0, error: e.message, ranAt: null }; });
      return send(res, 200, { started: true });
    }
    if (path === '/api/content-scan/status' && req.method === 'GET') {
      return send(res, 200, contentScanState);
    }

    // SIRIAI 베스트 콘텐츠 토글
    if (path === '/api/best' && req.method === 'POST') {
      const body = await readBody(req);
      // read-modify-write 직렬화 (동시 토글이 서로 덮어쓰지 않게)
      const { best, w } = await toggleBest(campaign, body.handle, !!body.on);
      if (w.sheet === 'fail') console.error('[베스트] 시트 기록 실패(로컬엔 저장됨):', w.sheetError);
      return send(res, 200, { ok: true, best, sheetWarn: w.sheet === 'fail' ? '시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
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
      let orders = await readOrders(campaign);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      return send(res, 200, { ok: true, scannedAt: scanLatest(campaign).ranAt, scannedCount: sync.scannedCount, nicksWritten: sync.nicksWritten, accounts: await buildAccounts(campaign, orders), orders: markStale(orders) });
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const svc = serviceOf(campaign);
      let orders = await readOrders(campaign);
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
      if (EXEC_PW && !pwMatch(body.password)) return send(res, 403, { error: '집행 비번이 틀렸어요' });
      const svc = serviceOf(campaign);
      if (!svc) return send(res, 400, { error: '서비스 정보 없음' });
      let orders = await readOrders(campaign);
      orders = await refreshOrders(smm, orders);
      let accounts = await getAccountsFromSheet(campaign.sheet);
      if (Array.isArray(body.handles)) accounts = accounts.filter((a) => body.handles.includes(a.handle));
      const scanned = await scanAccounts(accounts);
      const plan = buildPlan(scanned, orders, { target: campaign.target, min: campaign.min, service: svc });
      const balance = Number((await smm.balance()).balance);
      if (plan.totalCost > balance) return send(res, 400, { error: `잔액 부족: 필요 $${plan.totalCost.toFixed(2)} > 잔액 $${balance}` });
      let sheetWarn = null;
      let placed;
      try {
        placed = await placeOrders(smm, orders, plan.toOrder, svc, {
          // 과금 직후 즉시 기록. writeOrders 는 throw 하지 않고 durable 로 알린다.
          persist: async () => {
            const w = await writeOrders(campaign, orders);
            if (w.sheet === 'fail') { sheetWarn = w.sheetError; console.error('[집행] 시트 기록 실패(로컬엔 저장됨):', w.sheetError); }
            if (w.local === 'fail') console.error('[집행] 로컬 기록 실패:', w.localError);
            return w;
          },
        });
      } catch (e) {
        // 과금됐는데 어디에도 기록 못 함 → 마지막으로 한 번 더 저장 시도하고, 반드시 사용자에게 알린다.
        const w = await writeOrders(campaign, orders);
        console.error('[집행] 기록 실패로 배치 중단:', e.message);
        return send(res, 500, { error: e.message, placed: e.placed || [], recorded: w.durable, orders: markStale(orders) });
      }
      const w = await writeOrders(campaign, orders);
      if (!w.durable) return send(res, 500, { error: '주문은 나갔는데 기록에 실패했습니다. smmkings 패널에서 확인하세요.', placed, orders: markStale(orders) });
      if (w.sheet === 'fail') sheetWarn = w.sheetError;
      return send(res, 200, { ok: true, placed, filling: plan.filling, orders: markStale(orders), sheetWarn: sheetWarn ? '시트 기록 실패(로컬엔 저장됨) — 다음 새로고침 때 자동 재시도해요' : undefined });
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
      let orders = await readOrders(campaign);
      const o = orders.find((x) => String(x.id) === String(body.orderId));
      if (!o) return send(res, 404, { error: '주문 없음' });
      // 현재 배송 상태 스냅샷 (실제 배송량·과금 보존 — null/빈값을 0 으로 덮지 않음)
      try {
        const st = (await smm.multiStatus([o.id]))[String(o.id)];
        if (st && !st.error) {
          const r = (st.remains == null || String(st.remains).trim() === '') ? NaN : Number(st.remains);
          if (Number.isFinite(r)) o.remains = r;
          const sc = (st.start_count == null || String(st.start_count).trim() === '') ? NaN : Number(st.start_count);
          if (Number.isFinite(sc)) o.startCount = sc;
          if (st.charge != null && st.charge !== '') o.charge = st.charge;
          o.status = st.status;
        }
      } catch {}
      let cancelled = false;
      try { await smm.cancel([o.id]); cancelled = true; } catch {}
      o.closed = true;
      o.cancelled = cancelled; // 취소 성공 여부. 실패(false)면 inFlightFor 가 계속 진행중으로 카운트(재주문 차단).
      o.cancelStuck = false; // 새 종료 시도 → 오류표시 초기화(유예 지나도 배송 계속하면 스캔이 재표기).
      o.closedAt = new Date().toISOString();
      const w = await writeOrders(campaign, orders);
      if (!w.durable) return send(res, 500, { error: '종료 처리 기록에 실패했어요. 다시 시도해 주세요.' });
      if (w.sheet === 'fail') console.error("[종료] 시트 기록 실패(로컬엔 저장됨):", w.sheetError);
      return send(res, 200, { ok: true, cancelled, sheetWarn: w.sheet === 'fail' ? '시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
    }

    // 주문 포기 — 배송 중이라 취소가 안 먹혀도, 이 주문을 접고 계정을 재가드닝 가능하게(inFlightFor 제외).
    // 돈 안 나감(재주문은 별도 집행+비번). smm 취소를 마지막으로 한 번 더 시도(환불 여지)하되 결과와 무관하게 포기 처리.
    if (path === '/api/order/abandon' && req.method === 'POST') {
      const body = await readBody(req);
      let orders = await readOrders(campaign);
      const o = orders.find((x) => String(x.id) === String(body.orderId));
      if (!o) return send(res, 404, { error: '주문 없음' });
      if (smm) { try { await smm.cancel([o.id]); } catch {} } // 마지막 취소 시도(환불 가능하면)
      o.abandoned = true;
      o.abandonedAt = new Date().toISOString();
      o.cancelStuck = false;
      const w = await writeOrders(campaign, orders);
      if (!w.durable) return send(res, 500, { error: '포기 기록에 실패했어요. 다시 시도해 주세요.' });
      if (w.sheet === 'fail') console.error("[포기] 시트 기록 실패(로컬엔 저장됨):", w.sheetError);
      return send(res, 200, { ok: true, sheetWarn: w.sheet === 'fail' ? '시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
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
}

// 로컬(대표님 PC)에서만 포트를 잡는다. 클라우드는 api/index.js 가 handler 를 직접 호출.
if (!CLOUD) {
  const server = createServer(handler);
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
}

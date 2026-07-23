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
import { runAutoRefill, refillServiceIds, REFILL_WINDOW_DAYS } from './refill.js';
import { runSheetSetup, getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet, syncRecruitToSheet, deliverToSheet, readFeedbackFromSheet, addFeedbackToSheet, markFeedbackDone, addPersonToSheet } from './sheet.js';
import { scanAccounts, buildPlan, placeOrders, findService, tiktokOnly } from './execute-core.js';
import { runIgSync } from './ig-sync.js';
import { runIgContentScan } from './ig-content.js';
import { runSync } from './sync-core.js';
import { runContentScan, judgeOneLink, scanOneProfile } from './content-core.js';
import { checkExitLocation } from './tiktok-videos.js';
import { listCampaigns, getCampaign, getFx, setCalibration, setFallbackRate, getStaleDays, setService } from './campaigns.js';
import { getMarketUsdKrw } from './fx.js';
import { EDITABLE_FIELDS, OVERRIDE_FIELDS, LEGACY_COL_FIELD, reviewText } from './overrides.js';
// 상태 계층 — GARDEN_STATE=sheet 면 시트가 진실, 기본(local)은 지금까지처럼 로컬 파일.
import { CLOUD, isLocalOnly, cloudConfigError } from './cloud.js';
import { mode as stateMode, readOrders, writeOrders, updateOrders, readOverrides, setOverrideStore, clearOverrideStore, readBest, toggleBest, readAll, pendingState } from './store.js';

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
let contentScanState = { running: false, done: 0, total: 0, up: 0, newUp: 0, written: 0, error: null, ranAt: null };
// 캠페인별 SMM 캐시 — 잔액·주문상태 갱신을 매 로드마다 치지 않고 30초 스로틀. { balance, balanceAt, ordersAt }
const smmCache = new Map();
const SMM_TTL = 30000;
// 집행이 도는 동안 같은 캠페인의 두 번째 집행을 막는다 — 중복 과금 방지.
const execInProgress = new Set();
// 중단 요청. 스캔 루프가 계정 하나를 끝낼 때마다 확인한다 —
// 중간에 끊으면 브라우저가 열린 채 남고, 이미 쓴 시트값과 기록이 어긋난다.
const scanAbort = new Set();
let igContentState = null;   // 인스타 업로드 스캔 진행상황
let igScanState = null;   // 인스타 스캔 진행상황 — 워커 화면이 폴링한다
let scanConfirmResolve = null; // '스캔 시작' 확인을 기다리는 promise 의 resolver (로봇 인증 게이트)
let scanResumeResolve = null; // 막혔을 때 '재개/중지'를 기다리는 resolver (VPN 바꾸기 게이트)

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
// 지난 업로드 스캔에서 틱톡이 막아 '못 본' 계정 목록 (업로드 탭 하이라이트용). content-core 가 매 스캔마다 씀.
function scanFailures(campaign) {
  const p = join(campaign.dataDir, 'scan-failures.json');
  if (!existsSync(p)) return { ranAt: null, handles: [] };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { ranAt: null, handles: [] }; }
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
    // 최상위 inFlight 는 틱톡 기준이다(a.handle 이 틱톡 핸들). 인스타 충전이 여기 섞이면
    // 인스타를 채웠는데 틱톡 행이 '채워지는 중'으로 뜨고, 정작 인스타는 여전히 대상으로 남는다.
    const inFlight = inFlightFor(orders, a.handle, 'tk');
    const c = classify(a.current, { target: campaign.target, min: campaign.min, inFlight });
    const out = { ...a, inFlight, status: c.status, order: c.order, projected: c.projected };
    // 플랫폼 묶음에도 각자 진행중 수량을 넣는다 — 화면은 이 값으로 가드닝 대상을 가린다.
    if (out.ig && out.igHandle) out.ig = { ...out.ig, inFlight: inFlightFor(orders, out.igHandle, 'ig') };
    if (out.tk) out.tk = { ...out.tk, inFlight };
    return out;
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
  // 시트 어휘는 준수/미준수/빈칸(미확인) 셋뿐이다(overrides.js REVIEW_*). 그대로 보존한다.
  const det = loadDetected(campaign);
  const ov = pre.overrides || (await readOverrides(campaign));
  const hasV = (v) => !!(v != null && String(v).trim());
  list = list.map((a) => {
    const m = { ...a };
    const d = det[a.handle];
    if (d && d.uploaded) {
      // 시트값이 비었을 때만 자동감지로 채움 (content-scan이 시트에 이미 썼다면 시트값 유지).
      // autoFields = '시트에 저장된 값이 아니라 스캔의 추정값'인 필드. 프론트가 검수로 세지 않도록 구분용.
      // (열 번호 '19'/'21' 로 보내던 것 → 필드명. 프론트 app.js 도 같이 바뀐다)
      const autoFields = [];
      if (!hasV(m.contentLink)) m.contentLink = d.contentLink;
      // 화면에도 시트와 같은 어휘를 쓴다. 여기만 다르면 팀이 '준수'와 '확인 완료'를 다른 뜻으로 읽는다.
      if (!hasV(m.soundOk)) { m.soundOk = reviewText(d.soundOk); autoFields.push('soundOk'); }
      if (!hasV(m.hashtagOk)) { m.hashtagOk = reviewText(d.hashtagOk); autoFields.push('hashtagOk'); }
      if (!hasV(m.views)) { m.views = d.views; m.likes = d.likes; m.comments = d.comments; m.shares = d.shares; }
      m.autoDetected = true;
      if (autoFields.length) m.autoFields = autoFields;
    }
    // 수동 잠금값 최우선 (닉 제외 검수/콘텐츠 열). 로컬 저장이라 시트 재배포 전에도 즉시 반영.
    const rowOv = ov[String(a.row)];
    if (rowOv) {
      // 잠금 키는 필드명(contentA·soundOk…). 표시용 프로퍼티 이름(a.contentLink)은 그대로 둔다 —
      // 통일이 필요한 건 '되쓰기 키'뿐이고, 화면 코드까지 갈아엎으면 회귀 위험만 커진다.
      if ('contentA' in rowOv) m.contentLink = rowOv.contentA;
      if ('soundOk' in rowOv) m.soundOk = rowOv.soundOk;
      if ('soundSection' in rowOv) m.soundSection = rowOv.soundSection;
      if ('hashtagOk' in rowOv) m.hashtagOk = rowOv.hashtagOk;
      m.manualFields = Object.keys(rowOv); // 프론트 툴팁: 수동 지정된 필드 구분
    }
    return m;
  });
  return decorate(list, orders, campaign);
}

// SIRIAI 베스트 콘텐츠 마킹 — store.js 가 로컬/시트를 알아서 처리(readBest/writeBest)
// 자동 감지 결과 로드 (scan-content.js 가 저장)
// 업로드 스캔을 마지막으로 돌린 시각 — 팀 화면 상단의 '업로드 스캔'에 쓴다
function detectedRanAt(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')).ranAt || null; } catch { return null; }
}
function loadDetected(campaign) {
  const p = join(campaign.dataDir, 'detected.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).detected || {}; } catch { return {}; }
}
// 주문에 정체(stale) 플래그 부여 — 응답 전용
function markStale(orders) {
  const cutoff = getStaleDays() * 86400000;
  const now = Date.now();
  const refillIds = refillServiceIds(catalog()); // 리필 되는 서비스(refill=true) id 집합
  const num = (v) => (v == null || String(v).trim() === '' ? NaN : Number(v));
  return orders.map((o) => {
    const rem = num(o.remains);
    const delivered = Number.isFinite(rem) ? (Number(o.quantity) || 0) - rem : null;
    const undelivered = Number.isFinite(rem) ? rem : null; // 미전달분 = 환불 청구 대상
    const withinWindow = o.placedAt ? now - new Date(o.placedAt).getTime() <= REFILL_WINDOW_DAYS * 86400000 : false;
    // 리필 버튼 노출 조건: 리필 되는 서비스 · 30일 안 · 포기 안 함. (패널이 안 되면 눌렀을 때 사유가 뜬다)
    const refillable = refillIds.has(String(o.service)) && withinWindow && !o.abandoned;
    return {
      ...o,
      stale: !o.done && !o.closed && o.placedAt ? now - new Date(o.placedAt).getTime() > cutoff : false,
      delivered,
      undelivered,
      refillable,
    };
  });
}

// 배포 화면에서 이 로컬 서버를 부를 수 있게 허용할 출처. 우리 것만 연다 —
// 아무 출처나 열면 다른 사이트가 방문자 PC 의 로컬 서버를 조종할 수 있다.
// 정규식 대신 문자열 검사 — 이스케이프가 한 글자만 어긋나도 조용히 아무 출처나 열린다.
// 여는 문을 다루는 코드는 읽어서 바로 맞는지 알 수 있어야 한다.
function corsFor(origin) {
  const o = String(origin || '');
  if (!o) return '';
  // 우리 배포본 (프리뷰 배포는 siriai-challenge-xxxx 형태로 붙는다)
  if (o.startsWith('https://siriai-challenge') && o.endsWith('.vercel.app')) return o;
  // 개발 중인 로컬 화면
  if (o.startsWith('http://localhost:') || o.startsWith('http://127.0.0.1:')) return o;
  return '';
}

let _origin = '';   // 지금 처리 중인 요청의 Origin. send 가 CORS 헤더를 붙일 때 쓴다.
function send(res, code, body, type = 'application/json') {
  const t = type + (type.startsWith('text') || type === 'application/json' ? '; charset=utf-8' : '');
  const allow = corsFor(_origin);
  // 캐시 금지 — 고친 화면이 안 바뀌어 "요청한 게 하나도 적용이 안 됐다"로 보이던 원인.
  // 매일 고치는 내부 도구라 캐시 이득보다 '새로고침했는데 옛 화면'이 훨씬 비싸다.
  res.writeHead(code, Object.assign({ 'Content-Type': t, 'Cache-Control': 'no-store, must-revalidate', Pragma: 'no-cache' },
    allow ? { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' } : {}));
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
  _origin = req.headers.origin || '';
  // 브라우저는 POST 전에 OPTIONS 로 먼저 물어본다. 여기서 허용을 답하지 않으면 요청 자체가 안 간다.
  if (req.method === 'OPTIONS') {
    const allow = corsFor(_origin);
    res.writeHead(allow ? 204 : 403, allow
      ? { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
      : {});
    return res.end();
  }
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
        // 지금 돌고 있는 배포가 어느 커밋인지 — '배포가 됐나?'를 눈으로 확인하려고 (비밀 아님)
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        commitMsg: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
        env: {
          GARDEN_STATE: process.env.GARDEN_STATE || null, // 비밀 아님
          CAMPAIGNS_JSON: !!process.env.CAMPAIGNS_JSON,
          CAMPAIGNS_JSON_parsed: (() => { try { return !!JSON.parse(process.env.CAMPAIGNS_JSON || 'null'); } catch { return 'JSON 형식 오류'; } })(),
          SMMKINGS_API_KEY: !!process.env.SMMKINGS_API_KEY, // 클라우드엔 없어야 정상
        },
        configError: cloudConfigError(),
      });
    }
    // ── 안전장치: 필수 환경변수가 빠지면 텅 빈 화면 대신 뭐가 빠졌는지 보여준다. ──
    if (CLOUD) {
      const ce = cloudConfigError();
      if (ce) return send(res, 503, { error: ce, configError: true });
    }

    // 팀 URL 은 비번 없이 열린다. 돈·스캔은 아래 LOCAL_ONLY 로 막혀 있고,
    // smmkings API 키가 클라우드에 없어서 URL 을 아는 누구도 지출을 일으킬 수 없다.

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

    // ── 읽기 전용 캠페인 안전장치 ──────────────────────────────────────────
    // 되쓰기 좌표가 아직 열 번호 하드코딩이라(베이온 기준), 열 배치가 다른 마스터에 쓰면
    // 에러 없이 엉뚱한 열을 덮어쓴다. 예) 링크 저장은 4열 → LUN8에선 '이메일'.
    // 필드명 기반 되쓰기로 바꾸기 전까지, 새 캠페인은 readOnly:true 로 조회만 연다.
    // 의견은 예외 — 마스터 데이터가 아니라 별도 '의견' 탭에만 쌓인다.
    // 화면을 못 고치는 사람일수록 의견은 남겨야 하므로 읽기전용에서도 열어둔다.
    if (campaign.readOnly && req.method === 'POST' && path !== '/api/feedback') {
      return send(res, 423, {
        error: `${campaign.name}은(는) 아직 '조회 전용'이에요. 수정은 마스터시트에서 해주세요.\n(되쓰기 좌표를 필드명 기반으로 바꾸는 작업이 끝나면 열립니다 — 지금 쓰면 엉뚱한 열을 덮어써요.)`,
        readOnly: true,
      });
    }

    // ── 의견 남기기 ── 마스터 데이터가 아니라 별도 '의견' 탭. 팀 전체가 같은 목록을 본다.
    if (path === '/api/feedback' && req.method === 'GET') {
      try { return send(res, 200, { feedback: await readFeedbackFromSheet(campaign.sheet) }); }
      catch (e) { return send(res, 502, { error: '의견을 못 읽었어요: ' + e.message }); }
    }
    if (path === '/api/feedback' && req.method === 'POST') {
      const b = await readBody(req);
      const text = String(b.text || '').trim();
      if (b.done) {
        try { await markFeedbackDone(campaign.sheet, Number(b.done)); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 502, { error: '완료 표시 실패: ' + e.message }); }
      }
      if (!text) return send(res, 400, { error: '내용이 비어 있어요' });
      try {
        // 옛 브릿지는 모르는 요청을 조용히 삼키고 성공처럼 답한다 → 표식을 확인해 거짓 성공을 막는다.
        const r = await addFeedbackToSheet(campaign.sheet, { who: String(b.who || '팀원').slice(0, 30), where: String(b.where || '').slice(0, 200), text: text.slice(0, 2000) });
        if (!r || !r.feedbackSaved) return send(res, 502, { error: '마스터시트 브릿지가 의견 기능을 아직 몰라요. Apps Script 를 최신 Code.gs 로 재배포해 주세요.' });
        return send(res, 200, { ok: true });
      } catch (e) { return send(res, 502, { error: '의견을 못 남겼어요: ' + e.message }); }
    }

    if (path === '/api/data' && req.method === 'GET') {
      // 시트 모드면 계정+주문+검수잠금+베스트를 한 번에 (왕복 1회)
      const all = await readAll(campaign);
      let orders = all.orders;
      // 상태 폴링이 실제로 값을 바꿨을 때만 저장 — 30초 스로틀로 매 로드마다 SMM·시트를 치지 않도록.
      const now = Date.now();
      const sc = smmCache.get(campaign.id) || {};
      if (smm && (!sc.ordersAt || now - sc.ordersAt > SMM_TTL)) {
        try {
          // 락 안에서 다시 읽는다 — 읽고 multiStatus 를 기다리는 수 초 사이에 남이
          // 종료·포기한 주문이 낡은 스냅샷으로 되살아나는 걸 막는다(돈 기록).
          const u = await updateOrders(campaign, async (cur) => {
            const before = JSON.stringify(cur);
            const next = await refreshOrders(smm, cur);
            return JSON.stringify(next) === before ? undefined : next;
          });
          orders = u.orders;
          if (u.w && u.w.sheet === 'fail') console.error("[상태폴링] 시트 기록 실패(로컬엔 저장됨):", u.w.sheetError);
          sc.ordersAt = now;
        } catch {}
      }
      let balance = null;
      if (smm) {
        if (sc.balance != null && sc.balanceAt && now - sc.balanceAt < SMM_TTL) balance = sc.balance; // 30초 내면 캐시된 잔액
        else { try { balance = Number((await smm.balance()).balance); sc.balance = balance; sc.balanceAt = now; } catch {} }
      }
      smmCache.set(campaign.id, sc);
      const svc = serviceOf(campaign);
      const accounts = await buildAccounts(campaign, orders, { accounts: all.accounts, overrides: all.overrides });
      return send(res, 200, {
        campaign: { id: campaign.id, name: campaign.name, group: campaign.group },
        config: { target: campaign.target, min: campaign.min, krwPerUsd: await effectiveRate(), staleDays: getStaleDays(), hasKey: !!smm, confirmNotice: !!campaign.confirmNotice, execPwRequired: !!EXEC_PW, stateMode: stateMode(), cloud: CLOUD, readOnly: !!campaign.readOnly,
          service: svc ? { id: svc.service, name: svc.name, rate: svc.rate } : { id: campaign.serviceId, name: `#${campaign.serviceId}`, rate: 0 } },
        balance, scannedAt: scanLatest(campaign).ranAt, uploadScannedAt: detectedRanAt(campaign),
        // 화면이 가드닝 예상 금액을 계산하려면 단가와 환율이 필요하다.
        // 여기서 안 주면 프론트가 상수를 박아두게 되고, 서비스를 바꾼 날 조용히 틀린 금액이 뜬다.
        service: (() => { const v = serviceOf(campaign); return v ? { id: v.service, name: v.name, rate: v.rate } : null; })(),
        krwPerUsd: await effectiveRate(), accounts, orders: markStale(orders), best: all.best,
        scanFailures: scanFailures(campaign), // 지난 업로드 스캔에서 못 본 계정 — 업로드 탭 하이라이트용
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

    // 셀 수기 편집 → 시트 되쓰기 + 검수/콘텐츠 필드면 수동 잠금 기록(수동 우선)
    if (path === '/api/cell' && req.method === 'POST') {
      const body = await readBody(req);
      const row = Number(body.row);
      // 되쓰기 키는 필드명. 열 번호는 마스터마다 달라(베이온 4=계정링크, LUN8 4=이메일) 쓰면 안 된다.
      // 옛 화면(캐시된 app.js)이 col 로 보내는 경우만 베이온 좌표로 해석해 준다 —
      // 그렇게 얻은 필드도 아래 화이트리스트를 똑같이 통과해야 한다.
      let field = body.field ? String(body.field) : (LEGACY_COL_FIELD[Number(body.col)] || '');
      // 'ig.soundOk' 같은 플랫폼 지정 필드 — 접두어를 떼고 화이트리스트를 검사한다.
      const dot = field.indexOf('.');
      const baseField = dot > 0 ? field.slice(dot + 1) : field;
      const platPrefix = dot > 0 ? field.slice(0, dot) : '';
      if (platPrefix && !['tk', 'ig'].includes(platPrefix)) return send(res, 400, { error: '플랫폼은 tk/ig 만' });
      const value = body.value == null ? '' : String(body.value);
      if (!row || !EDITABLE_FIELDS.includes(baseField)) return send(res, 400, { error: `row/field(${EDITABLE_FIELDS.join('·')}) 필요` });
      // 계정 링크는 시트에서 읽을 때 핸들을 뽑아낼 수 있어야 한다 — 못 뽑으면 그 행이 통째로 사라진다.
      // 틱톡은 @핸들, 인스타는 instagram.com/핸들. 인스타를 예외로 두던 게 '@핸들' 을 그대로 통과시켜
      // 행 소실을 일으켰다(브릿지 igHandleFrom_ 은 URL 만 인식).
      if (baseField === 'link' && value.trim()) {
        const ok = platPrefix === 'ig'
          ? /instagram\.com\/[A-Za-z0-9._]+/i.test(value)
          : /@[A-Za-z0-9._]+/.test(value);
        if (!ok) return send(res, 400, { error: platPrefix === 'ig'
          ? '인스타 링크는 instagram.com/사용자명 형태여야 해요'
          : '계정 링크에 @사용자명이 필요합니다 (예: tiktok.com/@user)' });
      }
      try {
        await pushCellsToSheet(campaign.sheet, [{ row, field, value }]);
        // 검수/콘텐츠 필드: 값 있으면 수동 잠금, '미확인'(빈값)이면 잠금 해제(자동 관리에 반환). nick 은 잠금 무관.
        const w = (OVERRIDE_FIELDS.includes(baseField) && !value.trim())
          ? await clearOverrideStore(campaign, row, field)
          : await setOverrideStore(campaign, row, field, value);
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
      const _b = await readBody(req).catch(() => ({}));
      const _only = (Array.isArray(_b.only) && _b.only) || (url.searchParams.get('only') || '').split(',').filter(Boolean);
      if (contentScanState.running) return send(res, 200, { running: true });
      const full = url.searchParams.get('full') === '1';
      const perf = url.searchParams.get('perf') === '1'; // 조회수 스캔(납품 탭) — 업로드된 계정만 갱신
      // phase: 'confirm' = 크롬 창 떠서 로봇 인증 후 '스캔 시작' 대기 중, 'scan' = 실제로 긁는 중
      contentScanState = { running: true, phase: 'starting', mode: perf ? 'perf' : full ? 'full' : 'upload', done: 0, total: 0, up: 0, written: 0, failed: 0, pauseRequested: false, error: null, writeError: null, ranAt: null };
      // 확인 게이트: onWarmup 이 오면 phase=confirm, 사람이 /confirm 누르면 goPromise resolve → 스캔 착수
      const goPromise = new Promise((resolve) => { scanConfirmResolve = resolve; });
      runContentScan(campaign, {
        full, perf, only: _only,
        onWarmup: () => { contentScanState.phase = 'confirm'; },
        waitForGo: () => goPromise,
        onProgress: (p) => { if (contentScanState.phase !== 'blocked') contentScanState.phase = 'scan'; contentScanState.done = p.done; contentScanState.total = p.total; },
        shouldPause: () => contentScanState.pauseRequested,
        // 막히면(연속 실패) 또는 수동 중지 → phase=blocked, 사람이 /resume(재개) 또는 /stop(중지) 누를 때까지 대기.
        onBlocked: async ({ reason, done, total, failed }) => {
          contentScanState.phase = 'blocked';
          contentScanState.blockReason = reason;
          contentScanState.pauseRequested = false;
          contentScanState.done = done; contentScanState.total = total; contentScanState.failed = failed;
          const action = await new Promise((resolve) => { scanResumeResolve = resolve; });
          scanResumeResolve = null;
          contentScanState.phase = 'scan';
          contentScanState.blockReason = null;
          return action; // 'resume' | 'stop'
        },
      })
        .then((r) => { contentScanState = { running: false, mode: perf ? 'perf' : full ? 'full' : 'upload', done: r.total, total: r.total, up: r.up, newUp: r.newUp || 0, written: r.written, writeError: r.writeError || null, failed: r.failed, failedHandles: r.failedHandles, stopped: r.stopped, error: null, ranAt: new Date().toISOString() }; })
        .catch((e) => { contentScanState = { running: false, done: 0, total: 0, up: 0, written: 0, failed: 0, error: e.message, ranAt: null }; })
        .finally(() => { scanConfirmResolve = null; scanResumeResolve = null; });
      return send(res, 200, { started: true });
    }
    // 로봇 인증 끝났다는 사람 확인 → 스캔 착수
    if (path === '/api/content-scan/confirm' && req.method === 'POST') {
      if (!scanConfirmResolve) return send(res, 200, { ok: false, error: '대기 중인 스캔이 없어요' });
      scanConfirmResolve();
      scanConfirmResolve = null;
      contentScanState.phase = 'scan';
      return send(res, 200, { ok: true });
    }
    // 수동 중지 요청 — 다음 계정 사이에서 멈춘다(phase=blocked 로 넘어감).
    if (path === '/api/content-scan/pause' && req.method === 'POST') {
      if (!contentScanState.running || contentScanState.phase !== 'scan') return send(res, 200, { ok: false, error: '스캔 중이 아니에요' });
      contentScanState.pauseRequested = true;
      return send(res, 200, { ok: true });
    }
    // 재개 — VPN 바꾼 뒤. 멈춘(blocked) 지점부터 이어간다.
    if (path === '/api/content-scan/resume' && req.method === 'POST') {
      if (!scanResumeResolve) return send(res, 200, { ok: false, error: '멈춘 스캔이 없어요' });
      scanResumeResolve('resume');
      return send(res, 200, { ok: true });
    }
    // 중지 — 스캔을 접는다(여기까지 한 건 저장됨).
    if (path === '/api/content-scan/stop' && req.method === 'POST') {
      if (!scanResumeResolve) return send(res, 200, { ok: false, error: '멈춘 스캔이 없어요' });
      scanResumeResolve('stop');
      return send(res, 200, { ok: true, stopped: true });
    }
    if (path === '/api/content-scan/status' && req.method === 'GET') {
      return send(res, 200, contentScanState);
    }
    // 스캐너 출구 국가 확인 — VPN/프록시가 적용됐는지 눈으로. 창 하나 잠깐 뜸.
    if (path === '/api/exit-ip' && req.method === 'POST') {
      try { return send(res, 200, { ok: true, ...(await checkExitLocation()) }); }
      catch (e) { return send(res, 200, { ok: false, error: (e && e.message) || String(e) }); }
    }
    // 수기 대체 — 링크 한 장만 열어 판정(스캔이 막힐 때). 창 하나 잠깐 뜸.
    if (path === '/api/judge-link' && req.method === 'POST') {
      const body = await readBody(req);
      const row = Number(body.row);
      if (!row || !body.link) return send(res, 400, { error: 'row·link 가 필요해요' });
      try {
        const r = await judgeOneLink(campaign, { row, handle: body.handle, link: String(body.link) });
        return send(res, 200, { ok: true, ...r, accounts: await buildAccounts(campaign, await readOrders(campaign)) });
      } catch (e) { return send(res, 200, { ok: false, error: (e && e.message) || String(e) }); }
    }
    // 미업로드 계정 하나만 확인 — 이 프로필 한 장만 열어 업로드 여부 판정 (전체 스캔 대신)
    if (path === '/api/scan-one' && req.method === 'POST') {
      const body = await readBody(req);
      const row = Number(body.row), handle = String(body.handle || '');
      if (!row || !handle) return send(res, 400, { error: 'row·handle 이 필요해요' });
      try {
        const r = await scanOneProfile(campaign, { row, handle });
        return send(res, 200, { ok: true, ...r, accounts: await buildAccounts(campaign, await readOrders(campaign)) });
      } catch (e) { return send(res, 200, { ok: false, error: (e && e.message) || String(e) }); }
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
      // 브릿지의 원시 sync(linkCol 필요)가 아니라 시트에 있는 셋업 함수를 부른다.
      // 그쪽은 헤더 이름으로 열을 찾고 틱톡·인스타·이메일·추천인까지 처리한다 —
      // 사람이 시트 메뉴에서 손으로 돌리던 바로 그 로직이라 결과가 어긋나지 않는다.
      if (campaign.recruitSetupFn) {
        const r = await runSheetSetup(campaign.sheet, campaign.recruitSetupFn);
        return send(res, 200, { ok: true, ran: campaign.recruitSetupFn, result: r && r.result });
      }
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

    // 인원 추가 — 마스터 맨 아래에 한 줄. 돈 안 나감. 클라우드에서도 됨(시트 쓰기).
    if (path === '/api/person' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const r = await addPersonToSheet(campaign.sheet, { company: body.company, tkLink: body.tkLink, igLink: body.igLink, email: body.email });
        return send(res, 200, { ok: true, row: r.row });
      } catch (e) {
        // 브릿지가 검증 실패(핸들 못 뽑음 등)를 throw 로 올린다 — 그대로 사용자에게.
        return send(res, 400, { error: String((e && e.message) || e).replace(/^시트 응답:\s*/, '') });
      }
    }

    // 검수완료 콘텐츠 → 납품시트 자동 기입 (버튼). 링크 있고 3칸(음원·구간·해시) 모두 준수인 것만. 중복(계정 핸들) 제외.
    if (path === '/api/deliver' && req.method === 'POST') {
      if (!campaign.deliverySheetId) return send(res, 400, { error: '이 캠페인엔 납품시트 설정이 없어요 (campaigns.json deliverySheetId)' });
      const has = (v) => !!(v != null && String(v).trim());
      const revState = (v) => { const s = String(v == null ? '' : v).trim(); if (!s) return 'none'; if (/다름|누락|미준수|미사용|불가|없음|이슈|문제|✗|✘/i.test(s)) return 'fail'; if (/확인|준수|사용|완료|ok|pass|✓|✔/i.test(s)) return 'pass'; return 'none'; };
      const accounts = await buildAccounts(campaign, await readOrders(campaign));
      const reviewed = accounts.filter((a) => has(a.contentLink) && revState(a.soundOk) === 'pass' && revState(a.soundSection) === 'pass' && revState(a.hashtagOk) === 'pass');
      const rows = reviewed.map((a) => {
        const v = parseNum(a.views);
        return {
          nick: a.nick || a.handle,
          link: a.link || ('https://www.tiktok.com/@' + a.handle),
          contentLink: a.contentLink,
          viewNote: (v != null && v >= 10000) ? (Math.floor(v / 1000) * 1000) + '조회수' : '', // 1만+만 표기. 12,428 → "12000조회수"
        };
      });
      const r = await deliverToSheet(campaign.sheet, campaign.deliverySheetId, rows);
      if (r.added === undefined) return send(res, 400, { error: '브릿지에 납품 기입 기능이 없어요 — Apps Script(Code.gs) 재배포가 필요합니다' });
      return send(res, 200, { ok: true, ...r, reviewedTotal: reviewed.length });
    }

    if (path === '/api/scan' && req.method === 'POST') {
      const sync = await runSync(campaign, { full: url.searchParams.get('full') === '1' });
      let orders = await readOrders(campaign);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      // 자동 리필: 방금 스캔한 팔로워로 드롭 감지 → 리필 되는 주문(3693 등)에 리필 요청.
      // 리필 없는 서비스·30일 지난 주문·안 빠진 계정은 refill.js 가 알아서 거른다. 돈 안 나감.
      let refill = null;
      if (smm) {
        try {
          const latest = scanLatest(campaign);
          const fol = {};
          (latest.accounts || latest.results || []).forEach((a) => { fol[a.handle] = a.current; });
          const r = await runAutoRefill({ orders, followersByHandle: fol, smm, services: catalog() });
          if (r.requested) { await writeOrders(campaign, orders); refill = r; }
        } catch (e) { console.error('[자동리필] 실패(스캔은 정상):', (e && e.message) || e); }
      }
      return send(res, 200, { ok: true, scannedAt: scanLatest(campaign).ranAt, scannedCount: sync.scannedCount, scanTried: sync.scanTried, scanFailed: sync.scanFailed, writeError: sync.writeError || null, nicksWritten: sync.nicksWritten, refill, accounts: await buildAccounts(campaign, orders), orders: markStale(orders) });
    }

    // 인스타 모집 스캔 — 팔로워·닉네임을 인스타 열에 채운다. 틱톡 스캔(/api/scan)과 별개다:
    // 브라우저를 띄우고, 실패 모드도 다르다(로봇인증 vs 로그인 만료).
    if (path === '/api/ig-scan' && req.method === 'POST') {
      if (CLOUD) return send(res, 501, { error: '인스타 스캔은 대표님 PC 에서만 돌아요(크롬 창이 필요해요).' });
      igScanState = { phase: 'confirm', done: 0, total: 0, startedAt: new Date().toISOString() };
      try {
        scanAbort.delete('ig-scan');
        const out = await runIgSync(campaign, {
          full: url.searchParams.get('full') === '1',
          shouldStop: () => scanAbort.has('ig-scan'),
          onWarmup: () => { igScanState.phase = 'login'; },
          onProgress: (p) => {
            if (p.note) { igScanState.note = p.note; return; }
            igScanState.phase = 'scan'; igScanState.done = p.done; igScanState.total = p.total; igScanState.handle = p.handle;
          },
        });
        igScanState = { phase: 'done', done: out.scannedCount, total: out.total };
        return send(res, 200, { ok: true, ...out, accounts: undefined });
      } catch (e) {
        igScanState = { phase: 'error', error: e.message };
        return send(res, 500, { error: e.message });
      }
    }
    // 배포 화면이 '여기가 대표님 PC 인가'를 확인하는 데 쓴다. 로컬에서만 뜨는 서버이므로
    // 응답이 오면 곧 '이 브라우저가 있는 PC 에 서버가 있다'는 뜻이다. 팀원 PC 에선 응답이 없다.
    if (path === '/api/ping') return send(res, 200, { ok: true, local: !CLOUD, campaign: campaign.id, hasKey: !!smm });
    if (path === '/api/ig-scan-status') return send(res, 200, igScanState || { phase: 'idle' });
    if (path === '/api/ig-scan/stop' && req.method === 'POST') { scanAbort.add('ig-scan'); return send(res, 200, { ok: true }); }

    // 인스타 업로드 스캔 — 캡션에서 캠페인 해시태그를 찾아 콘텐츠 링크·검수를 채운다.
    // 게시물 목록이 필요해 API 경로로만 된다(프로필 페이지엔 안 온다) → 막히면 중단하고 나중에 재개.
    if (path === '/api/ig-content-scan' && req.method === 'POST') {
      if (CLOUD) return send(res, 501, { error: '인스타 업로드 스캔은 대표님 PC 에서만 돌아요(크롬 창이 필요해요).' });
      igContentState = { phase: 'confirm', done: 0, total: 0 };
      const body = await readBody(req).catch(() => ({}));
      try {
        scanAbort.delete('ig-content-scan');
        const out = await runIgContentScan(campaign, {
          since: url.searchParams.get('since') || '',
          // ?only=a,b 또는 본문 only:[...] — 내일 올리는 사람만 골라 도는 부분 스캔.
          only: (body && Array.isArray(body.only) && body.only) || (url.searchParams.get('only') || '').split(',').filter(Boolean),
          shouldStop: () => scanAbort.has('ig-content-scan'),
          onWarmup: () => { igContentState.phase = 'login'; },
          onProgress: (p) => { igContentState = { phase: 'scan', done: p.done, total: p.total, handle: p.handle, uploaded: p.uploaded }; },
        });
        igContentState = { phase: 'done', done: out.scannedCount, total: out.total };
        return send(res, 200, { ok: true, ...out, detected: undefined });
      } catch (e) {
        igContentState = { phase: 'error', error: e.message };
        return send(res, 500, { error: e.message });
      }
    }
    if (path === '/api/ig-content-status') return send(res, 200, igContentState || { phase: 'idle' });
    if (path === '/api/ig-content-scan/stop' && req.method === 'POST') { scanAbort.add('ig-content-scan'); return send(res, 200, { ok: true }); }

    if (path === '/api/plan' && req.method === 'POST') {
      const svc = serviceOf(campaign);
      let orders = await readOrders(campaign);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      const body = await readBody(req);
      let accs = (scanLatest(campaign).accounts || scanLatest(campaign).results || []);
      // 지난 스캔 기록에는 그 뒤 시트에서 지워진 계정이 남아 있다. 지금 시트에 틱톡 링크가
      // 실제로 있는 계정만 남긴다 — 안 그러면 없는 계정에 돈이 나간다(행28 りゅう 사례).
      try {
        const live = await getAccountsFromSheet(campaign.sheet);
        const ok = new Set(live.filter((a) => a.plat !== 'ig' && a.handle).map((a) => String(a.handle).toLowerCase()));
        const before = accs.length;
        accs = accs.filter((a) => ok.has(String(a.handle || '').toLowerCase()));
        if (accs.length < before) console.log('[집행계획] 시트에 없는 틱톡 계정 ' + (before - accs.length) + '건 제외');
      } catch (e) {
        // 시트를 못 읽으면 오래된 기록만으로 돈을 쓸 수는 없다.
        return send(res, 503, { error: '시트를 못 읽어서 집행 계획을 못 세웠어요 — 오래된 스캔 기록만으로는 주문하지 않습니다.' });
      }
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
      // 집행 한 번은 계정 전부를 다시 긁느라 수 분이 걸린다. 그동안 재진입을 막는 건
      // 워커 화면의 자바스크립트 변수뿐이었다 — 새로고침·탭 추가·네트워크 끊김 뒤 재시도면
      // 두 요청이 겹쳐 같은 계정에 두 번 과금된다. 둘 다 자기 시작 시점의 주문기록을 보므로
      // 진행중(inFlight)도 0 으로 읽혀 서로를 못 본다. 서버에서 막는다.
      // (비번 검증 뒤에 세운다 — 오타 요청이 잠금을 잡았다 놓는 잡음을 만들지 않게)
      if (execInProgress.has(campaign.id)) {
        return send(res, 409, { error: '집행이 이미 진행 중이에요 — 끝날 때까지 기다렸다가 결과를 확인하세요. 다시 누르면 같은 계정에 두 번 과금될 수 있어요.', busy: true });
      }
      execInProgress.add(campaign.id);
      try {
      const svc = serviceOf(campaign);
      if (!svc) return send(res, 400, { error: '서비스 정보 없음' });
      // 시트 왕복이 건당 3초쯤이라 순서대로 부르면 그만큼 쌓인다 —
      // 주문기록과 계정목록은 서로 의존하지 않으니 같이 부른다.
      let [orders, accounts] = await Promise.all([
        readOrders(campaign),
        getAccountsFromSheet(campaign.sheet),
      ]);
      orders = await refreshOrders(smm, orders);
      accounts = tiktokOnly(accounts);   // 틱톡 서비스로 주문하므로 틱톡 계정만
      if (Array.isArray(body.handles)) accounts = accounts.filter((a) => body.handles.includes(a.handle));
      // reuse: 이미 계획을 확인하고 비번까지 넣은 단계다 — 창을 새로 띄우고 로봇 인증을
      //        다시 거칠 이유가 없다. 살아 있는 브라우저로 팔로워만 다시 확인한다.
      const scanned = await scanAccounts(accounts, { reuse: true });
      const plan = buildPlan(scanned, orders, { target: campaign.target, min: campaign.min, service: svc });
      // 스캔에 수 분이 걸렸다. 그 사이 다른 경로(CLI·앞선 집행)가 주문을 넣었을 수 있으니
      // 돈을 쓰기 직전에 주문기록을 다시 읽어 이미 진행중인 계정은 뺀다.
      try {
        const fresh = await refreshOrders(smm, await readOrders(campaign));
        const before = plan.toOrder.length;
        plan.toOrder = plan.toOrder.filter((o) => inFlightFor(fresh, o.handle) === 0);
        if (plan.toOrder.length < before) console.log(`[집행] 이미 진행중인 주문 ${before - plan.toOrder.length}건 제외`);
        orders = fresh;
      } catch (e) { console.error('[집행] 주문기록 재확인 실패 — 중단합니다:', e.message); return send(res, 503, { error: '주문 기록을 다시 확인하지 못해 집행을 멈췄어요. 중복 과금을 피하려는 조치예요.' }); }
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
      } finally {
        // 중간 return 이 여러 개다(잔액부족·기록실패 등). 마지막 줄에서 지우면 영구 잠김이 된다.
        execInProgress.delete(campaign.id);
      }
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
      let notFound = false, cancelled = false, cancelError = '';
      // 읽기→수정→저장을 한 락 안에서. 안 그러면 20초 폴링이 그 사이에 끼어들어
      // 방금 찍은 closed 를 낡은 값으로 되돌린다.
      const { w } = await updateOrders(campaign, async (orders) => {
        const o = orders.find((x) => String(x.id) === String(body.orderId));
        if (!o) { notFound = true; return undefined; }
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
        // 패널이 취소를 '실제로' 받아줬는지 건별 응답으로 확인한다. HTTP 200 이라고 취소된 게 아니다.
        try {
          const [c] = await smm.cancel([o.id]);
          cancelled = !!(c && c.ok);
          if (c && !c.ok) cancelError = c.error || '패널이 취소를 거절했어요';
        } catch (e) { cancelError = String((e && e.message) || e); }
        o.closed = true;
        o.cancelled = cancelled; // 취소 성공 여부. 실패(false)면 inFlightFor 가 계속 진행중으로 카운트(재주문 차단).
        o.cancelError = cancelError || undefined;
        o.cancelStuck = false; // 새 종료 시도 → 오류표시 초기화(유예 지나도 배송 계속하면 스캔이 재표기).
        o.closedAt = new Date().toISOString();
        return orders;
      });
      if (notFound) return send(res, 404, { error: '주문 없음' });
      if (!w.durable) return send(res, 500, { error: '종료 처리 기록에 실패했어요. 다시 시도해 주세요.' });
      if (w.sheet === 'fail') console.error("[종료] 시트 기록 실패(로컬엔 저장됨):", w.sheetError);
      return send(res, 200, { ok: true, cancelled, cancelError: cancelError || undefined, sheetWarn: w.sheet === 'fail' ? '시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
    }

    // 수동 리필 — 버튼 딸깍. 리필 되는 주문(3693 등)의 빠진 팔로워를 지금 바로 리필 요청.
    // 자동 리필(스캔 시)과 같은 API, 사람이 직접 누르는 경로. 돈 안 나감.
    if (path === '/api/order/refill' && req.method === 'POST') {
      if (!smm) return send(res, 400, { error: 'SMM 키 없음 (대표님 PC에서만 됨)' });
      const body = await readBody(req);
      let notFound = false, reqError = '', result;
      const { orders: after, w } = await updateOrders(campaign, async (orders) => {
        const o = orders.find((x) => String(x.id) === String(body.orderId));
        if (!o) { notFound = true; return undefined; }
        try { [result] = await smm.refill([o.id]); }
        catch (e) { reqError = String((e && e.message) || e); return undefined; }
        o.refillAt = new Date().toISOString();
        if (result && result.ok) { o.refillId = result.refillId; o.refillError = undefined; }
        else { o.refillError = (result && result.error) || '패널이 리필을 거절했어요'; }
        return orders;
      });
      if (notFound) return send(res, 404, { error: '주문 없음' });
      if (reqError) return send(res, 502, { error: '리필 요청 실패: ' + reqError });
      if (!w.durable) return send(res, 500, { error: '리필 기록에 실패했어요. 다시 시도해 주세요.' });
      return send(res, 200, { ok: !!(result && result.ok), refillId: result && result.refillId, error: result && result.error, orders: markStale(after) });
    }

    // 주문 포기 — 배송 중이라 취소가 안 먹혀도, 이 주문을 접고 계정을 재가드닝 가능하게(inFlightFor 제외).
    // 돈 안 나감(재주문은 별도 집행+비번). smm 취소를 마지막으로 한 번 더 시도(환불 여지)하되 결과와 무관하게 포기 처리.
    if (path === '/api/order/abandon' && req.method === 'POST') {
      const body = await readBody(req);
      let notFound = false;
      const { w } = await updateOrders(campaign, async (orders) => {
        // id 로도, uid 로도 찾는다 — '패널 확인 필요' 주문은 id 가 null 이라 uid 로만 잡힌다(탈출구).
        const o = orders.find((x) => (x.id != null && String(x.id) === String(body.orderId)) || (x.uid && x.uid === body.orderId));
        if (!o) { notFound = true; return undefined; }
        if (smm && o.id != null) { try { await smm.cancel([o.id]); } catch {} } // 마지막 취소 시도(환불 가능하면). id 없으면 취소할 게 없다.
        o.abandoned = true;
        o.abandonedAt = new Date().toISOString();
        o.cancelStuck = false;
        return orders;
      });
      if (notFound) return send(res, 404, { error: '주문 없음' });
      if (!w.durable) return send(res, 500, { error: '포기 기록에 실패했어요. 다시 시도해 주세요.' });
      if (w.sheet === 'fail') console.error("[포기] 시트 기록 실패(로컬엔 저장됨):", w.sheetError);
      return send(res, 200, { ok: true, sheetWarn: w.sheet === 'fail' ? '시트에 아직 안 올라갔어요(로컬엔 저장됨)' : undefined });
    }

    // 작업 콘솔(worker.html)은 대표님 PC 전용 — 클라우드에선 '없는 파일'처럼 404.
    // 팀원이 URL 을 알아도 못 열게. (Vercel 은 public/ 을 CDN 이 직접 서빙하므로
    //  vercel.json 의 redirects 가 실질 방어선이고, 이건 핸들러가 서빙하는 경우의 이중 방어다.)
    if (CLOUD && /^\/worker(\.html)?$/i.test(path)) return send(res, 404, { error: 'not found' });

    // 정적 파일
    // 루트는 이 캠페인 대시보드로. 예전엔 index.html(옛 대시보드)이 떠서, 탭 이름이 같은
    // 두 화면을 오가며 '왜 수정이 반영이 안 되냐'로 헤맸다. 옛 화면들은 _archive/ 로 옮겼다.
    const file = (path === '/' ? '/lun8.html' : path).replace(/^\/+/, '');
    const fp = join(PUB, file);
    if (fp.startsWith(PUB) && existsSync(fp)) {
      return send(res, 200, readFileSync(fp), MIME[extname(fp)] || 'application/octet-stream');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}

const server = createServer(handler);
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n❌ 포트 ${PORT} 가 이미 사용 중이에요. 대시보드가 이미 켜져 있는지 확인하세요.\n`);
  else console.error('\n❌ 서버 오류:', e.message, '\n');
  process.exit(1);
});

if (!CLOUD) {
  // 로컬은 127.0.0.1 로만 묶는다 — 같은 공유기의 다른 기기가 들어오지 못하게.
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🌱 가드닝 대시보드 실행 중: http://localhost:${PORT}`);
    console.log(`   (이 창을 닫으면 대시보드가 꺼져요. 종료: Ctrl+C)\n`);
    if (process.platform === 'win32' && !process.env.NO_OPEN) exec(`start "" "http://localhost:${PORT}"`);
  });
}

// Vercel 이 이 파일을 진입점으로 잡는다. 그때는 서버가 아니라 '함수'를 기대한다 —
// default export 가 없으면 Invalid export found in module 로 모든 요청이 500 이 된다.
// (api/index.js 도 같은 handler 를 내보낸다. 어느 쪽이 진입점이 되든 동작하게 둘 다 둔다)
export default handler;

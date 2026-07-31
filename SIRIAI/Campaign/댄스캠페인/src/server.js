// 가드닝 대시보드 서버 — 캠페인 기반. Node 내장 http (의존성 0). 127.0.0.1 만.
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { createSmm } from './smm.js';
import { classify } from './garden.js';
import { refreshOrders, inFlightFor } from './orders.js';
import { runAutoRefill, refillServiceIds, REFILL_WINDOW_DAYS } from './refill.js';
import { runSheetSetup, getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet, syncRecruitToSheet, deliverToSheet, deleteRowsFromSheet, readFeedbackFromSheet, addFeedbackToSheet, markFeedbackDone, addPersonToSheet } from './sheet.js';
import { scanAccounts, buildPlan, placeOrders, findService, tiktokOnly, igFollowers } from './execute-core.js';
import { normH } from './orders.js';
import { runIgSync } from './ig-sync.js';
import { runIgContentScan } from './ig-content.js';
import { runSync } from './sync-core.js';
/* 스캔 시각을 시트에 남긴다 — 로컬 파일(data/)은 배포에 안 올라가서
   팀원 화면에서는 '마지막 스캔'이 영영 '아직'이었다. 시트는 양쪽이 다 읽는다.
   실패해도 스캔 자체는 성공이므로 조용히 넘긴다(로그만). */
/* 최초 팔로워(baseline) — '이 계정이 캠페인 시작 때 몇 명이었나'.
 *
 * 왜 만들었나: 어디에도 저장돼 있지 않았다. 시트의 팔로워 열은 스캔이 그때그때 덮어쓰고,
 * scan-latest.json 도 '마지막' 하나뿐이라 과거 값이 없다. 그래서 '가드닝으로 얼마나 올랐나',
 * '산 팔로워가 남았나' 를 계정 단위로 볼 방법이 없었다.
 *
 * 규칙
 *  · 한 번 적으면 절대 안 덮는다. 덮으면 그 순간부터 '최초'가 아니게 된다.
 *  · 주문에 startCount 가 있으면 그걸 우선한다 — 집행 직전 실측이라 더 이르고 정확하다.
 *  · 없으면 지금 스캔값으로 적고, 언제 적었는지(at)를 같이 남긴다.
 *    캠페인 도중에 시작했으면 '그때부터'라는 뜻이므로 화면이 그렇게 말할 수 있어야 한다.
 */
async function ensureBaseline(campaign, accounts, orders) {
  try {
    const { readStateFromSheet, writeStateToSheet } = await import('./sheet.js');
    if (!writeStateToSheet) return;
    const cur = (await readStateFromSheet(campaign.sheet).catch(() => ({}))) || {};
    const base = { ...(cur.startFol || {}) };
    const now = new Date().toISOString();
    const key = (plat, h) => plat + '|' + String(h || '').replace(/^@/, '').trim().toLowerCase();

    // ① 주문의 startCount 가 제일 이른 실측이다 — 있으면 그것으로 (이미 적힌 것도 더 이르면 교체)
    for (const o of orders || []) {
      const n = Number(o.startCount);
      if (!Number.isFinite(n) || !o.handle) continue;
      const k = key(o.plat || 'tk', o.handle);
      const at = o.placedAt || now;
      if (!base[k] || (base[k].at && at < base[k].at)) base[k] = { n, at, src: 'order' };
    }
    /* ② 직전 캠페인 기록 — 같은 크리에이터가 계속 참여한다. LUN8 틱톡 69명 중 41명이
       베이온에도 있었고, 그 팔로워는 7/8~7/13 에 이미 실측·기록돼 있었다(캠페인 시작 7/20 보다 이르다).
       data/c/<캠페인>/ 아래 주문의 startCount 와 스캔 결과를 전부 훑어 제일 이른 것을 고른다.
       ⚠️ 캠페인 폴더를 가리지 않는 게 핵심이다 — 사람은 캠페인을 옮겨 다니지만 계정은 그대로다. */
    try {
      const croot = join(root, 'data', 'c');
      for (const dir of (existsSync(croot) ? readdirSync(croot) : [])) {
        if (dir === campaign.id) continue;                       // 자기 것은 위에서 이미 봤다
        const take = (n, h, plat, at) => {
          const v = Number(n); if (!Number.isFinite(v) || !v || !h) return;
          const k = key(plat, h);
          if (!base[k] || (base[k].at && at && at < base[k].at)) base[k] = { n: v, at, src: 'prior' };
        };
        try {
          const op2 = join(croot, dir, 'orders.json');
          if (existsSync(op2)) for (const o of JSON.parse(readFileSync(op2, 'utf8')) || []) {
            take(o.startCount, o.handle, o.plat || 'tk', o.placedAt);
          }
        } catch {}
        for (const [f, plat] of [['scan-latest.json', 'tk'], ['ig-scan-latest.json', 'ig']]) {
          try {
            const sp = join(croot, dir, f);
            if (!existsSync(sp)) continue;
            const d = JSON.parse(readFileSync(sp, 'utf8'));
            const at = d.ranAt || null;
            for (const a of d.rows || d.accounts || d.results || []) {
              take(a.current != null ? a.current : a.followers, a.handle, plat, at);
            }
          } catch {}
        }
      }
    } catch (e) { console.warn('[최초팔로워] 지난 캠페인 기록을 못 읽었어요(무해):', (e && e.message) || e); }

    // ③ 그래도 없는 계정은 지금 값으로 연다 — '이 시점부터 기록 시작' 이라는 뜻이다
    for (const a of accounts || []) {
      const pairs = [['tk', a.handle, a.tk && a.tk.followers], ['ig', a.igHandle, a.ig && a.ig.followers]];
      for (const [plat, h, v] of pairs) {
        if (!h) continue;
        const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, ''));
        if (!Number.isFinite(n) || !n) continue;      // 못 읽은 값으로 기준을 만들지 않는다
        const k = key(plat, h);
        if (!base[k]) base[k] = { n, at: now, src: 'scan' };
      }
    }
    /* ⚠️ 다른 캠페인까지 훑었으므로 base 에는 우리 로스터에 없는 계정이 섞여 있다.
       그대로 쓰면 캠페인이 늘수록 각 시트의 startFol 이 전 캠페인 합집합이 되고,
       셀 한도(45,000자)에 걸리는 순간 writeState_ 가 throw 해 최초 팔로워 기록이 영구 정지한다. */
    const live = new Set();
    for (const a of accounts || []) {
      if (a.handle) live.add(key('tk', a.handle));
      if (a.igHandle) live.add(key('ig', a.igHandle));
    }
    const mine = {};
    for (const [k, v] of Object.entries(base)) if (live.has(k)) mine[k] = v;
    if (JSON.stringify(mine) !== JSON.stringify(cur.startFol || {})) {
      await writeStateToSheet(campaign.sheet, { startFol: mine });
    }
  } catch (e) {
    /* '무해' 가 아니다. 이 함수가 조용히 실패하면 최초 팔로워가 영영 안 쌓이고,
       그 사실을 아무도 모른다 — 화이트리스트 누락으로 121건이 증발했던 게 정확히 이 모양이다.
       스캔 응답에 실어 보내 화면이 말하게 한다. */
    const msg = (e && e.message) || String(e);
    console.error('[최초팔로워] 기록 실패:', msg);
    return msg;
  }
  return null;
}

async function stampScan(campaign, kind) {
  try {
    const { readStateFromSheet, writeStateToSheet } = await import('./sheet.js');
    if (!writeStateToSheet) return;
    const cur = (await readStateFromSheet(campaign.sheet).catch(() => ({}))) || {};
    const scans = { ...(cur.scans || {}), [kind]: new Date().toISOString() };
    await writeStateToSheet(campaign.sheet, { scans });
  } catch (e) { console.warn('[스캔시각] 시트 기록 실패(무해):', (e && e.message) || e); }
}
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
let igResumeResolve = null;  // 막혀서 '재개/중지' 를 기다리는 resolver (VPN 교체 게이트)
let igScanState = null;   // 인스타 스캔 진행상황 — 워커 화면이 폴링한다
let scanConfirmResolve = null; // '스캔 시작' 확인을 기다리는 promise 의 resolver (로봇 인증 게이트)
let scanGoAt = null;           // 사람이 '스캔 시작' 을 누른 시각. 워밍업이 읽어 가면 지운다.
let scanResumeResolve = null; // 막혔을 때 '재개/중지'를 기다리는 resolver (VPN 바꾸기 게이트)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/* 가드닝 서비스 선택 — 시트 _state.svcPick 에 산다.
 *
 * 왜 campaigns.json 이 아닌가: 그 파일은 로컬에만 있고, 배포본은 CAMPAIGNS_JSON 환경변수 사본을
 * 본다. 로컬에서 서비스를 바꾸면 팀 URL 은 '스크립트 실행 → 복사 → Vercel 붙여넣기 → 재배포'
 * 를 사람이 하기 전까지 옛 번호·옛 단가를 아무 경고 없이 계속 보여준다.
 * 시트에 두면 로컬·배포본이 같은 값을 본다.
 *
 * 스냅샷(name/rate/min/max/refill/cancel)을 같이 적는 이유: 배포본에는 카탈로그(data/)가
 * 없어서 번호만으로는 아무것도 표시할 수 없다.
 *
 * ⚠️ 이 값은 '표시'와 '번호 선택'에만 쓴다. 실제 주문에 넘기는 svc 객체는 언제나
 *    카탈로그(catalog())에서 다시 찾는다 — 스냅샷 단가로 돈을 계산하면 안 된다. */
const SVC_PICK = new Map();          // campaignId -> { tk:{...}, ig:{...} }
const pickOf = (c) => SVC_PICK.get(c && c.id) || null;
/* strict=true 는 돈 경로용이다. 시트를 못 읽었는데 조용히 campaigns.json 으로 되돌아가면
   사람이 고른 서비스가 아니라 옛 번호로 주문이 나간다(인스타 #3785 $1.069 대신 #7130 $1.97 = 1.84배).
   계획과 집행이 같은 폴백을 쓰므로 svcSig 대조도 '일치' 라고 답한다 — 아무 경고 없이 갈린다.
   같은 핸들러 스무 줄 위에서 '시트를 못 읽으면 주문하지 않는다'(503)고 이미 정해 뒀다. */
async function loadSvcPick(campaign, { strict = false } = {}) {
  try {
    const { readStateFromSheet } = await import('./sheet.js');
    const st = await readStateFromSheet(campaign.sheet);
    if (st && st.svcPick) SVC_PICK.set(campaign.id, st.svcPick);
    else SVC_PICK.delete(campaign.id);
  } catch (e) {
    if (strict) throw new Error('서비스 선택을 시트에서 못 읽었어요 — 옛 설정으로 주문하지 않았습니다: ' + ((e && e.message) || e));
    console.warn('[서비스선택] 못 읽었어요(표시는 설정값으로):', (e && e.message) || e);
  }
  return pickOf(campaign);
}

function catalog() {
  const p = join(root, 'data', 'smm-services.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}
/* 플랫폼별 서비스 번호. serviceIds:{tk,ig} 가 있으면 그걸 쓰고,
   없으면 옛 serviceId 를 틱톡용으로 본다(지금 구성 그대로 동작). */
const serviceIdOf = (c, plat = 'tk') => {
  // 대시보드에서 고른 값이 있으면 그것이 우선이다. 없으면 campaigns.json 그대로.
  const p = pickOf(c);
  if (p && p[plat] && p[plat].id != null) return Number(p[plat].id);
  const m = c.serviceIds || {};
  if (m[plat] != null) return Number(m[plat]);
  return plat === 'tk' ? Number(c.serviceId) : null;
};
/* ⚠️ 번호만 믿으면 안 된다. serviceIds.ig 를 7178 → 7188 로 한 자리 잘못 적으면
   findService 는 null 이 아니라 '텔레그램 채널 멤버' 라는 멀쩡한 다른 서비스를 돌려준다 —
   인스타 주소를 텔레그램 서비스에 보내면 돈만 나가고 아무 일도 안 일어난다.
   카탈로그의 이름·분류가 그 플랫폼의 '팔로워'인지 확인해야 실수를 잡는다. */
const PLAT_WORDS = { tk: ['tiktok', '틱톡'], ig: ['instagram', '인스타'] };
const platName = (p) => (p === 'ig' ? '인스타' : '틱톡');
function serviceWhy(svc, id, plat) {
  if (id == null) return '';                                     // 안 붙인 플랫폼 — 그냥 빠진다
  if (!svc) return `서비스 #${id} 를 카탈로그에서 못 찾았어요 — node scripts/verify-smm.js 로 서비스 목록을 먼저 받아주세요`;
  const t = `${svc.name || ''} ${svc.category || ''}`.toLowerCase();
  if (!(PLAT_WORDS[plat] || []).some((w) => t.includes(w)))
    return `서비스 #${id} 는 ${platName(plat)} 서비스가 아니에요 — "${svc.name}". 번호를 잘못 적으면 돈만 나갑니다.`;
  if (!/follow|팔로/.test(t))
    return `서비스 #${id} 는 팔로워 서비스가 아니에요 — "${svc.name}"`;
  return '';
}
/* svc 는 검증을 통과했을 때만 준다. why 가 있으면 그 플랫폼은 집행하지 않는다. */
/* ⚠️ resolveService 는 화면용이 아니다 — /api/plan 과 /api/execute 가 buildPlan·placeOrders 에
   넘기는 svc(rate·min·max·service)를 만드는 함수다. 그래서 폴백을 여기 넣으면 안 된다:
   카탈로그가 없을 때 '집행을 막던' serviceWhy 가드가 사람이 손으로 적은 값으로 통과해 버린다
   (serviceInfo min:100 / 실제 카탈로그 min:10 처럼 이미 값이 다르다).
   폴백은 표시용 함수(serviceForShow)에만 두고, 돈 경로는 catalog() 만 본다. */
function resolveService(c, plat = 'tk') {
  const id = serviceIdOf(c, plat);
  const svc = id == null ? null : findService(catalog(), id);
  const why = serviceWhy(svc, id, plat);
  return { id, svc: why ? null : svc, why };
}
const serviceOf = (c, plat = 'tk') => resolveService(c, plat).svc;

/* 화면에 금액을 보여주기 위한 것 — 여기서만 campaigns.json 의 serviceInfo 로 메운다.
   배포본(Vercel)에는 data/ 가 .vercelignore 로 빠져 카탈로그가 비어 있고, 그러면 프론트가
   틱톡 단가(4.13)로 인스타까지 계산한다(실단가 1.94, 2.13배). 실측: 팀원 22,379원 / 로컬 20,455원.
   ⚠️ 이 함수를 돈 경로(buildPlan·placeOrders)에 쓰면 안 된다. */
function serviceForShow(c, plat = 'tk') {
  const r = resolveService(c, plat);
  if (r.svc) return r.svc;
  const id = serviceIdOf(c, plat);
  if (id == null) return null;
  /* 선택 스냅샷이 campaigns.json 의 serviceInfo 보다 낫다 — 사람이 고를 때 카탈로그에서
     그대로 떠 온 값이라 최신이고, 새로 고른 서비스는 serviceInfo 에 아예 없다.
     여기서 안 메우면 filter(Boolean) 이 그 플랫폼을 통째로 떨어뜨리고, 화면은 하드코딩
     폴백 단가로 금액을 계산한다(옛 #3693 의 4.13). */
  const p = pickOf(c);
  const snap = p && p[plat];
  if (snap && Number(snap.id) === Number(id)) {
    return { service: Number(snap.id), name: snap.name, rate: snap.rate, min: snap.min, max: snap.max, refill: snap.refill, cancel: snap.cancel };
  }
  return findService(c.serviceInfo || [], id);
}

/* 선택 후보. ⚠️ refill·cancel 을 반드시 같이 실어야 한다 — 예전엔 {id,name,rate,min,max} 만
   보내서 '이 서비스는 리필이 안 됩니다' 를 화면이 말할 방법이 없었다. 후보 중 절반 가까이가
   refill:false 이고, 이름에는 여전히 '[30 Days Refill] ♻️' 라고 적혀 있다(패널이 플래그만 끈다). */
function followerServices(plat = 'tk') {
  const words = PLAT_WORDS[plat] || [];
  return catalog()
    .filter((s) => {
      const t = `${s.name} ${s.category || ''}`.toLowerCase();
      return words.some((w) => t.includes(w)) && /follow|팔로/.test(t);
    })
    .map((s) => ({ id: s.service, name: s.name, rate: s.rate, min: s.min, max: s.max, refill: !!s.refill, cancel: !!s.cancel }))
    .sort((a, b) => Number(a.rate) - Number(b.rate));
}

async function effectiveRate() {
  const fx = getFx();
  const market = await getMarketUsdKrw();
  return market ? market * fx.calibration : fx.fallbackRate;
}

/* 인스타 가드닝 대상. 팔로워는 반드시 인스타 스캔 결과에서 가져온다 —
   틱톡 스크래퍼에 인스타 핸들을 주면 같은 이름의 남의 틱톡 계정 숫자가 들어온다(실측 16건).
   igFollowers 가 낡은 기록(12시간 초과)도 거부한다. */
/* 최종 드랍한 사람의 핸들 — 돈이 나가는 계획에서 뺀다.
 *
 * ⚠️ 이 가드는 반드시 서버에 있어야 한다. 화면(lun8.html 의 gStat)에도 같은 가드를 넣었지만
 * 그것만으로는 아무 의미가 없다 — 실제로 주문을 넣는 건 이 경로이고, 작업 콘솔은
 * 화면의 판단을 거치지 않는다. 화면만 막으면 '목록에서는 안 보이는데 주문은 나가는'
 * 최악의 상태가 된다(사람이 걸러낼 수단까지 없애는 셈이다).
 *
 * 키를 plat 으로 가르는 이유: 같은 이름을 틱톡·인스타 양쪽에 가진 사람이 16명이다.
 * 핸들만으로 맞추면 남의 플랫폼 주문까지 같이 막힐 수 있다.
 */
const hKey = (h) => String(h || '').replace(/^@/, '').trim().toLowerCase();

/* 시트 '가드닝' 열에 '제외' 라고 적힌 계정·플랫폼 — 주문에서 뺀다.
   ⚠️ 화면(gStat)에도 같은 가드가 있지만 그것만으로는 소용없다. 실제로 주문을 넣는 건
   이 경로이고 작업 콘솔은 화면의 판단을 거치지 않는다(드랍 가드에서 이미 겪었다). */
const gardenOffV = (v) => /제외|안\s*함|하지\s*않|금지/.test(String(v || ''));
function gardenOffKeys(accounts) {
  const s = new Set();
  for (const a of accounts || []) {
    if (a && a.tk && gardenOffV(a.tk.gardening) && hKey(a.handle)) s.add('tk|' + hKey(a.handle));
    if (a && a.ig && gardenOffV(a.ig.gardening) && hKey(a.igHandle)) s.add('ig|' + hKey(a.igHandle));
    // 플랫폼 하위 객체가 없는 형태(옛 기록)면 최상위 열을 틱톡으로 본다
    if (a && !a.tk && gardenOffV(a.gardening) && hKey(a.handle)) s.add('tk|' + hKey(a.handle));
  }
  return s;
}
function droppedKeys(accounts) {
  const s = new Set();
  for (const a of accounts || []) {
    if (String(a.fixedDate || '').trim() !== '최종 드랍') continue;
    if (hKey(a.handle)) s.add('tk|' + hKey(a.handle));
    if (hKey(a.igHandle)) s.add('ig|' + hKey(a.igHandle));
  }
  return s;
}
const notDropped = (set, plat) => (a) => !set.has(plat + '|' + hKey(a.handle));

function igPlanRows(campaign, live) {
  const p = join(campaign.dataDir, 'ig-scan-latest.json');
  let latest = null;
  try { latest = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { latest = null; }
  const r = igFollowers(latest);
  if (r.stale) return { rows: [], why: r.why };
  // 지금 시트에 인스타 링크가 실제로 있는 계정만 — 낡은 스캔 기록으로 없는 계정에 돈이 나가면 안 된다.
  const ok = new Map((live || []).filter((a) => a.igHandle).map((a) => [String(a.igHandle).toLowerCase(), a]));
  const rows = r.rows
    .filter((x) => ok.has(String(x.handle || '').toLowerCase()))
    .map((x) => { const a = ok.get(String(x.handle).toLowerCase());
      return { ...x, row: a.row, company: a.company, plat: 'ig', folPlat: 'ig' }; });
  return { rows, why: '' };
}

/* 화면에서 체크한 것만 집행하는 필터.
   예전엔 핸들 문자열만 받아 틱톡 계획과 인스타 계획을 같은 리스트로 걸렀다 —
   양쪽 핸들이 같은 문자열인 사람이 16명이라(@zn09_k2 등), 인스타만 체크해도 틱톡까지 주문이 나갔다.
   이제 [{handle, plat}] 를 받는다. 옛 형식(문자열)이 오면 지금까지처럼 양쪽에 적용한다. */
function pickFilter(list, plat) {
  if (!Array.isArray(list)) return null;
  const set = new Set();
  for (const x of list) {
    if (x && typeof x === 'object') { if ((x.plat || 'tk') === plat) set.add(normH(x.handle)); }
    else set.add(normH(x));
  }
  return (a) => set.has(normH(a.handle));
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
    /* ⚠️ 취소·환불된 주문은 remains 가 0 이라 quantity - remains 가 '전량 배송' 으로 나온다.
       실제로 들어온 건 0명이고 나간 돈도 0원인데 화면은 '다 들어옴' 이라고 말했다.
       리필 쪽(src/refill.js)에서 같은 계산이 환불된 주문에 리필을 조르게 만들었던 것과 같은 오류다. */
    const voided = !!(o.canceled || o.refunded);
    const delivered = voided ? 0 : (Number.isFinite(rem) ? (Number(o.quantity) || 0) - rem : null);
    const undelivered = voided ? 0 : (Number.isFinite(rem) ? rem : null); // 미전달분 = 환불 청구 대상
    const withinWindow = o.placedAt ? now - new Date(o.placedAt).getTime() <= REFILL_WINDOW_DAYS * 86400000 : false;
    // 리필 버튼 노출 조건: 리필 되는 서비스 · 30일 안 · 포기 안 함. (패널이 안 되면 눌렀을 때 사유가 뜬다)
    // 취소·환불된 주문은 리필할 것이 없다 — 자동 리필과 같은 규칙을 표시에도 건다.
    const refillable = refillIds.has(String(o.service)) && withinWindow && !o.abandoned && !voided;
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

/* ⚠️ Origin 을 모듈 전역에 담으면 안 된다.
   집행은 수 분 걸리는데 그 사이 작업 콘솔 폴링(2초)이 한 번만 들어와도 값이 바뀌어,
   먼저 온 응답에 Access-Control-Allow-Origin 이 안 붙는다 — 주문은 실제로 나갔는데
   화면은 "응답을 못 받았어요" 라고 말한다. 돈 경로에서 뜨는 가짜 실패 경보다.
   그래서 res 객체에 실어 응답과 함께 다닌다(요청 하나에 하나). */
function send(res, code, body, type = 'application/json') {
  const t = type + (type.startsWith('text') || type === 'application/json' ? '; charset=utf-8' : '');
  const allow = corsFor(res._origin || '');
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
  res._origin = req.headers.origin || '';   // 이 응답 전용 — 전역에 두면 동시 요청끼리 섞인다
  // 브라우저는 POST 전에 OPTIONS 로 먼저 물어본다. 여기서 허용을 답하지 않으면 요청 자체가 안 간다.
  if (req.method === 'OPTIONS') {
    const allow = corsFor(res._origin || '');
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
    /* 선택 후보. plat=tk|ig, 없으면 둘 다.
       배포본은 카탈로그가 비어 있어 빈 목록이 나온다 — 오류가 아니라 '여기선 못 고른다' 는 뜻이라
       catalogSize 를 같이 보내 화면이 이유를 말할 수 있게 한다(예전엔 그냥 빈 배열이었다). */
    if (path === '/api/services' && req.method === 'GET') {
      const plat = url.searchParams.get('plat');
      const out = {};
      for (const pl of (plat ? [plat] : ['tk', 'ig'])) out[pl] = followerServices(pl);
      return send(res, 200, { byPlat: out, services: out.tk || [], catalogSize: catalog().length, local: !CLOUD });
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
      // 서비스 선택을 캐시에 올린 뒤에 아래 serviceOf/serviceForShow 를 부른다 —
      // 순서가 뒤집히면 방금 바꾼 서비스가 한 박자 늦게 반영된다.
      if (all.svcPick) SVC_PICK.set(campaign.id, all.svcPick); else SVC_PICK.delete(campaign.id);
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
          /* ⚠️ 폴백이 campaign.serviceId(옛 단일 필드) + rate:0 이었다. serviceIds.tk 만 바꾼
             상태에서 옛 번호를 보여주고, 금액을 쓰는 쪽이 생기면 0원이 된다. 표시 폴백을 쓴다. */
          service: (() => { const v = svc || serviceForShow(campaign, 'tk');
            return v ? { id: v.service, name: v.name, rate: v.rate } : null; })(),
          // 플랫폼마다 서비스도 단가도 다르다 — 화면이 틱톡 단가로 인스타까지 계산하면 안 된다.
          // 표시용이므로 폴백을 쓴다 — 집행은 위 resolveService(카탈로그 전용)를 그대로 쓴다.
          // min/max/refill/cancel 까지 실어야 화면이 '리필 안 되는 서비스' 를 말할 수 있다.
          services: ['tk', 'ig'].map((pl) => { const v = serviceForShow(campaign, pl);
            return v ? { plat: pl, id: v.service, name: v.name, rate: v.rate, min: v.min, max: v.max, refill: !!v.refill, cancel: !!v.cancel } : null; }).filter(Boolean),
          // 선택 UI 가 '지금 무엇이 골라져 있나'와 '언제 누가 바꿨나'를 보여준다.
          svcPick: all.svcPick || null,
          // 카탈로그가 있어야 후보를 고를 수 있다 — 배포본은 비어 있어 드롭다운을 잠근다.
          catalogSize: catalog().length },
        /* 로컬 파일이 없으면(배포본) 시트에 적어둔 시각을 쓴다 — 팀원 화면에서 '아직'만 뜨던 이유다. */
        balance,
        startFol: all.startFol || {},     // 최초 팔로워 — 화면이 증감을 보여준다
        scannedAt: scanLatest(campaign).ranAt || (all.scans && all.scans.follower) || null,
        uploadScannedAt: detectedRanAt(campaign) || (all.scans && all.scans.upload) || null,
        // 화면이 가드닝 예상 금액을 계산하려면 단가와 환율이 필요하다.
        // 여기서 안 주면 프론트가 상수를 박아두게 되고, 서비스를 바꾼 날 조용히 틀린 금액이 뜬다.
        service: (() => { const v = serviceOf(campaign); return v ? { id: v.service, name: v.name, rate: v.rate } : null; })(),
        krwPerUsd: await effectiveRate(), accounts, orders: markStale(orders), best: all.best,
        scanFailures: scanFailures(campaign), // 지난 업로드 스캔에서 못 본 계정 — 업로드 탭 하이라이트용
      });
    }

    /* 카탈로그 갱신 — 패널에서 서비스 목록을 새로 받아 catalog() 가 읽는 파일에 덮어쓴다.
       ⚠️ 이게 없어서 카탈로그가 20일 낡아 있었다. scripts/verify-smm.js 는 파일명이 달라
       (smm-services-<주소>.json) 서버가 읽는 smm-services.json 은 영영 안 바뀌었다.
       그 사이 팔로워 서비스 11개의 단가·리필이 바뀌었고(#3693 은 리필 true→false), 화면은
       낡은 단가로 금액을 계산하고 안 되는 리필을 계속 졸랐다. */
    if (path === '/api/services/refresh' && req.method === 'POST') {
      if (!smm) return send(res, 400, { error: 'SMM 키가 .env 에 없어요 — 카탈로그는 대표님 PC 에서만 받을 수 있어요.' });
      let list;
      try { list = await smm.services(); } catch (e) { return send(res, 502, { error: '패널에서 서비스 목록을 못 받았어요: ' + ((e && e.message) || e) }); }
      const arr = Array.isArray(list) ? list : (list && list.services) || [];
      if (!arr.length) return send(res, 502, { error: '패널이 빈 목록을 줬어요 — 덮어쓰지 않았습니다.' });
      // 무엇이 '우리 서비스' 인지는 시트가 정한다 — 캐시가 비어 있으면 옛 번호와 비교하게 된다.
      try { await loadSvcPick(campaign); } catch {}
      const before = catalog();
      const wasById = new Map(before.map((x) => [String(x.service), x]));
      const nowIds = new Set(arr.map((x) => String(x.service)));
      const changed = [];
      /* 새 목록만 순회하면 '패널에서 사라진 서비스' 가 안 잡힌다 — 그런데 파일은 통째로 덮어써진다.
         우리가 쓰는 번호가 사라지면 다음 집행이 400 으로 멈추므로 미리 말해야 한다. */
      for (const o of before) {
        if (!/follow|팔로/i.test(String(o.name || ''))) continue;
        if (!nowIds.has(String(o.service))) changed.push({ id: o.service, what: '패널에서 사라짐', name: o.name });
      }
      for (const n of arr) {
        const o = wasById.get(String(n.service));
        if (!o) { changed.push({ id: n.service, what: '신설', name: n.name }); continue; }
        const d = [];
        if (String(o.rate) !== String(n.rate)) d.push(`단가 ${o.rate}→${n.rate}`);
        if (!!o.refill !== !!n.refill) d.push(`리필 ${!!o.refill}→${!!n.refill}`);
        if (!!o.cancel !== !!n.cancel) d.push(`취소 ${!!o.cancel}→${!!n.cancel}`);
        if (d.length) changed.push({ id: n.service, what: d.join(' · '), name: n.name });
      }
      try { writeFileSync(join(root, 'data', 'smm-services.json'), JSON.stringify(arr, null, 1)); }
      catch (e) { return send(res, 500, { error: '카탈로그를 저장 못 했어요: ' + ((e && e.message) || e) }); }
      // 우리가 지금 쓰는 서비스가 바뀌었는지는 따로 짚어 준다 — 목록에 묻히면 못 본다.
      const mine = ['tk', 'ig'].map((pl) => serviceIdOf(campaign, pl)).filter((x) => x != null).map(String);
      const mineChanged = changed.filter((c) => mine.includes(String(c.id)));
      /* 시트의 선택 스냅샷도 새 값으로 고친다. 안 하면 카탈로그가 없는 배포본(팀 URL)이
         영영 옛 단가·옛 리필 플래그로 금액을 보여준다 — campaigns.json 을 버린 이유가
         '옛 값을 아무 경고 없이 보여준다' 였는데 스냅샷에도 똑같이 성립한다. */
      const pick = pickOf(campaign);
      if (pick) {
        const next = { ...pick }; let touched = false;
        for (const pl of ['tk', 'ig']) {
          const cur = pick[pl]; if (!cur) continue;
          const fresh = findService(arr, Number(cur.id)); if (!fresh) continue;
          const upd = { ...cur, name: fresh.name, rate: fresh.rate, min: fresh.min, max: fresh.max, refill: !!fresh.refill, cancel: !!fresh.cancel };
          if (JSON.stringify(upd) !== JSON.stringify(cur)) { next[pl] = upd; touched = true; }
        }
        if (touched) {
          try {
            const { writeStateToSheet } = await import('./sheet.js');
            await writeStateToSheet(campaign.sheet, { svcPick: next });
            SVC_PICK.set(campaign.id, next);
          } catch (e) { console.error('[카탈로그갱신] 선택 스냅샷을 못 고쳤어요 — 배포본은 옛 단가를 계속 보여줍니다:', (e && e.message) || e); }
        }
      }
      return send(res, 200, { ok: true, count: arr.length, before: before.length, changed: changed.length, mineChanged });
    }

    /* 선택 삭제 — 마스터에서 행을 지운다.
       ⚠️ 되돌릴 수 없다. 그래서 ① 지운 행의 값을 통째로 응답에 실어 보내고(작업 기록에 남는다)
       ② 대표님 PC 에서만 되게 막는다. 공개 URL 로 사람 명단을 지울 수 있으면 안 된다. */
    if (path === '/api/rows/delete' && req.method === 'POST') {
      const body = await readBody(req);
      const rows = (Array.isArray(body.rows) ? body.rows : []).map(Number).filter((n) => Number.isFinite(n) && n > 1);
      if (!rows.length) return send(res, 400, { error: '지울 행이 없어요' });
      let r;
      try { r = await deleteRowsFromSheet(campaign.sheet, rows); }
      catch (e) { return send(res, 502, { error: '삭제 실패: ' + ((e && e.message) || e) }); }
      if (r && r.error) return send(res, 400, { error: r.error });
      /* 잠금이 밀렸으니 로컬 캐시도 버린다 — 안 그러면 옛 행 번호로 다시 써서 되돌아간다. */
      try { clearOverrideStore(campaign); } catch {}
      return send(res, 200, { ok: true, ...r });
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
      /* '스캔 시작' 을 여러 번 누를 수 있어야 한다 — 한 번 눌렀는데 인증이 아직이면
         착수하지 않고 다시 기다리기 때문이다(예전엔 한 번 누르면 무조건 시작해서 전부 실패했다). */
      scanGoAt = null;
      runContentScan(campaign, {
        full, perf, only: _only,
        onWarmup: () => { contentScanState.phase = 'confirm'; contentScanState.warmNote = ''; },
        // 사람이 '스캔 시작' 을 눌렀는지 소비한다(한 번 읽으면 지운다).
        takeGo: () => { const v = scanGoAt; scanGoAt = null; return !!v; },
        // 인증이 아직이라거나, 화면이 안 열렸다거나 — 사람에게 그대로 보여준다.
        onNote: (m) => { contentScanState.warmNote = String(m || ''); },
        waitForGo: () => goPromise,
        onProgress: (p) => {
          if (contentScanState.phase !== 'blocked') contentScanState.phase = 'scan';
          contentScanState.done = p.done; contentScanState.total = p.total;
          // 본 스캔이 끝난 뒤의 재시도·시트쓰기 구간. 이걸 안 실으면 화면이 45/45 에 굳는다.
          contentScanState.stage = p.stage || '';
          contentScanState.retryDone = p.retryDone || 0;
          contentScanState.retryTotal = p.retryTotal || 0;
        },
        shouldPause: () => contentScanState.pauseRequested,
        shouldStop: () => contentScanState.stopRequested,   // 계정 사이에서 스스로 접는다
        // 봇 인증이 떴다 — 어느 계정 창을 풀어야 하는지 워커 화면에 그대로 띄운다.
        onCaptcha: (c) => { contentScanState.captcha = c && c.waiting ? c.handle : null; },
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
        .then((r) => {
          /* 중지했거나 못 본 계정이 있으면 '방금 완료' 도장을 찍지 않는다.
             40명 중 3명 돌고 중지해도 배포본 팀원 화면엔 '업로드 스캔: 방금' 이라고 떴다.
             perf(조회수) 스캔은 업로드된 계정만 도는 다른 일이므로 업로드 시계를 건드리지 않는다. */
          /* '중지'는 스캔이 아니지만 '몇 개 못 봤다'는 정상이다(틱톡·인스타는 늘 몇 개 막힌다).
             실패 0건만 찍게 두면 시계가 영영 안 갱신돼 팀원 화면이 '7/25' 에 멈춘다 —
             ②-14 를 고치다 반대쪽으로 넘어갔다. 중지만 걸러낸다. */
          if (!perf && !r.stopped) stampScan(campaign, 'upload');
          contentScanState = { running: false, mode: perf ? 'perf' : full ? 'full' : 'upload', done: r.total, total: r.total, up: r.up, newUp: r.newUp || 0, written: r.written, writeError: r.writeError || null, failed: r.failed, failedHandles: r.failedHandles, stopped: r.stopped, error: null, ranAt: new Date().toISOString() }; })
        .catch((e) => { contentScanState = { running: false, done: 0, total: 0, up: 0, written: 0, failed: 0, error: e.message, ranAt: null }; })
        .finally(() => { scanConfirmResolve = null; scanResumeResolve = null; });
      return send(res, 200, { started: true });
    }
    // 로봇 인증 끝났다는 사람 확인 → 스캔 착수
    if (path === '/api/content-scan/confirm' && req.method === 'POST') {
      /* ⚠️ 예전엔 여기서 phase 를 'scan' 으로 바꾸고 resolver 를 비웠다 — 누르는 순간
         '시작됨' 이 되어 버려서, 인증이 아직인데도 화면은 진행 중이라고 말했다.
         이제는 '눌렀다'만 기록하고, 실제 착수 여부는 워밍업이 화면을 다시 보고 정한다. */
      if (!contentScanState.running || contentScanState.phase !== 'confirm') {
        return send(res, 200, { ok: false, error: '인증 대기 중인 스캔이 없어요' });
      }
      scanGoAt = Date.now();
      contentScanState.warmNote = '확인 중…';
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
    /* 중지 — 스캔을 접는다(여기까지 한 건 저장됨).
       ⚠️ 예전엔 scanResumeResolve 가 있을 때만, 즉 '연속 실패로 멈춰 선 동안'에만 먹었다.
       정상적으로 도는 중엔 눌러도 '멈춘 스캔이 없어요' 였고, 실제로 스캔이 붙들리자
       서버를 죽이는 것 말고는 접을 방법이 없었다. 이제 깃발을 세워 루프가 스스로 접는다. */
    if (path === '/api/content-scan/stop' && req.method === 'POST') {
      if (!contentScanState.running) return send(res, 200, { ok: false, error: '도는 스캔이 없어요' });
      contentScanState.stopRequested = true;
      if (scanResumeResolve) scanResumeResolve('stop');   // 멈춰 있으면 그 자리에서
      return send(res, 200, { ok: true, stopped: true });
    }
    if (path === '/api/content-scan/status' && req.method === 'GET') {
      return send(res, 200, contentScanState);
    }
    // 스캐너 출구 국가 확인 — VPN/프록시가 적용됐는지 눈으로. 창 하나 잠깐 뜸.
    if (path === '/api/exit-ip' && req.method === 'POST') {
      /* 틱톡·인스타를 같이 본다. 프록시를 따로 줄 수 있고(IG_PROXY), VPN 을 바꾼 뒤
         '양쪽 다 바뀌었나' 를 한 번에 확인해야 스캔을 다시 돌릴지 정할 수 있다. */
      try {
        const { checkIgExitLocation } = await import('./instagram.js');
        const [tk, ig] = await Promise.all([
          checkExitLocation().catch((e) => ({ error: (e && e.message) || String(e) })),
          checkIgExitLocation().catch((e) => ({ error: (e && e.message) || String(e) })),
        ]);
        return send(res, 200, { ok: true, ...tk, tk, ig });
      }
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
        /* 시트의 셋업 함수는 '몇 명 들어왔는지' 를 안 돌려준다 — 그래서 화면이 늘 '완료' 만 말하고
           새 지원자가 있었는지는 사람이 시트를 열어 봐야 알았다.
           함수를 고치는 대신 여기서 전후를 센다. 누가 새로 들어왔는지까지 이름으로 말해 준다. */
        const key = (a) => String(a.handle || a.igHandle || a.nick || a.row).toLowerCase();
        let before = new Map();
        try { (await getAccountsFromSheet(campaign.sheet)).forEach((a) => before.set(key(a), a)); } catch {}
        const r = await runSheetSetup(campaign.sheet, campaign.recruitSetupFn);
        let added = [], total = null;
        try {
          const after = await getAccountsFromSheet(campaign.sheet);
          total = after.length;
          added = after.filter((a) => !before.has(key(a)))
            .map((a) => ({ nick: a.creator || a.nick || a.handle || a.igHandle || ('행 ' + a.row),
                           tk: a.handle || '', ig: a.igHandle || '' }));
        } catch {}
        return send(res, 200, { ok: true, ran: campaign.recruitSetupFn, result: r && r.result,
          added: added.length, people: added, total, before: before.size });
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
      const body = await readBody(req);
      const has = (v) => !!(v != null && String(v).trim());
      const revState = (v) => { const s = String(v == null ? '' : v).trim(); if (!s) return 'none'; if (/다름|누락|미준수|미사용|불가|없음|이슈|문제|✗|✘/i.test(s)) return 'fail'; if (/확인|준수|사용|완료|ok|pass|✓|✔/i.test(s)) return 'pass'; return 'none'; };
      const accounts = await buildAccounts(campaign, await readOrders(campaign));
      /* ⚠️ 예전엔 계정 단위(a.contentLink = 틱톡 콘텐츠)로만 만들어서 인스타 업로드가 통째로 빠졌다.
         멀티플랫폼 캠페인은 '한 사람'이 아니라 '사람×플랫폼'이 납품 단위다. */
      const plats = (campaign.serviceIds ? Object.keys(campaign.serviceIds) : ['tk']).filter((p) => p === 'tk' || p === 'ig');
      const PN = { tk: '틱톡', ig: '인스타' };
      const okRow = (b) => b && has(b.contentA) && revState(b.soundOk) === 'pass' && revState(b.soundSection) === 'pass' && revState(b.hashtagOk) === 'pass';
      // 지원타입 = 이 사람이 실제로 참여한 플랫폼(콘텐츠 유무가 아니라 배정 기준).
      const applyTypeOf = (a) => plats.filter((p) => a[p]).map((p) => PN[p]).join('+') || '';
      /* 차수를 여기서 정하지 않는다 — 시트에 이미 적힌 'N차' 중 최대 + 1 이 답이고, 그건 브릿지가 안다.
         body.batch 를 주면 그걸 쓴다(다시 넣기·수정용). */
      const batch = body.batch ? String(body.batch).trim() : '';
      const out = [];
      for (const p of plats) {
        const rows = accounts.filter((a) => okRow(a[p])).map((a) => {
          const b = a[p];
          const v = parseNum(b.views);
          return {
            nick: b.nick || a.creator || a.nick || b.handle,
            link: b.link || (p === 'ig' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/@') + b.handle,
            contentLink: b.contentA,
            viewNote: (v != null && v >= 10000) ? (Math.floor(v / 1000) * 1000) + '조회수' : '', // 1만+만 표기. 12,428 → "12000조회수"
            /* 납품시트의 '선정기준 충족여부' 세 열은 값이 아니라 판정이다(드롭다운).
               지원타입 = 캠페인 종류('댄스 챌린지' 하나), 팔로워·일본 = '승인' 또는 '이슈'.
               ⚠️ 처음엔 팔로워 열에 팔로워 수를, 일본 열에 'O' 를 넣으려 했는데 둘 다 드롭다운이라
               시트가 거절했다. 값을 우리가 정하지 않고 시트가 정한 어휘로 적는다. */
            applyType: applyTypeOf(a),
            followers: (Number(b.followers) >= Number(campaign.min || 1000)) ? '승인' : '이슈',
            /* 일본 — 마스터에 언어·국가 열이 없다(헤더 별칭이 못 찾아 엉뚱한 열에 물려 있다).
               이 캠페인 자체가 일본(댄스)이고 납품시트 제목도 '일본' 이라 전부 승인으로 적는다.
               사람별 판정이 아니라 캠페인 상수라는 뜻이다 — 나중에 언어 열이 생기면 여기서 읽는다. */
            japan: '승인',
            batch,
          };
        });
        if (!rows.length) { out.push({ plat: p, added: 0, updated: 0, handles: [], total: 0 }); continue; }
        const r = await deliverToSheet(campaign.sheet, campaign.deliverySheetId, rows, p);
        if (r.added === undefined) return send(res, 400, { error: (r.error || '브릿지에 납품 기입 기능이 없어요') + ' — Apps Script(Code.gs) 재배포가 필요합니다' });
        out.push({ plat: p, ...r, total: rows.length });
      }
      const sum = (k) => out.reduce((a, x) => a + (Number(x[k]) || 0), 0);
      return send(res, 200, { ok: true, batch: batch || (out.find((x) => x.batch) || {}).batch || '', byPlat: out, added: sum('added'), updated: sum('updated'), reviewedTotal: sum('total') });
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
          /* 플랫폼별로 출처를 가른다 — 틱톡 스캔 결과로 인스타 주문을 판정하면 안 된다.
             인스타 팔로워는 ig-scan-latest.json 에서만 온다. */
          const latest = scanLatest(campaign);
          const fol = { tk: {}, ig: {} };
          (latest.accounts || latest.results || []).forEach((a) => { fol.tk[a.handle] = a.current; });
          try {
            const igp = join(campaign.dataDir, 'ig-scan-latest.json');
            if (existsSync(igp)) {
              const igl = JSON.parse(readFileSync(igp, 'utf8'));
              (igl.rows || igl.accounts || igl.results || []).forEach((a) => { if (a && a.handle) fol.ig[a.handle] = a.current != null ? a.current : a.followers; });
            }
          } catch (e) { console.warn('[자동리필] 인스타 스캔 기록을 못 읽었어요(인스타 리필만 보류):', (e && e.message) || e); }
          const r = await runAutoRefill({ orders, followersByPlat: fol, smm, services: catalog() });
          if (r.requested) { await writeOrders(campaign, orders); refill = r; }
        } catch (e) { console.error('[자동리필] 실패(스캔은 정상):', (e && e.message) || e); }
      }
      // 몇 개 못 긁는 것은 정상이다(늘 있다). 그걸로 시계를 멈추면 영영 안 갱신된다.
      stampScan(campaign, 'follower');   // 기다리지 않는다(실패해도 응답은 성공)
      // 최초 팔로워는 스캔할 때마다 '없는 것만' 채운다 — 따로 눌러야 하면 아무도 안 누른다.
      let baselineError = null;
      try { baselineError = await ensureBaseline(campaign, await getAccountsFromSheet(campaign.sheet), orders); }
      catch (e) { baselineError = (e && e.message) || String(e); }
      return send(res, 200, { ok: true, baselineError, scannedAt: scanLatest(campaign).ranAt, scannedCount: sync.scannedCount, scanTried: sync.scanTried, scanFailed: sync.scanFailed, scanFailedHandles: sync.scanFailedHandles || [], writeError: sync.writeError || null, nicksWritten: sync.nicksWritten, refill, accounts: await buildAccounts(campaign, orders), orders: markStale(orders) });
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
        stampScan(campaign, 'follower');
        /* 인스타도 최초 팔로워를 연다. 예전엔 틱톡 스캔에서만 불러서, 인스타 계정은
           다음 틱톡 스캔 때까지 baseline 이 안 열렸다 — 그 사이 인스타 충전이 나가면
           '최초' 로 남는 값이 이미 충전된 뒤의 숫자가 된다. */
        try { ensureBaseline(campaign, await getAccountsFromSheet(campaign.sheet), await readOrders(campaign)); } catch {}
        return send(res, 200, { ok: true, ...out, accounts: undefined });
      } catch (e) {
        igScanState = { phase: 'error', error: e.message };
        return send(res, 500, { error: e.message });
      }
    }
    // 배포 화면이 '여기가 대표님 PC 인가'를 확인하는 데 쓴다. 로컬에서만 뜨는 서버이므로
    // 응답이 오면 곧 '이 브라우저가 있는 PC 에 서버가 있다'는 뜻이다. 팀원 PC 에선 응답이 없다.
    if (path === '/api/ping') return send(res, 200, { ok: true, local: !CLOUD, campaign: campaign.id, hasKey: !!smm });
    /* 인스타 스캔 재개 — VPN 을 바꾼 뒤. 다음 라운드는 브라우저를 새로 띄운다(ig-content.js). */
    if (path === '/api/ig-content-scan/resume' && req.method === 'POST') {
      if (!igResumeResolve) return send(res, 200, { ok: false, error: '멈춰 있는 인스타 스캔이 없어요' });
      igResumeResolve('resume');
      return send(res, 200, { ok: true });
    }
    if (path === '/api/ig-content-scan/stop' && req.method === 'POST') {
      scanAbort.add('ig-content-scan');
      if (igResumeResolve) igResumeResolve('stop');   // 멈춰 있으면 그 자리에서
      return send(res, 200, { ok: true, stopped: true });
    }
    if (path === '/api/ig-scan-status') return send(res, 200, igScanState || { phase: 'idle' });
    if (path === '/api/ig-scan/stop' && req.method === 'POST') { scanAbort.add('ig-scan'); return send(res, 200, { ok: true }); }

    // 인스타 업로드 스캔 — 캡션에서 캠페인 해시태그를 찾아 콘텐츠 링크·검수를 채운다.
    // 게시물 목록이 필요해 API 경로로만 된다(프로필 페이지엔 안 온다) → 막히면 중단하고 나중에 재개.
    if (path === '/api/ig-content-scan' && req.method === 'POST') {
      if (CLOUD) return send(res, 501, { error: '인스타 업로드 스캔은 대표님 PC 에서만 돌아요(크롬 창이 필요해요).' });
      /* 이미 돌고 있으면 새로 시작하지 않는다 — 틱톡 쪽엔 있던 가드가 여기만 없어서,
         두 번 누르거나 창을 두 개 열면 크롬 두 개가 같은 시트에 동시에 썼다. */
      if (igContentState && ['confirm', 'login', 'scan'].includes(igContentState.phase)) {
        return send(res, 200, { running: true });
      }
      igContentState = { phase: 'confirm', done: 0, total: 0 };
      const body = await readBody(req).catch(() => ({}));
      try {
        scanAbort.delete('ig-content-scan');
        const out = await runIgContentScan(campaign, {
          // perf=1 → 이미 올린 계정만 다시 열어 좋아요·댓글을 갱신한다(업로드를 새로 찾지 않는다).
          perf: url.searchParams.get('perf') === '1',
          since: url.searchParams.get('since') || '',
          // ?only=a,b 또는 본문 only:[...] — 내일 올리는 사람만 골라 도는 부분 스캔.
          only: (body && Array.isArray(body.only) && body.only) || (url.searchParams.get('only') || '').split(',').filter(Boolean),
          // 정밀 모드 — 느리게 깊게 본다(45명 기준 10분 → 20분쯤). 놓치는 것보다 낫다.
          deep: url.searchParams.get('deep') === '1' || !!(body && body.deep),
          shouldStop: () => scanAbort.has('ig-content-scan'),
          onWarmup: () => { igContentState.phase = 'login'; },
          /* 연속 실패 = 막힘. 여기서 멈춰야 사람이 VPN 을 바꿀 기회가 생긴다 —
             예전엔 끝까지 달린 뒤에야 '27개 못 봤어요' 를 보여줬다. */
          onBlocked: async (info) => {
            igContentState = { ...igContentState, phase: 'blocked', blockRound: info.round,
              done: info.done, total: info.total, failed: info.failed };
            const act = await new Promise((resolve) => { igResumeResolve = resolve; });
            igResumeResolve = null;
            igContentState = { ...igContentState, phase: 'scan' };
            return act;
          },
          onProgress: (p) => { igContentState = { phase: 'scan', done: p.done != null ? p.done : igContentState.done,
            total: p.total != null ? p.total : igContentState.total, handle: p.handle, uploaded: p.uploaded,
            note: p.note || '', retryDone: p.retryDone, retryTotal: p.retryTotal }; },
        });
        /* 결과를 상태에도 남긴다 — 예전엔 POST 응답에만 담아서, 작업 콘솔을 새로고침하면
           '몇 건 올라왔는지'가 영영 사라졌다. 상태에 두면 다시 열어도 읽어 갈 수 있다. */
        igContentState = { phase: 'done', done: out.scannedCount, total: out.total,
          ranAt: new Date().toISOString(), result: { ...out, detected: undefined } };
        if (!out.stopped) stampScan(campaign, 'upload');   // 중지는 '방금'이 아니다(부분실패는 정상)
        return send(res, 200, { ok: true, ...out, detected: undefined });
      } catch (e) {
        igContentState = { phase: 'error', error: e.message };
        return send(res, 500, { error: e.message });
      }
    }
    if (path === '/api/ig-content-status') return send(res, 200, igContentState || { phase: 'idle' });

    if (path === '/api/plan' && req.method === 'POST') {
      let orders = await readOrders(campaign);
      if (smm) { try { orders = await refreshOrders(smm, orders); } catch {} }
      const body = await readBody(req);
      let accs = (scanLatest(campaign).accounts || scanLatest(campaign).results || []);
      // 지난 스캔 기록에는 그 뒤 시트에서 지워진 계정이 남아 있다. 지금 시트에 틱톡 링크가
      // 실제로 있는 계정만 남긴다 — 안 그러면 없는 계정에 돈이 나간다(행28 りゅう 사례).
      let liveAccounts = [];
      try {
        const live = await getAccountsFromSheet(campaign.sheet);
        liveAccounts = live;
        const ok = new Set(live.filter((a) => a.plat !== 'ig' && a.handle).map((a) => String(a.handle).toLowerCase()));
        const before = accs.length;
        accs = accs.filter((a) => ok.has(String(a.handle || '').toLowerCase()));
        if (accs.length < before) console.log('[집행계획] 시트에 없는 틱톡 계정 ' + (before - accs.length) + '건 제외');
      } catch (e) {
        // 시트를 못 읽으면 오래된 기록만으로 돈을 쓸 수는 없다.
        return send(res, 503, { error: '시트를 못 읽어서 집행 계획을 못 세웠어요 — 오래된 스캔 기록만으로는 주문하지 않습니다.' });
      }
      /* 플랫폼마다 서비스도 팔로워 출처도 다르다 — 따로 계획을 세워 합친다.
         인스타 서비스(serviceIds.ig)가 설정 안 돼 있으면 인스타는 그냥 빠진다(지금까지와 동일). */
      const notes = [];
      const plans = [];
      // 돈 경로는 캐시를 믿지 않는다 — 시트에서 다시 읽는다(다른 창에서 방금 바꿨을 수 있다).
      try { await loadSvcPick(campaign, { strict: true }); }
      catch (e) { return send(res, 503, { error: (e && e.message) || String(e) }); }
      const tk = resolveService(campaign, 'tk');
      const ig = resolveService(campaign, 'ig');
      /* 서비스를 하나도 못 풀면 예전엔 200 + 빈 계획이라 화면이 '다 채워져 있어요' 라고 말했다.
         40명이 전부 미달이어도 같은 말이 나온다 — 설정 사고를 성공처럼 보고하는 것이다. */
      if (!tk.svc && !ig.svc) return send(res, 400, { error: [tk.why, ig.why].filter(Boolean).join(' · ') || '집행할 서비스가 설정돼 있지 않아요' });
      if (tk.why) notes.push(tk.why);
      if (ig.why) notes.push(ig.why);
      // 최종 드랍한 사람은 계획에서 뺀다. 몇 건을 뺐는지 말해 준다 — 조용히 빠지면
      // '왜 이 사람이 목록에 없지'를 아무도 못 풀고, 잘못 뺀 경우도 안 드러난다.
      const dropped = droppedKeys(liveAccounts);
      const offKeys = gardenOffKeys(liveAccounts);
      let cutN = 0, offN = 0;
      if (tk.svc) {
        const pick = pickFilter(body.handles, 'tk');
        let rows = pick ? accs.filter(pick) : accs;
        const b4 = rows.length; rows = rows.filter(notDropped(dropped, 'tk')); cutN += b4 - rows.length;
        const b4o = rows.length; rows = rows.filter(notDropped(offKeys, 'tk')); offN += b4o - rows.length;
        plans.push({ plat: 'tk', svc: tk.svc, ...buildPlan(rows, orders, { target: campaign.target, min: campaign.min, service: tk.svc, plat: 'tk' }) });
      }
      if (ig.svc) {
        const r = igPlanRows(campaign, liveAccounts);
        if (r.why) notes.push(r.why);
        const pick = pickFilter(body.handles, 'ig');
        let igRows = pick ? r.rows.filter(pick) : r.rows;
        const b4 = igRows.length; igRows = igRows.filter(notDropped(dropped, 'ig')); cutN += b4 - igRows.length;
        const b4o = igRows.length; igRows = igRows.filter(notDropped(offKeys, 'ig')); offN += b4o - igRows.length;
        plans.push({ plat: 'ig', svc: ig.svc, ...buildPlan(igRows, orders, { target: campaign.target, min: campaign.min, service: ig.svc, plat: 'ig' }) });
      }
      if (cutN) { notes.push('최종 드랍 ' + cutN + '건은 제외했어요'); console.log('[집행계획] 최종 드랍 ' + cutN + '건 제외'); }
      if (offN) { notes.push("시트에 '제외' 로 적힌 " + offN + '건은 빼고 계산했어요'); console.log('[집행계획] 시트 제외 ' + offN + '건'); }
      const igNote = notes.join(' · ') || null;
      const plan = {
        toOrder: plans.flatMap((p) => p.toOrder),
        filling: plans.flatMap((p) => p.filling),
        errored: plans.flatMap((p) => p.errored),
        totalQty: plans.reduce((a, p) => a + p.totalQty, 0),
        totalCost: plans.reduce((a, p) => a + p.totalCost, 0),
      };
      let balance = null;
      if (smm) { try { balance = Number((await smm.balance()).balance); } catch {} }
      return send(res, 200, { ...plan, balance, krwPerUsd: await effectiveRate(), igNote,
        service: tk.svc ? { id: tk.svc.service, name: tk.svc.name, rate: tk.svc.rate } : null,
        services: plans.map((p) => ({ plat: p.plat, id: p.svc.service, name: p.svc.name, rate: p.svc.rate })),
        /* 사람이 이 번호들을 보고 승인한다. 집행 때 되돌려 받아 대조한다 —
           확인창이 열려 있는 동안 서비스가 바뀌면 화면은 #3776($11.50) 기준 금액을 보여준 채
           #3697($3.137, 리필 없음)로 주문될 수 있었다. 반대 방향이면 3.7배 과금이다. */
        /* 번호만 담으면 '같은 #3776 인데 단가가 11.50 → 23.00 으로 바뀐' 경우를 못 잡는다.
           같은 커밋이 넣은 「패널에서 새로고침」이 확인창 열린 사이에 카탈로그를 덮어쓸 수 있고,
           집행은 새 단가로 금액을 다시 계산한다 — 승인한 금액과 실제 청구가 갈린다. */
        svcSig: plans.map((p) => p.plat + ':' + p.svc.service + '@' + p.svc.rate).sort().join('|') });
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
      try { await loadSvcPick(campaign, { strict: true }); }
      catch (e) { return send(res, 503, { error: (e && e.message) || String(e) }); }
      const xTk = resolveService(campaign, 'tk');
      const xIg = resolveService(campaign, 'ig');
      /* 화면이 승인한 서비스와 지금 서버가 풀어낸 서비스가 같은지 본다.
         body.svcSig 가 없으면(옛 화면) 대조를 건너뛴다 — 있으면 다르면 멈춘다. */
      if (body.svcSig) {
        const nowSig = [['tk', xTk], ['ig', xIg]].filter(([, r]) => r.svc)
          .map(([pl, r]) => pl + ':' + r.svc.service + '@' + r.svc.rate).sort().join('|');
        if (nowSig !== body.svcSig) return send(res, 409, {
          error: `승인하신 서비스와 지금 설정이 달라요 (승인 ${body.svcSig || '없음'} / 지금 ${nowSig || '없음'}). 화면을 새로고침하고 금액을 다시 확인해 주세요.` });
      }
      // 계획 때와 같은 검증. 여기서 통과시키면 잘못된 서비스로 진짜 돈이 나간다.
      if (!xTk.svc && !xIg.svc) return send(res, 400, { error: [xTk.why, xIg.why].filter(Boolean).join(' · ') || '집행할 서비스가 설정돼 있지 않아요' });
      // 시트 왕복이 건당 3초쯤이라 순서대로 부르면 그만큼 쌓인다 —
      // 주문기록과 계정목록은 서로 의존하지 않으니 같이 부른다.
      let [orders, accounts] = await Promise.all([
        readOrders(campaign),
        getAccountsFromSheet(campaign.sheet),
      ]);
      orders = await refreshOrders(smm, orders);
      const allAccounts = accounts;      // 인스타 행 매칭에 원본이 필요하다
      accounts = tiktokOnly(accounts);   // 틱톡 스크래퍼에는 틱톡 계정만 넘긴다
      const pickTk = pickFilter(body.handles, 'tk');
      if (pickTk) accounts = accounts.filter(pickTk);
      // reuse: 이미 계획을 확인하고 비번까지 넣은 단계다 — 창을 새로 띄우고 로봇 인증을
      //        다시 거칠 이유가 없다. 살아 있는 브라우저로 팔로워만 다시 확인한다.
      const scanned = await scanAccounts(accounts, { reuse: true });
      /* 플랫폼별로 계획을 세운다. 인스타 팔로워는 인스타 스캔 결과에서만 온다 —
         scanAccounts 는 틱톡 스크래퍼라 인스타 핸들을 주면 남의 숫자를 돌려준다. */
      const xPlans = [];
      const xNotes = [xTk.why, xIg.why].filter(Boolean);
      /* 여기가 진짜 돈이다 — 계획 단계와 같은 가드를 다시 건다.
         /api/execute 는 body 의 계획을 믿지 않고 스스로 다시 세우므로, 계획 쪽만 막으면 뚫린다. */
      const xDropped = droppedKeys(allAccounts);
      const xOff = gardenOffKeys(allAccounts);
      let xCut = 0, xOffN = 0;
      if (xTk.svc) {
        const b4 = scanned.length;
        const rows = scanned.filter(notDropped(xDropped, 'tk')).filter(notDropped(xOff, 'tk'));
        xCut += b4 - rows.length;
        xPlans.push({ plat: 'tk', svc: xTk.svc, ...buildPlan(rows, orders, { target: campaign.target, min: campaign.min, service: xTk.svc, plat: 'tk' }) });
      }
      if (xIg.svc) {
        const r = igPlanRows(campaign, allAccounts);
        if (r.why) xNotes.push(r.why);
        const pickIg = pickFilter(body.handles, 'ig');
        let igRows = pickIg ? r.rows.filter(pickIg) : r.rows;
        const b4 = igRows.length;
        igRows = igRows.filter(notDropped(xDropped, 'ig')).filter(notDropped(xOff, 'ig'));
        xCut += b4 - igRows.length;
        xPlans.push({ plat: 'ig', svc: xIg.svc, ...buildPlan(igRows, orders, { target: campaign.target, min: campaign.min, service: xIg.svc, plat: 'ig' }) });
      }
      if (xCut) console.log('[집행] 최종 드랍·시트제외 ' + xCut + '건 제외');
      if (xNotes.length) console.warn('[집행] 인스타 주의:', xNotes.join(' · '));
      const plan = {
        toOrder: xPlans.flatMap((p) => p.toOrder),
        filling: xPlans.flatMap((p) => p.filling),
        errored: xPlans.flatMap((p) => p.errored),
        totalQty: xPlans.reduce((a, p) => a + p.totalQty, 0),
        totalCost: xPlans.reduce((a, p) => a + p.totalCost, 0),
      };
      // 스캔에 수 분이 걸렸다. 그 사이 다른 경로(CLI·앞선 집행)가 주문을 넣었을 수 있으니
      // 돈을 쓰기 직전에 주문기록을 다시 읽어 이미 진행중인 계정은 뺀다.
      let skipped = [];
      try {
        const fresh = await refreshOrders(smm, await readOrders(campaign));
        const before = plan.toOrder.length;
        /* ⚠️ o.plat 을 반드시 넘긴다. 안 넘기면 inFlightFor 가 전 플랫폼을 합산해서,
           틱톡 주문이 배송 중인 사람의 인스타 주문이 조용히 사라진다(핸들이 같은 사람 16명).
           확인창에서 본 목록과 실제 주문이 달라지므로, 빠진 건 반드시 응답에 담아 말한다. */
        const kept = plan.toOrder.filter((o) => inFlightFor(fresh, o.handle, o.plat) === 0);
        skipped = plan.toOrder.filter((o) => !kept.includes(o))
          .map((o) => ({ handle: o.handle, plat: o.plat, qty: o.qty }));
        plan.toOrder = kept;
        if (skipped.length) console.log(`[집행] 이미 진행중인 주문 ${skipped.length}건 제외`);
        orders = fresh;
      } catch (e) { console.error('[집행] 주문기록 재확인 실패 — 중단합니다:', e.message); return send(res, 503, { error: '주문 기록을 다시 확인하지 못해 집행을 멈췄어요. 중복 과금을 피하려는 조치예요.' }); }
      const balance = Number((await smm.balance()).balance);
      if (plan.totalCost > balance) return send(res, 400, { error: `잔액 부족: 필요 $${plan.totalCost.toFixed(2)} > 잔액 $${balance}` });
      let sheetWarn = null;
      let placed = [];
      // (skipped 는 위 재확인 블록에서 채운다)
      try {
        for (const pl of xPlans) {
          const mine = plan.toOrder.filter((o) => o.plat === pl.plat);
          if (!mine.length) continue;
          // 플랫폼마다 서비스 번호도 주문 링크도 다르다 — 섞이면 돈만 버린다.
          const got = await placeOrders(smm, orders, mine, pl.svc, { plat: pl.plat,
          // 과금 직후 즉시 기록. writeOrders 는 throw 하지 않고 durable 로 알린다.
          persist: async () => {
            const w = await writeOrders(campaign, orders);
            if (w.sheet === 'fail') { sheetWarn = w.sheetError; console.error('[집행] 시트 기록 실패(로컬엔 저장됨):', w.sheetError); }
            if (w.local === 'fail') console.error('[집행] 로컬 기록 실패:', w.localError);
            return w;
          } });
          placed = placed.concat(got);
        }
      } catch (e) {
        // 과금됐는데 어디에도 기록 못 함 → 마지막으로 한 번 더 저장 시도하고, 반드시 사용자에게 알린다.
        const w = await writeOrders(campaign, orders);
        console.error('[집행] 기록 실패로 배치 중단:', e.message);
        return send(res, 500, { error: e.message, placed: e.placed || [], recorded: w.durable, orders: markStale(orders) });
      }
      const w = await writeOrders(campaign, orders);
      if (!w.durable) return send(res, 500, { error: '주문은 나갔는데 기록에 실패했습니다. smmkings 패널에서 확인하세요.', placed, orders: markStale(orders) });
      if (w.sheet === 'fail') sheetWarn = w.sheetError;
      return send(res, 200, { ok: true, placed, filling: plan.filling, skipped, igNote: xNotes.join(' · ') || null,
        orders: markStale(orders), sheetWarn: sheetWarn ? '시트 기록 실패(로컬엔 저장됨) — 다음 새로고침 때 자동 재시도해요' : undefined });
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

    /* 가드닝 서비스 변경 — 플랫폼별로 고른다.
     *
     * 예전엔 setService 가 옛 c.serviceId 에만 썼는데 집행은 serviceIds:{tk,ig} 만 봤다.
     * '바꿨다' 고 답하고 주문은 옛 번호로 나가는 경로라서, 그런 캠페인은 아예 400 으로 막아 뒀다.
     * 이제 시트 _state.svcPick 에 적고 serviceIdOf 가 그걸 먼저 본다 — 로컬·배포본이 같은 값을 본다.
     *
     * 저장하는 것은 번호 + 그 시점 스냅샷이다. 스냅샷은 '표시' 전용이고, 실제 주문은 언제나
     * 카탈로그에서 다시 찾는다(집행 경로에 사람이 적은 값이 새면 검증이 무력해진다). */
    if (path === '/api/service' && req.method === 'POST') {
      const body = await readBody(req);
      const plat = body.plat === 'ig' ? 'ig' : body.plat === 'tk' ? 'tk' : null;
      const id = Number(body.id != null ? body.id : body.serviceId);
      if (!plat) return send(res, 400, { error: "plat 이 'tk' 또는 'ig' 여야 해요" });
      if (!Number.isFinite(id)) return send(res, 400, { error: '서비스 번호가 필요해요' });

      const cat = catalog();
      if (!cat.length) return send(res, 400, { error: '카탈로그가 비어 있어요 — 먼저 「패널에서 새로고침」 을 눌러주세요.' });
      const svc = findService(cat, id);
      // 같은 검증을 집행 때와 똑같이 건다. 목록에서 골랐다고 통과시키면 검증이 사라진다.
      const why = serviceWhy(svc, id, plat);
      if (why) return send(res, 400, { error: why });

      // 진행 중 주문이 있으면 원장이 두 서비스로 갈린다 — 막지는 않되 몇 건인지 말해 준다.
      let inFlight = 0;
      try {
        const cur = await readOrders(campaign);
        inFlight = (cur || []).filter((o) => (o.plat || 'tk') === plat && !o.abandoned && !o.canceled && Number(o.remains) > 0).length;
      } catch {}

      /* prev 를 못 읽으면 {} 로 시작해 반대 플랫폼 선택이 통째로 지워진다
         (틱톡을 바꿨는데 인스타 선택이 사라지는 식). 못 읽으면 아예 바꾸지 않는다. */
      let prev;
      try { prev = (await loadSvcPick(campaign, { strict: true })) || {}; }
      catch (e) { return send(res, 503, { error: '기존 선택을 못 읽어서 바꾸지 않았어요: ' + ((e && e.message) || e) }); }
      const next = { ...prev, [plat]: {
        id: Number(svc.service), name: svc.name, rate: svc.rate, min: svc.min, max: svc.max,
        refill: !!svc.refill, cancel: !!svc.cancel, at: new Date().toISOString(),
      } };
      try {
        const { writeStateToSheet } = await import('./sheet.js');
        await writeStateToSheet(campaign.sheet, { svcPick: next });   // 못 쓰면 여기서 throw 한다
      } catch (e) { return send(res, 502, { error: '서비스를 저장 못 했어요: ' + ((e && e.message) || e) }); }
      SVC_PICK.set(campaign.id, next);
      return send(res, 200, { ok: true, plat, service: next[plat], inFlight,
        note: !svc.refill ? '이 서비스는 리필이 안 돼요 — 팔로워가 빠져도 회수 수단이 없습니다.' : null });
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
    /* 수기 집행 '완료 처리' — 사람이 패널에서 채워진 걸 보고 닫는다.
       ⚠️ 예전엔 이 버튼이 /abandon 을 불렀다. abandoned 는 (1) 지출 합계에서 빠지고
       (2) 재주문 차단(inFlightFor)에서도 빠진다. 즉 '완료 처리'를 누르면 실제로 나간 돈이
       장부에서 사라지고 같은 계정을 또 살 수 있게 됐다 — 실제로 9,000원짜리 한 건이 그 상태였다.
       완료는 done 이다: 지출에 남고, 재주문은 열린다(팔로워가 들어왔으니 그건 맞다). */
    if (path === '/api/order/done' && req.method === 'POST') {
      const body = await readBody(req);
      let notFound = false;
      const { w } = await updateOrders(campaign, async (orders) => {
        const o = orders.find((x) => (x.id != null && String(x.id) === String(body.orderId)) || (x.uid && x.uid === body.orderId));
        if (!o) { notFound = true; return undefined; }
        o.done = true;
        o.doneAt = new Date().toISOString();
        o.remains = 0;            // 다 들어왔다는 뜻 — 진행중으로 다시 세지 않게
        o.abandoned = false;      // 예전에 잘못 눌러 포기로 박힌 건을 여기서 정정한다
        o.cancelStuck = false;
        return orders;
      });
      if (notFound) return send(res, 404, { error: '주문 없음' });
      if (!w.durable) return send(res, 500, { error: '완료 기록에 실패했어요. 다시 시도해 주세요.' });
      return send(res, 200, { ok: true });
    }
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

// ── 스캔 에이전트 (무인 워커) ─────────────────────────────────────────────
// bat/터미널 없이 PC 백그라운드에서 돈다. 하는 일:
//   1) 버스(로컬 큐 또는 시트)에서 '스캔 요청'을 폴링
//   2) 기존 스캔 두뇌(runContentScan/scanOneProfile/judgeOneLink)를 그대로 호출
//   3) 결과는 기존 경로가 마스터 시트에 되쓰고(pushCellsToSheet), 요약/상태는 버스에 기록
//   4) 저녁 시간창 예약(무인) + 온디맨드(감독) 둘 다 지원
// 기존 라이브 코드는 한 줄도 안 고침 — src/ 함수를 import 해서 재사용만 한다.
// 워커는 CLOUD 아님(로컬 모드) → 스캔이 집 IP·실제 크롬 창으로 나간다(봇 우회).
// 스캔 전용: 돈(집행/리필)은 이 에이전트가 다루지 않는다(추천 아키텍처 3단계, 별도).
import { appendFileSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../../src/env.js';
import { listCampaigns } from '../../src/campaigns.js';
import { loadConfig, AGENT_DATA } from './config.js';
import { createBus } from './worker-bus.js';
import { runJob } from './runner.js';
import { startControlServer } from './control-server.js';

const AGENT_VERSION = '0.1.0';
loadEnv();                 // Garden/.env (TIKTOK_PROXY 등) 공유
const cfg = loadConfig();
const bus = createBus(cfg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 로그 ──────────────────────────────────────────────────────────────
const LOG = join(AGENT_DATA, 'agent.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { mkdirSync(AGENT_DATA, { recursive: true }); appendFileSync(LOG, line + '\n'); } catch {}
  if (!process.env.AGENT_QUIET) console.log(line);
}

// ── 단일 인스턴스 락 (중복 실행 = 이중 스캔 방지) ─────────────────────────
const LOCK = join(AGENT_DATA, 'agent.lock');
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function acquireLock() {
  mkdirSync(AGENT_DATA, { recursive: true });
  if (existsSync(LOCK)) {
    let prev = 0; try { prev = Number(JSON.parse(readFileSync(LOCK, 'utf8')).pid); } catch {}
    if (prev && prev !== process.pid && pidAlive(prev)) return false;
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  return true;
}
function releaseLock() { try { if (existsSync(LOCK) && JSON.parse(readFileSync(LOCK, 'utf8')).pid === process.pid) rmSync(LOCK); } catch {} }

// ── 인메모리 상태 (server.js 의 contentScanState 와 동일한 모양) ──────────
let busy = false;
let stopping = false;
let stopRequested = false;      // 감독 수동 중지(스캔 중)
let goResolve = null;           // 감독: '스캔 시작' 게이트 resolver
let resumeResolve = null;       // 감독: 막힘 후 '재개/중지' resolver
const state = { phase: 'idle', jobId: null, type: null, mode: null, attended: true, done: 0, total: 0, up: 0, written: 0, failed: 0, blockReason: null, error: null, ranAt: null, authNeeded: false };

// ── 제어 API (control-server 가 호출) ──────────────────────────────────
const control = {
  status: async () => ({ agentVersion: AGENT_VERSION, online: true, bus: bus.kind, busy, at: (await bus.readHeartbeat() || {}).at || null, state: { ...state } }),
  recent: async () => (await bus.recent(10)) || [],
  enqueue: async (job) => bus.enqueue(job),
  go: () => { if (goResolve) { goResolve(); goResolve = null; state.phase = 'scanning'; bus.update({ phase: 'scanning' }); return true; } return false; },
  resume: () => { if (resumeResolve) { const r = resumeResolve; resumeResolve = null; r('resume'); return true; } return false; },
  stop: () => {
    if (resumeResolve) { const r = resumeResolve; resumeResolve = null; r('stop'); return true; }
    if (busy && state.phase === 'scanning') { stopRequested = true; return true; }
    return false;
  },
};

// ── 한 작업 실행: 콜백 ↔ 상태/버스 어댑터 (추천 아키텍처 §4 '상태전달') ──────
async function runOne(job) {
  busy = true;
  stopRequested = false;
  const attended = job.attended !== false;
  Object.assign(state, { phase: 'starting', jobId: job.id, type: job.type || 'content-scan', mode: job.mode || null, attended, done: 0, total: 0, up: 0, written: 0, failed: 0, blockReason: null, error: null, ranAt: null, authNeeded: false });
  await bus.update({ status: 'running', phase: 'starting' });
  log(`작업 시작 ${job.id} type=${state.type} mode=${state.mode || '-'} attended=${attended} src=${job.source || '-'}`);

  let lastProg = 0;
  const hooks = {
    // 크롬 창이 떠서 로봇 인증 대기 → 감독이면 '스캔 시작' 버튼, 무인이면 graceMs 후 자동 진행.
    onWarmup: () => {
      state.phase = 'awaiting-human';
      bus.update({ phase: 'awaiting-human' });
      log(`워밍업: 크롬 창(로봇 인증 대기) attended=${attended}`);
      if (!attended) setTimeout(() => { if (goResolve) { goResolve(); goResolve = null; } }, cfg.schedule.graceMs);
    },
    waitForGo: () => new Promise((res) => { goResolve = res; }),
    onProgress: (p) => {
      if (state.phase !== 'blocked') state.phase = 'scanning';
      state.done = p.done; state.total = p.total;
      const now = Date.now();
      if (now - lastProg > cfg.progressThrottleMs) { lastProg = now; bus.update({ phase: state.phase, done: p.done, total: p.total }); }
    },
    shouldPause: () => stopRequested,
    // 연속 3회 막힘 → 감독이면 재개/중지 대기(클라우드/로컬 화면 게이트), 무인이면 즉시 접고 '세션 데우기 필요'.
    onBlocked: async ({ reason, done, total, failed }) => {
      state.phase = 'blocked'; state.blockReason = reason; state.done = done; state.total = total; state.failed = failed;
      stopRequested = false;
      bus.update({ phase: 'blocked', blockReason: reason, done, total, failed });
      log(`막힘(${reason}) ${done}/${total} 실패 ${failed}`);
      if (!attended) { if (reason === 'blocked') state.authNeeded = true; return 'stop'; }
      const action = await new Promise((res) => { resumeResolve = res; });
      state.phase = 'scanning'; state.blockReason = null;
      bus.update({ phase: 'scanning', blockReason: null });
      return action;
    },
  };

  try {
    const r = await runJob(job, hooks);
    Object.assign(state, { phase: 'done', up: r.up ?? 0, written: r.written ?? 0, failed: r.failed ?? 0, total: r.total ?? state.total, done: r.total ?? state.done, ranAt: new Date().toISOString(), error: null });
    // 무인인데 막혀서 조기 종료 + 실패 다수 = 쿠키 만료 의심 → 보류(세션 데우기 필요 배지).
    if (!attended && r.stopped && (r.failed || 0) > 0) state.authNeeded = true;
    await bus.finish({ status: state.authNeeded ? 'deferred' : 'done', phase: 'done', result: summarize(r) });
    log(`완료 ${job.id}: up=${r.up} total=${r.total} failed=${r.failed} written=${r.written} stopped=${!!r.stopped}${state.authNeeded ? ' (보류=세션 데우기 필요)' : ''}`);
  } catch (e) {
    state.phase = 'error';
    state.error = String((e && e.message) || e);
    const authy = /인증|robot|로봇|시간\s*초과|timeout|playwright/i.test(state.error);
    if (authy) state.authNeeded = true;
    await bus.finish({ status: authy ? 'deferred' : 'error', phase: 'error', error: state.error });
    log(`실패 ${job.id}: ${state.error}`);
  } finally {
    goResolve = null; resumeResolve = null;
    busy = false;
    state.jobId = null; state.type = null; state.mode = null; state.phase = 'idle'; state.blockReason = null;
  }
}
function summarize(r) { return { total: r.total, scanned: r.scanned, up: r.up, newUp: r.newUp, written: r.written, failed: r.failed, stopped: !!r.stopped }; }

// ── 저녁 시간창 예약 (무인, Vercel Cron 의존 X — 워커 내장 시계) ──────────
const SCHED_FILE = join(AGENT_DATA, 'schedule-state.json');
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d; } catch { return d; } };
function scanTargets() { return Array.isArray(cfg.campaigns) ? cfg.campaigns : listCampaigns().map((c) => c.id); }
function toMin(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); }
async function checkSchedule() {
  if (!cfg.schedule.enabled || stopping) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const st = readJson(SCHED_FILE, {}) || {};
  for (const win of cfg.schedule.windows) {
    const diff = nowMin - toMin(win);
    // 창 시각 ~ +60분 캐치업(PC가 늦게 깨어나도 그날치는 한 번 발화). 하루 1회.
    if (diff >= 0 && diff < 60 && !(st[today] && st[today][win])) {
      st[today] = st[today] || {}; st[today][win] = new Date().toISOString();
      try { writeFileSync(SCHED_FILE, JSON.stringify(st, null, 2)); } catch {}
      for (const cid of scanTargets()) {
        await bus.enqueue({ type: 'content-scan', mode: cfg.schedule.mode, campaign: cid, attended: false, source: 'schedule', window: win });
        log(`저녁 예약 발화 ${win} → ${cid} (${cfg.schedule.mode}, 무인)`);
      }
    }
  }
}

// ── 메인 루프 ──────────────────────────────────────────────────────────
async function loop() {
  while (!stopping) {
    try {
      await bus.heartbeat({ online: true, agentVersion: AGENT_VERSION, bus: bus.kind, busy, phase: state.phase, jobId: state.jobId, type: state.type, mode: state.mode, done: state.done, total: state.total, authNeeded: state.authNeeded });
      if (!busy) {
        const job = await bus.claim();
        if (job) runOne(job).catch((e) => log('runOne 예외: ' + ((e && e.message) || e)));
      }
    } catch (e) { log('loop 오류: ' + ((e && e.message) || e)); }
    const active = busy && ['starting', 'awaiting-human', 'blocked', 'scanning'].includes(state.phase);
    await sleep(active ? cfg.activePollMs : cfg.idlePollMs);
  }
}

function shutdown() { if (stopping) return; stopping = true; log('종료 신호 — 정리 중'); releaseLock(); process.exit(0); }

// ── 부팅 ────────────────────────────────────────────────────────────────
if (!acquireLock()) { console.error('스캔 에이전트가 이미 실행 중이에요(중복 방지). 종료합니다.'); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', releaseLock);
process.on('uncaughtException', (e) => log('uncaught: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + ((e && e.message) || e)));

let ctrl = null;
if (cfg.controlPort) ctrl = startControlServer(cfg.controlPort, control);
log(`스캔 에이전트 시작 v${AGENT_VERSION} · bus=${bus.kind} · 캠페인=${JSON.stringify(scanTargets())} · 제어서버=${cfg.controlPort ? 'http://127.0.0.1:' + cfg.controlPort : '꺼짐'} · 예약=${cfg.schedule.enabled ? cfg.schedule.windows.join(',') : '끔'}`);
setInterval(() => { checkSchedule().catch((e) => log('스케줄 오류: ' + ((e && e.message) || e))); }, 30000);
checkSchedule().catch(() => {});
loop();

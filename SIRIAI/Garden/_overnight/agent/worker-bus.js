// 신호버스 — '스캔 요청'을 넣고(enqueue) 워커가 하나씩 꺼내(claim) 상태를 되쓰는(update/finish) 얇은 추상화.
// 두 가지 드라이버:
//   local  = 로컬 파일 큐 (_data/queue/). 설치 0, 별도 배포 0. 기본값.
//   sheet  = worker_bus.gs(별도 Apps Script 웹앱) 폴링. 클라우드에서 큐에 넣으려면 이걸로.
// 버스를 얇게 유지해 나중에 Vercel KV 등으로 스왑 가능하게 둔다(추천 아키텍처 §6/§7-3).
// ⚠️ 스캔 '결과 데이터'(콘텐츠·검수·조회수)는 이 버스가 아니라 기존 runContentScan → pushCellsToSheet 가
//    '마스터 시트'에 직접 되쓴다. 여기 버스는 (a)요청 (b)진행상태 (c)결과요약/하트비트만 나른다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AGENT_DATA } from './config.js';

const Q = join(AGENT_DATA, 'queue');
const PENDING = join(Q, 'pending');       // pending/<id>.json — 대기 중 요청
const DONE = join(Q, 'done');             // done/<id>.json — 완료/실패/보류 기록
const ACTIVE = join(Q, 'active.json');    // 지금 처리 중인 단일 작업(+실시간 상태)
const HEARTBEAT = join(AGENT_DATA, 'heartbeat.json');

const readJson = (f, dflt = null) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : dflt; } catch { return dflt; } };
const writeJson = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2));
export function newId() { return Date.now().toString(36) + '-' + randomUUID().slice(0, 8); }
function ensureDirs() { for (const d of [AGENT_DATA, Q, PENDING, DONE]) mkdirSync(d, { recursive: true }); }

// ── 로컬 파일 큐 드라이버 ─────────────────────────────────────────────
function localBus() {
  ensureDirs();
  return {
    kind: 'local',
    enqueue(job) {
      ensureDirs();
      const id = job.id || newId();
      const rec = { type: 'content-scan', attended: true, ...job, id, status: 'pending', enqueuedAt: new Date().toISOString() };
      writeJson(join(PENDING, id + '.json'), rec);
      return rec;
    },
    listPending() {
      ensureDirs();
      return readdirSync(PENDING).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(PENDING, f))).filter(Boolean);
    },
    // 다음 대기 작업 1개를 원자적으로(단일 인스턴스 전제) 집어 active 로 승격. 없으면 null.
    claim() {
      ensureDirs();
      // 크래시 잔재: 이전 실행이 남긴 active 는 '미완'으로 done 이관(같은 작업 두 번 실행 방지).
      const leftover = readJson(ACTIVE);
      if (leftover) {
        leftover.status = 'interrupted';
        leftover.finishedAt = new Date().toISOString();
        if (leftover.id) writeJson(join(DONE, leftover.id + '.json'), leftover);
        try { rmSync(ACTIVE); } catch {}
      }
      const files = readdirSync(PENDING).filter((f) => f.endsWith('.json')).sort();
      if (!files.length) return null;
      const first = files[0];
      const job = readJson(join(PENDING, first));
      if (!job) { try { rmSync(join(PENDING, first)); } catch {} return null; }
      job.status = 'running';
      job.claimedAt = new Date().toISOString();
      writeJson(ACTIVE, job);
      try { rmSync(join(PENDING, first)); } catch {}
      return job;
    },
    update(patch) {
      const cur = readJson(ACTIVE);
      if (!cur) return;
      Object.assign(cur, patch, { updatedAt: new Date().toISOString() });
      writeJson(ACTIVE, cur);
    },
    finish(result) {
      const cur = readJson(ACTIVE) || {};
      Object.assign(cur, result, { finishedAt: new Date().toISOString() });
      if (cur.id) writeJson(join(DONE, cur.id + '.json'), cur);
      try { rmSync(ACTIVE); } catch {}
      return cur;
    },
    current() { return readJson(ACTIVE); },
    recent(n = 10) {
      ensureDirs();
      return readdirSync(DONE).filter((f) => f.endsWith('.json')).sort().slice(-n).reverse().map((f) => readJson(join(DONE, f))).filter(Boolean);
    },
    heartbeat(obj) { writeJson(HEARTBEAT, { ...obj, at: new Date().toISOString() }); },
    readHeartbeat() { return readJson(HEARTBEAT); },
  };
}

// ── 시트 드라이버 (worker_bus.gs 별도 웹앱) ────────────────────────────
// 브릿지가 가끔 JSON 대신 HTML 오류를 뱉는 것은 sheet.js 와 동일하게 흡수(여기선 얇게 1회 오류처리).
function sheetBus(sheet) {
  if (!sheet || !sheet.url || !sheet.token) {
    throw new Error("bus:'sheet' 에는 config.sheet.url/token 이 필요해요 (worker_bus.gs 를 별도 웹앱으로 배포한 URL/토큰).");
  }
  const post = async (payload) => {
    const res = await fetch(sheet.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sheet.token, ...payload }) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error('worker_bus 응답이 JSON 이 아니에요 (Apps Script 일시 오류).'); }
    if (data.error) throw new Error('worker_bus: ' + data.error);
    return data;
  };
  const get = async (qs) => {
    const url = `${sheet.url}?token=${encodeURIComponent(sheet.token)}&${qs}`;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error('worker_bus 응답이 JSON 이 아니에요 (Apps Script 일시 오류).'); }
    if (data.error) throw new Error('worker_bus: ' + data.error);
    return data;
  };
  return {
    kind: 'sheet',
    async enqueue(job) { return (await post({ enqueue: { type: 'content-scan', attended: true, ...job, id: job.id || newId() } })).job; },
    async listPending() { return (await get('action=pending')).jobs || []; },
    async claim() { return (await post({ claim: true })).job || null; },
    async update(patch) { return post({ update: patch }); },
    async finish(result) { return post({ finish: result }); },
    async current() { return (await get('action=current')).job || null; },
    async recent(n = 10) { return (await get('action=recent&n=' + n)).jobs || []; },
    async heartbeat(obj) { return post({ heartbeat: obj }); },
    async readHeartbeat() { return (await get('action=heartbeat')).heartbeat || null; },
  };
}

export function createBus(config) {
  return config.bus === 'sheet' ? sheetBus(config.sheet) : localBus();
}

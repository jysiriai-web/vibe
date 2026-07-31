// 틱톡 계정별 키워드 확인기 — 계정을 하나씩 훑어 최근 N개 영상에 지정 키워드가 있는지 확인하고
// 찾은 콘텐츠 링크를 시트 O열에 기입한다.
//
// 설계 원칙 (틱톡이 중간에 막아도 앞 결과가 안 날아가게):
//   ① 계정을 하나씩 순차로, 사이에 랜덤 간격
//   ② 한 계정 끝날 때마다 state.json + result.csv 즉시 저장 (체크포인트)
//   ③ 차단 의심(fetchVideos 의 ok=false)이 연속되면 조용히 넘어가지 않고 멈추고 알림
//   ④ 다시 실행하면 끝난 계정은 건너뛰고 남은 것부터 이어서
//   ⑤ 중간에 멈춰도, 그때까지 찾은 링크는 시트에 기입하고 끝냄
//
// 실행: check.bat 더블클릭  또는  node run.js
//   --all       O열에 이미 링크가 있는 계정도 다시 확인 (기본: 빈 것만)
//   --local     시트 대신 accounts.txt 의 계정 목록으로 확인 (시트 기입 안 함)
//   --no-push   확인만 하고 시트에 기입하지 않음
//   --reset     체크포인트를 지우고 처음부터
//   --plan      어느 계정을 확인할지만 보여주고 끝 (크롬 안 띄움, 시트 안 건드림)

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchBrowser, fetchVideos } from './src/tiktok-videos.js';
import { toHandle } from './src/tiktok.js';
import { loadEnv } from './src/env.js';
import { findMatch, ymd } from './match.js';
import { listRows, pushLinks } from './sheet-client.js';

loadEnv(); // .env 의 TIKTOK_PROXY 를 읽어 스캐너를 특정 국가로 내보낼 수 있게

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const STATE_PATH = join(HERE, 'state.json');
const CSV_PATH = join(HERE, 'result.csv');

const argv = new Set(process.argv.slice(2));
const OPT = {
  all: argv.has('--all'),
  local: argv.has('--local'),
  noPush: argv.has('--no-push') || argv.has('--local'),
  reset: argv.has('--reset'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.round(a + Math.random() * (b - a));
const norm = (s) => toHandle(String(s || '').trim()).toLowerCase();

// ── 체크포인트 ──────────────────────────────────────────────────────────
// 계정 하나 끝날 때마다 통째로 다시 쓴다(작은 파일이라 부담 없음). 임시파일→rename 이라
// 쓰다가 중단돼도 state.json 이 깨지지 않는다.
function loadState() {
  if (OPT.reset || !existsSync(STATE_PATH)) return { accounts: {} };
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return s && s.accounts ? s : { accounts: {} };
  } catch {
    console.log('⚠ state.json 을 읽지 못해 새로 시작합니다.');
    return { accounts: {} };
  }
}

const state = loadState();

// 오류로 빠져나가거나 Ctrl+C 로 멈춰도 크롬이 남지 않게, 브라우저는 모듈 스코프에 둔다.
let browser = null;
const closeBrowser = async () => {
  const b = browser; browser = null;
  if (b) { try { await b.close(); } catch {} }
};

function save() {
  state.updatedAt = new Date().toISOString();
  const tmp = STATE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, STATE_PATH);
  writeCsv();
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function writeCsv() {
  const head = ['계정', '발견', '콘텐츠링크', '업로드일', '맞은키워드', '확인한영상수', '상태', '메모', '확인시각'];
  const lines = [head.join(',')];
  for (const [handle, a] of Object.entries(state.accounts)) {
    lines.push([
      '@' + handle,
      a.status === 'found' ? 'O' : a.status === 'none' ? 'X' : '',
      a.link || '',
      a.date || '',
      (a.keywords || []).join(' '),
      a.scanned ?? '',
      a.status === 'found' ? '발견'
        : a.status === 'none' ? '해당없음'
        : (a.fails || 0) >= MAX_FAILS ? '확인불가(직접 확인 필요)'
        : '확인실패(재시도 예정)',
      a.error || '',
      a.at || '',
    ].map(csvCell).join(','));
  }
  // BOM: 엑셀에서 한글이 깨지지 않게
  const tmp = CSV_PATH + '.tmp';
  writeFileSync(tmp, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
  renameSync(tmp, CSV_PATH);
}

const isDone = (h) => {
  const s = state.accounts[h];
  return !!(s && (s.status === 'found' || s.status === 'none'));
};

// 몇 번을 다시 시도해도 계속 실패하는 계정 = 삭제·개명·비공개 계정일 가능성이 크다.
// 이런 계정을 계속 큐에 두면 매 실행마다 같은 자리에서 '차단'으로 오해하고 멈춰서
// 그 뒤 계정이 영영 스캔되지 않는다. 그래서 maxFails 번 시도한 뒤엔 큐에서 빼고
// '확인불가'로 따로 보고한다 (시트에는 아무것도 쓰지 않는다 — 사람이 볼 몫).
const MAX_FAILS = Number(CFG.maxFails) > 0 ? Number(CFG.maxFails) : 3;
const failCount = (h) => (state.accounts[h] && state.accounts[h].fails) || 0;
const isGivenUp = (h) => {
  const s = state.accounts[h];
  return !!(s && s.status === 'fail' && failCount(h) >= MAX_FAILS);
};

// ── 대상 계정 확보 ──────────────────────────────────────────────────────
async function getTargets() {
  if (OPT.local) {
    const p = join(HERE, 'accounts.txt');
    if (!existsSync(p)) throw new Error('accounts.txt 가 없어요. 계정을 한 줄에 하나씩 적어주세요.');
    const rows = readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => ({ row: 0, handle: norm(l), link: '' }))
      .filter((r) => r.handle);
    return { rows, from: `accounts.txt (${rows.length}건)` };
  }
  const data = await listRows(CFG.sheet);
  const rows = (data.rows || []).map((r) => ({ row: r.row, handle: norm(r.handle), link: String(r.link || '').trim() })).filter((r) => r.handle);
  return { rows, from: `시트 (${rows.length}건)` };
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('  틱톡 계정별 키워드 확인기');
  console.log('  키워드: ' + CFG.keywords.join('  ') + '   |   최근 ' + CFG.recentN + '개 게시물');
  console.log('  ─────────────────────────────────────────────');

  const { rows, from } = await getTargets();
  console.log('  계정 목록: ' + from);

  const targets = OPT.all ? rows : rows.filter((r) => !r.link);
  if (!OPT.all) console.log('  이미 O열에 링크 있음: ' + (rows.length - targets.length) + '건 (건너뜀)');

  // 같은 계정이 두 행에 있으면(시트에 '중복' 표시된 건들) 한 번만 확인한다.
  // targets 는 그대로 두므로, 기입할 때는 두 행 모두에 같은 링크가 들어간다.
  //
  // 지난번에 실패한 계정은 큐의 '뒤'로 보낸다. 앞에 두면 그 계정들이 다시 실패하면서
  // 매 실행마다 같은 자리에서 멈춰, 아직 한 번도 안 본 계정이 계속 밀린다.
  const queued = new Set();
  const fresh = [], retry = [], givenUp = [];
  for (const t of targets) {
    if (isDone(t.handle) || queued.has(t.handle)) continue;
    queued.add(t.handle);
    if (isGivenUp(t.handle)) { givenUp.push(t); continue; }
    (state.accounts[t.handle] ? retry : fresh).push(t);
  }
  const pending = [...fresh, ...retry];

  const alreadyDone = targets.filter((t) => isDone(t.handle)).length;
  if (alreadyDone) console.log('  지난 실행에서 확인 완료: ' + alreadyDone + '건 (건너뜀)');
  const dupes = targets.length - alreadyDone - pending.length - givenUp.length;
  if (dupes > 0) console.log('  같은 계정이 여러 행에 있음: ' + dupes + '건 (한 번만 확인)');
  if (givenUp.length) console.log(`  ${MAX_FAILS}번 시도해도 안 되던 계정: ${givenUp.length}건 (건너뜀 — 아래 목록 참고)`);
  if (retry.length) console.log('  지난번 실패해 다시 시도: ' + retry.length + '건 (뒤로 미뤄서 확인)');
  console.log('  이번에 확인할 계정: ' + pending.length + '건');
  console.log('');

  // 미리보기 — 크롬도 안 띄우고 시트도 안 건드린다. 무엇이 남았는지만 확인할 때.
  if (argv.has('--plan')) {
    for (const t of pending) {
      const prev = state.accounts[t.handle];
      console.log(`    · @${t.handle}` + (prev ? `  (지난번 실패 ${prev.fails || 1}회 — ${prev.error || ''})` : ''));
    }
    console.log('');
    console.log('  (--plan: 계획만 보여주고 끝냅니다. 실제로 확인하려면 --plan 없이 실행하세요.)');
    console.log('');
    return;
  }

  let stoppedReason = '';

  if (pending.length) {
    console.log('  크롬 창이 열립니다. 로봇 인증(퍼즐·슬라이더)이 뜨면 사람이 통과시켜 주세요.');
    console.log('  ▶ 통과했거나 인증이 안 떴으면, 이 검은 창에서 Enter 를 누르면 시작합니다.');
    console.log('');

    let goResolve;
    const goPromise = new Promise((r) => { goResolve = r; });
    const onData = () => goResolve();
    process.stdin.on('data', onData);
    process.stdin.resume();

    let ctx;
    try {
      const b = await launchBrowser({ warmup: true, waitForGo: () => goPromise });
      browser = b.browser; ctx = b.ctx;
    } finally {
      process.stdin.off('data', onData);
      process.stdin.pause();
    }

    console.log('  스캔 시작 — 창을 닫지 마세요.');
    console.log('');

    let streak = []; // 연속으로 실패한 계정들 (성공하면 비워진다)

    for (let i = 0; i < pending.length; i++) {
      const t = pending[i];
      const tag = `  [${String(i + 1).padStart(2)}/${pending.length}] @${t.handle}`;
      process.stdout.write(tag + ' … ');

      let r;
      try {
        r = await fetchVideos(ctx, t.handle, { timeout: 45000, attempts: 2 });
      } catch (e) {
        r = { videos: [], ok: false, error: String((e && e.message) || e).slice(0, 120) };
      }

      const now = new Date().toISOString();

      // ok=false 는 '영상 없음'이 아니라 '못 봤음'(차단·타임아웃·삭제된 계정).
      let failError = r.ok ? '' : r.error;

      // 중복 제거 후 최신순 정렬 (fetchVideos 가 같은 영상을 두 번 담아오는 경우가 있다)
      const seen = new Set();
      const videos = (r.videos || [])
        .filter((v) => { const id = String(v.id || ''); if (!id || seen.has(id)) return false; seen.add(id); return true; })
        .sort((a, b) => (Number(b.createTime) || 0) - (Number(a.createTime) || 0));

      const m = r.ok ? findMatch(videos, t.handle, CFG.keywords, CFG.recentN) : null;

      // 목록은 왔는데 전부 남의 영상이면(추천·리포스트만 섞여 온 경우) 이 계정 영상은 못 본 것이다.
      // 이걸 '해당 없음'으로 확정해버리면 실제로 올린 계정의 O열이 영영 비게 된다 → 실패로 두고 재시도.
      if (m && m.scanned === 0 && videos.length > 0) {
        failError = `이 계정 영상을 못 받았어요 (남의 영상 ${videos.length}개만 섞여 옴)`;
      }

      if (failError) {
        streak.push(t.handle);
        const fails = failCount(t.handle) + 1;
        state.accounts[t.handle] = { status: 'fail', error: failError, fails: fails, row: t.row, at: now };
        save(); // 완료로 찍지 않아 다음 실행 때 재시도된다 (MAX_FAILS 회까지)
        console.log('못 봤어요 — ' + failError + (fails >= MAX_FAILS ? `  (${fails}번째 — 더 시도하지 않습니다)` : ''));

        if (streak.length >= CFG.stopAfterConsecutiveFails) {
          // 원인을 단정하지 않는다. 전에도 실패했던 계정들이면 차단이 아니라 그 계정들 문제일 수 있다.
          const repeats = streak.filter((h) => failCount(h) > 1).length;
          stoppedReason = repeats === streak.length
            ? `연속 ${streak.length}건 실패 — 전에도 실패했던 계정들입니다 (삭제·개명·비공개 계정일 수 있어요): ${streak.map((h) => '@' + h).join(', ')}`
            : `연속 ${streak.length}건 실패 — 틱톡이 막았을 가능성이 큽니다.`;
          break;
        }
        await sleep(rand(CFG.delayMs.min, CFG.delayMs.max));
        continue;
      }
      streak = [];

      if (m.found) {
        state.accounts[t.handle] = {
          status: 'found', link: m.best.link, date: ymd(m.best.createTime),
          keywords: m.best.keywords, scanned: m.scanned, hits: m.hits.length, row: t.row, at: now,
        };
        console.log(`발견 ✓  ${ymd(m.best.createTime)}  ${m.best.keywords.join(' ')}`);
      } else {
        state.accounts[t.handle] = { status: 'none', scanned: m.scanned, row: t.row, at: now };
        console.log(`해당 없음 (영상 ${m.scanned}개 확인)`);
      }
      save();

      if (i < pending.length - 1) {
        const rest = CFG.restEvery && (i + 1) % CFG.restEvery === 0;
        const ms = rest ? CFG.restMs : rand(CFG.delayMs.min, CFG.delayMs.max);
        if (rest) console.log(`         … ${Math.round(ms / 1000)}초 쉬어갑니다 (차단 예방)`);
        await sleep(ms);
      }
    }

    await closeBrowser();
  }

  // ── 시트 기입 ─────────────────────────────────────────────────────────
  // 중간에 멈췄더라도, 그때까지 찾은 링크는 기입하고 끝낸다.
  console.log('');
  let pushed = 0;
  if (!OPT.noPush) {
    const items = targets
      .filter((t) => { const s = state.accounts[t.handle]; return s && s.status === 'found' && s.link && !t.link; })
      .map((t) => ({ row: t.row, handle: t.handle, link: state.accounts[t.handle].link }));
    if (!items.length) {
      console.log('  시트에 새로 기입할 링크가 없습니다.');
    } else {
      console.log(`  시트 O열에 ${items.length}건 기입 중…`);
      try {
        const res = await pushLinks(CFG.sheet, items);
        pushed = res.updated || 0;
        console.log(`  기입 완료: ${pushed}건`);
        for (const s of res.skipped || []) console.log(`    · 건너뜀 ${s.row}행 @${s.handle || ''} — ${s.reason}`);
      } catch (e) {
        console.log('  ⚠ 시트 기입 실패: ' + ((e && e.message) || e));
        console.log('    (결과는 result.csv 에 남아 있습니다. 문제 해결 후 다시 실행하면 기입만 다시 시도합니다.)');
      }
    }
  } else {
    console.log('  시트 기입은 생략했습니다 (--no-push / --local).');
  }

  // ── 요약 ──────────────────────────────────────────────────────────────
  writeCsv(); // 이번에 새로 확인한 게 없어도 result.csv 는 항상 최신 상태로
  // 같은 계정이 여러 행에 있어도 '계정 수'로 센다 (행 수로 세면 중복 계정이 두 번 잡힌다)
  const uniq = [...new Map(targets.map((t) => [t.handle, t])).values()];
  const vals = uniq.map((t) => state.accounts[t.handle]).filter(Boolean);
  const found = vals.filter((a) => a.status === 'found').length;
  const none = vals.filter((a) => a.status === 'none').length;
  const failed = uniq.filter((t) => { const s = state.accounts[t.handle]; return s && s.status === 'fail'; });
  const dead = failed.filter((t) => isGivenUp(t.handle));       // 그만 시도하기로 한 계정
  const retryable = failed.filter((t) => !isGivenUp(t.handle));  // 다음 실행에 다시 볼 계정
  const remaining = uniq.filter((t) => !isDone(t.handle) && !isGivenUp(t.handle)).length;

  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  발견 ${found}건 · 해당없음 ${none}건 · 확인실패 ${failed.length}건 · 남은 계정 ${remaining}건`);
  console.log('  결과 파일: result.csv');

  if (stoppedReason) {
    console.log('');
    console.log('  ⛔ 중간에 멈췄습니다 — ' + stoppedReason);
    console.log('     잠시(10~30분) 뒤 다시 실행하면, 끝난 계정은 건너뛰고 남은 것부터 이어서 합니다.');
    console.log('     계속 막히면 VPN 을 켜거나 .env 의 TIKTOK_PROXY 를 설정해 보세요.');
  } else if (retryable.length) {
    console.log('');
    console.log('  확인 못 한 계정 (다시 실행하면 재시도합니다):');
    for (const t of retryable) console.log(`    · @${t.handle} — ${state.accounts[t.handle].error || ''}`);
  } else if (!remaining && !dead.length) {
    console.log('');
    console.log('  ✅ 대상 계정을 모두 확인했습니다.');
  }

  // 여러 번 시도해도 안 된 계정 — 자동으로는 더 못 하니 사람이 봐야 한다. 조용히 묻지 않는다.
  if (dead.length) {
    console.log('');
    console.log(`  ⚠ ${MAX_FAILS}번 시도해도 확인 못 한 계정 ${dead.length}건 — 직접 확인해 주세요 (계정이 삭제·개명·비공개일 수 있어요):`);
    for (const t of dead) console.log(`    · @${t.handle} — ${state.accounts[t.handle].error || ''}`);
    console.log('     (시트에는 아무것도 쓰지 않았습니다. 다시 시도하려면 result.csv 확인 후 --reset)');
  }
  console.log('');
}

process.on('SIGINT', async () => {
  console.log('\n  중단했습니다. 여기까지 결과는 저장돼 있어요 — 다시 실행하면 이어서 합니다.');
  await closeBrowser();
  process.exit(0);
});

main().catch(async (e) => {
  await closeBrowser();
  console.log('');
  console.log('  ⛔ ' + ((e && e.message) || e));
  console.log('     (여기까지 확인한 결과는 state.json / result.csv 에 저장돼 있습니다.)');
  console.log('');
  process.exit(1);
});

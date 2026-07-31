// 스캔 요청을 큐에 넣는 CLI 헬퍼(테스트·스크립트용). 실행 중인 에이전트가 이걸 집어 처리한다.
// 예)  node enqueue.js --mode upload            (무인 아님=감독 기본)
//      node enqueue.js --mode perf --unattended
//      node enqueue.js --type scan-one --row 42 --handle someuser
//      node enqueue.js --type judge-link --row 42 --link https://www.tiktok.com/@u/video/123
import { loadConfig } from './config.js';
import { createBus } from './worker-bus.js';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) opt[key] = true;
    else { opt[key] = next; i++; }
  }
}

const job = {
  type: opt.type || 'content-scan',
  mode: opt.mode || 'upload',
  campaign: opt.campaign,
  attended: !opt.unattended,          // 기본 감독. --unattended 면 무인.
  row: opt.row ? Number(opt.row) : undefined,
  handle: opt.handle,
  link: opt.link,
  source: 'cli',
};

const bus = createBus(loadConfig());
const enq = await bus.enqueue(job);
console.log('큐에 넣음:', enq.id, JSON.stringify({ type: enq.type, mode: enq.mode, attended: enq.attended, campaign: enq.campaign || '(기본)' }));

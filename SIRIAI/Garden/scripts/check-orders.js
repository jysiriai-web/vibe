// 패널에 주문 상태를 직접 물어본다. 돈은 안 나간다(조회만).
//   node scripts/check-orders.js 21925729 21931633 ...
//   인자 없으면 data/c/lun8/orders.json 의 번호 전부
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';

loadEnv();
const root = dirname(dirname(fileURLToPath(import.meta.url)));

let ids = process.argv.slice(2).map(Number).filter(Boolean);
if (!ids.length) {
  const p = join(root, 'data', 'c', 'lun8', 'orders.json');
  if (existsSync(p)) {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    ids = (Array.isArray(j) ? j : j.orders || []).map((o) => Number(o.id)).filter(Boolean);
  }
}
if (!ids.length) { console.log('조회할 주문번호가 없어요.'); process.exit(0); }

const smm = createSmm(process.env.SMMKINGS_API_KEY, process.env.SMM_API_URL);
console.log('▶ 잔액:', await smm.balance().catch((e) => '(못 읽음) ' + e.message));
console.log('▶ 주문', ids.length, '건 조회\n');

// 한 건씩 묻는다 — 다건 응답이 패널마다 모양이 달라 섞어 읽으면 오해한다.
for (const id of ids) {
  let r;
  try { r = await smm.status([id]); } catch (e) { console.log(String(id).padEnd(12), '조회 실패:', e.message); continue; }
  const v = (r && r[id]) || (r && r[String(id)]) || r || {};
  console.log(
    String(id).padEnd(12),
    String(v.status || '-').padEnd(12),
    'start=' + String(v.start_count ?? '-').padEnd(7),
    'remains=' + String(v.remains ?? '-').padEnd(6),
    'charge=' + String(v.charge ?? '-').padEnd(7),
    v.currency || ''
  );
}

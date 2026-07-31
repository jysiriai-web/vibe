// [복사본] SIRIAI/Garden/src/env.js 에서 가져온 검증된 엔진 코드입니다.
//          US_seeding 은 Garden 과 완전히 독립 실행됩니다 — 한쪽을 고쳐도 다른 쪽에 반영되지 않습니다.
// 의존성 없는 .env 로더 — dotenv 없이도 동작(키 확인 단계에서 npm install 불필요).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadEnv(path) {
  const envPath =
    path || join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return; // .env 없으면 조용히 통과
    throw e;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// 키 확인 + 서비스 카탈로그 조회. 의존성 0 — npm install 없이 바로 실행 가능.
//   node scripts/verify-smm.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';

loadEnv();

const key = process.env.SMMKINGS_API_KEY;
if (!key) {
  console.error('\n❌ SMMKINGS_API_KEY 가 .env 에 없습니다.');
  console.error('   Garden/.env 를 열어 SMMKINGS_API_KEY= 뒤에 키를 붙여넣고 저장하세요.\n');
  process.exit(1);
}

// 사용자가 지목한 틱톡 팔로워 서비스 후보
const CANDIDATE_IDS = ['5750', '3697'];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data');

function fmt(s) {
  return [
    `  #${s.service}  ${s.name}`,
    `      카테고리: ${s.category}`,
    `      단가(1000개당): ${s.rate}   min: ${s.min}   max: ${s.max}   type: ${s.type}   refill: ${s.refill}   cancel: ${s.cancel}`,
  ].join('\n');
}

const smm = createSmm(key);

try {
  console.log('\n▶ 잔액 확인...');
  const bal = await smm.balance();
  console.log(`  잔액: ${bal.balance} ${bal.currency}`);

  console.log('\n▶ 서비스 카탈로그 가져오는 중...');
  const services = await smm.services();
  if (!Array.isArray(services)) {
    throw new Error(`services 응답이 배열이 아님: ${JSON.stringify(services).slice(0, 300)}`);
  }
  console.log(`  총 ${services.length}개 서비스`);

  console.log('\n▶ 지목한 후보 서비스 (5750, 3697):');
  for (const id of CANDIDATE_IDS) {
    const s = services.find((x) => String(x.service) === id);
    console.log(s ? fmt(s) : `  #${id} — 카탈로그에 없음(또는 접근 불가)`);
  }

  const hay = (s) => `${s.name} ${s.category || ''}`.toLowerCase();
  const tiktokFollowers = services.filter(
    (s) => /tiktok/.test(hay(s)) && /follow/.test(hay(s))
  );
  console.log(`\n▶ 틱톡 팔로워 계열 서비스 ${tiktokFollowers.length}개 (단가 낮은 순 상위 15):`);
  tiktokFollowers
    .slice()
    .sort((a, b) => Number(a.rate) - Number(b.rate))
    .slice(0, 15)
    .forEach((s) => console.log(fmt(s)));

  // 나중에 내가 참고할 수 있게 덤프 저장 (data/ 는 gitignore)
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'smm-services.json'), JSON.stringify(services, null, 2));
  writeFileSync(
    join(dataDir, 'smm-tiktok-followers.json'),
    JSON.stringify(tiktokFollowers, null, 2)
  );
  console.log(`\n  (전체 카탈로그를 data/smm-services.json 에 저장함)`);

  console.log('\n✅ 키 정상 동작. 이제 스크래퍼/브레인/집행 배선으로 진행 가능.\n');
} catch (e) {
  console.error('\n❌ 실패:', e.message, '\n');
  process.exit(1);
}

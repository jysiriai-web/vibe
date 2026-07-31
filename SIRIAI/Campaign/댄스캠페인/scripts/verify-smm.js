// SMM 패널 점검 — 키·URL 이 살아 있는지, 어떤 서비스가 있는지 본다. 돈은 한 푼도 안 나간다.
// 새 패널을 붙이기 전에 반드시 이걸로 먼저 확인할 것: 패널마다 서비스 번호가 완전히 다르다.
// (같은 3693 이 A 패널에선 틱톡 팔로워, B 패널에선 엉뚱한 상품일 수 있다 — 그대로 집행하면 돈이 샌다)
//
//   node scripts/verify-smm.js                        기본(.env 의 SMMKINGS_API_KEY)
//   node scripts/verify-smm.js --find "instagram follow"
//   node scripts/verify-smm.js --url https://realsite.shop/api/v2 --keyenv REALSITE_API_KEY --find instagram
//        ↑ 권장: 키는 .env 에 두고 변수 이름만 지목한다(명령줄에 적으면 셸 기록에 남는다)
//   node scripts/verify-smm.js --id 3693              그 번호가 무슨 서비스인지 확인
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { createSmm } from '../src/smm.js';

loadEnv();

// ── 인자 파싱 (의존성 0)
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
// --keyenv 로 .env 의 다른 변수를 지목한다. 키를 명령줄에 적으면 셸 기록에 그대로 남는다.
const keyEnv = arg('keyenv', '');
const key = arg('key', keyEnv ? process.env[keyEnv] : process.env.SMMKINGS_API_KEY);
const url = arg('url', process.env.SMM_API_URL);
const find = arg('find', '');
const wantIds = argv.filter((a, i) => argv[i - 1] === '--id');

if (!key) {
  if (keyEnv) console.error('\n❌ .env 에 ' + keyEnv + ' 가 없어요. 그 줄을 추가하고 저장한 뒤 다시 실행하세요.\n');
  else console.error('\n❌ 키가 없습니다. Garden/.env 에 키를 넣고 --keyenv <변수이름> 으로 지목하세요.\n');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data');

function fmt(s) {
  return [
    `  #${s.service}  ${s.name}`,
    `      카테고리: ${s.category}`,
    `      단가(1000개당): ${s.rate}   min: ${s.min}   max: ${s.max}   type: ${s.type}   refill: ${s.refill}   cancel: ${s.cancel}`,
  ].join('\n');
}

const smm = createSmm(key, url);

try {
  console.log('\n▶ 패널:', url || '(기본 smmkings)');
  console.log('▶ 잔액 확인...');
  const bal = await smm.balance();
  console.log(`  잔액: ${bal.balance} ${bal.currency || ''}`);

  console.log('\n▶ 서비스 카탈로그 가져오는 중...');
  const services = await smm.services();
  if (!Array.isArray(services)) {
    throw new Error(`services 응답이 배열이 아님: ${JSON.stringify(services).slice(0, 300)}`);
  }
  console.log(`  총 ${services.length}개 서비스`);

  // 번호로 확인 — '이 번호가 정말 내가 생각한 그 상품인가'를 집행 전에 눈으로 본다.
  if (wantIds.length) {
    console.log(`\n▶ 지정한 서비스 번호:`);
    for (const id of wantIds) {
      const s = services.find((x) => String(x.service) === String(id));
      console.log(s ? fmt(s) : `  #${id} — 카탈로그에 없음(또는 접근 불가)`);
    }
  }

  // 이름·카테고리로 검색 — 새 패널에서 쓸 서비스를 고를 때.
  const hay = (s) => `${s.name} ${s.category || ''}`.toLowerCase();
  const terms = String(find || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hit = services.filter((s) => terms.every((t) => hay(s).includes(t)));
    console.log(`\n▶ "${find}" 검색 결과 ${hit.length}개 (단가 낮은 순 상위 15):`);
    hit.slice().sort((a, b) => Number(a.rate) - Number(b.rate)).slice(0, 15).forEach((s) => console.log(fmt(s)));
    if (!hit.length) console.log('  (없음 — 검색어를 줄여보세요. 예: instagram)');
  }

  // 패널이 무엇을 지원하는지 — refill/cancel 이 없는 패널이면 대시보드의 그 버튼은 못 쓴다.
  const yes = (v) => v === true || String(v) === 'true';
  console.log(`\n▶ 이 패널의 지원 범위: 리필 가능 ${services.filter((s) => yes(s.refill)).length}개 · 취소 가능 ${services.filter((s) => yes(s.cancel)).length}개 서비스`);

  mkdirSync(dataDir, { recursive: true });
  const stamp = String(url || 'default').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  writeFileSync(join(dataDir, `smm-services-${stamp}.json`), JSON.stringify(services, null, 2));
  console.log(`  (전체 카탈로그를 data/smm-services-${stamp}.json 에 저장함)`);

  console.log('\n✅ 키·URL 정상. 집행 전 확인할 것:');
  console.log('   ① 쓸 서비스 번호를 위 목록에서 눈으로 확인 (패널마다 번호가 다르다)');
  console.log('   ② campaigns.json 의 serviceId 를 그 번호로');
  console.log('   ③ 첫 집행은 한 계정·최소 수량으로 — 금액 확인 창의 원화가 예상과 맞는지 보고 확정\n');
} catch (e) {
  console.error('\n❌ 실패:', e.message);
  console.error('   URL·키를 확인하세요. 패널이 Perfect Panel(/api/v2) 규격이 아니면 연동 코드 수정이 필요합니다.\n');
  process.exit(1);
}

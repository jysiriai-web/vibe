// Vercel 환경변수 CAMPAIGNS_JSON 값 만들기.
// campaigns.json 의 캠페인을 '한 줄 JSON' 으로 _docs/vercel-LUN8.txt 에 쓴다.
// 실행: npm run env:vercel
//
// ⚠️ 이 값은 배포본이 아는 캠페인 목록을 **통째로 대체한다**. 여기 없는 캠페인은
//    다음 배포부터 팀 URL 에서 사라진다.
//    예전엔 이 스크립트가 LUN8 하나만 담았는데 배포본에는 두 개가 올라가 있었다.
//    그대로 붙여넣었으면 베이온이 조용히 없어졌을 것이다(2026-07-29 직전에 잡음).
//    → 이제 campaigns.json 에 있는 것을 전부 담는다. 뺄 것만 SKIP 에 적는다.
//
// 순서가 곧 기본 캠페인이다: 서버의 defaultCampaign() 은 campaigns[0] 이라
// ?campaign= 이 빠진 요청(의견 등)이 첫 번째 캠페인으로 간다. 그래서 공유 URL 의
// 주인공인 LUN8 을 맨 앞에 둔다 — 예전에 '하나만 올리는' 이유였던 문제를,
// 캠페인을 빼지 않고 푸는 방법이다.
//
// ⚠️ 산출물에 시트 주소와 토큰이 들어간다. .gitignore 로 막혀 있고, 남에게 보내지 말 것.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'campaigns.json');
const OUT = join(root, '_docs', 'vercel-LUN8.txt');

// 맨 앞(=기본)으로 둘 캠페인. 공유 URL 의 주인공이 바뀌면 여기만 고친다.
const FIRST = 'lun8';
// 클라우드에 올리지 않을 캠페인 id. 비워 두면 전부 올린다.
// ⚠️ 여기 적는 순간 그 캠페인은 팀 URL 에서 사라진다 — 정말 뺄 것만 적을 것.
const SKIP = [];

if (!existsSync(SRC)) {
  console.error('❌ campaigns.json 이 없어요. (gitignore 대상이라 이 PC에만 있습니다)');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(SRC, 'utf8'));
const all = cfg.campaigns || [];
if (!all.length) { console.error('❌ campaigns.json 에 캠페인이 없어요.'); process.exit(1); }

const kept = all.filter((c) => !SKIP.includes(c.id));
const dropped = all.filter((c) => SKIP.includes(c.id));
// FIRST 를 맨 앞으로. 나머지는 원래 순서 그대로(안정 정렬).
kept.sort((a, b) => (b.id === FIRST ? 1 : 0) - (a.id === FIRST ? 1 : 0));

// 시트를 못 읽는 캠페인이 섞이면 그 탭은 배포본에서 통째로 빈 화면이 된다 — 미리 잡는다.
const broken = kept.filter((c) => !c.sheet?.url || !c.sheet?.token);
if (broken.length) {
  console.error('❌ sheet.url / sheet.token 이 없는 캠페인: ' + broken.map((c) => c.id).join(', '));
  console.error('   없으면 클라우드가 그 캠페인의 시트를 못 읽어요.');
  process.exit(1);
}

// 되쓰기가 열번호 하드코딩이던 시절엔 readOnly 가 아니면 배포를 막았다. 지금은 헤더에서 열을 찾고
// 못 찾으면 쓰기를 거부하므로 그 이유는 없어졌다. 남은 위험은 '주소를 아는 사람이 마스터시트를
// 고칠 수 있다' 하나뿐이고, 팀 내부 공유 전제로 감수하기로 했다.
// 돈 나가는 경로는 클라우드에서 이미 죽어 있다 — SMM 키를 안 올리고, 워커 화면은 vercel.json 이 막는다.
const open = kept.filter((c) => c.readOnly !== true).map((c) => c.id);
if (open.length) {
  console.warn('⚠️  조회 전용이 아닌 캠페인: ' + open.join(', '));
  console.warn('    주소를 아는 사람은 마스터시트를 고칠 수 있어요 — 팀 내부에만 공유하세요.');
}

// fx(환율 보정)·staleDays 는 화면 계산에 쓰이므로 같이 넘긴다. 클라우드는 이 값을 못 바꾼다(읽기전용 FS).
const out = { fx: cfg.fx, staleDays: cfg.staleDays, campaigns: kept };
const json = JSON.stringify(out);

/* 돈이 나가는 키가 섞이면 안 된다. '클라우드에 SMM 키가 없다' 가 곧 '클라우드에서 돈이 안 나간다' 의
   유일한 근거라, 실수로 흘러 들어가는 경로를 여기서 막는다. */
const LEAK = [/smmkings/i, /SMMKINGS_API_KEY/, /EXECUTE_PASSWORD/, /\bapi[_-]?key\b/i];
const hit = LEAK.find((re) => re.test(json));
if (hit) {
  console.error('❌ 나가면 안 되는 값이 섞였어요 (' + hit + '). 파일을 만들지 않았습니다.');
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json); // 한 줄 — Vercel 입력칸에 통째로 붙여넣기 위함

console.log('✔ _docs/vercel-LUN8.txt 생성 — ' + json.length + '자');
console.log('  담긴 캠페인: ' + kept.map((c, i) => (i === 0 ? c.id + '(기본)' : c.id)).join(', '));
if (dropped.length) console.log('  ⚠️ 뺀 캠페인: ' + dropped.map((c) => c.id).join(', ') + ' — 팀 URL 에서 사라집니다');
console.log('');
console.log('  올리는 법 (둘 중 하나)');
console.log('   A) vercel env rm CAMPAIGNS_JSON production --yes');
console.log('      vercel env add CAMPAIGNS_JSON production < _docs/vercel-LUN8.txt');
console.log('      vercel deploy --prod --yes');
console.log('   B) 파일을 열어 전체 복사 → Vercel 환경변수 CAMPAIGNS_JSON 에 붙여넣기 → Redeploy');
console.log('  ⚠️ 시트 토큰이 들어 있어요. 남에게 보내지 마세요(깃에는 안 올라갑니다).');

// Vercel 환경변수 CAMPAIGNS_JSON 값 만들기.
// campaigns.json 에서 LUN8 만 뽑아 '한 줄 JSON' 으로 _docs/vercel-LUN8.txt 에 쓴다.
// 실행: npm run env:vercel
//
// 왜 LUN8 만 넣나 (베이온을 빼는 이유)
//  ① 공유 URL 은 LUN8 대시보드다. 베이온은 끝난 캠페인이라 팀이 볼 이유가 없다.
//  ② 베이온은 readOnly 가 아니다. 클라우드에 올리면 주소를 아는 사람이 베이온 마스터시트에
//     쓰기를 할 수 있게 된다. 안 올리면 그 경로가 아예 존재하지 않는다.
//  ③ 캠페인이 하나뿐이면 ?campaign= 이 빠진 요청(의견 등)도 무조건 LUN8 으로 간다.
//     둘을 올리면 그런 요청이 첫 번째 캠페인(베이온)으로 새어 들어간다.
//
// ⚠️ 산출물에 시트 주소와 토큰이 들어간다. .gitignore 로 막혀 있고, 남에게 보내지 말 것.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'campaigns.json');
const OUT = join(root, '_docs', 'vercel-LUN8.txt');

if (!existsSync(SRC)) {
  console.error('❌ campaigns.json 이 없어요. (gitignore 대상이라 이 PC에만 있습니다)');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(SRC, 'utf8'));
const lun8 = (cfg.campaigns || []).find((c) => c.id === 'lun8');
if (!lun8) { console.error('❌ campaigns.json 에 id=lun8 이 없어요.'); process.exit(1); }
if (!lun8.sheet?.url || !lun8.sheet?.token) {
  console.error('❌ lun8 에 sheet.url / sheet.token 이 없어요. 없으면 클라우드가 시트를 못 읽습니다.');
  process.exit(1);
}
// 예전엔 여기서 readOnly:true 가 아니면 배포를 막았다. 이유는 '되쓰기가 열번호
// 하드코딩이라 엉뚱한 열을 덮어쓴다'였는데, 되쓰기를 필드명으로 바꾸면서 그 이유는 없어졌다.
// (헤더에서 열을 찾고, 못 찾으면 폴백하지 않고 쓰기를 거부한다)
//
// 남은 위험은 하나뿐이다: 주소를 아는 사람이 마스터시트를 고칠 수 있다. 팀 내부 공유
// 전제로 감수하기로 했다. 돈이 나가는 경로는 클라우드에서 이미 죽어 있다 —
// SMM 키를 클라우드에 두지 않고(smm=null), 워커 화면은 vercel.json 이 돌려보낸다.
//
// 그래서 여기서 막는 대신, 나가는 내용에 키가 섞이지 않았는지만 확인한다.
if (lun8.readOnly !== true) {
  console.warn('⚠️  lun8 이 조회 전용이 아닙니다 — 주소를 아는 사람은 마스터시트를 고칠 수 있어요.');
  console.warn('    팀 내부에만 공유하세요. (돈 나가는 기능은 클라우드에서 이미 막혀 있습니다)');
}

// fx(환율 보정)·staleDays 는 화면 계산에 쓰이므로 같이 넘긴다. 클라우드는 이 값을 못 바꾼다(읽기전용 FS).
const out = { fx: cfg.fx, staleDays: cfg.staleDays, campaigns: [lun8] };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out)); // 한 줄 — Vercel 입력칸에 통째로 붙여넣기 위함

console.log('✔ _docs/vercel-LUN8.txt 생성');
console.log('  → 메모장으로 열어 전체 선택(Ctrl+A) 복사 → Vercel 환경변수 CAMPAIGNS_JSON 에 붙여넣기');
console.log('  ⚠️ 시트 토큰이 들어 있어요. 남에게 보내지 마세요(깃에는 안 올라갑니다).');

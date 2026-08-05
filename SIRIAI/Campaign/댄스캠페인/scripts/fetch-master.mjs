/* 마스터 데이터를 확실하게 받아 파일로 떨군다.
 *
 * 왜 있나: 구글 Apps Script 가 수시로 404/HTML/500 을 뱉는다(실측 3번 중 1번). 그걸 모르고
 * 한 번 받아서 판단하면 '0명' 같은 빈 응답을 사실로 착각한다 — 실제로 그런 보고를 한 적이 있다.
 * 여기서 재시도·검증을 끝내고, **계정이 실제로 들어 있을 때만** 성공으로 친다.
 *
 * ⚠️ 시트 CSV 내보내기를 쓰지 말 것. 서식이 적용된 '표시값' 이 와서 숫자가 문자열이 된다
 *    (실측: 추천 수 칸이 '1엔' 으로 와서 0 으로 읽혔다). 이 경로는 브릿지 원시값이다.
 *
 * 사용: node scripts/fetch-master.mjs [출력경로] [캠페인]
 */
const out = process.argv[2] || 'master.json';
const camp = process.argv[3] || 'lun8';
const BASE = process.env.GARDEN_URL || 'http://localhost:3737';
const TRIES = Number(process.env.FETCH_TRIES || 6);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = '';
for (let i = 1; i <= TRIES; i++) {
  try {
    const res = await fetch(`${BASE}/api/data?campaign=${encodeURIComponent(camp)}`, { signal: AbortSignal.timeout(300000) });
    const text = await res.text();
    if (text.trim().startsWith('<')) { last = 'HTML 오류페이지'; }
    else {
      const j = JSON.parse(text);
      if (j.error) last = String(j.error).slice(0, 60);
      else if (!(j.accounts || []).length) last = '계정 0명(빈 응답)';
      else {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(out, JSON.stringify(j));
        console.log(`✅ ${j.accounts.length}명 · 주문 ${(j.orders || []).length}건 → ${out}  (${i}번째 시도, ${new Date().toLocaleTimeString('ko-KR')})`);
        process.exit(0);
      }
    }
  } catch (e) { last = String((e && e.message) || e).slice(0, 60); }
  console.log(`  ${i}/${TRIES} 실패: ${last}`);
  if (i < TRIES) await sleep(3000 * i);   // 3·6·9·12·15초 — 구글 딸꾹질은 수십 초 단위다
}
console.error(`❌ ${TRIES}번 다 실패: ${last}`);
process.exit(1);

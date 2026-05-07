const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_PATH = path.resolve(__dirname, '../data/master.csv');
const OUT_PATH = path.resolve(__dirname, '../data/parsed-master.json');

// 인스타그램 URL에서 핸들 추출
function extractHandle(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // 비공개/없음/X 등 무효 값
  const invalid = ['없음', 'x', 'X', '비공계', '비공개', '사진작가', '외국인입니가', '촬영 파트너', 'No', '따로 없습니다'];
  if (invalid.some(v => s.toLowerCase() === v.toLowerCase())) return null;

  // instagram.com/[handle] 패턴 추출 (google search URL 포함)
  const match = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (match) return match[1];

  // @ 없이 그냥 핸들만 입력된 경우
  if (/^[A-Za-z0-9._]+$/.test(s)) return s;

  return null;
}

// "5/1", "5/2", "5/3" → "2026-05-01" 등
function parseVisitDate(raw) {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/(\d+)\/(\d+)/);
  if (!m) return null;
  return `2026-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function main() {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');

  // columns: false → 첫 행이 헤더, 이후 데이터를 배열로 처리
  const rows = parse(csv, {
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  });

  // rows[0] = 헤더행 (복잡한 컬럼명), rows[1..] = 데이터
  const dataRows = rows.slice(1);

  // 컬럼 인덱스
  // 0: 타임스탬프
  // 1: 인플루언서 성함
  // 2: 인스타그램 프로필 링크
  // 3: 동행자 유무
  // 4: 동행자 성함
  // 5: 동행자 인스타그램
  // 6: 동행자 연락처
  // 7: 최종 방문 일정 (5/1, 5/2, 5/3)
  // 8: 대체 방문 일정 (7번이 없을 때)
  // 9: 개인정보 동의
  // 10: 인플루언서 연락처

  const people = [];
  let seq = 1;

  for (const row of dataRows) {
    const name = row[1]?.trim();
    if (!name) continue;

    const igUrl       = row[2]?.trim() ?? '';
    const hasCompanion = row[3]?.trim() ?? '';
    const compName    = row[4]?.trim() ?? '';
    const compIgUrl   = row[5]?.trim() ?? '';
    const visitRaw    = row[7]?.trim() || row[8]?.trim() || '';

    const handle    = extractHandle(igUrl);
    const visitDate = parseVisitDate(visitRaw);

    people.push({
      id: `inf_${String(seq).padStart(3, '0')}`,
      name,
      handle,
      type: '인플루언서',
      visit_date: visitDate,
      matchable: !!handle,
    });

    const validCompanion =
      hasCompanion.includes('있음') &&
      compName &&
      !['', '없음', 'x', 'X', 'No', '촬영 파트너'].includes(compName);

    if (validCompanion) {
      const compHandle = extractHandle(compIgUrl);
      people.push({
        id: `comp_${String(seq).padStart(3, '0')}`,
        name: compName,
        handle: compHandle,
        type: '동행자',
        visit_date: visitDate,
        linked_influencer: name,
        matchable: !!compHandle,
      });
    }

    seq++;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(people, null, 2), 'utf-8');

  const influencers       = people.filter(p => p.type === '인플루언서');
  const companions        = people.filter(p => p.type === '동행자');
  const matchableInf      = influencers.filter(p => p.matchable);
  const matchableComp     = companions.filter(p => p.matchable);
  const skippedComp       = companions.filter(p => !p.matchable);

  console.log('파싱 완료');
  console.log(`  인플루언서: ${influencers.length}명 (매칭 대상: ${matchableInf.length}명)`);
  console.log(`  동행자:     ${companions.length}명 (매칭 대상: ${matchableComp.length}명, 스킵: ${skippedComp.length}명)`);
  console.log(`  전체 매칭 대상: ${matchableInf.length + matchableComp.length}명`);
  if (skippedComp.length) {
    console.log(`\n  [스킵 목록 - 인스타 없음]`);
    skippedComp.forEach(p => console.log(`    - ${p.name} (동행자→${p.linked_influencer})`));
  }
  console.log(`\n저장 완료: ${OUT_PATH}`);
}

main();

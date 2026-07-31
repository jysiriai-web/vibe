// 시트(CSV) → 대시보드 config 블록 변환기
// 사용: node _SIRIAI_TEMPLATE/tools/sheet-to-config.mjs <csv경로>
// 컬럼: name,handle,followers,views,er,cost   (cost 선택)
// 출력: influencers: [...] 블록 + 집계(합산 팔로워/조회수/평균 ER) 요약
import fs from 'fs';

const path = process.argv[2];
if (!path) { console.error('CSV 경로를 넣으세요: node sheet-to-config.mjs <csv>'); process.exit(1); }

const raw = fs.readFileSync(path, 'utf8').replace(/^﻿/, '');
const rows = raw.split(/\r?\n/).filter(l => l.trim().length);
const header = rows.shift().split(',').map(h => h.trim().toLowerCase());
const idx = k => header.indexOf(k);
const col = { name: idx('name'), handle: idx('handle'), followers: idx('followers'), views: idx('views'), er: idx('er'), cost: idx('cost') };

const num = v => parseInt(String(v ?? '').replace(/[^0-9.-]/g, ''), 10) || 0;
const fnum = v => parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;

const inf = rows.map((line, i) => {
  // 간단 CSV 분해(따옴표 미사용 가정). 핸들에 콤마 없을 것.
  const c = line.split(',');
  const handle = String(c[col.handle] ?? '').trim().replace(/^@/, '');
  return {
    no: i + 1,
    name: String(c[col.name] ?? '').trim(),
    followers: num(c[col.followers]),
    views: num(c[col.views]),
    er: fnum(c[col.er]),
    ig: '@' + handle,
    cost: col.cost >= 0 ? num(c[col.cost]) : 0,
  };
});

// 집계
const sumF = inf.reduce((s, x) => s + x.followers, 0);
const sumV = inf.reduce((s, x) => s + x.views, 0);
const avgEr = inf.length ? (inf.reduce((s, x) => s + x.er, 0) / inf.length) : 0;

// 출력 — config에 붙여넣을 influencers 블록
const lines = inf.map(x =>
  `                { no: ${x.no}, name: '${x.name}', followers: ${x.followers}, views: ${x.views}, er: ${x.er}, ig: '${x.ig}', costKRW: ${x.cost} },`
);

console.log('// ── 시트 → influencers (이 블록을 config의 domestic.influencers 에 붙여넣기) ──');
console.log('            influencers: [');
console.log(lines.join('\n').replace(/,$/, ''));
console.log('            ]');
console.log('');
console.log(`// 집계 확인:  ${inf.length}명 · 합산팔로워 ${sumF.toLocaleString()} · 예상조회 ${sumV.toLocaleString()} · 평균ER ${avgEr.toFixed(2)}%`);
console.log(`// → comparison.ours.value 는 ${avgEr.toFixed(1)} 권장`);

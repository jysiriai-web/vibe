// 로컬 상태 ↔ 시트 상태 대조 유틸 (호스팅 1단계 검증 게이트).
// 이 게이트가 거짓 통과하면 2단계에서 돈 로직이 잘못된 상태를 진실로 믿게 된다.

// 키 순서·undefined 를 정규화(재귀). 타입은 보존해야 하므로 값은 손대지 않는다
// → "3.4507"(문자열) vs 3.4507(숫자)는 JSON.stringify 에서 따옴표 유무로 반드시 갈린다.
export function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) { if (v[k] !== undefined) out[k] = canon(v[k]); }
    return out;
  }
  return v;
}

export const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export const byId = (arr) => Object.fromEntries((arr || []).map((o) => [String(o.id), o]));

// 양방향(전단사) 대조 — 유실(로컬⊄시트) + 유령(시트⊄로컬) + 필드 타입 변환을 모두 잡는다.
// 유령 'In progress' 행이 남으면 2단계에서 inFlightFor 를 부풀려 정당한 재가드닝을 조용히 막는다.
export function diffOrders(local, remote) {
  const L = byId(local), R = byId(remote);
  const problems = [];
  for (const k of Object.keys(L)) {
    if (!(k in R)) { problems.push(`#${k} 시트에 없음(유실!)`); continue; }
    if (!eq(L[k], R[k])) {
      const fields = new Set([...Object.keys(L[k]), ...Object.keys(R[k])]);
      for (const f of fields) {
        if (!eq(L[k][f], R[k][f])) {
          problems.push(`#${k}.${f}: 로컬=${JSON.stringify(L[k][f])}(${typeof L[k][f]}) ≠ 시트=${JSON.stringify(R[k][f])}(${typeof R[k][f]})`);
        }
      }
    }
  }
  for (const k of Object.keys(R)) {
    if (!(k in L)) problems.push(`#${k} 시트에만 있음(유령 행 — 로컬에 없는 주문)`);
  }
  return problems;
}

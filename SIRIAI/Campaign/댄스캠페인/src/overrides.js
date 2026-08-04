// 수동 편집 잠금(sticky override) — 사람이 대시보드에서 고친 검수/콘텐츠 셀을 기록.
// 자동 콘텐츠 스캔(content-core)은 여기 등록된 (row,col)을 덮어쓰지 않음.
// buildAccounts 는 이 값을 시트값·자동감지보다 최우선으로 표시. 의존성 0.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 자동 스캔이 건드리는 검수/콘텐츠 '필드' — 이 필드들만 수동 우선 잠금 대상.
// ⚠️ 열 번호가 아니라 필드명이다. 열 번호는 마스터마다 달라서(베이온 vs LUN8) 되쓰기 키로 못 쓴다.
//    이름은 브릿지(appsscript/Code.gs DEFAULT_COL/FIELD_HEADERS) 키를 그대로 따른다.
/* 검수 칸에 들어갈 수 있는 값. 마스터시트 드롭다운과 글자 하나까지 같아야 한다 —
   다르면 셀이 '잘못된 값' 경고를 달고, 사람이 드롭다운으로 고치는 순간 어휘가 갈린다.
   빈칸 = 미확인(아직 안 봄). 자동 스캔도 사람도 이 셋만 쓴다. */
export const REVIEW_OK = '준수';
export const REVIEW_NO = '미준수';
export const REVIEW_UNKNOWN = '';           // 시트에선 빈칸 = 미확인
export const reviewText = (pass) => (pass ? REVIEW_OK : REVIEW_NO);

// contentB 는 인스타 콘텐츠②(미러/추가). 스캔이 채우고 사람도 고치는 칸이라 잠금 대상이다.
// 조회수(views)는 일부러 뺐다 — 계속 자라는 숫자라 한번 잠그면 영영 멈춘다.
export const OVERRIDE_FIELDS = ['contentA', 'contentB', 'soundOk', 'soundSection', 'hashtagOk'];

/* 플랫폼별 드랍 표식 — 콘텐츠 칸에 이 값이 있으면 '이 자리는 안 채운다'는 뜻이다(주소가 아니다).
 *
 * ⚠️ 판정을 여기 한 곳에만 둔다. 처음엔 같은 정규식을 파일마다 복사해 뒀는데,
 * content-core.js 에서 정의 줄 하나가 빠진 채로 커밋돼 **틱톡 스캔이 통째로 죽었다**
 * (isDropMark is not defined — 업로드 스캔·조회수 스캔 둘 다). 규칙이 흩어져 있으면
 * 한 벌만 어긋나도 아무도 모른다. 브라우저 쪽(lun8.html·worker.html)은 import 를 못 쓰므로
 * 같은 정규식을 쓰되, 바꿀 일이 생기면 **여기와 그 두 곳을 반드시 같이** 고칠 것. */
export const DROP_MARK_RE = /^(드랍|드롭|drop)$/i;
export const isDropMark = (v) => DROP_MARK_RE.test(String(v == null ? '' : v).trim());
// 대시보드에서 편집 허용하는 필드(화이트리스트). nick·link·notice·schedDate·memo 는
// 자동스캔이 안 건드려서 잠금(OVERRIDE) 대상은 아니고 편집만 허용.
export const EDITABLE_FIELDS = ['nick', 'link', 'notice', 'contentA', 'schedDate', 'fixedDate', 'soundOk', 'soundSection', 'hashtagOk', 'memo', 'mirror',
  // 업로드·납품 모달에서 직접 고치는 값들. 없으면 서버가 400 으로 되돌려 '저장했는데 안 남는다'가 된다.
  'contentB', 'views',
  /* 팔로워 — 신규 인원 두어 명 때문에 전체 스캔(5~10분)을 돌리는 건 낭비라 손으로 넣는다.
     ⚠️ 잠금(OVERRIDE) 대상은 아니다. 계속 변하는 숫자라 한번 잠그면 스캔이 영영 못 고친다 —
     조회수를 뺀 것과 같은 이유다. 손입력은 다음 스캔이 실측으로 덮는 게 맞다. */
  'followers',
  // 정산 탭. 자동 스캔이 안 건드리는 칸이라 잠금(OVERRIDE) 대상은 아니고 편집만 허용한다.
  'pay', 'best', 'override', 'paid', 'settleMemo'];

// ── 마이그레이션 호환 계층 ──────────────────────────────────────────────
// 기존 잠금은 베이온 열 번호를 키로 저장돼 있다: { "9": { "17": "...", "19": "..." } }.
// 필드 키로 바꾸면서 이걸 그냥 두면 잠금이 전부 무시돼, 다음 스캔이 사람이 고친 칸을 덮어쓴다.
// 그래서 '읽을 때' 숫자 키를 필드명으로 옮겨준다(베이온 DEFAULT_COL 역매핑). 쓸 때는 필드명으로만 쓴다.
export const LEGACY_COL_FIELD = {
  3: 'nick', 4: 'link', 6: 'gardening', 16: 'notice', 17: 'contentA', 18: 'schedDate',
  19: 'soundOk', 20: 'soundSection', 21: 'hashtagOk', 22: 'memo',
  27: 'views', 28: 'likes', 29: 'comments', 30: 'shares',
};
// 숫자 키 → 필드 키. 같은 칸이 양쪽 키로 있으면 필드 키(새것)가 이긴다.
// (JS 객체는 정수형 키를 먼저 돌려주므로, 반드시 숫자를 먼저 깔고 필드로 덮어써야 순서가 보장된다.)
export function normalizeOverrides(all) {
  const out = {};
  for (const row of Object.keys(all || {})) {
    const src = all[row];
    if (!src || typeof src !== 'object') continue;
    const dst = {};
    for (const k of Object.keys(src)) {
      if (!/^\d+$/.test(k)) continue;
      const f = LEGACY_COL_FIELD[Number(k)];
      if (f) dst[f] = src[k]; // 모르는 옛 열번호는 버린다 — 어느 필드인지 모르면 쓰는 게 더 위험
    }
    for (const k of Object.keys(src)) if (!/^\d+$/.test(k)) dst[k] = src[k];
    if (Object.keys(dst).length) out[String(row)] = dst;
  }
  return out;
}

function file(dataDir) { return join(dataDir, 'overrides.json'); }

export function loadOverrides(dataDir) {
  const p = file(dataDir);
  if (!existsSync(p)) return {};
  // 읽는 순간 필드 키로 정규화 — 옛 열번호 키로 저장된 잠금도 그대로 살아 있게(사고 방지).
  try { return normalizeOverrides(JSON.parse(readFileSync(p, 'utf8')) || {}); } catch { return {}; }
}

// (row,field) 수동값 기록. field 가 OVERRIDE_FIELDS 가 아니면 잠그지 않음(닉 등).
export function setOverride(dataDir, row, field, value) {
  if (!OVERRIDE_FIELDS.includes(String(field))) return;
  const all = loadOverrides(dataDir);
  const key = String(row);
  all[key] = all[key] || {};
  all[key][String(field)] = value;
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2));
}

// (row,col) 수동 잠금 해제 — '미확인'으로 되돌리면 자동 관리에 반환(다음 스캔이 다시 채움).
export function clearOverride(dataDir, row, field) {
  const all = loadOverrides(dataDir);
  const key = String(row);
  if (!all[key] || !(String(field) in all[key])) return;
  delete all[key][String(field)];
  if (!Object.keys(all[key]).length) delete all[key];
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2));
}

// content-scan 이 (row,field) 를 덮어써도 되는지 — 수동 잠금이면 false.
// overrides 는 loadOverrides/readOverrides 를 거쳐 이미 필드 키로 정규화된 것이어야 한다.
export function isLocked(overrides, row, field) {
  const r = overrides[String(row)];
  return !!(r && Object.prototype.hasOwnProperty.call(r, String(field)));
}

// 플랫폼이 둘로 갈린 뒤로 화면은 잠금을 항상 접두어로 보낸다('tk.hashtagOk').
// 그런데 스캔 쪽은 맨 필드명으로 물었다 → 사람이 고친 칸을 다음 스캔이 그대로 덮어썼다.
// 저장은 접두어 그대로, 조회는 접두어판과 맨판 둘 다 — 베이온에 쌓인 옛 잠금도 살려야 한다.
export function isLockedField(overrides, row, field, plat) {
  return isLocked(overrides, row, field) || (!!plat && isLocked(overrides, row, plat + '.' + field));
}

// 'tk.hashtagOk' → 'hashtagOk'. 화이트리스트 검사는 항상 이 맨 이름으로 한다.
export function baseFieldOf(field) {
  const f = String(field);
  const dot = f.indexOf('.');
  return dot > 0 ? f.slice(dot + 1) : f;
}

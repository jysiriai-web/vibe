// 수동 편집 잠금(sticky override) — 사람이 대시보드에서 고친 검수/콘텐츠 셀을 기록.
// 자동 콘텐츠 스캔(content-core)은 여기 등록된 (row,col)을 덮어쓰지 않음.
// buildAccounts 는 이 값을 시트값·자동감지보다 최우선으로 표시. 의존성 0.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 자동 스캔이 건드리는 검수/콘텐츠 열 — 이 열들만 수동 우선 잠금 대상.
export const OVERRIDE_COLS = [17, 19, 20, 21];
// 대시보드에서 편집 허용하는 열 (닉3·콘텐츠17·음원19·음원구간20·해시태그21).
export const EDITABLE_COLS = [3, 17, 19, 20, 21];

function file(dataDir) { return join(dataDir, 'overrides.json'); }

export function loadOverrides(dataDir) {
  const p = file(dataDir);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')) || {}; } catch { return {}; }
}

// (row,col) 수동값 기록. col 이 OVERRIDE_COLS 가 아니면 잠그지 않음(닉 등).
export function setOverride(dataDir, row, col, value) {
  if (!OVERRIDE_COLS.includes(Number(col))) return;
  const all = loadOverrides(dataDir);
  const key = String(row);
  all[key] = all[key] || {};
  all[key][String(col)] = value;
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2));
}

// (row,col) 수동 잠금 해제 — '미확인'으로 되돌리면 자동 관리에 반환(다음 스캔이 다시 채움).
export function clearOverride(dataDir, row, col) {
  const all = loadOverrides(dataDir);
  const key = String(row);
  if (!all[key] || !(String(col) in all[key])) return;
  delete all[key][String(col)];
  if (!Object.keys(all[key]).length) delete all[key];
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2));
}

// content-scan 이 (row,col) 을 덮어써도 되는지 — 수동 잠금이면 false.
export function isLocked(overrides, row, col) {
  const r = overrides[String(row)];
  return !!(r && Object.prototype.hasOwnProperty.call(r, String(col)));
}

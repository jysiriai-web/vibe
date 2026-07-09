// sync 공용 로직 — 시트 계정 읽고 → 팔로워 스크랩 → 시트 되쓰기 → scan-latest.json.
// 최적화(#7): 팔로워 없는 계정 + 가드닝 집행된 계정(드롭 예상)만 스캔. 나머진 이전 값 유지. full=true면 전체.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet } from './sheet.js';
import { scanAccounts } from './execute-core.js';
import { loadOrders } from './orders.js';

function prevCurrents(campaign) {
  const p = join(campaign.dataDir, 'scan-latest.json');
  if (!existsSync(p)) return {};
  try {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    const m = {};
    (d.accounts || []).forEach((a) => { m[a.handle] = a.current; });
    return m;
  } catch { return {}; }
}

export async function runSync(campaign, { onProgress, full = false } = {}) {
  const accounts = await getAccountsFromSheet(campaign.sheet);
  const prev = prevCurrents(campaign);
  const gardened = new Set(loadOrders(campaign.dataDir).map((o) => o.handle));

  // 스캔 대상: 팔로워 없음 + 가드닝 집행됨(드롭 예상) + 닉네임 빈 계정(자동채움용). full이면 전체.
  // 닉 빈 계정은 한 번 스캔→시트에 닉 채워지면 다음부턴 자동 제외(셀프 해소).
  const targets = full
    ? accounts
    : accounts.filter((a) => prev[a.handle] == null || gardened.has(a.handle) || !String(a.nick || '').trim());

  const scanned = await scanAccounts(targets, { onProgress });
  const scannedCur = {};
  scanned.forEach((a) => { scannedCur[a.handle] = a.current; });

  // 시트 되쓰기: 새로 스캔한 것만
  const updates = scanned.filter((a) => a.current != null).map((a) => ({ row: a.row, followers: a.current }));
  let written = 0;
  try { written = await pushFollowersToSheet(campaign.sheet, updates); } catch {}

  // 닉네임 자동채움(#8): 시트 닉이 비어있고 스크랩으로 잡힌 것만 3열에 되쓰기
  const nickCells = scanned
    .filter((a) => a.row && a.scrapedNick && !String(a.nick || '').trim())
    .map((a) => ({ row: a.row, col: 3, value: a.scrapedNick }));
  let nicksWritten = 0;
  if (nickCells.length) { try { nicksWritten = await pushCellsToSheet(campaign.sheet, nickCells); } catch {} }

  // 병합: 대상은 새 값, 나머진 이전 값 유지
  const mergedAccounts = accounts.map((a) => ({
    company: a.company,
    handle: a.handle,
    row: a.row,
    current: a.handle in scannedCur ? scannedCur[a.handle] : (a.handle in prev ? prev[a.handle] : null),
    sheetFollowers: a.sheetFollowers,
  }));

  const out = {
    ranAt: new Date().toISOString(),
    target: campaign.target,
    min: campaign.min,
    written,
    nicksWritten,
    scannedCount: targets.length,
    total: accounts.length,
    accounts: mergedAccounts,
  };
  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, 'scan-latest.json'), JSON.stringify(out, null, 2));
  return out;
}

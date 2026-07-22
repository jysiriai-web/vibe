// sync 공용 로직 — 시트 계정 읽고 → 팔로워 스크랩 → 시트 되쓰기 → scan-latest.json.
// 최적화(#7): 팔로워 없는 계정 + 가드닝 집행된 계정(드롭 예상)만 스캔. 나머진 이전 값 유지. full=true면 전체.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountsFromSheet, pushFollowersToSheet, pushCellsToSheet } from './sheet.js';
import { scanAccounts } from './execute-core.js';
import { readOrders, localOrders } from './store.js';

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
  const all = await getAccountsFromSheet(campaign.sheet);
  // 틱톡 스캐너는 틱톡 계정만 본다. 인스타 전용(plat==='ig')은 틱톡 링크가 없으므로
  // 긁을 대상도 아니고, 긁으면 인스타 핸들로 검색해 엉뚱한 값을 틱톡 열에 쓴다.
  const accounts = all.filter((a) => a.plat !== 'ig');
  const igOnly = all.length - accounts.length;
  if (igOnly) console.log('[스캔] 인스타 전용 ' + igOnly + '명 제외 (틱톡 계정 없음)');
  const prev = prevCurrents(campaign);
  // 시트 모드면 시트 주문 기준(로컬만 보면 대상이 어긋남). 시트를 못 읽으면 로컬로 폴백.
  let _ords; try { _ords = await readOrders(campaign); } catch { _ords = localOrders(campaign); }
  const gardened = new Set(_ords.map((o) => o.handle));

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
  let written = 0, writeError = null;
  // 조용히 삼키면 '스캔 완료 N개' 라고 답하면서 시트엔 한 칸도 안 들어간다.
  try { written = await pushFollowersToSheet(campaign.sheet, updates); }
  catch (e) { writeError = String((e && e.message) || e); }

  // 닉네임 자동채움(#8): 시트 닉이 비어있고 스크랩으로 잡힌 것만 nick 필드에 되쓰기
  // (3열 고정이었다 → 마스터마다 닉 열 위치가 달라 필드명으로 바꿈)
  const nickCells = scanned
    .filter((a) => a.row && a.scrapedNick && !String(a.nick || '').trim())
    .map((a) => ({ row: a.row, field: 'nick', value: a.scrapedNick }));
  let nicksWritten = 0;
  if (nickCells.length) {
    try { nicksWritten = await pushCellsToSheet(campaign.sheet, nickCells); }
    catch (e) { if (!writeError) writeError = String((e && e.message) || e); }
  }

  // 병합: 이번에 실제 숫자를 받았으면 그 값, 아니면(스캔 안 함 or 스캔 실패=null) 이전 값 유지.
  //  ⚠️ 스캔했지만 실패한 계정은 scannedCur 에 키가 null 로 들어온다. 예전엔 그 null 로
  //     이전 값(수기 입력 포함)을 덮어써 팔로워 기록이 사라졌다. null 이면 prev 로 폴백한다.
  const mergedAccounts = accounts.map((a) => ({
    company: a.company,
    handle: a.handle,
    row: a.row,
    current: scannedCur[a.handle] != null ? scannedCur[a.handle] : (a.handle in prev ? prev[a.handle] : null),
    sheetFollowers: a.sheetFollowers,
  }));

  const out = {
    ranAt: new Date().toISOString(),
    target: campaign.target,
    min: campaign.min,
    written,
    nicksWritten,
    // 예전엔 targets.length 였다 — 전건 실패해도 '완료 N개' 로 보였다. 실제로 값을 받은 수만 센다.
    scannedCount: scanned.filter((a) => a.current != null).length,
    scanTried: targets.length,
    scanFailed: scanned.filter((a) => a.current == null).length,
    writeError,
    total: accounts.length,
    accounts: mergedAccounts,
  };
  mkdirSync(campaign.dataDir, { recursive: true });
  writeFileSync(join(campaign.dataDir, 'scan-latest.json'), JSON.stringify(out, null, 2));
  return out;
}

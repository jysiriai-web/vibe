// 시트 브릿지 클라이언트 — Apps Script 웹앱 호출. 캠페인별 {url, token} 받음. 의존성 0.

function ensure(sheet) {
  if (!sheet || !sheet.url || !sheet.token) {
    throw new Error('캠페인 시트 설정(url/token)이 없습니다. campaigns.json 확인.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 브릿지 호출 공용. Apps Script 는 가끔 JSON 대신 HTML 오류페이지를 순간적으로 뱉는다(구글 일시 오류).
// 그때 res.json() 이 'Unexpected token <' 로 크래시하던 것 → 응답을 텍스트로 받아 파싱, 실패 시 재시도.
// 여기 쓰기(cells·updates·sync·deliver)는 전부 idempotent(같은 값/중복제외)라 재시도해도 안전하다.
async function bridgeCall(url, opts, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    let text = null;
    try {
      const res = await fetch(url, { redirect: 'follow', ...opts });
      text = await res.text();
    } catch (e) {
      lastErr = e; // 네트워크 오류 → 재시도
      if (i < tries - 1) { await sleep(500 * (i + 1)); continue; }
      throw lastErr;
    }
    let data;
    try { data = JSON.parse(text); }
    catch {
      lastErr = new Error('브릿지가 JSON이 아닌 응답을 줬어요 (구글 Apps Script 일시 오류 — 잠시 후 다시 시도하세요).');
      if (i < tries - 1) { await sleep(500 * (i + 1)); continue; } // HTML 오류페이지 → 재시도
      throw lastErr;
    }
    if (data.error) throw new Error('시트 응답: ' + data.error); // 브릿지가 명시한 오류 = 진짜 오류, 재시도 안 함
    return data;
  }
  throw lastErr || new Error('브릿지 호출 실패');
}

const bridgePost = (sheet, payload) =>
  bridgeCall(sheet.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sheet.token, ...payload }) });

export async function getAccountsFromSheet(sheet) {
  ensure(sheet);
  const data = await bridgeCall(`${sheet.url}?action=list&token=${encodeURIComponent(sheet.token)}`, {});
  return data.accounts || [];
}

// updates: [{ row, followers }]
export async function pushFollowersToSheet(sheet, updates) {
  ensure(sheet);
  return (await bridgePost(sheet, { updates })).updated || 0;
}

// 모집시트 → 마스터 자동 동기화 요청. sync = { sheetId, company, linkCol }.
export async function syncRecruitToSheet(sheet, sync) {
  ensure(sheet);
  return await bridgePost(sheet, { sync });
}

// 검수완료 콘텐츠 → 납품시트(다른 스프레드시트)에 기입. deliver = { sheetId, rows:[{nick,link,contentLink,viewNote}] }.
export async function deliverToSheet(sheet, deliverySheetId, rows) {
  ensure(sheet);
  return await bridgePost(sheet, { deliver: { sheetId: deliverySheetId, rows } });
}

// 임의 셀 쓰기: cells = [{ row, field, value }] — 콘텐츠 링크·검수·조회수 되쓰기용.
// field 는 브릿지(Code.gs)의 COL 키. 브릿지가 헤더에서 실제 열을 찾아 쓴다(마스터마다 열이 달라도 안전).
export async function pushCellsToSheet(sheet, cells) {
  ensure(sheet);
  // 안전장치: 열 번호로 쓰는 경로가 하나라도 남아 있으면 다른 마스터에서 조용히 엉뚱한 열을 덮어쓴다.
  // 조용한 데이터 파손보다 시끄러운 실패가 낫다 → 여기서 막는다.
  const bad = (cells || []).filter((c) => !c || typeof c.field !== 'string' || !c.field);
  if (bad.length) {
    throw new Error('셀 쓰기는 필드명(field)으로만 합니다 — 열 번호(col)를 쓰는 호출부가 남아 있어요: ' + JSON.stringify(bad.slice(0, 3)));
  }
  const r = await bridgePost(sheet, { cells });
  // 브릿지가 필드를 못 알아들으면 skipped 로 돌려준다. 이걸 안 보면 '아무것도 안 써졌는데 성공'이 된다.
  if (r && Array.isArray(r.skipped) && r.skipped.length) {
    throw new Error('마스터시트에서 이 항목의 열을 못 찾았어요: ' + [...new Set(r.skipped)].join(', ')
      + ' — 시트 헤더 이름을 확인하거나 브릿지 별칭에 추가해야 합니다(엉뚱한 열을 덮어쓰지 않으려고 쓰기를 멈췄어요).');
  }
  const updated = (r && r.updated) || 0;
  if (cells.length && !updated) {
    throw new Error('마스터시트에 아무것도 안 써졌어요 — 브릿지가 옛 버전이라 필드명을 모를 수 있어요(재배포 필요).');
  }
  return updated;
}

// 의견 남기기 — 마스터 데이터와 분리된 '의견' 탭. 읽기전용 캠페인에서도 열려 있다.
export async function readFeedbackFromSheet(sheet) {
  ensure(sheet);
  const data = await bridgeCall(`${sheet.url}?action=feedback&token=${encodeURIComponent(sheet.token)}`, {});
  return data.feedback || [];
}
export async function addFeedbackToSheet(sheet, feedback) {
  ensure(sheet);
  return await bridgePost(sheet, { feedback });
}
export async function markFeedbackDone(sheet, row) {
  ensure(sheet);
  return await bridgePost(sheet, { feedbackDone: row });
}

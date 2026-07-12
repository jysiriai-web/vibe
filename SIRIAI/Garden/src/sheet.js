// 시트 브릿지 클라이언트 — Apps Script 웹앱 호출. 캠페인별 {url, token} 받음. 의존성 0.

function ensure(sheet) {
  if (!sheet || !sheet.url || !sheet.token) {
    throw new Error('캠페인 시트 설정(url/token)이 없습니다. campaigns.json 확인.');
  }
}

export async function getAccountsFromSheet(sheet) {
  ensure(sheet);
  const res = await fetch(
    `${sheet.url}?action=list&token=${encodeURIComponent(sheet.token)}`,
    { redirect: 'follow' }
  );
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data.accounts || [];
}

// updates: [{ row, followers }]
export async function pushFollowersToSheet(sheet, updates) {
  ensure(sheet);
  const res = await fetch(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, updates }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data.updated || 0;
}

// 모집시트 → 마스터 자동 동기화 요청. sync = { sheetId, company, linkCol }.
export async function syncRecruitToSheet(sheet, sync) {
  ensure(sheet);
  const res = await fetch(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, sync }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data;
}

// 검수완료 콘텐츠 → 납품시트(다른 스프레드시트)에 기입. deliver = { sheetId, rows:[{nick,link,contentLink,viewNote}] }.
export async function deliverToSheet(sheet, deliverySheetId, rows) {
  ensure(sheet);
  const res = await fetch(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, deliver: { sheetId: deliverySheetId, rows } }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data;
}

// 임의 셀 쓰기: cells = [{ row, col, value }] — 콘텐츠 링크·검수·조회수 되쓰기용
export async function pushCellsToSheet(sheet, cells) {
  ensure(sheet);
  const res = await fetch(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, cells }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (data.error) throw new Error('시트 응답: ' + data.error);
  return data.updated || 0;
}

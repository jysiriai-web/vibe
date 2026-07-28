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

// 토큰을 본문과 URL 양쪽에 싣는다.
// Apps Script 의 /exec 는 POST 에 302 로 답하는데, fetch 가 그걸 따라가면 규격상
// POST→GET 으로 바뀌며 본문이 버려진다 → 본문에만 토큰이 있으면 unauthorized 가 뜬다.
// (쓰기 자체는 리다이렉트 전에 끝나 있어서 '써졌는데 실패라고 보고'하는 상태가 된다)
const bridgePost = (sheet, payload) =>
  bridgeCall(`${sheet.url}?token=${encodeURIComponent(sheet.token)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sheet.token, ...payload }) });

export async function getAccountsFromSheet(sheet) {
  ensure(sheet);
  const data = await bridgeCall(`${sheet.url}?action=list&token=${encodeURIComponent(sheet.token)}`, {});
  // 헤더행을 못 찾았으면 브릿지가 '추측한 좌표'로 읽어 온 값이다. 쓰기는 이미 막혀 있으니
  // 읽기도 같이 막는다 — 남의 열을 우리 값이라고 화면에 띄우는 게 더 위험하다.
  if (data.colinfo && data.colinfo.headerFound === false) {
    throw new Error('마스터 헤더행(계정링크 + 닉네임/진행사)을 못 찾았어요 — 열 위치를 몰라 값을 읽지 않았습니다. 시트 헤더 이름을 확인해 주세요.');
  }
  return data.accounts || [];
}

// updates: [{ row, followers }]
export async function pushFollowersToSheet(sheet, updates) {
  ensure(sheet);
  return (await bridgePost(sheet, { updates })).updated || 0;
}

// 인원 한 명 추가 — 마스터 맨 아래에 한 줄. { company, tkLink, igLink, email }.
// 브릿지가 {error} 를 주면 bridgeCall 이 throw 하므로, 호출부가 그 메시지를 그대로 사용자에게 보인다.
export async function addPersonToSheet(sheet, person) {
  ensure(sheet);
  const r = await bridgePost(sheet, { addPerson: person });
  return { row: r.row };
}

// 모집시트 → 마스터 자동 동기화 요청. sync = { sheetId, company, linkCol }.
export async function syncRecruitToSheet(sheet, sync) {
  ensure(sheet);
  // 구글이 POST 응답을 리다이렉트로 돌리면 doGet 결과(계정 목록)가 돌아온다.
  // doPost 는 이미 돈 뒤라 '실패'라고 말하면 거짓말이다 — 행 수를 직접 세서 판정한다.
  const before = (await getAccountsFromSheet(sheet)).length;
  let r;
  try { r = await bridgePost(sheet, { sync }); }
  catch (e) { r = { _err: e.message }; }
  if (r && r.added !== undefined) return r;              // 정상 응답
  const after = (await getAccountsFromSheet(sheet)).length;
  const added = Math.max(0, after - before);
  if (added > 0) return { added, handles: [], viaCount: true };
  if (r && r._err) throw new Error(r._err);
  // 늘지 않았다 = 새 지원자가 없었거나 브릿지가 sync 를 모른다. 둘을 구분해 알린다.
  if (r && r.accounts) return { added: 0, handles: [], viaCount: true };
  return { added: undefined };
}

// 시트에 심어둔 셋업 함수를 원격 실행. 이름은 Code.gs 의 화이트리스트에만 있는 것만 통한다.
export async function runSheetSetup(sheet, name) {
  ensure(sheet);
  return await bridgePost(sheet, { setup: name });
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
    // 사유까지 붙인다 — '열을 못 찾았다' 하나로는 헤더 오타인지 플랫폼 열이 없는 건지 구분이 안 된다.
    const why = Array.isArray(r.skipReasons) && r.skipReasons.length ? ' (' + [...new Set(r.skipReasons)].join(' / ') + ')' : '';
    throw new Error('마스터시트에서 이 항목의 열을 못 찾았어요: ' + [...new Set(r.skipped)].join(', ') + why
      + ' — 시트 헤더 이름을 확인하거나 브릿지 별칭에 추가해야 합니다(엉뚱한 열을 덮어쓰지 않으려고 쓰기를 멈췄어요).');
  }
  // 리다이렉트로 POST 가 GET 이 되면 목록 응답(accounts)이 돌아온다 — 쓰기 결과가 아니다.
  // 이때 '실패'라고 해도 '성공'이라고 해도 거짓말이다. 확인 불가라고 그대로 말한다.
  if (r && r.accounts && r.updated == null) {
    throw new Error('시트에 썼는지 확인이 안 됐어요 (구글이 응답을 리다이렉트로 돌렸어요). 시트를 직접 확인해 주세요 — 보통은 써져 있습니다.');
  }
  const updated = (r && r.updated) || 0;
  if (cells.length && !updated) {
    throw new Error('마스터시트에 아무것도 안 써졌어요 — 브릿지가 옛 버전이라 필드명을 모를 수 있어요(재배포 필요).');
  }
  return updated;
}

// 의견 남기기 — 마스터 데이터와 분리된 '의견' 탭. 읽기전용 캠페인에서도 열려 있다.
/* _state 탭 읽기·쓰기 — overrides/best 와 같은 자리에 스캔 시각(scans)도 둔다.
   배포본엔 data/ 가 없어 로컬 파일을 못 읽으므로, 시트가 유일한 공유 경로다. */
export async function readStateFromSheet(sheet) {
  ensure(sheet);
  return bridgeCall(`${sheet.url}?action=state&token=${encodeURIComponent(sheet.token)}`, {});
}
/* ⚠️ 브릿지 writeState_ 는 '아는 키'만 저장하고, 모르는 키는 조용히 건너뛴 뒤 {written:N} 을
   200 으로 돌려준다. 그래서 화이트리스트에 안 적힌 키는 예외도 로그도 없이 사라진다 —
   startFol 121건이 정확히 이렇게 증발했다(서버는 성공했다고 믿었다).
   보낸 키 수보다 적게 써졌으면 여기서 터뜨린다. 조용한 실패보다 시끄러운 실패가 낫다. */
export async function writeStateToSheet(sheet, state) {
  ensure(sheet);
  const keys = Object.keys(state || {});
  const r = await bridgePost(sheet, { state });
  const written = Number(r && r.written);
  if (keys.length && Number.isFinite(written) && written < keys.length) {
    throw new Error(`_state 쓰기가 일부만 됐어요 — 보낸 키 ${keys.join(', ')} 중 ${written}개만 저장. `
      + '브릿지(appsscript/lun8/code.gs.js)의 STATE_KEYS 에 새 키를 넣고 clasp push + 새 버전 배포를 하셔야 해요.');
  }
  return r;
}

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

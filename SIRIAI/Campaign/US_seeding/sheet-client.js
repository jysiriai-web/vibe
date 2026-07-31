// 시트 브릿지 클라이언트 — 이 도구 전용 Apps Script 웹앱 호출. 의존성 0.
// 호출 패턴(JSON 아니면 재시도)은 ../src/sheet.js 의 검증된 방식을 그대로 옮겼다.
// Apps Script 는 가끔 JSON 대신 HTML 오류페이지를 순간적으로 뱉는다(구글 일시 오류).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bridgeCall(url, opts, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    let text = null;
    try {
      const res = await fetch(url, { redirect: 'follow', ...opts });
      text = await res.text();
    } catch (e) {
      lastErr = e; // 네트워크 오류 → 재시도
      if (i < tries - 1) { await sleep(800 * (i + 1)); continue; }
      throw lastErr;
    }
    let data;
    try { data = JSON.parse(text); }
    catch {
      lastErr = new Error('브릿지가 JSON이 아닌 응답을 줬어요 (구글 Apps Script 일시 오류 — 잠시 후 다시 시도하세요).');
      if (i < tries - 1) { await sleep(800 * (i + 1)); continue; }
      throw lastErr;
    }
    if (data.error) throw new Error('시트 응답: ' + data.error); // 브릿지가 명시한 오류 = 진짜 오류, 재시도 안 함
    return data;
  }
  throw lastErr || new Error('브릿지 호출 실패');
}

function ensure(sheet) {
  if (!sheet || !sheet.url || !sheet.token || /여기에/.test(sheet.url)) {
    throw new Error('config.json 의 sheet.url / sheet.token 이 아직 안 채워졌어요. README.md 의 1회 설정을 먼저 해주세요.');
  }
}

// 대상 탭의 계정 목록 → { header, rows:[{ row, handle, link }] }
// handle 은 @ 없는 소문자, link 는 지금 O열에 들어있는 값(빈 문자열이면 미기입).
export async function listRows(sheet) {
  ensure(sheet);
  return await bridgeCall(`${sheet.url}?action=list&token=${encodeURIComponent(sheet.token)}`, {});
}

// O열 기입. items = [{ row, handle, link }].
// handle 을 같이 보내는 이유: 스캔하는 몇 분 사이 시트에 행이 삽입되면 row 가 밀린다.
// 브릿지가 그 행의 B열이 아직 같은 계정인지 다시 확인하고, 아니면 건너뛴다(엉뚱한 행 오염 방지).
export async function pushLinks(sheet, items) {
  ensure(sheet);
  return await bridgeCall(sheet.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sheet.token, links: items }),
  });
}

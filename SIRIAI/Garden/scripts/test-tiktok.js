// 틱톡 팔로워 읽기 테스트 — 네 PC(가정용 IP)에서 실제로 되는지 확인. 의존성 0.
//   node scripts/test-tiktok.js                       (시트에서 뽑은 샘플 계정으로)
//   node scripts/test-tiktok.js @ruto__39 @k_n_m07    (직접 지정도 가능)

// 시트 실제 계정 샘플: 정상(팔로워 많음) + 가드닝 대상(적음) 섞음
const SAMPLES = ['maru_changho', 'ruto__39', 'hijk_z_az', 'k_n_m07'];

function toHandle(s) {
  s = String(s).trim();
  const m = s.match(/@([A-Za-z0-9._]+)/);
  return m ? m[1] : s.replace(/^@/, '');
}

async function fetchFollowers(handle) {
  const url = `https://www.tiktok.com/@${handle}`;
  let res, html;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
    });
    html = await res.text();
  } catch (e) {
    return { ok: false, reason: `네트워크 오류: ${e.message}` };
  }
  // 차단 페이지(빈 껍데기 "Please wait") 감지
  if (html.length < 4000 && /please wait/i.test(html)) {
    return { ok: false, reason: `차단(Please wait, ${html.length}b) — 이 방법으론 막힘` };
  }
  // 1) 정식 JSON 블록에서 파싱
  const m = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const stats =
        data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo?.stats;
      if (stats && Number.isFinite(stats.followerCount)) {
        return { ok: true, followers: stats.followerCount, via: 'JSON' };
      }
    } catch {
      /* 아래 정규식 폴백으로 */
    }
  }
  // 2) 정규식 폴백
  const r = html.match(/"followerCount":(\d+)/);
  if (r) return { ok: true, followers: Number(r[1]), via: 'regex' };

  return { ok: false, reason: `팔로워 못 찾음 (응답 ${html.length}b — 부분차단/구조변경)` };
}

const args = process.argv.slice(2);
const handles = (args.length ? args : SAMPLES).map(toHandle);

console.log(`\n▶ ${handles.length}개 계정 팔로워 읽기 테스트 (네 PC IP에서)\n`);
let ok = 0;
for (const h of handles) {
  process.stdout.write(`  @${h} ... `);
  const r = await fetchFollowers(h);
  if (r.ok) {
    ok++;
    console.log(`✅ ${r.followers.toLocaleString()} 팔로워 (${r.via})`);
  } else {
    console.log(`❌ ${r.reason}`);
  }
  await new Promise((res) => setTimeout(res, 1500)); // 예의상 지연
}

console.log(`\n결과: ${ok}/${handles.length} 성공.`);
if (ok === handles.length) {
  console.log('→ 네 PC에서 무료 스크래핑 정상. 이대로 진행 가능! ✅\n');
} else if (ok > 0) {
  console.log('→ 일부만 됨. 지연 늘리거나 실제 브라우저(Playwright) 방식 병행 검토.\n');
} else {
  console.log('→ 이 방법으론 막힘. 실제 브라우저(Playwright) 방식으로 전환할게.\n');
}

// 키워드 매칭 — 한 영상이 지정 키워드 중 '하나라도' 썼는지 판정 (OR).
//
// tagsOf / authorRaw / sameAuthor 는 ../src/content-detect.js 의 검증된 로직을 그대로 옮긴 것이다.
// (기존 캠페인 대시보드 파일은 읽기 전용이라 export 를 추가하지 않고 이식했다. 로직 변경 없음.)
// 다른 점은 판정 방식뿐: 캠페인 감지는 '지정 태그 전부 AND', 여기는 '아무거나 하나 OR'.

function tagsOf(v) {
  const set = new Set();
  (v.challenges || []).forEach((c) => c && c.title && set.add(String(c.title).toLowerCase()));
  const m = String(v.desc || '').match(/#([\p{L}\p{N}_]+)/gu) || [];
  m.forEach((t) => set.add(t.slice(1).toLowerCase()));
  return set;
}

// 영상 작성자 핸들 (webapp=uniqueId, aweme=unique_id 둘 다 대응)
function authorRaw(v) {
  return String((v && v.author && (v.author.uniqueId || v.author.unique_id)) || '');
}

// 이 영상을 '이 계정이 올린 것'으로 볼 수 있나 = 작성자 핸들이 계정 핸들과 같은가.
//  · 계정 핸들을 모르거나 영상에 작성자 정보가 없으면 검증 불가 → 통과(오탐 방지).
//  · 리포스트/피드에 섞여 온 남의 영상은 걸러 남의 링크가 이 계정 행에 써지는 것을 막는다.
//    (@nagisa__n 행에 @k_n_m07 링크가 박힌 사례가 실제로 있었다)
export function sameAuthor(v, handle) {
  const a = authorRaw(v).toLowerCase(), h = String(handle || '').toLowerCase();
  if (!h || !a) return true;
  return a === h;
}

// 영상에 달린 @멘션 모음 (본문의 @xxx + textExtra 의 userUniqueId)
function mentionsOf(v) {
  const set = new Set();
  const m = String(v.desc || '').match(/@([A-Za-z0-9._]+)/g) || [];
  m.forEach((t) => set.add(t.slice(1).toLowerCase()));
  (v.textExtra || []).forEach((t) => {
    const u = t && (t.userUniqueId || t.user_unique_id);
    if (u) set.add(String(u).toLowerCase());
  });
  return set;
}

// 키워드 표기법
//   "#foo"  → 해시태그로 찾음 (challenges + 본문의 #foo)
//   "@foo"  → 멘션으로 찾음 (본문의 @foo + textExtra)
//   "foo"   → 본문 문자열 포함으로 찾음 (대소문자·공백 무시)
// 반환: 실제로 맞은 키워드들 (원래 표기 그대로). 하나도 없으면 [].
export function matchKeywords(v, keywords) {
  const tags = tagsOf(v);
  const mentions = mentionsOf(v);
  const desc = String(v.desc || '').toLowerCase();
  const descTight = desc.replace(/\s+/g, ''); // "rated green" 도 "ratedgreen" 으로 잡히게

  const hit = [];
  for (const raw of keywords) {
    const k = String(raw || '').trim();
    if (!k) continue;
    const body = k.slice(1).toLowerCase();
    if (k.startsWith('#')) {
      if (tags.has(body)) hit.push(k);
    } else if (k.startsWith('@')) {
      if (mentions.has(body)) hit.push(k);
    } else {
      const low = k.toLowerCase();
      if (desc.includes(low) || descTight.includes(low.replace(/\s+/g, ''))) hit.push(k);
    }
  }
  return hit;
}

// 최근 N개 영상에서 키워드 쓴 영상 찾기 → 가장 최근 것 하나를 대표로.
// videos 는 fetchVideos 결과. handle 은 지금 확인 중인 '이 계정'.
//
// ⚠️ 순서가 중요하다: 작성자를 '먼저' 거르고 그 다음에 최근 N개를 자른다.
//    틱톡 프로필 응답에는 추천·리포스트 등 남의 영상이 섞여 온다. N개를 먼저 자르면
//    남의 영상이 그 N칸을 차지해, 이 계정이 실제로 올린 캠페인 영상이 창 밖으로 밀려난다
//    (= 올렸는데 '해당 없음'으로 확정되고 O열이 영영 비는 사고).
//    반환하는 scanned 도 '이 계정 영상을 몇 개 봤나'여야 한다 — 남의 영상 수를 세면 거짓 안심이 된다.
export function findMatch(videos, handle, keywords, recentN) {
  const mine = (videos || [])
    .filter((v) => sameAuthor(v, handle))
    .sort((a, b) => (Number(b.createTime) || 0) - (Number(a.createTime) || 0));
  const list = mine.slice(0, recentN);
  const hits = [];
  for (const v of list) {
    const matched = matchKeywords(v, keywords);
    if (!matched.length) continue;
    const author = authorRaw(v) || handle;
    hits.push({
      videoId: String(v.id || ''),
      link: v.id ? `https://www.tiktok.com/@${author}/video/${v.id}` : '',
      createTime: Number(v.createTime) || 0,
      keywords: matched,
    });
  }
  if (!hits.length) return { found: false, scanned: list.length, hits: [] };
  hits.sort((a, b) => b.createTime - a.createTime); // 가장 최근 것을 대표로
  return { found: true, scanned: list.length, hits, best: hits[0] };
}

// 유닉스초 → 'YYYY-MM-DD' (시트 표기용). 0/없으면 빈 문자열.
export function ymd(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

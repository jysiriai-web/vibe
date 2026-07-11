// 캠페인 콘텐츠 자동 판정 — 최근 영상에서 캠페인 해시태그/음원 쓴 영상을 찾아 업로드·검수·성과 산출.

function tagsOf(v) {
  const set = new Set();
  (v.challenges || []).forEach((c) => c && c.title && set.add(String(c.title).toLowerCase()));
  const m = String(v.desc || '').match(/#([\p{L}\p{N}_]+)/gu) || [];
  m.forEach((t) => set.add(t.slice(1).toLowerCase()));
  return set;
}

// 틱톡 링크에서 영상 id 뽑기. 공유 링크 꼬리표(?_r=1&_t=...)는 무시된다.
export function videoIdFromLink(link) {
  const m = String(link || '').match(/\/video\/(\d+)/);
  return m ? m[1] : '';
}

// 영상 작성자 핸들 (webapp=uniqueId, aweme=unique_id 둘 다 대응)
function authorRaw(v) {
  return String((v && v.author && (v.author.uniqueId || v.author.unique_id)) || '');
}
// 이 영상을 '이 계정이 올린 것'으로 볼 수 있나 = 작성자 핸들이 계정 핸들과 같은가.
//  · 계정 핸들을 모르거나(handle 빈값) 영상에 작성자 정보가 없으면 검증 불가 → 통과(오탐 방지).
//  · 리포스트/피드에 섞여 온 남의 영상(작성자≠계정)은 걸러 남의 링크가 이 계정 행에 써지는 것을 막는다.
function sameAuthor(v, handle) {
  const a = authorRaw(v).toLowerCase(), h = String(handle || '').toLowerCase();
  if (!h || !a) return true;
  return a === h;
}

function judge(v, wanted, soundId) {
  const tags = tagsOf(v);
  const handle = authorRaw(v);
  return {
    uploaded: true,
    videoId: String(v.id || ''),
    contentLink: handle && v.id ? `https://www.tiktok.com/@${handle}/video/${v.id}` : '',
    hashtagOk: wanted.length ? wanted.every((w) => tags.has(w)) : false, // 캠페인 해시태그 전부?
    soundOk: !!(soundId && String(v.music?.id) === String(soundId)), // 캠페인 지정 음원 사용?
    soundTitle: v.music?.title || '',
    views: Number(v.stats?.playCount) || 0,
    likes: Number(v.stats?.diggCount) || 0,
    comments: Number(v.stats?.commentCount) || 0,
    shares: Number(v.stats?.shareCount) || 0,
    createTime: Number(v.createTime) || 0,
  };
}

// videos: fetchVideos 결과의 videos. cfg: { hashtags:[], soundId:'' }
// knownLink: 시트 17열에 사람이 이미 적어둔 콘텐츠 링크. handle: 지금 스캔 중인 '이 계정'의 틱톡 핸들.
//
// ⚠️ 작성자 가드: 틱톡 프로필 item_list 에는 리포스트(남이 만든 영상)가 섞여 온다. 그 영상은
//    author 가 원작자라, 걸러내지 않으면 그 원작자 링크가 '이 계정' 행에 써져 시트가 오염된다
//    (@nagisa__n 행에 @k_n_m07 링크가 박힌 사례). 그래서 '이 계정이 작성한' 영상만 인정한다.
export function detectCampaign(videos, { hashtags = [], soundId = '' } = {}, { knownLink = '', handle = '' } = {}) {
  const wanted = hashtags.map((h) => String(h).toLowerCase().replace(/^#/, ''));
  const need = wanted.length >= 2 ? 2 : 1; // 태그 2개 이상 설정 시 2개 이상 일치 요구(#MUAH 등 흔한 단일태그 오탐 방지)
  const list = videos || [];

  // ① 사람이 링크를 찍어줬으면 그 영상이 답이다 — 단, 그 영상 작성자가 '이 계정'일 때만.
  //    작성자가 다르면(리포스트·잘못 박힌 링크) 인정하지 않고 아래로 흘려 미업로드 처리 → 오염 자가치유.
  //    (해시태그를 덜 달았든 음원이 다르든, 자기 영상이면 매칭 조건은 안 본다)
  const wantId = videoIdFromLink(knownLink);
  if (wantId) {
    const v = list.find((x) => String(x.id || '') === wantId);
    if (v && sameAuthor(v, handle)) return { ...judge(v, wanted, soundId), byLink: true };
  }

  // ② 링크가 없으면 캠페인 음원(강신호) 또는 해시태그 need개 이상으로 찾되, 반드시 '이 계정이 작성한' 영상만.
  for (const v of list) {
    if (!sameAuthor(v, handle)) continue; // 작성자≠계정(리포스트 등) → 이 계정 영상 아님, 건너뜀
    const tags = tagsOf(v);
    const matchCount = wanted.filter((w) => tags.has(w)).length;
    const hasSound = soundId && String(v.music?.id) === String(soundId);
    if (!hasSound && matchCount < need) continue; // 캠페인 영상 아님 → 다음
    return judge(v, wanted, soundId);
  }
  return { uploaded: false };
}

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

function judge(v, wanted, soundId) {
  const tags = tagsOf(v);
  const handle = v.author?.uniqueId || '';
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
// knownLink: 시트 17열에 사람이 이미 적어둔 콘텐츠 링크.
export function detectCampaign(videos, { hashtags = [], soundId = '' } = {}, { knownLink = '' } = {}) {
  const wanted = hashtags.map((h) => String(h).toLowerCase().replace(/^#/, ''));
  const need = wanted.length >= 2 ? 2 : 1; // 태그 2개 이상 설정 시 2개 이상 일치 요구(#MUAH 등 흔한 단일태그 오탐 방지)
  const list = videos || [];

  // ① 사람이 링크를 찍어줬으면 그 영상이 답이다.
  //    해시태그를 덜 달았든 다른 음원을 썼든, 자동 매칭에 실패했다고 미업로드로 둘 수는 없다.
  //    (그래서 이 경로는 매칭 조건을 안 보고 '그 영상'을 그대로 판정한다)
  const wantId = videoIdFromLink(knownLink);
  if (wantId) {
    const v = list.find((x) => String(x.id || '') === wantId);
    if (v) return { ...judge(v, wanted, soundId), byLink: true };
  }

  // ② 링크가 없으면 캠페인 음원(강신호) 또는 해시태그 need개 이상으로 찾아낸다.
  for (const v of list) {
    const tags = tagsOf(v);
    const matchCount = wanted.filter((w) => tags.has(w)).length;
    const hasSound = soundId && String(v.music?.id) === String(soundId);
    if (!hasSound && matchCount < need) continue; // 캠페인 영상 아님 → 다음
    return judge(v, wanted, soundId);
  }
  return { uploaded: false };
}

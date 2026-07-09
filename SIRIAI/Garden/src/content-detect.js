// 캠페인 콘텐츠 자동 판정 — 최근 영상에서 캠페인 해시태그/음원 쓴 영상을 찾아 업로드·검수·성과 산출.

function tagsOf(v) {
  const set = new Set();
  (v.challenges || []).forEach((c) => c && c.title && set.add(String(c.title).toLowerCase()));
  const m = String(v.desc || '').match(/#([\p{L}\p{N}_]+)/gu) || [];
  m.forEach((t) => set.add(t.slice(1).toLowerCase()));
  return set;
}

// videos: fetchVideos 결과. cfg: { hashtags:[], soundId:'' }
export function detectCampaign(videos, { hashtags = [], soundId = '' } = {}) {
  const wanted = hashtags.map((h) => String(h).toLowerCase().replace(/^#/, ''));
  const need = wanted.length >= 2 ? 2 : 1; // 태그 2개 이상 설정 시 2개 이상 일치 요구(#MUAH 등 흔한 단일태그 오탐 방지)
  for (const v of videos || []) {
    const tags = tagsOf(v);
    const matchCount = wanted.filter((w) => tags.has(w)).length;
    const hasSound = soundId && String(v.music?.id) === String(soundId);
    // 업로드 판정: 캠페인 음원 일치(강신호) OR 캠페인 해시태그 need개 이상 일치
    if (!hasSound && matchCount < need) continue; // 캠페인 영상 아님 → 다음
    const handle = v.author?.uniqueId || '';
    return {
      uploaded: true,
      videoId: String(v.id || ''),
      contentLink: handle && v.id ? `https://www.tiktok.com/@${handle}/video/${v.id}` : '',
      hashtagOk: wanted.length ? wanted.every((w) => tags.has(w)) : false, // 캠페인 해시태그 전부?
      soundOk: !!hasSound, // 캠페인 지정 음원 사용?
      soundTitle: v.music?.title || '',
      views: Number(v.stats?.playCount) || 0,
      likes: Number(v.stats?.diggCount) || 0,
      comments: Number(v.stats?.commentCount) || 0,
      shares: Number(v.stats?.shareCount) || 0,
      createTime: Number(v.createTime) || 0,
    };
  }
  return { uploaded: false };
}

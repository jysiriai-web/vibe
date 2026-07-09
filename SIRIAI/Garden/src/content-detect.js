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
  for (const v of videos || []) {
    const tags = tagsOf(v);
    const hasHashtag = wanted.some((w) => tags.has(w));
    const hasSound = soundId && String(v.music?.id) === String(soundId);
    if (!hasHashtag && !hasSound) continue; // 캠페인 영상 아님 → 다음
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

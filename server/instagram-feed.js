// Server-only. Never import this module into src/.
export async function getInstagramFeed(env, request = fetch) {
  const { INSTAGRAM_ACCESS_TOKEN: token, INSTAGRAM_USER_ID: user, INSTAGRAM_API_VERSION: version } = env;
  if (!token || !/^\d+$/.test(user || '') || !/^v\d+\.\d+$/.test(version || '')) {
    throw new Error('Instagram is not configured');
  }
  const url = new URL(`https://graph.instagram.com/${version}/${user}/media`);
  url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp');
  url.searchParams.set('limit', '24');
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Instagram request failed');
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('Invalid Instagram response');
  return payload.data.filter(item => {
    try {
      const link = new URL(item.permalink);
      return link.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(link.hostname)
        && Number.isFinite(Date.parse(item.timestamp));
    } catch { return false; }
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 12).map(item => ({
    id: String(item.id),
    title: (item.caption || 'A little inspiration from Chii.').split('\n')[0].slice(0, 120),
    url: item.permalink,
    imageUrl: item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url,
    alt: (item.caption || 'Karya terbaru Chii Nails').slice(0, 180),
    timestamp: item.timestamp,
  }));
}

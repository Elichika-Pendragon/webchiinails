// Public permalinks only. No account/session credentials or post content are collected.
export const PROFILE = 'chii.nails_';
export const PROFILE_URL = `https://www.instagram.com/${PROFILE}/`;
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_HTML_BYTES = 1024 * 1024;

export function normalizeInstagramLinks(values, { canonical = false } = {}) {
  const posts = new Map();
  for (const value of values) {
    if (typeof value !== 'string' || value.length > 2048) continue;
    try {
      const url = new URL(value.replaceAll('&amp;', '&'), PROFILE_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.port
        || !['www.instagram.com', 'instagram.com'].includes(url.hostname)) continue;
      // Owner-prefixed links establish which profile supplied the grid item.
      const match = url.pathname.match(/^\/(?:([^/]+)\/)?(p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/);
      if (!match || (match[1] ? match[1] !== PROFILE : !canonical)) continue;
      const [, , type, id] = match;
      if (!posts.has(id)) posts.set(id, { id, url: `https://www.instagram.com/${type}/${id}/` });
    } catch { /* Ignore malformed or unrelated links. */ }
  }
  return [...posts.values()].slice(0, 48);
}

export function extractInstagramLinks(html) {
  const hrefs = [];
  for (const anchor of html.matchAll(/<a\b[^>]{0,8192}>/gi)) {
    const href = anchor[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (href) hrefs.push(href);
  }
  return normalizeInstagramLinks(hrefs);
}

export async function fetchPublicInstagramLinks(request = fetch) {
  const response = await request(PROFILE_URL, {
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' },
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('PUBLIC_PROFILE_UNAVAILABLE');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '', bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) throw new Error('PUBLIC_PROFILE_TOO_LARGE');
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const posts = extractInstagramLinks(html);
  if (!posts.length) throw new Error('NO_PUBLIC_LINKS');
  return posts;
}

export async function refreshInstagramLinks(previous, {
  now = Date.now(), collect = fetchPublicInstagramLinks,
} = {}) {
  const current = {
    profile: PROFILE,
    posts: normalizeInstagramLinks((previous?.posts || []).map(post => post.url), { canonical: true }),
    lastAttemptAt: previous?.lastAttemptAt || null,
    lastSuccessAt: previous?.lastSuccessAt || null,
    status: previous?.status || 'not-checked',
  };
  const elapsed = now - Date.parse(current.lastAttemptAt);
  if (Number.isFinite(elapsed) && elapsed < CHECK_INTERVAL_MS) return current;
  current.lastAttemptAt = new Date(now).toISOString();
  try {
    const result = await collect();
    const posts = normalizeInstagramLinks(result.map(post => post.url), { canonical: true });
    if (!posts.length) throw new Error('NO_PUBLIC_LINKS');
    return { ...current, posts, lastSuccessAt: current.lastAttemptAt, status: 'fresh' };
  } catch {
    // A login wall, empty page or rate limit must never erase the working gallery.
    return { ...current, status: current.posts.length ? 'stale' : 'unavailable' };
  }
}

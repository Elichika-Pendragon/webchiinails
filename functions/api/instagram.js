import { getInstagramFeed } from '../../server/instagram-feed.js';
import { getInstagramCredentials } from '../../server/instagram-tokens.js';

// Cloudflare Pages Function. Only /api/instagram invokes this server code.
export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }
  const cache = globalThis.caches?.default;
  const cacheUrl = new URL(context.request.url);
  cacheUrl.search = ''; // A visitor's query string cannot bypass the shared feed cache.
  const key = new Request(cacheUrl.toString(), { method: 'GET' });
  const cached = cache ? await cache.match(key) : null;
  if (cached) return cached;
  try {
    const credentials = await getInstagramCredentials(context.env);
    const posts = await getInstagramFeed(credentials);
    const response = Response.json({ posts, fetchedAt: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' },
    });
    if (cache) context.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return Response.json({ error: 'Instagram feed temporarily unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

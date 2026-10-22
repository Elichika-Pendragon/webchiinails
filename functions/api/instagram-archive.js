import bootstrap from '../../public/data/instagram-archive.json' with { type: 'json' };
import { publicInstagramArchive } from '../../src/instagram-showcase.js';

// Visitors only read saved public links. This endpoint never launches a scraper.
export async function onRequest(context) {
  if (context.request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(context.request.url); url.search = '';
  const key = new Request(url, { method: 'GET' });
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key);
  if (hit) return hit;
  let archive;
  try { archive = publicInstagramArchive(await context.env?.INSTAGRAM_LINKS?.get('archive-v1', 'json')); }
  catch { /* The manually collected public archive stays available. */ }
  const response = Response.json(archive || publicInstagramArchive(bootstrap), {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Content-Type-Options': 'nosniff' },
  });
  if (cache) context.waitUntil(cache.put(key, response.clone()));
  return response;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInstagramLinks, normalizeInstagramLinks, fetchPublicInstagramLinks,
  refreshInstagramLinks, CHECK_INTERVAL_MS } from './instagram-links.js';

const owned = 'https://www.instagram.com/chii.nails_/reel/Ddbohf_TKUi/?tracking=discard';
const posts = normalizeInstagramLinks([owned]);
const now = Date.parse('2026-10-22T02:00:00+07:00');

test('collect only Chii grid links and strip tracking; no other data survives', () => {
  assert.deepEqual(normalizeInstagramLinks([owned, owned, 'https://instagram.com/other/p/Abcdefghi/',
    'https://instagram.com/p/Abcdefghi/', 'https://instagram.com.evil.test/chii.nails_/p/Abcdefghi/',
    'javascript:alert(1)', 'https://user:secret@instagram.com/chii.nails_/p/Abcdefghi/']),
  [{ id: 'Ddbohf_TKUi', url: 'https://www.instagram.com/reel/Ddbohf_TKUi/' }]);
});

test('extract real anchor hrefs rather than unrelated script strings', () => {
  assert.deepEqual(extractInstagramLinks(`<script>"${owned}"</script><a href='${owned}'>private text</a>`), posts);
});

test('anonymous fetch neither supplies cookies nor follows redirects', async () => {
  const result = await fetchPublicInstagramLinks(async (url, options) => {
    assert.equal(url, 'https://www.instagram.com/chii.nails_/');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Cookie, undefined);
    return new Response(`<a href="${owned}">post</a>`, { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(result, posts);
});

test('login shells and rate limits are failures, not empty successful feeds', async () => {
  await assert.rejects(fetchPublicInstagramLinks(async () => new Response('<html>Log in</html>',
    { headers: { 'content-type': 'text/html' } })), /NO_PUBLIC_LINKS/);
  await assert.rejects(fetchPublicInstagramLinks(async () => new Response('', { status: 429 })),
    /PUBLIC_PROFILE_UNAVAILABLE/);
});

test('successful hourly discovery replaces snapshot with validated public links', async () => {
  const result = await refreshInstagramLinks(null, { now, collect: async () => posts });
  assert.equal(result.status, 'fresh'); assert.deepEqual(result.posts, posts);
  assert.equal(result.lastSuccessAt, new Date(now).toISOString());
});

test('failed refresh preserves last success and backs off for a full hour', async () => {
  const first = await refreshInstagramLinks(null, { now, collect: async () => posts });
  let calls = 0;
  const collect = async () => { calls++; throw new Error('upstream unavailable'); };
  const stale = await refreshInstagramLinks(first, { now: now + CHECK_INTERVAL_MS, collect });
  assert.equal(stale.status, 'stale'); assert.deepEqual(stale.posts, posts);
  assert.equal(stale.lastSuccessAt, first.lastSuccessAt);
  assert.deepEqual(await refreshInstagramLinks(stale,
    { now: now + CHECK_INTERVAL_MS * 2 - 1, collect }), stale);
  assert.equal(calls, 1);
});

test('empty or malformed results never erase saved links', async () => {
  const first = await refreshInstagramLinks(null, { now, collect: async () => posts });
  for (const result of [[], null, [{ url: 'https://evil.test/reel/Ddbohf_TKUi/' }]]) {
    const stale = await refreshInstagramLinks(first,
      { now: now + CHECK_INTERVAL_MS, collect: async () => result });
    assert.deepEqual(stale.posts, posts); assert.equal(stale.status, 'stale');
  }
});

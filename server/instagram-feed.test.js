import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstagramFeed } from './instagram-feed.js';

const env = { INSTAGRAM_ACCESS_TOKEN: 'test-secret', INSTAGRAM_USER_ID: '123', INSTAGRAM_API_VERSION: 'v99.0' };
test('returns newest posts, uses video thumbnail and keeps token out of response and URL', async () => {
  const result = await getInstagramFeed(env, async (url, options) => {
    assert.equal(url.searchParams.has('access_token'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return { ok: true, json: async () => ({ data: [
      { id: '1', permalink: 'https://www.instagram.com/p/older/', timestamp: '2026-01-01', caption: 'Older', media_type: 'IMAGE', media_url: 'https://example.com/old.jpg' },
      { id: '2', permalink: 'https://www.instagram.com/reel/newer/', timestamp: '2026-02-01', caption: 'Newer\ncaption', media_type: 'VIDEO', thumbnail_url: 'https://example.com/new.jpg' },
      { id: '3', permalink: 'https://untrusted.example/post', timestamp: '2026-03-01' },
    ] }) };
  });
  assert.deepEqual(result.map(item => item.id), ['2', '1']);
  assert.equal(result[0].imageUrl, 'https://example.com/new.jpg');
  assert.equal(result[0].title, 'Newer');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});
test('fails closed when unconfigured or Instagram rejects the token', async () => {
  await assert.rejects(() => getInstagramFeed({}, () => assert.fail('Must not make a request')));
  await assert.rejects(() => getInstagramFeed(env, async () => ({ ok: false })));
});

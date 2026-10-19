import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/instagram.js';

test('Cloudflare endpoint returns 405 for writes and a sanitized 503 without credentials', async () => {
  const write = await onRequest({ request: new Request('https://example.com/api/instagram', { method: 'POST' }) });
  assert.equal(write.status, 405);
  const unavailable = await onRequest({ request: new Request('https://example.com/api/instagram'), env: {} });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await unavailable.json(), { error: 'Instagram feed temporarily unavailable' });
});

test('Cloudflare endpoint caches a successful feed and does not let queries bypass the cache', async () => {
  const originalFetch = globalThis.fetch, originalCaches = globalThis.caches;
  const stored = new Map();
  let calls = 0;
  globalThis.caches = { default: {
    match: async key => stored.get(key.url)?.clone(),
    put: async (key, value) => { stored.set(key.url, value); },
  } };
  globalThis.fetch = async () => { calls++; return Response.json({ data: [] }); };
  const pending = [];
  const context = {
    env: { INSTAGRAM_ACCESS_TOKEN: 'never-public', INSTAGRAM_USER_ID: '123', INSTAGRAM_API_VERSION: 'v99.0' },
    waitUntil: promise => pending.push(promise),
  };
  try {
    const first = await onRequest({ ...context, request: new Request('https://example.com/api/instagram?attempt=1') });
    assert.equal(first.status, 200);
    await Promise.all(pending);
    const second = await onRequest({ ...context, request: new Request('https://example.com/api/instagram?attempt=2') });
    assert.equal(second.status, 200);
    assert.equal(calls, 1);
    assert.equal((await second.text()).includes('never-public'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

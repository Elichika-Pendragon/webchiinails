import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, TOKEN_KEY, STATUS_KEY, encryptTokenRecord, decryptTokenRecord, readTokenRecord, getInstagramCredentials, maintainInstagramToken } from './instagram-tokens.js';
import worker from '../workers/instagram-refresh.js';
import { onRequest } from '../functions/api/instagram.js';

const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const now = Date.now();
const record = { accessToken: 'private-original', accountId: '123', updatedAt: now - 31 * DAY, refreshAfter: now - DAY, expiresAt: now + 29 * DAY };
async function fixture(input = record) {
  const data = new Map([[TOKEN_KEY, await encryptTokenRecord(input, secret)]]);
  return { data, env: {
    INSTAGRAM_USER_ID: '123', TOKEN_ENCRYPTION_KEY: secret, INSTAGRAM_API_VERSION: 'v99.0',
    INSTAGRAM_TOKENS: { get: async key => data.get(key), put: async (key, value) => data.set(key, value) },
  } };
}

test('token storage uses authenticated encryption with fresh nonces and rejects tampering', async () => {
  const first = await encryptTokenRecord(record, secret), second = await encryptTokenRecord(record, secret);
  assert.notEqual(first, second);
  assert.equal(first.includes('private-original'), false);
  assert.deepEqual(await decryptTokenRecord(first, secret), record);
  const tampered = JSON.parse(first); tampered.ciphertext = btoa('bad data');
  await assert.rejects(() => decryptTokenRecord(JSON.stringify(tampered), secret), /Cannot read/);
  await assert.rejects(() => decryptTokenRecord(first, btoa('x'.repeat(32))), /Cannot read/);
});

test('bound KV fails closed on wrong account, missing key or expired token instead of using old env secret', async () => {
  const { env } = await fixture();
  await assert.rejects(() => readTokenRecord({ ...env, INSTAGRAM_USER_ID: '456' }), /does not match/);
  await assert.rejects(() => readTokenRecord({ ...env, TOKEN_ENCRYPTION_KEY: '' }), /Cannot read/);
  await assert.rejects(() => getInstagramCredentials({ ...env, INSTAGRAM_ACCESS_TOKEN: 'stale-secret' }, record.expiresAt + 1), /expired/);
  await assert.rejects(() => getInstagramCredentials({ ...env, INSTAGRAM_TOKENS: { get: async () => null }, INSTAGRAM_ACCESS_TOKEN: 'stale-secret' }, now), /initialized/);
});

test('fresh or too-young tokens do not trigger a Meta request', async () => {
  for (const current of [
    { ...record, refreshAfter: now + DAY },
    { ...record, updatedAt: now - DAY / 2 },
  ]) {
    const { env } = await fixture(current);
    const result = await maintainInstagramToken(env, () => assert.fail('Not due'), now);
    assert.equal(result.state, 'current');
  }
});

test('due renewal securely saves the returned token and Pages reads it on its next uncached request', async () => {
  const { env, data } = await fixture();
  const result = await maintainInstagramToken(env, async (url, options) => {
    assert.equal(url.origin, 'https://graph.instagram.com');
    assert.equal(url.pathname, '/refresh_access_token');
    assert.equal(url.searchParams.get('grant_type'), 'ig_refresh_token');
    assert.equal(url.searchParams.get('access_token'), 'private-original');
    assert.equal(options.redirect, 'error');
    return Response.json({ access_token: 'private-renewed', expires_in: 60 * DAY / 1000 });
  }, now);
  assert.deepEqual(result, { state: 'renewed', expiresAt: now + 60 * DAY });
  const saved = await readTokenRecord(env);
  assert.equal(saved.accessToken, 'private-renewed');
  assert.equal(saved.refreshAfter, now + 30 * DAY);
  assert.equal(data.get(TOKEN_KEY).includes('private-renewed'), false);
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  delete globalThis.caches;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-renewed');
    assert.equal(url.searchParams.has('access_token'), false);
    return Response.json({ data: [] });
  };
  try {
    const response = await onRequest({ env, request: new Request('https://example.com/api/instagram') });
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes('private-renewed'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches !== undefined) globalThis.caches = originalCaches;
  }
});

test('renewal rejection, malformed response and network failure preserve the previous encrypted record', async () => {
  for (const request of [
    async () => Response.json({ error: 'private-original' }, { status: 400 }),
    async () => Response.json({ access_token: '', expires_in: 60 * DAY / 1000 }),
    async () => Response.json({ access_token: 'new', expires_in: 'not a number' }),
    async () => { throw new Error('https://upstream/?access_token=private-original'); },
  ]) {
    const { env, data } = await fixture();
    const before = data.get(TOKEN_KEY);
    await assert.rejects(() => maintainInstagramToken(env, request, now), error => !error.message.includes('private-original'));
    assert.equal(data.get(TOKEN_KEY), before);
  }
  const { env } = await fixture();
  await assert.rejects(() => maintainInstagramToken(env, () => assert.fail('Expired must not be refreshed'), record.expiresAt), /reconnect required/);
});

test('renewal Worker exposes no public trigger and scheduled errors contain no credentials', async () => {
  assert.equal((await worker.fetch(new Request('https://example.com/refresh', { method: 'POST' }))).status, 404);
  const { env, data } = await fixture();
  env.INSTAGRAM_TOKENS.get = async () => { throw new Error('private-original'); };
  const originalError = console.error;
  const messages = [];
  console.error = message => messages.push(message);
  try {
    await assert.rejects(() => worker.scheduled({}, env), /requires attention/);
    assert.equal(messages.join('').includes('private-original'), false);
    assert.equal(JSON.parse(data.get(STATUS_KEY)).state, 'attention-required');
    assert.equal(data.get(STATUS_KEY).includes('private-original'), false);
  } finally { console.error = originalError; }
});

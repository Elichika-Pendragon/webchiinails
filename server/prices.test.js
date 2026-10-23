import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handleOwnerPrices, handlePublicPrices } from './prices.js';
import { defaultPrices, priceFields, validPrices, calculatePressOn, priceRange } from '../src/pricing.js';
import { getAuthChallenge, signInOwner } from './booking-auth.js';

const schema = await readFile(new URL('../migrations/0009-site-prices.sql', import.meta.url), 'utf8');
const authEnv = { SITE_URL: 'https://synthetic.example', GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com', BOOKING_OWNER_EMAIL: 'owner.synthetic@gmail.com', BOOKING_AUTH_SECRET: 'synthetic-test-signing-secret-with-more-than-32-bytes' };
const now = Date.parse('2026-10-23T02:00:00Z');
const auth = { now: () => now };
const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
const base64 = data => Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)).toString('base64url');
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
const draft = () => structuredClone(defaultPrices);
function request(path = '/api/booking/prices', { method = 'GET', cookie: value, csrf, body, origin = authEnv.SITE_URL, headers = {} } = {}) {
  return new Request(`${authEnv.SITE_URL}${path}`, { method, headers: { ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(value ? { Cookie: value } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}
async function owner(email = authEnv.BOOKING_OWNER_EMAIL) {
  const challenge = await getAuthChallenge(request('/api/booking/auth/session'), authEnv, auth);
  const data = await challenge.json();
  const unsigned = `${base64({ alg: 'RS256', kid: 'test' })}.${base64({ iss: 'https://accounts.google.com', aud: authEnv.GOOGLE_OAUTH_CLIENT_ID, iat: now / 1000, exp: now / 1000 + 600, sub: 'synthetic-owner', email, email_verified: true, nonce: data.nonce })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(unsigned));
  const response = await signInOwner(request('/api/booking/auth/session', { method: 'POST', cookie: cookie(challenge, '__Secure-chii_booking_challenge'), csrf: data.csrfToken, body: { credential: `${unsigned}.${Buffer.from(signature).toString('base64url')}`, nonce: data.nonce } }), authEnv, { ...auth, fetch: async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] }), { headers: { 'Content-Type': 'application/json' } }) });
  return { cookie: cookie(response, '__Secure-chii_booking_owner'), csrf: (await response.json()).csrfToken };
}
const signedOwner = await owner();
function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(schema);
  let calls = 0;
  const db = { prepare(sql) { calls++; const statement = sqlite.prepare(sql); return { first: async () => statement.get(), bind: (...values) => ({ first: async () => statement.get(...values) }) }; } };
  return { env: { ...authEnv, BOOKING_DB: db }, sqlite, calls: () => calls };
}
const call = (fixture, options = {}) => handleOwnerPrices(request(undefined, { ...signedOwner, ...options }), fixture.env, { auth, now: () => now });

test('press-on estimates use approved menu fees plus kit, optional glue and real ranges', () => {
  assert.deepEqual(calculatePressOn(defaultPrices), { base: 22000, design: 40000, designMax: null, glue: 0, min: 62000, max: 62000 });
  assert.equal(calculatePressOn(defaultPrices, 'cat-eye-0', true).min, 75000);
  assert.deepEqual([calculatePressOn(defaultPrices, 'nail-art-4').min, calculatePressOn(defaultPrices, 'nail-art-4').max], [72000, 77000]);
  assert.equal(calculatePressOn(defaultPrices, 'nail-art-5').max, 177000);
  const changed = draft(); changed.base = 23000; changed.items['cat-eye-0'].price = 45000;
  assert.equal(calculatePressOn(changed).min, 68000);
  assert.throws(() => calculatePressOn(defaultPrices, 'removal-0'));
  assert.equal(priceRange(0, 0), 'Rp0');
  assert.equal(priceRange(72000, 77000), 'Rp72.000–77.000');
});
test('catalog validation rejects omitted fees, injected fields, fractions and inverted ranges', () => {
  for (const mutate of [p => { delete p.items['cat-eye-0']; }, p => { p.items.extra = { price: 1, max: null }; }, p => { p.base = '22000'; }, p => { p.glue = -1; }, p => { p.base = 0.5; }, p => { p.base = 10000001; }, p => { p.items['cat-eye-0'].max = 1; }, p => { p.items['cat-eye-0'].owner = 'private'; }]) { const p = draft(); mutate(p); assert.equal(validPrices(p), false); }
  assert.equal(priceFields.filter(field => field.design).length, 11);
});
test('public read returns sanitized defaults, caches a single key and rejects writes', async () => {
  const f = fixture(); let putKey; const waits = [];
  const response = await handlePublicPrices(request('/api/prices?ignored=123'), f.env, { cache: { match: async () => null, put: async key => { putKey = key.url; } }, waitUntil: promise => waits.push(promise) });
  const body = await response.json(); await Promise.all(waits);
  assert.deepEqual(body, { prices: defaultPrices, revision: 0, updatedAt: null });
  assert.equal(putKey, `${authEnv.SITE_URL}/api/prices`);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=60');
  assert.equal((await handlePublicPrices(request('/api/prices', { method: 'POST', body: {} }), f.env)).status, 405);
  assert.equal(JSON.stringify(body).includes(authEnv.BOOKING_OWNER_EMAIL), false);
});
test('unauthenticated, forged and cross-origin writes do not access the database', async () => {
  const f = fixture();
  for (const options of [{ cookie: undefined }, { cookie: '__Secure-chii_booking_owner=forged' }, { method: 'POST', csrf: undefined, body: { revision: 0, prices: draft() } }, { method: 'POST', origin: 'https://attacker.example', body: { revision: 0, prices: draft() } }]) {
    const result = await call(f, options); assert.ok([401, 403].includes(result.status)); assert.equal(f.calls(), 0);
  }
  await assert.rejects(owner('random.customer@gmail.com'), error => error.code === 'AUTH_FORBIDDEN');
});
test('real signed owner can atomically save and read the catalog; stale tabs cannot overwrite', async () => {
  const f = fixture(); const prices = draft(); prices.base = 24000; prices.items['nail-art-0'] = { price: 26000, max: 28000 };
  const first = await call(f, { method: 'POST', body: { revision: 0, prices } });
  assert.equal(first.status, 200); assert.equal(first.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(await first.json(), { prices, revision: 1, updatedAt: new Date(now).toISOString() });
  assert.equal((await call(f, { method: 'POST', body: { revision: 0, prices: draft() } })).status, 409);
  const read = await (await call(f)).json(); assert.equal(read.prices.base, 24000); assert.equal(read.revision, 1);
  prices.glue = 15000;
  assert.equal((await (await call(f, { method: 'POST', body: { revision: 1, prices } })).json()).revision, 2);
  assert.equal((await call(f, { method: 'POST', body: { revision: 1, prices: draft() } })).status, 409);
  assert.equal((await (await handlePublicPrices(request('/api/prices'), f.env)).json()).prices.glue, 15000);
});
test('invalid and oversized writes leave the complete stored catalog unchanged', async () => {
  const f = fixture(); await call(f, { method: 'POST', body: { revision: 0, prices: draft() } });
  const bad = draft(); bad.items['cat-eye-0'].price = -1;
  for (const body of [{ revision: 1, prices: bad }, { revision: -1, prices: draft() }, { revision: 1, prices: draft(), email: 'attacker@example.com' }, '{broken']) assert.equal((await call(f, { method: 'POST', body })).status, 400);
  assert.equal((await call(f, { method: 'POST', body: 'x'.repeat(9000) })).status, 413);
  assert.equal((await call(f, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.deepEqual((await (await call(f)).json()).prices, defaultPrices);
  assert.equal(f.sqlite.prepare('SELECT revision FROM site_prices WHERE id=1').get().revision, 1);
});
test('missing or corrupt database fails closed without leaking error details', async () => {
  for (const env of [{ ...authEnv }, { ...authEnv, BOOKING_DB: { prepare() { throw new Error('private credentials and SQL'); } } }]) {
    const response = await handlePublicPrices(request('/api/prices'), env);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: { code: 'PRICES_UNAVAILABLE' } });
  }
  const f = fixture(); f.sqlite.exec("INSERT INTO site_prices VALUES (1, '{}', 1, '2026-10-23T00:00:00Z')");
  assert.equal((await call(f)).status, 503);
});

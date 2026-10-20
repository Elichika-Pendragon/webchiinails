import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingAuthError, getAuthChallenge, signInOwner, requireBookingOwner, signOutOwner } from './booking-auth.js';

// Ephemeral synthetic identity and keys. No real owner, Google call or resource.
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
const env = { SITE_URL: 'https://synthetic.example', GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com', BOOKING_OWNER_EMAIL: 'owner.synthetic@gmail.com', BOOKING_AUTH_SECRET: 'synthetic-test-signing-secret-with-more-than-32-bytes' };
const current = Date.parse('2026-10-20T12:00:00Z');
const challengeName = '__Secure-chii_booking_challenge';
const sessionName = '__Secure-chii_booking_owner';
const base64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const json = (value, headers = {}, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const jwks = (extra = {}) => json({ keys: [{ ...publicKey, kid: 'synthetic-key', alg: 'RS256', use: 'sig', ...extra }] }, { 'Cache-Control': 'public, max-age=300' });
const isCode = (code, status) => error => error instanceof BookingAuthError && error.code === code && (!status || error.status === status);
const cookies = response => response.headers.getSetCookie();
const cookie = (response, name) => cookies(response).find(item => item.startsWith(`${name}=`))?.split(';')[0];

function request(path = '/api/booking/auth/session', { method = 'GET', cookie: cookieValue, csrf, body, headers = {}, origin = env.SITE_URL } = {}) {
  const values = { ...headers };
  if (cookieValue) values.Cookie = cookieValue;
  if (csrf !== undefined) values['X-CSRF-Token'] = csrf;
  if (origin !== null && method !== 'GET' && method !== 'HEAD') values.Origin = origin;
  if (body !== undefined && !Object.keys(values).some(key => key.toLowerCase() === 'content-type')) values['Content-Type'] = 'application/json';
  return new Request(`${env.SITE_URL}${path}`, { method, headers: values, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}

async function token(nonce, claims = {}, header = {}) {
  const first = base64({ alg: 'RS256', typ: 'JWT', kid: 'synthetic-key', ...header });
  const second = base64({ iss: 'https://accounts.google.com', aud: env.GOOGLE_OAUTH_CLIENT_ID, iat: current / 1000, exp: current / 1000 + 3600, sub: 'synthetic-owner-123', email: env.BOOKING_OWNER_EMAIL, email_verified: true, nonce, ...claims });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${first}.${second}`));
  return `${first}.${second}.${Buffer.from(signature).toString('base64url')}`;
}

async function challenge(extra = {}, config = env) {
  const options = { now: () => current, fetch: async () => jwks(), ...extra };
  const response = await getAuthChallenge(request(), config, options);
  return { options, response, body: await response.json(), cookie: cookie(response, challengeName) };
}

async function login(fixture, claims = {}, extra = {}, config = env) {
  const credential = await token(fixture.body.nonce, claims);
  return signInOwner(request(undefined, { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken, body: { credential, nonce: fixture.body.nonce } }), config, { ...fixture.options, ...extra });
}

test('missing or unsafe configuration fails closed without any remote I/O', async () => {
  let calls = 0;
  const options = { now: () => current, fetch: async () => { calls++; throw new Error('private upstream data'); } };
  for (const field of Object.keys(env)) {
    const missing = { ...env };
    delete missing[field];
    await assert.rejects(getAuthChallenge(request(), missing, options), isCode('AUTH_CONFIG', 503));
    await assert.rejects(requireBookingOwner(request(), missing, options), isCode('AUTH_CONFIG', 503));
  }
  for (const change of [{ SITE_URL: 'http://synthetic.example' }, { SITE_URL: 'https://synthetic.example/path' }, { SITE_URL: 'https://synthetic.example/?redirect=bad' }, { BOOKING_AUTH_SECRET: 'short' }, { GOOGLE_OAUTH_CLIENT_ID: 'untrusted-id' }, { BOOKING_OWNER_EMAIL: ' owner@gmail.com' }]) await assert.rejects(getAuthChallenge(request(), { ...env, ...change }, options), isCode('AUTH_CONFIG', 503));
  assert.equal(calls, 0);
});

test('challenge is random, signed, HttpOnly, scoped, no-store and reusable across tabs', async () => {
  const first = await challenge();
  assert.deepEqual(Object.keys(first.body).sort(), ['authenticated', 'clientId', 'csrfToken', 'nonce', 'ownerName'].sort());
  assert.equal(first.body.authenticated, false);
  assert.equal(first.body.ownerName, 'Chii');
  assert.match(first.body.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.body.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.body.nonce, first.body.csrfToken);
  assert.match(cookies(first.response)[0], /Path=\/api\/booking; Max-Age=600; Secure; HttpOnly; SameSite=Lax$/);
  assert.equal(first.response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(first.response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(JSON.stringify(first.body).includes(env.BOOKING_OWNER_EMAIL), false);
  const second = await getAuthChallenge(request(undefined, { cookie: first.cookie }), env, first.options);
  assert.deepEqual(await second.json(), first.body);
  assert.notEqual((await challenge()).body.nonce, first.body.nonce);
});

test('valid Google signature grants a seven-day session without returning email or credentials', async () => {
  let calls = 0;
  const fixture = await challenge({ fetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
    return jwks();
  } });
  const response = await login(fixture);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['authenticated', 'csrfToken', 'ownerName'].sort());
  assert.equal(body.authenticated, true);
  assert.equal(body.ownerName, 'Chii');
  assert.notEqual(body.csrfToken, fixture.body.csrfToken);
  assert.match(cookies(response)[0], /Max-Age=604800; Secure; HttpOnly; SameSite=Lax$/);
  assert.match(cookies(response)[1], /Max-Age=0;/);
  const session = cookie(response, sessionName);
  const payload = JSON.parse(Buffer.from(session.split('=')[1].split('.')[0], 'base64url'));
  assert.equal(payload.exp - payload.iat, 604800);
  assert.equal(JSON.stringify(payload).includes(env.BOOKING_OWNER_EMAIL), false);
  assert.equal('credential' in payload, false);
  const owner = await requireBookingOwner(request('/api/booking/review?token=synthetic', { cookie: session }), env, fixture.options);
  assert.deepEqual(owner, { email: env.BOOKING_OWNER_EMAIL, subject: 'synthetic-owner-123', csrfToken: body.csrfToken });
  const authenticated = await getAuthChallenge(request(undefined, { cookie: session }), env, fixture.options);
  assert.deepEqual(await authenticated.json(), { authenticated: true, csrfToken: body.csrfToken, clientId: env.GOOGLE_OAUTH_CLIENT_ID, nonce: null, ownerName: 'Chii' });
  assert.equal(calls, 1);
});

test('owner reads need a signed session and decisions additionally need exact Origin and session CSRF', async () => {
  const fixture = await challenge();
  const response = await login(fixture);
  const session = cookie(response, sessionName);
  const { csrfToken } = await response.json();
  await assert.rejects(requireBookingOwner(request('/api/booking/review?token=synthetic'), env, fixture.options), isCode('AUTH_REQUIRED', 401));
  for (const change of [{}, { csrf: fixture.body.csrfToken }, { csrf: csrfToken, origin: null }, { csrf: csrfToken, origin: 'https://attacker.example' }, { csrf: csrfToken, headers: { 'Sec-Fetch-Site': 'cross-site' } }]) {
    await assert.rejects(requireBookingOwner(request('/api/booking/review?token=synthetic', { method: 'POST', cookie: session, ...change }), env, fixture.options), isCode('AUTH_CSRF', 403));
  }
  const owner = await requireBookingOwner(request('/api/booking/review?token=synthetic', { method: 'POST', cookie: session, csrf: csrfToken }), env, fixture.options);
  assert.equal(owner.subject, 'synthetic-owner-123');
  await assert.rejects(requireBookingOwner(request('/api/booking/review?token=synthetic', { cookie: fixture.cookie }), env, fixture.options), isCode('AUTH_REQUIRED', 401));
});

test('tampered, duplicate, expired or configuration-stale session cookies cannot authorize', async () => {
  const fixture = await challenge();
  const response = await login(fixture);
  const session = cookie(response, sessionName);
  const [name, serialized] = session.split('=');
  const [data, signature] = serialized.split('.');
  const forged = base64({ ...JSON.parse(Buffer.from(data, 'base64url')), exp: current / 1000 + 10000000 });
  for (const value of [`${name}=${forged}.${signature}`, `${name}=${data}.AAAA`, `${session}; ${session}`, `${name}=not-a-cookie`]) await assert.rejects(requireBookingOwner(request(undefined, { cookie: value }), env, fixture.options), isCode('AUTH_REQUIRED', 401));
  await assert.rejects(requireBookingOwner(request(undefined, { cookie: session }), env, { ...fixture.options, now: () => current + 604800000 }), isCode('AUTH_REQUIRED', 401));
  for (const change of [{ BOOKING_AUTH_SECRET: `${env.BOOKING_AUTH_SECRET}-rotated` }, { BOOKING_OWNER_EMAIL: 'other.synthetic@gmail.com' }, { GOOGLE_OAUTH_CLIENT_ID: 'different-client.apps.googleusercontent.com' }]) await assert.rejects(requireBookingOwner(request(undefined, { cookie: session }), { ...env, ...change }, fixture.options), isCode('AUTH_REQUIRED', 401));
});

test('sign-in binds both client nonce and CSRF to the challenge before Google I/O', async () => {
  let calls = 0;
  const fixture = await challenge({ fetch: async () => { calls++; return jwks(); } });
  const credential = await token(fixture.body.nonce);
  for (const change of [{ csrf: undefined }, { csrf: 'A'.repeat(43) }, { origin: null }, { origin: 'https://attacker.example' }, { body: { credential, nonce: 'A'.repeat(43) } }, { body: { credential, nonce: fixture.body.nonce, approved: true } }]) {
    await assert.rejects(signInOwner(request(undefined, { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken, body: { credential, nonce: fixture.body.nonce }, ...change }), env, fixture.options), isCode('AUTH_CSRF', 403));
  }
  await assert.rejects(signInOwner(request(undefined, { method: 'POST', csrf: fixture.body.csrfToken, body: { credential, nonce: fixture.body.nonce } }), env, fixture.options), isCode('AUTH_REQUIRED', 401));
  assert.equal(calls, 0);
});

test('expired, forged and cross-browser challenge cookies fail closed', async () => {
  const first = await challenge();
  const second = await challenge();
  const credential = await token(first.body.nonce);
  await assert.rejects(signInOwner(request(undefined, { method: 'POST', cookie: first.cookie, csrf: first.body.csrfToken, body: { credential, nonce: first.body.nonce } }), env, { ...first.options, now: () => current + 600000 }), isCode('AUTH_REQUIRED', 401));
  await assert.rejects(signInOwner(request(undefined, { method: 'POST', cookie: second.cookie, csrf: first.body.csrfToken, body: { credential, nonce: first.body.nonce } }), env, second.options), isCode('AUTH_CSRF', 403));
  const expired = await getAuthChallenge(request(undefined, { cookie: first.cookie }), env, { ...first.options, now: () => current + 600000 });
  assert.notEqual((await expired.json()).nonce, first.body.nonce);
});

test('Google ID token validates signature, audience, issuer, nonce, issuance and expiry', async () => {
  const fixture = await challenge();
  const seconds = current / 1000;
  for (const claims of [{ aud: 'malicious-client.apps.googleusercontent.com' }, { aud: [env.GOOGLE_OAUTH_CLIENT_ID] }, { azp: 'other-client' }, { iss: 'https://attacker.example' }, { nonce: 'A'.repeat(43) }, { exp: seconds }, { exp: seconds + 9000 }, { iat: seconds + 61 }, { iat: seconds - 3601 }, { iat: 'not-a-number' }, { nbf: seconds + 1 }, { sub: '' }]) await assert.rejects(login(fixture, claims), isCode('AUTH_REQUIRED', 401));
  const credential = await token(fixture.body.nonce);
  const [first, second] = credential.split('.');
  await assert.rejects(signInOwner(request(undefined, { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken, body: { credential: `${first}.${second}.AAAA`, nonce: fixture.body.nonce } }), env, fixture.options), isCode('AUTH_REQUIRED', 401));
  const alternateIssuer = await login(fixture, { iss: 'accounts.google.com' });
  assert.equal(alternateIssuer.status, 200);
});

test('Google account must be the exact allowlisted, verified, Google-authoritative email', async () => {
  const fixture = await challenge();
  for (const claims of [{ email: 'other.synthetic@gmail.com' }, { email: 'owner.synthetic+alias@gmail.com' }, { email_verified: false }, { email_verified: 'true' }, { email: undefined }]) await assert.rejects(login(fixture, claims), isCode('AUTH_FORBIDDEN', 403));
  const externalEnv = { ...env, BOOKING_OWNER_EMAIL: 'owner@synthetic.example' };
  const external = await challenge({}, externalEnv);
  await assert.rejects(login(external, { email: externalEnv.BOOKING_OWNER_EMAIL }, {}, externalEnv), isCode('AUTH_FORBIDDEN', 403));
  await assert.rejects(login(external, { email: externalEnv.BOOKING_OWNER_EMAIL, hd: 'unrelated.example' }, {}, externalEnv), isCode('AUTH_FORBIDDEN', 403));
  assert.equal((await login(external, { email: externalEnv.BOOKING_OWNER_EMAIL, hd: 'synthetic.example' }, {}, externalEnv)).status, 200);
});

test('algorithm substitution and caller-controlled key URLs are rejected before I/O', async () => {
  let calls = 0;
  const fixture = await challenge({ fetch: async () => { calls++; return jwks(); } });
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: '../../untrusted' }, { jku: 'https://attacker.example/key' }, { jwk: publicKey }, { crit: ['nonce'] }]) {
    const credential = await token(fixture.body.nonce, {}, header);
    await assert.rejects(signInOwner(request(undefined, { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken, body: { credential, nonce: fixture.body.nonce } }), env, fixture.options), isCode('AUTH_REQUIRED', 401));
  }
  assert.equal(calls, 0);
});

test('JWKS caches according to its lifetime and shares concurrent refreshes', async () => {
  let calls = 0;
  let time = current;
  const fetcher = async () => { calls++; return json({ keys: [{ ...publicKey, kid: 'synthetic-key', alg: 'RS256' }] }, { 'Cache-Control': 'public, max-age=2' }); };
  const fixture = await challenge({ fetch: fetcher, now: () => time });
  const other = await challenge({ fetch: fetcher, now: () => time });
  await Promise.all([login(fixture), login(other)]);
  assert.equal(calls, 1);
  await login(fixture);
  assert.equal(calls, 1);
  time += 3000;
  await login(fixture);
  assert.equal(calls, 2);
});

test('rotated Google key IDs refresh once while unknown IDs cannot force repeated I/O', async () => {
  let calls = 0;
  let time = current;
  const fixture = await challenge({ now: () => time, fetch: async () => {
    calls++;
    return json({ keys: [{ ...publicKey, kid: calls === 1 ? 'synthetic-key' : 'rotated-key', alg: 'RS256' }] }, { 'Cache-Control': 'max-age=300' });
  } });
  await login(fixture);
  const credential = await token(fixture.body.nonce, {}, { kid: 'rotated-key' });
  const send = () => signInOwner(request(undefined, { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken, body: { credential, nonce: fixture.body.nonce } }), env, fixture.options);
  await assert.rejects(send(), isCode('AUTH_REQUIRED', 401));
  await assert.rejects(send(), isCode('AUTH_REQUIRED', 401));
  assert.equal(calls, 1);
  time += 31000;
  assert.equal((await send()).status, 200);
  assert.equal(calls, 2);
});

test('upstream failures and malformed key documents are sanitized and never grant sessions', async () => {
  for (const upstream of [() => new Response('private upstream customer details', { status: 500 }), () => json({ keys: [] }), () => json({ keys: [{ ...publicKey, kid: 'synthetic-key', d: 'private' }] }), () => json({ keys: [{ ...publicKey, kid: 'synthetic-key', alg: 'HS256' }] }), () => new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }), () => { throw new Error('private upstream owner@email.example'); }]) {
    const fixture = await challenge({ fetch: async () => upstream() });
    await assert.rejects(login(fixture), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'AUTH_UNAVAILABLE');
      assert.equal(error.message.includes('private'), false);
      assert.equal('cause' in error, false);
      return true;
    });
  }
});

test('Google timeouts are bounded even if a fetch implementation ignores abort', async () => {
  let signal;
  const fixture = await challenge({ timeoutMs: 10, fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  await assert.rejects(login(fixture), isCode('AUTH_TIMEOUT', 503));
  assert.equal(signal.aborted, true);
});

test('slow JSON bodies are cancelled and oversized Google key responses stay bounded', async () => {
  let cancelled = false;
  const fixture = await challenge({ timeoutMs: 10 });
  const pendingBody = new ReadableStream({ cancel() { cancelled = true; } });
  const slowRequest = new Request(`${env.SITE_URL}/api/booking/auth/session`, {
    method: 'POST', headers: { Origin: env.SITE_URL, Cookie: fixture.cookie, 'X-CSRF-Token': fixture.body.csrfToken, 'Content-Type': 'application/json' }, body: pendingBody, duplex: 'half',
  });
  await assert.rejects(signInOwner(slowRequest, env, fixture.options), isCode('AUTH_TIMEOUT', 503));
  assert.equal(cancelled, true);
  const oversized = await challenge({ fetch: async () => new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(login(oversized), isCode('AUTH_UNAVAILABLE', 503));
});

test('Google no-store key responses are not cached between sign-ins', async () => {
  let calls = 0;
  const fixture = await challenge({ fetch: async () => {
    calls++;
    return json({ keys: [{ ...publicKey, kid: 'synthetic-key', alg: 'RS256' }] }, { 'Cache-Control': 'no-store, max-age=3600' });
  } });
  await login(fixture);
  await login(fixture);
  assert.equal(calls, 2);
});

test('JSON sign-in body enforces type, valid structure and byte limits', async () => {
  const fixture = await challenge();
  const base = { method: 'POST', cookie: fixture.cookie, csrf: fixture.body.csrfToken };
  await assert.rejects(signInOwner(request(undefined, { ...base, body: '{}', headers: { 'Content-Type': 'text/plain' } }), env, fixture.options), isCode('AUTH_MEDIA', 415));
  await assert.rejects(signInOwner(request(undefined, { ...base, body: '{bad json' }), env, fixture.options), isCode('AUTH_INPUT', 400));
  await assert.rejects(signInOwner(request(undefined, { ...base, body: '[]' }), env, fixture.options), isCode('AUTH_INPUT', 400));
  await assert.rejects(signInOwner(request(undefined, { ...base, body: 'x'.repeat(16385) }), env, fixture.options), isCode('AUTH_BODY', 413));
  await assert.rejects(signInOwner(request(undefined, { ...base, body: '{}', headers: { 'Content-Length': '20000' } }), env, fixture.options), isCode('AUTH_BODY', 413));
});

test('sign-out is explicit, CSRF-protected and clears both cookies without external calls', async () => {
  const fixture = await challenge();
  const response = await login(fixture);
  const session = cookie(response, sessionName);
  const { csrfToken } = await response.json();
  await assert.rejects(signOutOwner(request(undefined, { cookie: session }), env, fixture.options), isCode('AUTH_METHOD', 405));
  await assert.rejects(signOutOwner(request(undefined, { method: 'DELETE', cookie: session }), env, fixture.options), isCode('AUTH_CSRF', 403));
  const signedOut = await signOutOwner(request(undefined, { method: 'DELETE', cookie: session, csrf: csrfToken }), env, fixture.options);
  assert.deepEqual(await signedOut.json(), { authenticated: false, ownerName: 'Chii' });
  assert.equal(cookies(signedOut).length, 2);
  for (const value of cookies(signedOut)) assert.match(value, /Max-Age=0; Secure; HttpOnly; SameSite=Lax$/);
});

test('auth endpoints reject wrong methods and do not issue cookies on a different host', async () => {
  const fixture = await challenge();
  await assert.rejects(getAuthChallenge(request(undefined, { method: 'POST' }), env, fixture.options), isCode('AUTH_METHOD', 405));
  await assert.rejects(signInOwner(request(), env, fixture.options), isCode('AUTH_METHOD', 405));
  await assert.rejects(requireBookingOwner(request(undefined, { method: 'PATCH' }), env, fixture.options), isCode('AUTH_METHOD', 405));
  await assert.rejects(getAuthChallenge(new Request('https://preview.example/api/booking/auth/session'), env, fixture.options), isCode('AUTH_FORBIDDEN', 403));
  await assert.rejects(getAuthChallenge(request(undefined, { headers: { Origin: 'https://attacker.example' } }), env, fixture.options), isCode('AUTH_CSRF', 403));
});

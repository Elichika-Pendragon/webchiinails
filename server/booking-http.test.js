import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingAuthError } from './booking-auth.js';
import { BookingRequestError } from './booking-requests.js';
import { createBookingHttpHandlers, isBookingEnabled } from './booking-http.js';

// Synthetic adapters only: no resources, DB queries, credentials or network I/O.
const env = {
  BOOKING_ENABLED: 'true', SITE_URL: 'https://synthetic.example',
  BOOKING_DB: { prepare() {}, batch() {} },
  BOOKING_LINK_SECRET: 'synthetic-link-signing-secret-with-32-bytes',
  BOOKING_AUTH_SECRET: 'synthetic-auth-signing-secret-with-32-bytes',
  BOOKING_OWNER_EMAIL: 'owner.synthetic@gmail.com',
  GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'synthetic@project.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nU1lOVEhFVElD\n-----END PRIVATE KEY-----',
  GOOGLE_CALENDAR_ID: 'synthetic-calendar@group.calendar.google.com',
};
const current = Date.parse('2026-10-20T12:00:00Z');
const reviewToken = 'A'.repeat(43);
const input = { name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic-request-key-1' };
const summary = { id: 'synthetic-request-id', status: 'pending', name: input.name, whatsapp: '6281234567890', agreedPrice: 100000, deposit: 10000, remainingBalance: 90000, date: input.date, time: input.time, startISO: '2026-10-21T14:00:00+07:00', endISO: '2026-10-21T16:00:00+07:00', durationMinutes: 120, expiresAt: '2026-10-21T07:00:00.000Z' };
const created = { requestId: summary.id, status: 'pending', reviewUrl: `${env.SITE_URL}/book/approve?r=${reviewToken}`, booking: summary };
const identity = { email: env.BOOKING_OWNER_EMAIL, subject: 'synthetic-owner', csrfToken: 'C'.repeat(43) };

function request(path, { method = 'GET', body, origin = env.SITE_URL, headers = {}, base = env.SITE_URL } = {}) {
  const values = { ...headers };
  if (!['GET', 'HEAD'].includes(method) && origin !== null) values.Origin = origin;
  if (body !== undefined && !Object.keys(values).some(key => key.toLowerCase() === 'content-type')) values['Content-Type'] = 'application/json';
  return new Request(`${base}/api/booking/${path}`, { method, headers: values, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}

function fixture(extra = {}) {
  const calls = [];
  const provider = { availability() {}, createApprovedAppointment() {}, reconcileApprovedAppointment() {} };
  const options = {
    now: () => current,
    createBookingRequest: async (config, body, settings) => { calls.push(['create', config, body, settings]); return created; },
    getBookingRequest: async (config, token, settings) => { calls.push(['read', config, token, settings]); return summary; },
    decideBookingRequest: async (config, token, action, settings) => { calls.push(['decide', config, token, action, settings]); return { ...summary, status: action === 'accept' ? 'accepted' : 'cancelled' }; },
    requireBookingOwner: async (incoming, config, settings) => { calls.push(['owner', incoming, config, settings]); return identity; },
    getAuthChallenge: async () => { calls.push(['challenge']); return Response.json({ authenticated: false, csrfToken: 'C'.repeat(43), clientId: env.GOOGLE_OAUTH_CLIENT_ID, nonce: 'N'.repeat(43) }); },
    signInOwner: async () => { calls.push(['signIn']); return Response.json({ authenticated: true, csrfToken: 'D'.repeat(43) }); },
    signOutOwner: async () => { calls.push(['signOut']); return Response.json({ authenticated: false }); },
    createGoogleCalendarProvider: (config, settings) => { calls.push(['calendar', config, settings]); return provider; },
    ...extra,
  };
  return { handlers: createBookingHttpHandlers(options), calls, provider, options };
}

function secure(response) {
  assert.match(response.headers.get('Content-Type'), /^application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
}

test('readiness requires exact activation and every binding without revealing configuration', async () => {
  const item = fixture();
  assert.equal(isBookingEnabled(env), true);
  for (const field of Object.keys(env)) {
    const missing = { ...env };
    delete missing[field];
    assert.equal(isBookingEnabled(missing), false, field);
    const status = await item.handlers.status(request('status'), missing);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { enabled: false });
    secure(status);
    for (const route of ['requests', 'review', 'session']) {
      const response = await item.handlers[route](request(route, { method: route === 'requests' ? 'POST' : 'GET', ...(route === 'requests' ? { body: input } : {}) }), missing);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'BOOKING_DISABLED');
      secure(response);
    }
  }
  assert.equal(item.calls.length, 0);
  for (const value of [true, 'TRUE', '1', 1, false, 'false', undefined]) assert.equal(isBookingEnabled({ ...env, BOOKING_ENABLED: value }), false);
  assert.deepEqual(await (await item.handlers.status(request('status'), env)).json(), { enabled: true });
});

test('unsafe origins and malformed required settings cannot enable booking', () => {
  for (const change of [{ SITE_URL: 'http://synthetic.example' }, { SITE_URL: 'https://synthetic.example/other' }, { BOOKING_DB: {} }, { BOOKING_LINK_SECRET: 'short' }, { BOOKING_AUTH_SECRET: 'short' }, { GOOGLE_OAUTH_CLIENT_ID: 'bad' }, { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'personal@gmail.com' }, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not a PEM key' }, { GOOGLE_CALENDAR_ID: 'primary' }, { GOOGLE_CALENDAR_ID: ' calendar ' }, { BOOKING_OWNER_EMAIL: ' padded@gmail.com' }]) assert.equal(isBookingEnabled({ ...env, ...change }), false);
});

test('creation passes only validated JSON fields to the ledger and uses no owner or Calendar adapter', async () => {
  const item = fixture();
  const response = await item.handlers.requests(request('requests', { method: 'POST', body: input }), env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), created);
  secure(response);
  assert.equal(item.calls.length, 1);
  assert.equal(item.calls[0][0], 'create');
  assert.equal(item.calls[0][1], env);
  assert.deepEqual(item.calls[0][2], input);
  assert.equal(item.calls[0][3].now(), current);
  assert.equal('calendar' in item.calls[0][3], false);
});

test('creation rejects cross-site, missing Origin and different-host requests before ledger access', async () => {
  const item = fixture();
  for (const change of [{ origin: null }, { origin: 'https://attacker.example' }, { base: 'https://preview.example' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } }]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: input, ...change }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'BOOKING_ORIGIN');
  }
  assert.equal(item.calls.length, 0);
});

test('method and CORS preflight fallthrough fail closed with explicit allowed methods', async () => {
  const item = fixture();
  for (const [handler, route, method, allowed] of [['status', 'status', 'POST', 'GET'], ['requests', 'requests', 'GET', 'POST'], ['review', `review?token=${reviewToken}`, 'DELETE', 'GET, POST'], ['session', 'auth/session', 'PUT', 'GET, POST, DELETE'], ['requests', 'requests', 'OPTIONS', 'POST']]) {
    const response = await item.handlers[handler](request(route, { method }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allowed);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
});

test('creation rejects malformed, oversized, non-JSON and unexpected fields before storage', async () => {
  const item = fixture();
  for (const [body, headers, status, code] of [
    [input, { 'Content-Type': 'text/plain' }, 415, 'BOOKING_MEDIA'],
    ['{bad json', {}, 400, 'BOOKING_INPUT'],
    ['[]', {}, 400, 'BOOKING_INPUT'],
    ['x'.repeat(8193), {}, 413, 'BOOKING_BODY'],
    [input, { 'Content-Length': '9000' }, 413, 'BOOKING_BODY'],
    [{ ...input, approved: true }, {}, 400, 'BOOKING_INPUT'],
    [{ ...input, deposit: '1' }, {}, 400, 'BOOKING_INPUT'],
    [{ ...input, agreedPrice: 100000 }, {}, 400, 'BOOKING_INPUT'],
    [{ name: input.name }, {}, 400, 'BOOKING_INPUT'],
  ]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body, headers }), env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
});

test('slow request bodies are timed out and cancelled without touching the ledger', async () => {
  let cancelled = false;
  const item = fixture({ bodyTimeoutMs: 10 });
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const incoming = new Request(`${env.SITE_URL}/api/booking/requests`, { method: 'POST', headers: { Origin: env.SITE_URL, 'Content-Type': 'application/json' }, body, duplex: 'half' });
  const response = await item.handlers.requests(incoming, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'BOOKING_TIMEOUT');
  assert.equal(cancelled, true);
  assert.equal(item.calls.length, 0);
});

test('unauthenticated review cannot inspect tokens, bodies or private ledger data', async () => {
  const item = fixture({ requireBookingOwner: async () => { throw new BookingAuthError('AUTH_REQUIRED'); } });
  for (const incoming of [request('review?token=invalid'), request(`review?token=${reviewToken}`, { method: 'POST', body: '{bad json' })]) {
    const response = await item.handlers.review(incoming, env);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'AUTH_REQUIRED');
    assert.equal(JSON.stringify(body).includes(summary.name), false);
    assert.equal(JSON.stringify(body).includes(env.BOOKING_OWNER_EMAIL), false);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
});

test('read-only review authenticates first and forwards verified internal owner identity', async () => {
  const item = fixture();
  const response = await item.handlers.review(request(`review?token=${reviewToken}`), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), summary);
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'read']);
  assert.equal(item.calls[1][2], reviewToken);
  assert.deepEqual(item.calls[1][3].owner, { email: identity.email, subject: identity.subject, verified: true });
  assert.equal('csrfToken' in item.calls[1][3].owner, false);
  assert.equal('calendar' in item.calls[1][3], false);
});

test('malformed and duplicate review tokens produce no store lookup after authentication', async () => {
  const item = fixture();
  for (const path of ['review', 'review?token=invalid', `review?token=${reviewToken}&token=${reviewToken}`, `review?token=${reviewToken}&other=1`]) {
    const response = await item.handlers.review(request(path), env);
    assert.equal(response.status, 404);
  }
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'owner', 'owner', 'owner']);
});

test('owner mutation CSRF rejection occurs before decision payload parsing or storage', async () => {
  const item = fixture({ requireBookingOwner: async incoming => {
    assert.equal(incoming.method, 'POST');
    assert.equal(incoming.headers.get('Origin'), env.SITE_URL);
    throw new BookingAuthError('AUTH_CSRF');
  } });
  const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: '{bad json' }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'AUTH_CSRF');
  assert.equal(item.calls.length, 0);
});

test('cancellation forwards only the explicit action and never instantiates Calendar', async () => {
  const item = fixture();
  const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: { action: 'cancel' }, headers: { 'X-CSRF-Token': identity.csrfToken } }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'cancelled');
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'decide']);
  assert.equal(item.calls[1][3], 'cancel');
  assert.equal('calendar' in item.calls[1][4], false);
});

test('accept lazily caches the Calendar provider per credential set and invalidates rotations', async () => {
  const item = fixture();
  const send = config => item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: { action: 'accept' }, headers: { 'X-CSRF-Token': identity.csrfToken } }), config);
  assert.equal((await send(env)).status, 200);
  assert.equal((await send({ ...env })).status, 200);
  assert.equal(item.calls.filter(call => call[0] === 'calendar').length, 1);
  const decision = item.calls.find(call => call[0] === 'decide');
  assert.equal(decision[4].calendar, item.provider);
  assert.equal(decision[4].owner.verified, true);
  assert.equal((await send({ ...env, GOOGLE_CALENDAR_ID: 'rotated-calendar@group.calendar.google.com' })).status, 200);
  assert.equal(item.calls.filter(call => call[0] === 'calendar').length, 2);
});

test('invalid decisions and oversized bodies never initialize Calendar or decide', async () => {
  const item = fixture();
  for (const body of [{ action: 'approve' }, { action: 'accept', approved: true }, {}, { action: 'accept', note: 'x'.repeat(1024) }]) {
    const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body }), env);
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal(item.calls.every(call => call[0] === 'owner'), true);
});

test('auth/session delegates its three methods without touching store or Calendar and preserves cookies', async () => {
  const upstreamHeaders = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public' });
  upstreamHeaders.append('Set-Cookie', '__Secure-chii_booking_owner=synthetic; Path=/api/booking; Secure; HttpOnly');
  upstreamHeaders.append('Set-Cookie', '__Secure-chii_booking_challenge=; Path=/api/booking; Max-Age=0; Secure; HttpOnly');
  const item = fixture({ signInOwner: async () => new Response(JSON.stringify({ authenticated: true, csrfToken: 'D'.repeat(43) }), { headers: upstreamHeaders }) });
  const signedIn = await item.handlers.session(request('auth/session', { method: 'POST', body: { credential: 'synthetic', nonce: 'N'.repeat(43) } }), env);
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).authenticated, true);
  assert.equal(signedIn.headers.getSetCookie().length, 2);
  secure(signedIn);
  assert.equal((await item.handlers.session(request('auth/session'), env)).status, 200);
  assert.equal((await item.handlers.session(request('auth/session', { method: 'DELETE', headers: { 'X-CSRF-Token': identity.csrfToken } }), env)).status, 200);
  assert.deepEqual(item.calls.map(call => call[0]), ['challenge', 'signOut']);
});

test('typed failures preserve safe status/code while untrusted details and unknown errors are redacted', async () => {
  const privateDetail = 'private-email@example.com private-key synthetic-secret';
  const validation = new BookingRequestError('BOOKING_INPUT', 400, { name: privateDetail, date: 'bad date', password: privateDetail });
  validation.message = privateDetail;
  const item = fixture({ createBookingRequest: async () => { throw validation; } });
  const response = await item.handlers.requests(request('requests', { method: 'POST', body: input }), env);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'BOOKING_INPUT');
  assert.deepEqual(Object.keys(body.fields).sort(), ['date', 'name']);
  assert.equal(JSON.stringify(body).includes(privateDetail), false);
  for (const error of [new Error(privateDetail), { status: 400, code: privateDetail, message: privateDetail }, new BookingRequestError(privateDetail, 400)]) {
    const failing = fixture({ createBookingRequest: async () => { throw error; } });
    const safe = await failing.handlers.requests(request('requests', { method: 'POST', body: input }), env);
    assert.equal(safe.status, 503);
    assert.deepEqual(await safe.json(), { code: 'BOOKING_UNAVAILABLE', message: 'Permintaan belum dapat diproses. Coba lagi sebentar.' });
  }
});

test('Pages wrappers resolve correctly and remain disabled without configuration', async () => {
  for (const [path, method, status] of [['status', 'GET', 200], ['requests', 'POST', 503], ['review', 'GET', 503], ['auth/session', 'GET', 503]]) {
    const wrapper = await import(`../functions/api/booking/${path}.js`);
    const response = await wrapper.onRequest({ request: request(path, { method }), env: {} });
    assert.equal(response.status, status);
    secure(response);
  }
});

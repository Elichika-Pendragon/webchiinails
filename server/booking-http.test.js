import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingAuthError } from './booking-auth.js';
import { BookingRequestError } from './booking-requests.js';
import { createBookingHttpHandlers, isBookingEnabled } from './booking-http.js';
import { proof, proofBytes } from './fixtures/payment-proof.js';
import { PAYMENT_PROOF_BODY_MAX_BYTES } from './booking-proofs.js';

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
const input = { name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic-request-key-1', proof };
const summary = { id: 'synthetic-request-id', status: 'pending', name: input.name, whatsapp: '6281234567890', agreedPrice: 100000, deposit: 20000, paymentMode: 'deposit', paymentPolicy: 'min20k-v2', remainingBalance: 80000, date: input.date, time: input.time, startISO: '2026-10-21T14:00:00+07:00', endISO: '2026-10-21T16:00:00+07:00', durationMinutes: 120, expiresAt: '2026-10-21T07:00:00.000Z' };
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
  const provider = { availability() {}, createApprovedAppointment() {}, reconcileApprovedAppointment() {}, readAppointmentState() {}, verifyCalendarWriteAccess() {} };
  const options = {
    now: () => current,
    createBookingRequest: async (config, body, settings) => { calls.push(['create', config, body, settings]); return created; },
    getBookingRequest: async (config, token, settings) => { calls.push(['read', config, token, settings]); return summary; },
    decideBookingRequest: async (config, token, action, settings) => { calls.push(['decide', config, token, action, settings]); return { ...summary, status: action === 'accept' ? 'accepted' : 'cancelled' }; },
    getBookingAvailability: async (config, selection, settings) => { calls.push(['availability', config, selection, settings]); return { ...selection, timeZone: 'Asia/Jakarta', slots: [{ time: '08:00', available: true }, { time: '08:30', available: false }] }; },
    getBookingCalendarMonth: async (config, selection, settings) => { calls.push(['calendarMonth', config, selection, settings]); return { ...selection, durationMinutes: Number(selection.durationMinutes), timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] }; },
    getBookingPaymentProof: async (config, token, settings) => { calls.push(['proof', config, token, settings]); return proofBytes; },
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
    for (const route of ['requests', 'review', 'session', 'availability', 'calendar', 'proof']) {
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

test('creation forwards the read-only availability adapter without requiring owner auth', async () => {
  const item = fixture();
  const response = await item.handlers.requests(request('requests', { method: 'POST', body: input }), env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), created);
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'create']);
  assert.equal(item.calls[1][1], env);
  assert.deepEqual(item.calls[1][2], input);
  assert.equal(item.calls[1][3].now(), current);
  assert.equal(item.calls[1][3].calendar, item.provider);
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

test('public payment mode permits only deposit or full, retaining omitted-mode cached-client compatibility', async () => {
  const item = fixture();
  for (const paymentMode of ['deposit', 'full']) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, paymentMode } }), env);
    assert.equal(response.status, 201);
    assert.equal(item.calls.at(-1)[2].paymentMode, paymentMode);
  }
  const count = item.calls.length;
  for (const paymentMode of ['legacy', '', 'cash', 'FULL', true, null, {}, []]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, paymentMode } }), env);
    assert.equal(response.status, 400);
  }
  assert.equal(item.calls.length, count);
});

test('public design and duration fields are strict strings and permit only the agreed combinations', async () => {
  const item = fixture();
  for (const [designType, durationMinutes] of [['plain', '60'], ['simple', '60'], ['simple', '120'], ['full-art', '180'], ['full-art', '240'], ['full-art', '300']]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, designType, durationMinutes } }), env);
    assert.equal(response.status, 201);
    assert.equal(item.calls.at(-1)[2].durationMinutes, durationMinutes);
  }
  const count = item.calls.length;
  for (const [designType, durationMinutes] of [['legacy', '120'], ['plain', '120'], ['simple', '300'], ['full-art', 180], ['full-art', '180.0'], [null, '60']]) {
    assert.equal((await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, designType, durationMinutes } }), env)).status, 400);
  }
  assert.equal(item.calls.length, count);
});

test('public availability uses bounded same-origin POST JSON and returns only occupancy without owner auth', async () => {
  const item = fixture();
  const route = 'availability';
  const body = { date: '2026-10-21', designType: 'full-art', durationMinutes: '180' };
  const incoming = extra => request(route, { method: 'POST', body, ...extra });
  const response = await item.handlers.availability(incoming(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { date: '2026-10-21', designType: 'full-art', durationMinutes: 180, timeZone: 'Asia/Jakarta', slots: [{ time: '08:00', available: true }, { time: '08:30', available: false }] });
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'availability']);
  const bad = fixture();
  for (const change of [{}, { ...body, extra: '1' }, { ...body, designType: 'legacy' }, { ...body, durationMinutes: '120' }, { ...body, durationMinutes: 180 }, { ...body, date: '2026-02-30' }, { ...body, date: '2027-12-31' }, { ...body, date: '2026-10-19' }]) {
    assert.equal((await bad.handlers.availability(incoming({ body: change }), env)).status, 400);
  }
  assert.equal((await bad.handlers.availability(request(`${route}?extra=1`, { method: 'POST', body }), env)).status, 400);
  assert.equal(bad.calls.length, 0);
  assert.equal((await bad.handlers.availability(incoming({ base: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.availability(incoming({ origin: null }), env)).status, 403);
  assert.equal((await bad.handlers.availability(request(route), env)).status, 405);
  const failing = fixture({ getBookingAvailability: async () => { throw new BookingRequestError('CALENDAR_UNAVAILABLE'); } });
  const failure = await failing.handlers.availability(incoming(), env);
  assert.equal(failure.status, 503);
  assert.equal('slots' in await failure.json(), false);
});

test('month Calendar route returns only bounded closure dates through same-origin POST without owner authentication', async () => {
  const item = fixture();
  const body = { month: '2026-10', designType: 'simple', durationMinutes: '120' };
  const response = await item.handlers.calendar(request('calendar', { method: 'POST', body }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { month: '2026-10', designType: 'simple', durationMinutes: 120, timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] });
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'calendarMonth']);
  assert.deepEqual(item.calls[1][2], body);
  assert.equal(item.calls[1][3].calendar, item.provider);
  const bad = fixture();
  for (const changed of [{}, { month: '2026-10' }, { ...body, extra: true }, { ...body, designType: 'plain' }, { ...body, durationMinutes: 120 }, { ...body, designType: 'legacy' }, ...[202610, '2026-1', '2026-13', '0000-10', '2026-10\n', '2026-09', '2027-02'].map(month => ({ ...body, month }))]) {
    assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body: changed }), env)).status, 400);
  }
  assert.equal((await bad.handlers.calendar(request('calendar?extra=1', { method: 'POST', body }), env)).status, 400);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, origin: null }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, origin: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, base: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Sec-Fetch-Site': 'cross-site' } }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Content-Length': '1025' } }), env)).status, 413);
  assert.equal(bad.calls.length, 0);
});

test('month Calendar rejects private, mismatched or malformed internal response shapes and redacts failures', async () => {
  const monthInput = { month: '2026-10', designType: 'simple', durationMinutes: '120' };
  const valid = { ...monthInput, durationMinutes: 120, timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] };
  for (const result of [null, { ...valid, eventName: 'private-event' }, { ...valid, month: '2026-11' }, { ...valid, designType: 'plain' }, { ...valid, durationMinutes: '120' }, { ...valid, durationMinutes: 60 }, { ...valid, minDate: '2026-10-01' }, { ...valid, maxDate: '2026-11-01' }, { ...valid, timeZone: 'UTC' }, { ...valid, closedDates: null }, { ...valid, closedDates: ['2026-10-24', '2026-10-24'] }, { ...valid, closedDates: ['2026-10-25', '2026-10-24'] }, { ...valid, closedDates: ['2026-10-19'] }, { ...valid, closedDates: ['2026-10-32'] }, { ...valid, closedDates: ['2026-10-24\n'] }, { ...valid, closedDates: Array(32).fill('2026-10-24') }]) {
    const item = fixture({ getBookingCalendarMonth: async () => result });
    const response = await item.handlers.calendar(request('calendar', { method: 'POST', body: monthInput }), env);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(await response.json()).includes('private-event'), false);
    secure(response);
  }
  for (const error of [new Error('private token event email'), new BookingRequestError('CALENDAR_UNAVAILABLE')]) {
    const item = fixture({ getBookingCalendarMonth: async () => { throw error; } });
    const response = await item.handlers.calendar(request('calendar', { method: 'POST', body: monthInput }), env);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal('closedDates' in body, false);
    assert.equal(JSON.stringify(body).includes('private token'), false);
  }
});

test('method and CORS preflight fallthrough fail closed with explicit allowed methods', async () => {
  const item = fixture();
  for (const [handler, route, method, allowed] of [['status', 'status', 'POST', 'GET'], ['requests', 'requests', 'GET', 'POST'], ['review', `review?token=${reviewToken}`, 'DELETE', 'GET, POST'], ['session', 'auth/session', 'PUT', 'GET, POST, DELETE'], ['requests', 'requests', 'OPTIONS', 'POST'], ['calendar', 'calendar', 'GET', 'POST'], ['calendar', 'calendar', 'OPTIONS', 'POST']]) {
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
    ['x'.repeat(PAYMENT_PROOF_BODY_MAX_BYTES + 1), {}, 413, 'BOOKING_BODY'],
    [input, { 'Content-Length': String(PAYMENT_PROOF_BODY_MAX_BYTES + 1) }, 413, 'BOOKING_BODY'],
    [{ ...input, proof: undefined }, {}, 400, 'BOOKING_INPUT'],
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

test('payment-proof image requires owner auth before token lookup and uses private image-only response headers', async () => {
  const denied = fixture({ requireBookingOwner: async () => { throw new BookingAuthError('AUTH_REQUIRED'); } });
  for (const token of ['invalid', reviewToken]) {
    const response = await denied.handlers.proof(request(`proof?token=${token}`), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'AUTH_REQUIRED');
    secure(response);
  }
  assert.equal(denied.calls.length, 0);
  const item = fixture();
  const response = await item.handlers.proof(request(`proof?token=${reviewToken}`), env);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), proofBytes);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Content-Length'), String(proofBytes.length));
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'proof']);
  assert.deepEqual(item.calls[1][3].owner, { email: identity.email, subject: identity.subject, verified: true });
});

test('payment-proof route rejects bad or duplicate tokens, cross-site reads, mutations and expired bytes', async () => {
  const item = fixture();
  for (const suffix of ['?token=invalid', `?token=${reviewToken}&token=${reviewToken}`, `?token=${reviewToken}&extra=1`]) assert.equal((await item.handlers.proof(request(`proof${suffix}`), env)).status, 404);
  assert.equal(item.calls.every(call => call[0] === 'owner'), true);
  const before = item.calls.length;
  assert.equal((await item.handlers.proof(request(`proof?token=${reviewToken}`, { origin: 'https://attacker.example', headers: { Origin: 'https://attacker.example' } }), env)).status, 403);
  assert.equal((await item.handlers.proof(request(`proof?token=${reviewToken}`, { method: 'POST', body: {} }), env)).status, 405);
  assert.equal(item.calls.length, before);
  const expired = fixture({ getBookingPaymentProof: async () => { throw new BookingRequestError('PROOF_EXPIRED', 410); } });
  const response = await expired.handlers.proof(request(`proof?token=${reviewToken}`), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'PROOF_EXPIRED');
  secure(response);
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
  for (const [path, method, status] of [['status', 'GET', 200], ['requests', 'POST', 503], ['review', 'GET', 503], ['auth/session', 'GET', 503], ['availability', 'GET', 503], ['calendar', 'POST', 503], ['proof', 'GET', 503]]) {
    const wrapper = await import(`../functions/api/booking/${path}.js`);
    const response = await wrapper.onRequest({ request: request(path, { method }), env: {} });
    assert.equal(response.status, status);
    secure(response);
  }
});

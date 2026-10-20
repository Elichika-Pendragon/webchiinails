import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCalendarProvider, GoogleCalendarError } from './google-calendar.js';

// Ephemeral synthetic key; no real account, credential, network or Calendar call.
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const exported = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(exported).toString('base64')}\n-----END PRIVATE KEY-----`;
const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'booking@synthetic-test.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem, GOOGLE_CALENDAR_ID: 'synthetic-calendar@group.calendar.google.com' };
const current = Date.parse('2026-10-20T00:00:00+07:00');
const range = { timeMin: '2026-10-20T08:00:00+07:00', timeMax: '2026-10-20T17:00:00+07:00' };
const appointment = { bookingId: 'booking_test_001', name: 'Client Test', whatsapp: '081234567890', agreedPrice: 155000, date: '2026-10-20', time: '08:00' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
const freeBusy = (busy = [], other = {}) => ({ kind: 'calendar#freeBusy', ...range, calendars: { [env.GOOGLE_CALENDAR_ID]: { busy } }, ...other });
const provider = (fetch, extra = {}, config = {}) => createGoogleCalendarProvider({ ...env, ...config }, { fetch, now: () => current, ...extra });
const isCode = code => error => error instanceof GoogleCalendarError && error.code === code;

test('service-account JWT is signed RS256 with limited scopes, correct audience and one-hour TTL', async () => {
  let calls = 0;
  const calendar = provider(async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      const params = new URLSearchParams(init.body);
      assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const parts = params.get('assertion').split('.');
      assert.equal(parts.length, 3);
      assert.deepEqual(JSON.parse(Buffer.from(parts[0], 'base64url')), { alg: 'RS256', typ: 'JWT' });
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      assert.equal(claims.iss, env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
      assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
      assert.deepEqual(claims.scope.split(' '), ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.events.freebusy']);
      assert.equal(claims.iat, current / 1000);
      assert.equal(claims.exp - claims.iat, 3600);
      assert.equal('sub' in claims, false);
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(parts[2], 'base64url'), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)), true);
      return token();
    }
    assert.equal(url, 'https://www.googleapis.com/calendar/v3/freeBusy');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
    assert.deepEqual(JSON.parse(init.body), { ...range, timeZone: 'Asia/Jakarta', calendarExpansionMax: 1, items: [{ id: env.GOOGLE_CALENDAR_ID }] });
    return json(freeBusy());
  });
  assert.deepEqual(await calendar.availability(range), { ...range, timeZone: 'Asia/Jakarta', busyIntervals: [] });
  assert.equal(calls, 2);
});

test('access tokens cache, concurrent calls share authorization, and near-expiry refreshes', async () => {
  let time = current;
  let tokens = 0;
  const calendar = provider(async url => {
    if (url.includes('oauth2')) { tokens++; return token(); }
    return json(freeBusy());
  }, { now: () => time });
  await Promise.all([calendar.availability(range), calendar.availability(range)]);
  await calendar.availability(range);
  assert.equal(tokens, 1);
  time += 3540000;
  await calendar.availability(range);
  assert.equal(tokens, 2);
});

test('explicit calendar selection and service-account PKCS8 configuration are required', async () => {
  for (const GOOGLE_CALENDAR_ID of ['', 'primary', 'bad\ncalendar', ' padded ']) assert.throws(() => provider(() => token(), {}, { GOOGLE_CALENDAR_ID }), isCode('CALENDAR_CONFIG'));
  assert.throws(() => provider(() => token(), {}, { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'customer@gmail.com' }), isCode('CALENDAR_CONFIG'));
  let calls = 0;
  const invalid = provider(async () => { calls++; return token(); }, {}, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not a private key' });
  await assert.rejects(invalid.availability(range), isCode('CALENDAR_CONFIG'));
  assert.equal(calls, 0);
  const escaped = provider(async url => url.includes('oauth2') ? token() : json(freeBusy()), {}, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem.replace(/\n/g, '\\n') });
  assert.deepEqual((await escaped.availability(range)).busyIntervals, []);
});

test('availability ranges reject unbounded, local-time and invalid-calendar dates before I/O', async () => {
  let calls = 0;
  const calendar = provider(async () => { calls++; return token(); });
  for (const value of [null, [], {}, { ...range, timeMin: '2026-10-20T08:00:00' }, { ...range, timeMin: '2026-02-30T08:00:00Z' }, { ...range, timeMax: range.timeMin }, { ...range, timeMax: '2026-12-01T00:00:00Z' }, { timeMin: '2027-03-01T00:00:00Z', timeMax: '2027-03-02T00:00:00Z' }]) await assert.rejects(calendar.availability(value), isCode('CALENDAR_INPUT'));
  assert.equal(calls, 0);
});

test('freeBusy normalizes offsets, sorts and merges overlap while returning no event details', async () => {
  const busy = [
    { start: '2026-10-20T04:30:00Z', end: '2026-10-20T06:00:00Z' },
    { start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T12:00:00+07:00' },
    { start: '2026-10-20T07:00:00+07:00', end: '2026-10-20T08:30:00+07:00', summary: 'must not return' },
  ];
  const calendar = provider(async url => url.includes('oauth2') ? token() : json(freeBusy(busy)));
  const result = await calendar.availability(range);
  assert.deepEqual(result.busyIntervals, [
    { start: Date.parse(range.timeMin), end: Date.parse('2026-10-20T08:30:00+07:00') },
    { start: Date.parse('2026-10-20T10:00:00+07:00'), end: Date.parse('2026-10-20T13:00:00+07:00') },
  ]);
  assert.equal(JSON.stringify(result).includes(env.GOOGLE_CALENDAR_ID), false);
  assert.equal(JSON.stringify(result).includes('must not return'), false);
});

test('HTTP 200 per-calendar errors and malformed/freeBusy data fail closed', async () => {
  const bad = [
    freeBusy([], { calendars: { [env.GOOGLE_CALENDAR_ID]: { busy: [], errors: [{ reason: 'notFound' }] } } }),
    freeBusy([], { calendars: {} }),
    freeBusy([], { timeMax: '2026-10-21T17:00:00+07:00' }),
    freeBusy([], { calendars: { [env.GOOGLE_CALENDAR_ID]: {} } }),
    freeBusy([{ start: '2026-10-20', end: '2026-10-21' }]),
    freeBusy([{ start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T09:00:00+07:00' }]),
    freeBusy([{ start: '2026-11-20T10:00:00+07:00', end: '2026-11-20T11:00:00+07:00' }]),
    [],
  ];
  for (const payload of bad) {
    const calendar = provider(async url => url.includes('oauth2') ? token() : json(payload));
    await assert.rejects(calendar.availability(range), isCode('CALENDAR_RESPONSE'));
  }
});

test('approved appointment writes a private, opaque WIB two-hour event without attendees', async () => {
  let body;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(url, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?sendUpdates=none`);
    assert.equal(init.method, 'POST');
    body = JSON.parse(init.body);
    return json(body);
  });
  const result = await calendar.createApprovedAppointment(appointment);
  assert.match(result.eventId, /^[0-9a-v]{5,1024}$/);
  assert.equal(result.reconciled, false);
  assert.deepEqual(body.start, { dateTime: '2026-10-20T08:00:00+07:00', timeZone: 'Asia/Jakarta' });
  assert.deepEqual(body.end, { dateTime: '2026-10-20T10:00:00+07:00', timeZone: 'Asia/Jakarta' });
  assert.equal(body.visibility, 'private');
  assert.equal(body.transparency, 'opaque');
  assert.equal(body.status, 'confirmed');
  assert.equal('attendees' in body, false);
  assert.equal('approved' in body, false);
  assert.match(body.description, /WhatsApp: \+6281234567890/);
  assert.match(body.description, /Harga disepakati: Rp155000\nDP 10%: Rp15500\n/);
  assert.equal(JSON.stringify(result).includes(appointment.name), false);
});

test('event DP and fingerprint ignore legacy deposit input and recalculate from the total', async () => {
  const bodies = [];
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    const body = JSON.parse(init.body);
    bodies.push(body);
    return json(body);
  });
  await calendar.createApprovedAppointment(appointment);
  const original = bodies[0];
  for (const deposit of [undefined, null, 0, 1, 50000, 155000, '0', '1e5', 'invalid', {}, []]) {
    await calendar.createApprovedAppointment({ ...appointment, deposit });
    assert.deepEqual(bodies.at(-1), original);
  }
  const unread = Object.defineProperty({ ...appointment }, 'deposit', { get() { throw new Error('must not read customer deposit'); } });
  await calendar.createApprovedAppointment(unread);
  assert.deepEqual(bodies.at(-1), original);
  await calendar.createApprovedAppointment({ ...appointment, agreedPrice: 155001, deposit: 50000 });
  const changed = bodies.at(-1);
  assert.equal(changed.id, original.id);
  assert.match(changed.description, /Harga disepakati: Rp155001\nDP 10%: Rp15501\n/);
  assert.notEqual(changed.extendedProperties.private.fingerprint, original.extendedProperties.private.fingerprint);
});

test('weekday 14.00 last-book boundary creates a two-hour event ending at 16.00', async () => {
  let body;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    body = JSON.parse(init.body);
    return json(body);
  });
  await calendar.createApprovedAppointment({ ...appointment, time: '14:00' });
  assert.deepEqual(body.start, { dateTime: '2026-10-20T14:00:00+07:00', timeZone: 'Asia/Jakarta' });
  assert.deepEqual(body.end, { dateTime: '2026-10-20T16:00:00+07:00', timeZone: 'Asia/Jakarta' });
});

test('invalid and customer-flag-only appointments cannot create events', async () => {
  let calls = 0;
  const calendar = provider(async () => { calls++; return token(); });
  for (const value of [null, [], { approved: true }, { ...appointment, bookingId: 'short' }, { ...appointment, bookingId: 'booking_test\n' }, { ...appointment, time: '07:00' }, { ...appointment, time: '14:30' }, { ...appointment, time: '15:00' }, { ...appointment, agreedPrice: 0 }, { ...appointment, agreedPrice: '1e5' }, { ...appointment, agreedPrice: 10000001 }, { ...appointment, date: '2026-02-30' }]) await assert.rejects(calendar.createApprovedAppointment(value), isCode('CALENDAR_INPUT'));
  assert.equal(calls, 0);
});

test('409 reconciles the same stable event ID and validates existing event contents', async () => {
  let stored;
  let posts = 0;
  let gets = 0;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    if (init.method === 'POST') {
      posts++;
      const body = JSON.parse(init.body);
      if (!stored) { stored = body; return json(body); }
      assert.equal(body.id, stored.id);
      return json({ error: 'duplicate' }, 409);
    }
    gets++;
    assert.ok(url.endsWith(`/events/${stored.id}`));
    return json(stored);
  });
  const first = await calendar.createApprovedAppointment(appointment);
  const retry = await calendar.createApprovedAppointment(appointment);
  assert.equal(first.eventId, retry.eventId);
  assert.equal(retry.reconciled, true);
  assert.equal(posts, 2);
  assert.equal(gets, 1);
  stored.start.dateTime = '2026-10-20T09:00:00+07:00';
  await assert.rejects(calendar.createApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
  assert.equal(posts, 3); // No replacement event is attempted after the conflict.
});

test('409 mismatched booking payload or cancelled event requires manual reconciliation', async () => {
  let stored;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    if (init.method === 'POST') {
      if (!stored) { stored = JSON.parse(init.body); return json(stored); }
      return json({}, 409);
    }
    return json(stored);
  });
  await calendar.createApprovedAppointment(appointment);
  await assert.rejects(calendar.createApprovedAppointment({ ...appointment, agreedPrice: 165000 }), isCode('CALENDAR_CONFLICT'));
  stored.status = 'cancelled';
  await assert.rejects(calendar.createApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
});

test('delayed retries reconcile an existing past appointment without inserting a past event', async () => {
  let time = current;
  let stored;
  let posts = 0;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    if (init.method === 'POST') { posts++; stored = JSON.parse(init.body); return json(stored); }
    return stored ? json(stored) : json({}, 404);
  }, { now: () => time });
  const first = await calendar.createApprovedAppointment(appointment);
  time = Date.parse('2026-10-20T09:00:00+07:00');
  const retry = await calendar.createApprovedAppointment(appointment);
  assert.equal(retry.eventId, first.eventId);
  assert.equal(retry.reconciled, true);
  assert.equal(posts, 1);
  stored = null;
  await assert.rejects(calendar.createApprovedAppointment(appointment), isCode('CALENDAR_UNAVAILABLE'));
  assert.equal(posts, 1);
});

test('lookup-only recovery verifies the original event without any insert, even after its start', async () => {
  let stored;
  const seed = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    stored = JSON.parse(init.body);
    return json(stored);
  });
  const original = await seed.createApprovedAppointment(appointment);
  let gets = 0;
  const recovery = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.ok(url.endsWith(`/events/${original.eventId}`));
    gets++;
    return json(stored);
  }, { now: () => Date.parse('2026-10-20T09:00:00+07:00') });
  assert.deepEqual(await recovery.reconcileApprovedAppointment(appointment), { found: true, ...original, reconciled: true });
  assert.equal(gets, 1);
  stored.summary = 'Unrelated event';
  await assert.rejects(recovery.reconcileApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
});

test('lookup-only recovery distinguishes a real 404 from unavailable or malformed responses', async () => {
  let calendarCalls = 0;
  const missing = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    calendarCalls++;
    assert.equal(init.method, 'GET');
    return json({}, 404);
  });
  assert.deepEqual(await missing.reconcileApprovedAppointment(appointment), { found: false });
  assert.equal(calendarCalls, 1);
  for (const status of [401, 403, 429, 500]) {
    const failed = provider(async url => url.includes('oauth2') ? token() : json({}, status));
    await assert.rejects(failed.reconcileApprovedAppointment(appointment), isCode(status === 401 || status === 403 ? 'CALENDAR_AUTH' : 'CALENDAR_UNAVAILABLE'));
  }
  const malformed = provider(async url => url.includes('oauth2') ? token() : json({ notFound: true }));
  await assert.rejects(malformed.reconcileApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
});

test('token and provider failures contain no token, private key, contact or raw upstream text', async () => {
  const secret = 'sensitive upstream text Client Test +6281234567890 synthetic-token';
  const cases = [
    async () => json({ error_description: secret }, 400),
    async url => url.includes('oauth2') ? token() : json({ error: secret }, 403),
    async () => { throw new Error(secret); },
  ];
  for (const fetch of cases) {
    try { await provider(fetch).availability(range); assert.fail('must reject'); }
    catch (error) {
      assert.ok(error instanceof GoogleCalendarError);
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes('synthetic-token'), false);
      assert.equal('cause' in error, false);
    }
  }
  for (const payload of [{ access_token: secret, expires_in: 3600, token_type: 'Bearer' }, { access_token: 'synthetic-token', expires_in: '3600', token_type: 'Bearer' }, { access_token: 'synthetic-token', expires_in: 3600, token_type: 'other' }]) await assert.rejects(provider(async () => json(payload)).availability(range), isCode('CALENDAR_RESPONSE'));
});

test('timeouts cover stalled token requests and stalled Calendar response bodies', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(provider(never, { timeoutMs: 5 }).availability(range), isCode('CALENDAR_TIMEOUT'));
  const stalled = provider(async url => url.includes('oauth2') ? token() : { status: 200, ok: true, json: never }, { timeoutMs: 5 });
  await assert.rejects(stalled.availability(range), isCode('CALENDAR_TIMEOUT'));
});

test('a rejected cached token is cleared for a later retry without blind event retries', async () => {
  let tokenCalls = 0;
  let calendarCalls = 0;
  const calendar = provider(async url => {
    if (url.includes('oauth2')) { tokenCalls++; return token(); }
    calendarCalls++;
    return calendarCalls === 1 ? json({}, 401) : json(freeBusy());
  });
  await assert.rejects(calendar.availability(range), isCode('CALENDAR_AUTH'));
  assert.equal(calendarCalls, 1);
  await calendar.availability(range);
  assert.equal(tokenCalls, 2);
});

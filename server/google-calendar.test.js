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
const events = (items = [], other = {}) => ({ kind: 'calendar#events', items, ...other });
const emptyCalendar = (url, busy = []) => json(url.endsWith('/freeBusy') ? freeBusy(busy) : events());
const provider = (fetch, extra = {}, config = {}) => createGoogleCalendarProvider({ ...env, ...config }, { fetch, now: () => current, ...extra });
const isCode = code => error => error instanceof GoogleCalendarError && error.code === code;

test('service-account JWT is signed RS256 with limited scopes, correct audience and one-hour TTL', async () => {
  let calls = 0;
  const calendar = provider(async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
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
    assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
    if (init.method === 'GET') {
      const query = new URL(url);
      assert.equal(query.pathname, `/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`);
      assert.deepEqual(Object.fromEntries(query.searchParams), { ...range, timeZone: 'Asia/Jakarta', singleEvents: 'true', showDeleted: 'false', maxResults: '2500', fields: 'kind,nextPageToken,items(status,start(date,dateTime,timeZone),end(date,dateTime,timeZone))' });
      assert.equal(init.body, undefined);
      return json(events());
    }
    assert.equal(url, 'https://www.googleapis.com/calendar/v3/freeBusy');
    assert.deepEqual(JSON.parse(init.body), { ...range, timeZone: 'Asia/Jakarta', calendarExpansionMax: 1, items: [{ id: env.GOOGLE_CALENDAR_ID }] });
    return json(freeBusy());
  });
  assert.deepEqual(await calendar.availability(range), { ...range, timeZone: 'Asia/Jakarta', busyIntervals: [] });
  assert.equal(calls, 3);
});

test('access tokens cache, concurrent calls share authorization, and near-expiry refreshes', async () => {
  let time = current;
  let tokens = 0;
  const calendar = provider(async url => {
    if (url.includes('oauth2')) { tokens++; return token(); }
    return emptyCalendar(url);
  }, { now: () => time });
  await Promise.all([calendar.availability(range), calendar.availability(range)]);
  await calendar.availability(range);
  assert.equal(tokens, 1);
  time += 3540000;
  await calendar.availability(range);
  assert.equal(tokens, 2);
});

test('independent freeBusy and first event page start together after shared authorization', { timeout: 1000 }, async () => {
  const responses = new Map();
  let started;
  const bothStarted = new Promise(resolve => { started = resolve; });
  let tokens = 0;
  const calendar = provider(async url => {
    if (url.includes('oauth2')) { tokens++; return token(); }
    return new Promise(resolve => {
      responses.set(url.endsWith('/freeBusy') ? 'freeBusy' : 'events', resolve);
      if (responses.size === 2) started();
    });
  });
  const result = calendar.availability(range);
  await bothStarted;
  assert.deepEqual([...responses.keys()].sort(), ['events', 'freeBusy']);
  assert.equal(tokens, 1);
  responses.get('freeBusy')(json(freeBusy()));
  responses.get('events')(json(events()));
  assert.deepEqual((await result).busyIntervals, []);
});

test('explicit calendar selection and service-account PKCS8 configuration are required', async () => {
  for (const GOOGLE_CALENDAR_ID of ['', 'primary', 'bad\ncalendar', ' padded ']) assert.throws(() => provider(() => token(), {}, { GOOGLE_CALENDAR_ID }), isCode('CALENDAR_CONFIG'));
  assert.throws(() => provider(() => token(), {}, { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'customer@gmail.com' }), isCode('CALENDAR_CONFIG'));
  let calls = 0;
  const invalid = provider(async () => { calls++; return token(); }, {}, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not a private key' });
  await assert.rejects(invalid.availability(range), isCode('CALENDAR_CONFIG'));
  assert.equal(calls, 0);
  const escaped = provider(async url => url.includes('oauth2') ? token() : emptyCalendar(url), {}, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem.replace(/\n/g, '\\n') });
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
  const calendar = provider(async url => url.includes('oauth2') ? token() : emptyCalendar(url, busy));
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

test('a Free all-day event on 24 October closes that whole WIB day without exposing its details', async () => {
  const bounds = { timeMin: '2026-10-24T00:00:00+07:00', timeMax: '2026-10-25T00:00:00+07:00' };
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy([], bounds));
    const query = new URL(url).searchParams;
    assert.equal(query.get('timeMin'), bounds.timeMin);
    assert.equal(query.get('timeMax'), bounds.timeMax);
    assert.equal(query.get('singleEvents'), 'true');
    assert.equal(query.get('showDeleted'), 'false');
    assert.equal(query.get('fields').includes('transparency'), false);
    return json(events([{ status: 'confirmed', start: { date: '2026-10-24' }, end: { date: '2026-10-25' }, transparency: 'transparent', summary: 'Private birthday', id: 'private-id', attendees: [{ email: 'private@example.test' }] }]));
  });
  const result = await calendar.availability(bounds);
  assert.deepEqual(result, { ...bounds, timeZone: 'Asia/Jakarta', busyIntervals: [{ start: Date.parse(bounds.timeMin), end: Date.parse(bounds.timeMax) }] });
  for (const sensitive of ['Private birthday', 'private-id', 'private@example.test', env.GOOGLE_CALENDAR_ID, 'synthetic-token']) assert.equal(JSON.stringify(result).includes(sensitive), false);
});

test('multi-day all-day dates use WIB midnight, exclusive ends and clipped merged occupancy', async () => {
  const bounds = { timeMin: '2026-10-23T08:00:00+07:00', timeMax: '2026-10-27T12:00:00+07:00' };
  const busy = [{ start: '2026-10-26T00:00:00+07:00', end: '2026-10-26T09:00:00+07:00' }];
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy(busy, bounds));
    return json(events([
      { status: 'confirmed', start: { date: '2026-10-22', timeZone: 'Pacific/Honolulu' }, end: { date: '2026-10-24', timeZone: 'Pacific/Honolulu' } },
      { status: 'tentative', start: { date: '2026-10-24' }, end: { date: '2026-10-26' } },
      { status: 'confirmed', start: { date: '2026-10-27' }, end: { date: '2026-10-29' } },
    ]));
  });
  assert.deepEqual((await calendar.availability(bounds)).busyIntervals, [
    { start: Date.parse(bounds.timeMin), end: Date.parse('2026-10-26T09:00:00+07:00') },
    { start: Date.parse('2026-10-27T00:00:00+07:00'), end: Date.parse(bounds.timeMax) },
  ]);
});

test('ordinary Free timed events block their interval without requiring a Busy setting', async () => {
  const busy = [{ start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T11:00:00+07:00' }];
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy(busy));
    return json(events([
      { status: 'cancelled' },
      { status: 'cancelled', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } },
      { status: 'confirmed', transparency: 'transparent', start: { dateTime: range.timeMin }, end: { dateTime: range.timeMax } },
      { status: 'confirmed', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
      { status: 'confirmed', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } },
    ]));
  });
  assert.deepEqual((await calendar.availability(range)).busyIntervals, [{ start: Date.parse(range.timeMin), end: Date.parse(range.timeMax) }]);
});

test('timed events normalize explicit offsets and merge with each other and Google freeBusy', async () => {
  const busy = [{ start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T11:00:00+07:00' }];
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy(busy));
    return json(events([
      { status: 'confirmed', transparency: 'transparent', start: { dateTime: '2026-10-20T01:30:00Z' }, end: { dateTime: '2026-10-20T02:30:00Z' } },
      { status: 'tentative', start: { dateTime: '2026-10-20T10:00:00+07:00' }, end: { dateTime: '2026-10-20T12:00:00+07:00' } },
      { status: 'confirmed', start: { dateTime: '2026-10-20T04:30:00Z' }, end: { dateTime: '2026-10-20T06:00:00Z' } },
    ]));
  });
  assert.deepEqual((await calendar.availability(range)).busyIntervals, [
    { start: Date.parse('2026-10-20T08:30:00+07:00'), end: Date.parse('2026-10-20T09:30:00+07:00') },
    { start: Date.parse('2026-10-20T10:00:00+07:00'), end: Date.parse('2026-10-20T13:00:00+07:00') },
  ]);
});

test('multi-day timed events preserve overnight occupancy and clip to the requested range', async () => {
  const bounds = { timeMin: '2026-10-20T08:00:00+07:00', timeMax: '2026-10-22T17:00:00+07:00' };
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy([], bounds));
    return json(events([
      { status: 'confirmed', start: { dateTime: '2026-10-19T23:00:00+07:00' }, end: { dateTime: '2026-10-20T09:00:00+07:00' } },
      { status: 'confirmed', start: { dateTime: '2026-10-20T23:00:00+07:00' }, end: { dateTime: '2026-10-21T03:00:00+07:00' } },
      { status: 'confirmed', start: { dateTime: '2026-10-22T16:00:00+07:00' }, end: { dateTime: '2026-10-23T08:00:00+07:00' } },
    ]));
  });
  assert.deepEqual((await calendar.availability(bounds)).busyIntervals, [
    { start: Date.parse(bounds.timeMin), end: Date.parse('2026-10-20T09:00:00+07:00') },
    { start: Date.parse('2026-10-20T23:00:00+07:00'), end: Date.parse('2026-10-21T03:00:00+07:00') },
    { start: Date.parse('2026-10-22T16:00:00+07:00'), end: Date.parse(bounds.timeMax) },
  ]);
});

test('cancelled events do not block and timed interval boundaries remain exclusive', async () => {
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy());
    return json(events([
      { status: 'cancelled' },
      { status: 'cancelled', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } },
      { status: 'cancelled', start: { dateTime: range.timeMin }, end: { dateTime: range.timeMax } },
      { status: 'confirmed', start: { dateTime: '2026-10-20T07:00:00+07:00' }, end: { dateTime: range.timeMin } },
      { status: 'confirmed', start: { dateTime: range.timeMax }, end: { dateTime: '2026-10-20T18:00:00+07:00' } },
      { status: 'confirmed', start: { dateTime: '2026-10-20T16:00:00+07:00' }, end: { dateTime: range.timeMax } },
    ]));
  });
  assert.deepEqual((await calendar.availability(range)).busyIntervals, [{ start: Date.parse('2026-10-20T16:00:00+07:00'), end: Date.parse(range.timeMax) }]);
});

test('malformed timed events fail closed rather than silently reopening their time', async () => {
  for (const [start, end] of [
    [{}, {}],
    [{ dateTime: range.timeMin }, {}],
    [{ dateTime: '2026-10-20T08:00:00', timeZone: 'Asia/Jakarta' }, { dateTime: range.timeMax }],
    [{ dateTime: '2026-02-30T08:00:00+07:00' }, { dateTime: range.timeMax }],
    [{ dateTime: '2026-10-20T08:60:00+07:00' }, { dateTime: range.timeMax }],
    [{ dateTime: '2026-10-20T08:00:00+25:00' }, { dateTime: range.timeMax }],
    [{ dateTime: range.timeMax }, { dateTime: range.timeMin }],
    [{ dateTime: range.timeMin }, { dateTime: range.timeMin }],
    [{ dateTime: null }, { dateTime: range.timeMax }],
  ]) {
    const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : json(events([{ status: 'confirmed', start, end }])));
    await assert.rejects(calendar.availability(range), isCode('CALENDAR_RESPONSE'));
  }
});

test('expanded recurring all-day instances are read across bounded pages with the exact original range', async () => {
  const bounds = { timeMin: '2026-10-20T00:00:00+07:00', timeMax: '2026-10-27T00:00:00+07:00' };
  const pages = [];
  const calendar = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy([], bounds));
    const query = new URL(url).searchParams;
    assert.equal(query.get('singleEvents'), 'true');
    assert.equal(query.get('timeZone'), 'Asia/Jakarta');
    assert.equal(query.get('timeMin'), bounds.timeMin);
    assert.equal(query.get('timeMax'), bounds.timeMax);
    pages.push(query.get('pageToken'));
    return json(pages.length === 1 ? events([], { nextPageToken: 'opaque-page-token' }) : events([{ status: 'confirmed', start: { date: '2026-10-24' }, end: { date: '2026-10-25' } }]));
  });
  assert.deepEqual((await calendar.availability(bounds)).busyIntervals, [{ start: Date.parse('2026-10-24T00:00:00+07:00'), end: Date.parse('2026-10-25T00:00:00+07:00') }]);
  assert.deepEqual(pages, [null, 'opaque-page-token']);
});

test('malformed or partial all-day dates fail closed rather than silently reopening the date', async () => {
  for (const item of [null, {}, { status: 'unknown' },
    { status: 'confirmed', start: { date: '2026-10-20' }, end: { dateTime: range.timeMax } },
    { status: 'confirmed', start: { dateTime: range.timeMin }, end: { date: '2026-10-21' } },
    { status: 'confirmed', start: { date: '2026-02-30' }, end: { date: '2026-03-01' } },
    { status: 'confirmed', start: { date: '2026-10-20' }, end: { date: '2026-10-20' } },
    { status: 'confirmed', start: { date: '2026-10-21' }, end: { date: '2026-10-20' } },
    { status: 'confirmed', start: { date: '2026-10-20', dateTime: range.timeMin }, end: { date: '2026-10-21' } },
    { status: 'confirmed', start: { date: '2026-10-20' }, end: { date: '2026-10-21', dateTime: range.timeMax } },
  ]) {
    const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : json(events([item])));
    await assert.rejects(calendar.availability(range), isCode('CALENDAR_RESPONSE'));
  }
});

test('event pagination rejects incomplete, excessive and looping results without leaking page tokens', async () => {
  const badPages = [{}, { kind: 'calendar#event', items: [] }, events(null), events({}), events(Array.from({ length: 2501 }, () => ({ status: 'cancelled' }))),
    ...['', 'contains space', 'contains\nline', 'a'.repeat(8193), 1, null].map(nextPageToken => events([], { nextPageToken }))];
  for (const page of badPages) {
    const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : json(page));
    await assert.rejects(calendar.availability(range), isCode('CALENDAR_RESPONSE'));
  }
  for (const repeat of [true, false]) {
    let pages = 0;
    const calendar = provider(async url => {
      if (url.includes('oauth2')) return token();
      if (url.endsWith('/freeBusy')) return json(freeBusy());
      pages++;
      return json(events([], { nextPageToken: repeat ? 'private-page-token' : `private-page-${pages}` }));
    });
    await assert.rejects(calendar.availability(range), error => isCode('CALENDAR_RESPONSE')(error) && !error.message.includes('private-page'));
    assert.equal(pages, repeat ? 2 : 4);
  }
  let pages = 0;
  const complete = provider(async url => {
    if (url.includes('oauth2')) return token();
    if (url.endsWith('/freeBusy')) return json(freeBusy());
    pages++;
    return json(events([], pages < 4 ? { nextPageToken: `page-${pages}` } : {}));
  });
  assert.deepEqual((await complete.availability(range)).busyIntervals, []);
  assert.equal(pages, 4);
});

test('a recognized empty partial collection may omit items, but each page must retain its collection kind', async () => {
  const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : json({ kind: 'calendar#events' }));
  assert.deepEqual((await calendar.availability(range)).busyIntervals, []);
  for (const page of [{}, { items: [] }, { kind: 'calendar#event' }, { kind: 'calendar#events', items: null }]) {
    let pages = 0;
    const invalidNext = provider(async url => {
      if (url.includes('oauth2')) return token();
      if (url.endsWith('/freeBusy')) return json(freeBusy());
      pages++;
      return json(pages === 1 ? events([], { nextPageToken: 'next-page' }) : page);
    });
    await assert.rejects(invalidNext.availability(range), isCode('CALENDAR_RESPONSE'));
    assert.equal(pages, 2);
  }
});

test('all-day lookup authorization, transport and body timeout failures never produce free availability', async () => {
  for (const status of [401, 403, 429, 500]) {
    const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : json({ error: 'Private event details synthetic-token' }, status));
    await assert.rejects(calendar.availability(range), error => isCode(status === 401 || status === 403 ? 'CALENDAR_AUTH' : 'CALENDAR_UNAVAILABLE')(error) && !error.message.includes('Private event'));
  }
  const never = () => new Promise(() => {});
  const calendar = provider(async url => url.includes('oauth2') ? token() : url.endsWith('/freeBusy') ? json(freeBusy()) : { status: 200, ok: true, json: never }, { timeoutMs: 5 });
  await assert.rejects(calendar.availability(range), isCode('CALENDAR_TIMEOUT'));
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

test('payment snapshots distinguish minimum DP and full payment while legacy event fingerprints remain identical', async () => {
  const bodies = [];
  let calls = 0;
  const calendar = provider(async (url, init) => {
    calls++;
    if (url.includes('oauth2')) return token();
    const body = JSON.parse(init.body);
    bodies.push(body);
    return json(body);
  });
  await calendar.createApprovedAppointment(appointment);
  const original = bodies.at(-1);
  await calendar.createApprovedAppointment({ ...appointment, paymentMode: 'legacy', paymentAmount: 15500 });
  assert.deepEqual(bodies.at(-1), original);
  await calendar.createApprovedAppointment({ ...appointment, paymentMode: 'deposit', paymentAmount: 20000 });
  const dp = bodies.at(-1);
  assert.equal(dp.id, original.id);
  assert.equal(dp.extendedProperties.private.source, 'chiinails-booking-v2');
  assert.match(dp.description, /Pilihan pembayaran: DP 10%, minimal Rp20000\nNominal pembayaran: Rp20000\nSisa pembayaran: Rp135000/);
  assert.notEqual(dp.extendedProperties.private.fingerprint, original.extendedProperties.private.fingerprint);
  await calendar.createApprovedAppointment({ ...appointment, paymentMode: 'full', paymentAmount: 155000 });
  const full = bodies.at(-1);
  assert.match(full.description, /Pilihan pembayaran: Full payment\nNominal pembayaran: Rp155000\nSisa pembayaran: Rp0/);
  assert.notEqual(full.extendedProperties.private.fingerprint, dp.extendedProperties.private.fingerprint);
  const before = calls;
  for (const changes of [{ paymentMode: 'deposit', paymentAmount: 1 }, { paymentMode: 'full', paymentAmount: 20000 }, { paymentMode: 'legacy', paymentAmount: 20000 }, { paymentMode: 'cash' }]) {
    await assert.rejects(calendar.createApprovedAppointment({ ...appointment, ...changes }), isCode('CALENDAR_INPUT'));
  }
  assert.equal(calls, before);
});

test('default fetch preserves its Worker global receiver', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis);
    count++;
    return url.includes('oauth2') ? token() : emptyCalendar(url);
  };
  try {
    const calendar = createGoogleCalendarProvider(env, { now: () => current });
    assert.equal((await calendar.availability(range)).busyIntervals.length, 0);
    assert.equal(count, 3);
  } finally { globalThis.fetch = original; }
});

test('explicit design snapshot writes its actual duration and preserves all previous two-hour versions', async () => {
  const bodies = [];
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    const body = JSON.parse(init.body);
    bodies.push(body);
    return json(body);
  });
  for (const [designType, durationMinutes] of [['plain', 60], ['simple', 60], ['simple', 120], ['full-art', 180], ['full-art', 240], ['full-art', 300]]) {
    await calendar.createApprovedAppointment({ ...appointment, designType, durationMinutes, paymentMode: 'deposit', paymentAmount: 20000 });
    const body = bodies.at(-1);
    assert.equal(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime), durationMinutes * 60000);
    assert.equal(body.extendedProperties.private.source, 'chiinails-booking-v4');
    assert.match(body.description, new RegExp(`Durasi: ${durationMinutes} menit`));
    assert.match(body.description, /WhatsApp: <a href="https:\/\/wa.me\/6281234567890">https:\/\/wa.me\/6281234567890<\/a>\n/);
  }
  await calendar.createApprovedAppointment({ ...appointment, paymentMode: 'full', paymentAmount: 155000 });
  const previous = bodies.at(-1);
  await calendar.createApprovedAppointment({ ...appointment, designType: 'legacy', durationMinutes: 120, paymentMode: 'full', paymentAmount: 155000 });
  assert.deepEqual(bodies.at(-1), previous);
  assert.equal(previous.extendedProperties.private.source, 'chiinails-booking-v2');
  for (const changes of [{ designType: 'plain', durationMinutes: 120 }, { designType: 'full-art', durationMinutes: 300, time: '12:30' }, { designType: 'full-art', durationMinutes: 300, date: '2026-10-24' }, { designType: 'legacy', durationMinutes: 60 }]) {
    await assert.rejects(calendar.createApprovedAppointment({ ...appointment, paymentMode: 'deposit', paymentAmount: 20000, ...changes }), isCode('CALENDAR_INPUT'));
  }
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

test('trusted historical half-hour starts retain all Calendar fingerprints and support lookup-only recovery', async () => {
  // Golden hashes captured from the previous deployed adapter for these exact
  // synthetic snapshots. Cadence changes must never alter event identity.
  const cases = [
    [{ ...appointment, time: '08:30' }, 'chiinails-booking-v1', '57a45e4e1ef0af149dd425272b14a887a2741aaad6ce94af340ad9b57fe889ea'],
    [{ ...appointment, time: '08:30', paymentMode: 'full', paymentAmount: 155000 }, 'chiinails-booking-v2', '09261d78e64aef9c6ea6c9632fcb8ed6400e2044ecf5f9f4c6d2f9e521ab12b5'],
    [{ ...appointment, time: '08:30', designType: 'simple', durationMinutes: 120, paymentMode: 'deposit', paymentAmount: 20000 }, 'chiinails-booking-v3', '2c0f36c5df03040c7e6ed776a48837f4ab5390dc9fc0f7e876a49bbc9b1e3c22'],
  ];
  for (const [snapshot, source, fingerprint] of cases) {
    let stored;
    let posts = 0;
    let gets = 0;
    const calendar = provider(async (url, init) => {
      if (url.includes('oauth2')) return token();
      if (init.method === 'POST') { posts++; stored = JSON.parse(init.body); return json(stored); }
      gets++;
      return json(stored);
    });
    const created = await calendar.createApprovedAppointment(snapshot);
    assert.equal(stored.start.dateTime, '2026-10-20T08:30:00+07:00');
    assert.equal(stored.end.dateTime, '2026-10-20T10:30:00+07:00');
    if (source === 'chiinails-booking-v3') {
      assert.equal(stored.extendedProperties.private.source, 'chiinails-booking-v4');
      // A prior deployed writer may have finished just before this release.
      // Restore that immutable old payload and check its golden fingerprint.
      stored = { ...stored, summary: `Chii Nails · ${snapshot.name}`,
        description: stored.description.replace(/^Nomor WhatsApp: .*\n/m, '').replace(/<a href="(https:\/\/wa.me\/\d+)">\1<\/a>/, '$1'),
        extendedProperties: { private: { source, bookingId: snapshot.bookingId, fingerprint } } };
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ version: 3, calendarId: env.GOOGLE_CALENDAR_ID, bookingId: snapshot.bookingId, summary: stored.summary, description: stored.description, startISO: stored.start.dateTime, endISO: stored.end.dateTime })));
      assert.equal(Buffer.from(digest).toString('hex'), fingerprint);
    } else assert.deepEqual(stored.extendedProperties.private, { source, bookingId: snapshot.bookingId, fingerprint });
    assert.deepEqual(await calendar.reconcileApprovedAppointment(snapshot), { found: true, ...created, reconciled: true });
    assert.equal(posts, 1);
    assert.equal(gets, 1);
  }
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
    return calendarCalls === 1 ? json({}, 401) : emptyCalendar(url);
  });
  await assert.rejects(calendar.availability(range), isCode('CALENDAR_AUTH'));
  assert.equal(calendarCalls, 2);
  await calendar.availability(range);
  assert.equal(tokenCalls, 2);
});

test('Worker-compatible manual redirects survive a constructor that rejects error mode and never follow credential redirects', async () => {
  let calls = 0;
  const workerFetch = async (url, init) => {
    if (init.redirect === 'error') throw new TypeError('Invalid redirect value, must be follow or manual');
    calls++;
    assert.equal(init.redirect, 'manual');
    return url.includes('oauth2') ? token() : emptyCalendar(url);
  };
  await assert.rejects(workerFetch('https://synthetic.example', { redirect: 'error' }), TypeError);
  assert.equal((await provider(workerFetch).availability(range)).busyIntervals.length, 0);
  assert.equal(calls, 3);
  for (const status of [301, 302, 303, 307, 308]) {
    const visited = [];
    const redirected = provider(async (url, init) => {
      visited.push(url);
      assert.equal(init.redirect, 'manual');
      return url.includes('oauth2') ? token() : new Response('', { status, headers: { Location: 'https://untrusted.example/collect' } });
    });
    await assert.rejects(redirected.availability(range), isCode('CALENDAR_UNAVAILABLE'));
    assert.equal(visited.length, 3);
    assert.equal(visited.some(url => url.includes('untrusted')), false);
  }
});

test('accepted-event state reads use only the deterministic stored ID and distinguish definite deletion from failures', async () => {
  let stored;
  const seed = provider(async (url, init) => url.includes('oauth2') ? token() : (stored = JSON.parse(init.body), json(stored)));
  const original = await seed.createApprovedAppointment(appointment);
  const identity = { bookingId: appointment.bookingId, eventId: original.eventId };
  let event = stored;
  let status = 200;
  let gets = 0;
  const reader = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.ok(url.endsWith(`/events/${original.eventId}`));
    gets++;
    return json(event, status);
  });
  assert.deepEqual(await reader.readAppointmentState(identity), { state: 'active' });
  for (const code of [404, 410]) {
    status = code; event = {};
    assert.deepEqual(await reader.readAppointmentState(identity), { state: 'deleted' });
  }
  status = 200; event = { id: original.eventId, status: 'cancelled' };
  assert.deepEqual(await reader.readAppointmentState(identity), { state: 'deleted' });
  for (const malformed of [{}, { id: 'wrong', status: 'cancelled' }, { id: original.eventId, status: 'confirmed' }, { ...stored, extendedProperties: {} }]) {
    event = malformed;
    await assert.rejects(reader.readAppointmentState(identity), isCode('CALENDAR_RESPONSE'));
  }
  for (const code of [401, 403, 429, 500]) {
    status = code;
    await assert.rejects(reader.readAppointmentState(identity), isCode(code === 401 || code === 403 ? 'CALENDAR_AUTH' : 'CALENDAR_UNAVAILABLE'));
  }
  const before = gets;
  await assert.rejects(reader.readAppointmentState({ ...identity, eventId: 'wrong' }), isCode('CALENDAR_INPUT'));
  assert.equal(gets, before);
});

test('Calendar deletion synchronization requires a fresh fields-only writer or owner role on every batch', async () => {
  let role = 'writer';
  let calls = 0;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(init.method, 'GET');
    assert.ok(url.endsWith('/events?maxResults=1&fields=accessRole'));
    calls++;
    return json(role === undefined ? {} : { accessRole: role });
  });
  assert.equal(await calendar.verifyCalendarWriteAccess(), true);
  role = 'owner';
  assert.equal(await calendar.verifyCalendarWriteAccess(), true);
  for (const value of ['reader', 'freeBusyReader', 'writerWithoutPrivateAccess', 'none', undefined]) {
    role = value;
    await assert.rejects(calendar.verifyCalendarWriteAccess(), isCode('CALENDAR_AUTH'));
  }
  assert.equal(calls, 7);
});

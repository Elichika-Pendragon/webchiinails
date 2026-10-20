import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createBookingRequest, getBookingRequest, decideBookingRequest, BookingRequestError } from './booking-requests.js';
import { createGoogleCalendarProvider } from './google-calendar.js';

// Coupled ledger + actual Calendar adapter. This uses ephemeral RSA material,
// SQLite and an in-memory Google transport, never real credentials or services.
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const initial = Date.parse('2026-10-20T00:00:00+07:00');
const owner = { email: 'workflow-owner@gmail.com', subject: 'synthetic-workflow-owner', verified: true };
const input = (extra = {}) => ({ name: 'Workflow Test', whatsapp: '081234567890', agreedPrice: '100001', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic_workflow_request_001', ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokenOf = result => new URL(result.reviewUrl).searchParams.get('r');

class D1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const database = this.sqlite;
    return {
      sql, values: [], bind(...values) { return { ...this, values }; },
      async first() { return database.prepare(this.sql).get(...this.values) ?? null; },
      async run() { const result = database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const result = statements.map(statement => ({ success: true, meta: { changes: Number(this.sqlite.prepare(statement.sql).run(...statement.values).changes) } }));
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  count(table) { return this.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get().count; }
  changes() { return this.sqlite.prepare('SELECT total_changes() AS changes').get().changes; }
}

function fixture() {
  const db = new D1Fixture();
  const env = {
    BOOKING_DB: db, BOOKING_LINK_SECRET: 'synthetic_workflow_secret_never_use_in_production', BOOKING_OWNER_EMAIL: owner.email,
    SITE_URL: 'https://workflow.example', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'booking@workflow-test.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem, GOOGLE_CALENDAR_ID: 'synthetic-workflow@group.calendar.google.com',
  };
  const state = { now: initial, ambiguousNextInsert: false };
  const events = new Map();
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(url.includes('oauth2.googleapis.com') ? '{}' : init.body) : null });
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(init.method, 'POST');
      const assertion = new URLSearchParams(init.body).get('assertion');
      const [header, claims, signature] = assertion.split('.');
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${claims}`)), true);
      return json({ access_token: 'synthetic-workflow-token', token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer synthetic-workflow-token');
    if (url === 'https://www.googleapis.com/calendar/v3/freeBusy') {
      const body = JSON.parse(init.body);
      const start = Date.parse(body.timeMin);
      const end = Date.parse(body.timeMax);
      const busy = [...events.values()].filter(event => Date.parse(event.start.dateTime) < end && Date.parse(event.end.dateTime) > start)
        .map(event => ({ start: event.start.dateTime, end: event.end.dateTime }));
      return json({ kind: 'calendar#freeBusy', timeMin: body.timeMin, timeMax: body.timeMax, calendars: { [env.GOOGLE_CALENDAR_ID]: { busy } } });
    }
    const collection = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;
    if (url === `${collection}?sendUpdates=none`) {
      assert.equal(init.method, 'POST');
      const event = JSON.parse(init.body);
      if (events.has(event.id)) return json({}, 409);
      events.set(event.id, structuredClone(event));
      if (state.ambiguousNextInsert) { state.ambiguousNextInsert = false; throw new Error('Synthetic acknowledgement lost after committed insert'); }
      return json(event);
    }
    if (url.startsWith(`${collection}/`) && init.method === 'GET') {
      const event = events.get(url.slice(collection.length + 1));
      return json(event || { error: { code: 404 } }, event ? 200 : 404);
    }
    throw new Error('Unexpected synthetic transport request');
  };
  const now = () => state.now;
  const calendar = createGoogleCalendarProvider(env, { now, fetch: transport });
  const insertCount = () => calls.filter(call => call.method === 'POST' && call.url.endsWith('/events?sendUpdates=none')).length;
  const eventGetCount = () => calls.filter(call => call.method === 'GET' && call.url.includes('/events/')).length;
  return { db, env, state, events, calls, now, calendar, insertCount, eventGetCount };
}

test('real adapter and ledger couple pending/read-only review to one private acknowledged Calendar event', async () => {
  const f = fixture();
  const created = await createBookingRequest(f.env, input({ approved: true, paymentVerified: true, deposit: '1' }), { now: f.now, calendar: f.calendar });
  assert.equal(created.status, 'pending');
  assert.equal(created.booking.deposit, 10001);
  assert.equal(f.calls.length, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.db.count('booking_slot_claims'), 0);
  const beforeRead = f.db.changes();
  assert.equal((await getBookingRequest(f.env, tokenOf(created), { owner, now: f.now })).status, 'pending');
  assert.equal(f.db.changes(), beforeRead);
  assert.equal(f.calls.length, 0);

  const accepted = await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar });
  assert.equal(accepted.status, 'accepted');
  assert.equal(f.db.count('booking_slot_claims'), 4);
  assert.equal(f.events.size, 1);
  assert.equal(f.insertCount(), 1);
  const event = [...f.events.values()][0];
  assert.match(event.id, /^chii[a-f0-9]{64}$/);
  assert.equal(event.visibility, 'private');
  assert.equal(event.transparency, 'opaque');
  assert.equal(event.status, 'confirmed');
  assert.equal('attendees' in event, false);
  assert.equal(event.start.timeZone, 'Asia/Jakarta');
  assert.equal(event.start.dateTime, '2026-10-21T14:00:00+07:00');
  assert.equal(event.end.dateTime, '2026-10-21T16:00:00+07:00');
  assert.match(event.description, /DP 10%: Rp10001/);
  assert.equal(event.extendedProperties.private.bookingId, created.requestId);
  const callCount = f.calls.length;
  assert.deepEqual(await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar }), accepted);
  assert.equal(f.calls.length, callCount);
  assert.equal(f.insertCount(), 1);
});

test('overlap is rejected by the ledger before another real provider insert; expired GET remains read-only', async () => {
  const f = fixture();
  const one = await createBookingRequest(f.env, input(), { now: f.now });
  const two = await createBookingRequest(f.env, input({ time: '13:30', idempotencyKey: 'synthetic_workflow_request_002' }), { now: f.now });
  await decideBookingRequest(f.env, tokenOf(one), 'accept', { owner, now: f.now, calendar: f.calendar });
  const callCount = f.calls.length;
  await assert.rejects(decideBookingRequest(f.env, tokenOf(two), 'accept', { owner, now: f.now, calendar: f.calendar }), error => error instanceof BookingRequestError && error.code === 'SLOT_CONFLICT' && error.status === 409);
  assert.equal(f.calls.length, callCount);
  assert.equal(f.insertCount(), 1);
  assert.equal(f.db.count('booking_slot_claims'), 4);
  const beforeRead = f.db.changes();
  f.state.now = Date.parse(two.booking.startISO);
  assert.equal((await getBookingRequest(f.env, tokenOf(two), { owner, now: f.now })).status, 'expired');
  assert.equal(f.db.changes(), beforeRead);
  assert.equal(f.calls.length, callCount);
  assert.equal(f.db.sqlite.prepare('SELECT status FROM booking_requests WHERE id = ?').get(two.requestId).status, 'pending');
});

test('ambiguous real-adapter insertion recovers through GET after61seconds without a second event POST', async () => {
  const f = fixture();
  const created = await createBookingRequest(f.env, input(), { now: f.now });
  f.state.ambiguousNextInsert = true;
  await assert.rejects(decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar }), error => error instanceof BookingRequestError && error.code === 'CALENDAR_RECONCILE');
  assert.equal(f.events.size, 1);
  assert.equal(f.insertCount(), 1);
  assert.equal(f.db.count('booking_slot_claims'), 4);
  const beforeReview = f.calls.length;
  assert.equal((await getBookingRequest(f.env, tokenOf(created), { owner, now: f.now })).status, 'reconcile');
  assert.equal(f.calls.length, beforeReview);
  await assert.rejects(decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar }), error => error.code === 'REQUEST_IN_PROGRESS');
  f.state.now += 61000;
  const accepted = await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar });
  assert.equal(accepted.status, 'accepted');
  assert.equal(f.eventGetCount(), 1);
  assert.equal(f.insertCount(), 1);
  assert.equal(f.events.size, 1);
  assert.equal(f.db.count('booking_slot_claims'), 4);
  assert.equal(f.calls.filter(call => call.url.endsWith('/freeBusy')).length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createBookingRequest, getBookingRequest, decideBookingRequest, getBookingAvailability, BookingRequestError } from './booking-requests.js';
import { createGoogleCalendarProvider } from './google-calendar.js';
import { proof } from './fixtures/payment-proof.js';

// Coupled ledger + actual Calendar adapter. This uses ephemeral RSA material,
// SQLite and an in-memory Google transport, never real credentials or services.
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const initial = Date.parse('2026-10-20T00:00:00+07:00');
const owner = { email: 'workflow-owner@gmail.com', subject: 'synthetic-workflow-owner', verified: true };
const input = (extra = {}) => ({ name: 'Workflow Test', whatsapp: '081234567890', agreedPrice: '100001', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic_workflow_request_001', proof, ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokenOf = result => new URL(result.reviewUrl).searchParams.get('r');

class D1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0002-booking-payment.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0003-booking-duration.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0004-booking-payment-proofs.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0005-booking-calendar-sync-index.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const database = this.sqlite;
    return {
      sql, values: [], bind(...values) { return { ...this, values: values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value) }; },
      async first() { return database.prepare(this.sql).get(...this.values) ?? null; },
      async all() { return { success: true, results: database.prepare(this.sql).all(...this.values) }; },
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
  const state = { now: initial, ambiguousNextInsert: false, externalBusy: [], accessRole: 'writer', goneEvents: new Set() };
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
      const busy = [...events.values()].filter(event => event.status !== 'cancelled' && Date.parse(event.start.dateTime) < end && Date.parse(event.end.dateTime) > start)
        .map(event => ({ start: event.start.dateTime, end: event.end.dateTime })).concat(state.externalBusy);
      return json({ kind: 'calendar#freeBusy', timeMin: body.timeMin, timeMax: body.timeMax, calendars: { [env.GOOGLE_CALENDAR_ID]: { busy } } });
    }
    const collection = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;
    if (url === `${collection}?maxResults=1&fields=accessRole`) return json({ accessRole: state.accessRole });
    if (url === `${collection}?sendUpdates=none`) {
      assert.equal(init.method, 'POST');
      const event = JSON.parse(init.body);
      if (events.has(event.id)) return json({}, 409);
      events.set(event.id, structuredClone(event));
      if (state.ambiguousNextInsert) { state.ambiguousNextInsert = false; throw new Error('Synthetic acknowledgement lost after committed insert'); }
      return json(event);
    }
    if (url.startsWith(`${collection}/`) && init.method === 'GET') {
      const id = url.slice(collection.length + 1);
      if (state.goneEvents.has(id)) return json({}, 410);
      const event = events.get(id);
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
  assert.equal(created.booking.deposit, 20000);
  assert.equal(f.calls.length, 2); // Service token + read-only free/busy.
  assert.equal(f.events.size, 0);
  assert.equal(f.db.count('booking_slot_claims'), 0);
  const beforeRead = f.db.changes();
  assert.equal((await getBookingRequest(f.env, tokenOf(created), { owner, now: f.now })).status, 'pending');
  assert.equal(f.db.changes(), beforeRead);
  assert.equal(f.calls.length, 2);

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
  assert.match(event.description, /DP 10%, minimal Rp20000\nNominal pembayaran: Rp20000/);
  assert.equal(event.extendedProperties.private.source, 'chiinails-booking-v3');
  assert.equal(event.extendedProperties.private.bookingId, created.requestId);
  assert.match(event.description, /WhatsApp: https:\/\/wa.me\/6281234567890\n/);
  assert.equal(event.description.includes(proof.base64), false);
  const callCount = f.calls.length;
  assert.deepEqual(await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar }), accepted);
  assert.equal(f.calls.length, callCount);
  assert.equal(f.insertCount(), 1);
});

test('overlap is rejected after fresh Calendar synchronization without another insert; expired GET remains read-only', async () => {
  const f = fixture();
  const one = await createBookingRequest(f.env, input(), { now: f.now, calendar: f.calendar });
  const two = await createBookingRequest(f.env, input({ time: '13:30', idempotencyKey: 'synthetic_workflow_request_002' }), { now: f.now, calendar: f.calendar });
  await decideBookingRequest(f.env, tokenOf(one), 'accept', { owner, now: f.now, calendar: f.calendar });
  await assert.rejects(decideBookingRequest(f.env, tokenOf(two), 'accept', { owner, now: f.now, calendar: f.calendar }), error => error instanceof BookingRequestError && error.code === 'SLOT_CONFLICT' && error.status === 409);
  const callCount = f.calls.length;
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
  const created = await createBookingRequest(f.env, input(), { now: f.now, calendar: f.calendar });
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
  assert.equal(f.calls.filter(call => call.url.endsWith('/freeBusy')).length, 2);
});

test('full-payment snapshot reaches the real adapter with zero remaining balance', async () => {
  const f = fixture();
  const created = await createBookingRequest(f.env, input({ paymentMode: 'full' }), { now: f.now, calendar: f.calendar });
  assert.equal(created.booking.deposit, 100001);
  assert.equal(created.booking.remainingBalance, 0);
  assert.equal(created.booking.paymentMode, 'full');
  const accepted = await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.deposit, 100001);
  const event = [...f.events.values()][0];
  assert.match(event.description, /Pilihan pembayaran: Full payment\nNominal pembayaran: Rp100001\nSisa pembayaran: Rp0/);
  assert.equal(event.extendedProperties.private.source, 'chiinails-booking-v3');
  assert.equal(f.insertCount(), 1);
});

test('legacy uncertain request reconciles its original 10% event fingerprint after the payment-policy upgrade', async () => {
  const f = fixture();
  const created = await createBookingRequest(f.env, input(), { now: f.now, calendar: f.calendar });
  f.db.sqlite.prepare("UPDATE booking_requests SET payment_mode = 'legacy', payment_amount = NULL, design_type = 'legacy' WHERE id = ?").run(created.requestId);
  const original = await f.calendar.createApprovedAppointment({ bookingId: created.requestId, name: 'Workflow Test', whatsapp: '6281234567890', agreedPrice: 100001, date: '2026-10-21', time: '14:00' });
  const originalBody = structuredClone(f.events.get(original.eventId));
  assert.match(originalBody.description, /DP 10%: Rp10001\n/);
  assert.equal(originalBody.extendedProperties.private.source, 'chiinails-booking-v1');
  f.db.sqlite.prepare("UPDATE booking_requests SET status = 'reconcile', approval_operation = 'synthetic-old-operation', approval_lease_until = ? WHERE id = ?").run(initial - 1, created.requestId);
  for (let cell = 0; cell < 4; cell++) f.db.sqlite.prepare('INSERT INTO booking_slot_claims(slot_start,request_id,claimed_at) VALUES (?, ?, ?)').run(Date.parse(created.booking.startISO) + cell * 1800000, created.requestId, initial);
  const reviewed = await getBookingRequest(f.env, tokenOf(created), { owner, now: f.now });
  assert.equal(reviewed.paymentMode, 'legacy');
  assert.equal(reviewed.deposit, 10001);
  const accepted = await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.paymentMode, 'legacy');
  assert.equal(accepted.deposit, 10001);
  assert.equal(f.eventGetCount(), 1);
  assert.equal(f.insertCount(), 1);
  assert.deepEqual(f.events.get(original.eventId), originalBody);
});

test('five-hour full-art flows through real free/busy and Calendar with ten claims and no false adjacent availability', async () => {
  const f = fixture();
  const created = await createBookingRequest(f.env, input({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: f.now, calendar: f.calendar });
  assert.equal(created.booking.endISO, '2026-10-21T17:00:00+07:00');
  const accepted = await decideBookingRequest(f.env, tokenOf(created), 'accept', { owner, now: f.now, calendar: f.calendar });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.durationMinutes, 300);
  assert.equal(f.db.count('booking_slot_claims'), 10);
  const event = [...f.events.values()][0];
  assert.equal(event.end.dateTime, '2026-10-21T17:00:00+07:00');
  assert.match(event.description, /Durasi: 300 menit/);
  assert.match(event.description, /WhatsApp: https:\/\/wa.me\/6281234567890\n/);
  const occupancy = await getBookingAvailability(f.env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: f.now, calendar: f.calendar });
  assert.equal(occupancy.slots.find(slot => slot.time === '11:00').available, true);
  assert.equal(occupancy.slots.find(slot => slot.time === '14:00').available, false);
  assert.equal(f.insertCount(), 1);
});

test('ordinary all-day Busy in Google Calendar blacks out every candidate and rejects Book without a pending record', async () => {
  const f = fixture();
  // Google freeBusy expands an ordinary all-day Busy event to midnight bounds
  // in the calendar timezone. No paid out-of-office feature is involved.
  f.state.externalBusy = [{ start: '2026-10-21T00:00:00+07:00', end: '2026-10-22T00:00:00+07:00' }];
  const occupancy = await getBookingAvailability(f.env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: f.now, calendar: f.calendar });
  assert.ok(occupancy.slots.length > 0);
  assert.ok(occupancy.slots.every(slot => slot.available === false));
  await assert.rejects(createBookingRequest(f.env, input(), { now: f.now, calendar: f.calendar }), error => error.code === 'SLOT_CONFLICT' && error.status === 409);
  assert.equal(f.db.count('booking_requests'), 0);
  assert.equal(f.db.count('booking_payment_proofs'), 0);
  assert.equal(f.db.count('booking_slot_claims'), 0);
  assert.equal(f.insertCount(), 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.calls.filter(call => call.url.endsWith('/freeBusy')).length, 2);
  assert.deepEqual(f.calls.filter(call => call.url.endsWith('/freeBusy')).at(-1).body.items, [{ id: f.env.GOOGLE_CALENDAR_ID }]);
});

test('real adapter confirms deleted or cancelled Google events before releasing all long-duration claims', async () => {
  for (const outcome of ['404', '410', 'cancelled']) {
    const f = fixture();
    const one = await createBookingRequest(f.env, input({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: f.now, calendar: f.calendar });
    await decideBookingRequest(f.env, tokenOf(one), 'accept', { owner, now: f.now, calendar: f.calendar });
    const event = [...f.events.values()][0];
    if (outcome === 'cancelled') event.status = 'cancelled';
    else { f.events.delete(event.id); if (outcome === '410') f.state.goneEvents.add(event.id); }
    const result = await getBookingAvailability(f.env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: f.now, calendar: f.calendar });
    assert.equal(result.slots.find(slot => slot.time === '14:00').available, true);
    assert.equal(f.db.count('booking_slot_claims'), 0);
    const brief = await getBookingRequest(f.env, tokenOf(one), { owner, now: f.now });
    assert.equal(brief.status, 'cancelled');
    assert.equal(brief.cancelledViaCalendar, true);
    assert.equal(brief.durationMinutes, 300);
    assert.equal(f.db.count('booking_payment_proofs'), 1);
    assert.equal(f.insertCount(), 1);
    const recent = f.calls.slice(-3);
    assert.ok(recent[0].url.endsWith('/freeBusy'));
    assert.ok(recent[1].url.endsWith('/events?maxResults=1&fields=accessRole'));
    assert.ok(recent[2].url.endsWith(`/events/${event.id}`));
  }
});

test('real adapter retains accepted claims if free/busy remains healthy but private event access is downgraded', async () => {
  const f = fixture();
  const one = await createBookingRequest(f.env, input(), { now: f.now, calendar: f.calendar });
  await decideBookingRequest(f.env, tokenOf(one), 'accept', { owner, now: f.now, calendar: f.calendar });
  f.events.clear();
  f.state.accessRole = 'freeBusyReader';
  await assert.rejects(getBookingAvailability(f.env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: f.now, calendar: f.calendar }), error => error.code === 'CALENDAR_UNAVAILABLE');
  assert.equal(f.db.count('booking_slot_claims'), 4);
  assert.equal((await getBookingRequest(f.env, tokenOf(one), { owner, now: f.now })).status, 'accepted');
  assert.equal(f.eventGetCount(), 0);
  assert.equal(f.insertCount(), 1);
});

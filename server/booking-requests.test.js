import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { BookingRequestError, createBookingRequest, getBookingRequest, decideBookingRequest } from './booking-requests.js';

// Real SQLite constraints and transactions, wrapped in the D1 statement shape.
// No real D1 binding, Calendar, credential, customer or network call is used.
class D1TestDatabase {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
    this.fail = null;
  }
  prepare(sql) {
    const database = this;
    return {
      sql, values: [],
      bind(...values) { return { ...this, values }; },
      async first() { database.check(this.sql); return database.sqlite.prepare(this.sql).get(...this.values) ?? null; },
      async run() {
        database.check(this.sql);
        const result = database.sqlite.prepare(this.sql).run(...this.values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }
  check(sql) {
    if (this.fail?.(sql)) { this.fail = null; throw new Error('Synthetic storage failure, not a customer detail'); }
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        this.check(statement.sql);
        const result = this.sqlite.prepare(statement.sql).run(...statement.values);
        results.push({ success: true, meta: { changes: Number(result.changes) } });
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  rows(sql = 'SELECT * FROM booking_requests') { return this.sqlite.prepare(sql).all(); }
}

const initial = Date.parse('2026-10-20T00:00:00+07:00');
const owner = { email: 'owner@example.com', subject: 'synthetic-owner', verified: true };
const customer = (other = {}) => ({ name: 'Client Test', whatsapp: '081234567890', agreedPrice: '100001', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic_idempotency_001', ...other });
function setup() {
  const db = new D1TestDatabase();
  const env = { BOOKING_DB: db, BOOKING_LINK_SECRET: 'synthetic_secret_only_for_tests_0123456789', BOOKING_OWNER_EMAIL: owner.email, SITE_URL: 'https://chiinails.example' };
  const events = new Map();
  const calls = { availability: 0, insert: 0, lookup: 0 };
  const calendar = {
    async availability() { calls.availability++; return { busyIntervals: [] }; },
    async createApprovedAppointment(appointment) {
      calls.insert++;
      const result = { eventId: `chii${appointment.bookingId.replaceAll('-', '')}`, startISO: `${appointment.date}T${appointment.time}:00+07:00`, endISO: `${appointment.date}T${String(Number(appointment.time.slice(0, 2)) + 2).padStart(2, '0')}:${appointment.time.slice(3)}:00+07:00` };
      events.set(appointment.bookingId, result);
      return result;
    },
    async reconcileApprovedAppointment(appointment) {
      calls.lookup++;
      return events.has(appointment.bookingId) ? { found: true, ...events.get(appointment.bookingId), reconciled: true } : { found: false };
    },
  };
  return { db, env, calendar, calls, events };
}
const tokenOf = result => new URL(result.reviewUrl).searchParams.get('r');
const isCode = (code, status) => error => error instanceof BookingRequestError && error.code === code && (!status || error.status === status);

test('creation stores the canonical five fields and derived DP; token is opaque and stored only as a hash', async () => {
  const { env, db, calendar, calls } = setup();
  const result = await createBookingRequest(env, customer({ deposit: '1', approved: true, paymentVerified: true }), { now: initial, calendar });
  assert.equal(result.status, 'pending');
  assert.equal(result.booking.deposit, 10001);
  assert.equal(result.booking.remainingBalance, 90000);
  assert.equal(result.booking.whatsapp, '6281234567890');
  assert.equal(result.booking.startISO, '2026-10-21T14:00:00+07:00');
  assert.equal(result.booking.endISO, '2026-10-21T16:00:00+07:00');
  assert.equal(result.booking.expiresAt, '2026-10-21T07:00:00.000Z');
  const token = tokenOf(result);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(result.reviewUrl).origin, env.SITE_URL);
  const stored = db.rows()[0];
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(token), false);
  assert.equal(JSON.stringify(stored).includes('paymentVerified'), false);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 0, insert: 0, lookup: 0 });
});

test('idempotent retries normalize the same input and return the same request and token', async () => {
  const { env, db } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  const two = await createBookingRequest(env, customer({ name: ' Client Test ', whatsapp: '+62 812-3456-7890', agreedPrice: '0100001', deposit: '999999' }), { now: initial + 1000 });
  assert.equal(one.requestId, two.requestId);
  assert.equal(one.reviewUrl, two.reviewUrl);
  assert.equal(db.rows().length, 1);
  await assert.rejects(createBookingRequest(env, customer({ agreedPrice: '100002' }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
  assert.equal(db.rows().length, 1);
});

test('concurrent creation retries resolve to one SQLite row', async () => {
  const { env, db } = setup();
  const [one, two] = await Promise.all([createBookingRequest(env, customer(), { now: initial }), createBookingRequest(env, customer(), { now: initial })]);
  assert.equal(one.reviewUrl, two.reviewUrl);
  assert.equal(db.rows().length, 1);
});

test('invalid required fields, customer flags and last-book bounds cannot bypass server validation', async () => {
  const { env, db } = setup();
  for (const changes of [{ name: '' }, { whatsapp: '' }, { agreedPrice: '' }, { agreedPrice: '1e5' }, { date: '' }, { time: '' }, { time: '14:30' }, { time: '15:00' }, { date: '2026-10-24', time: '10:30' }, { idempotencyKey: '' }]) {
    await assert.rejects(createBookingRequest(env, customer(changes), { now: initial }), isCode('BOOKING_INPUT', 400));
  }
  const weekend = await createBookingRequest(env, customer({ date: '2026-10-24', time: '10:00' }), { now: initial });
  assert.equal(weekend.booking.endISO, '2026-10-24T12:00:00+07:00');
  assert.equal(db.rows().length, 1);
});

test('daily per-number creation cap is enforced; matching retry remains available', async () => {
  const { env, db } = setup();
  const firstResult = await createBookingRequest(env, customer(), { now: initial });
  for (let index = 1; index < 10; index++) await createBookingRequest(env, customer({ idempotencyKey: `synthetic_idempotency_${String(index).padStart(4, '0')}` }), { now: initial });
  await assert.rejects(createBookingRequest(env, customer({ idempotencyKey: 'synthetic_idempotency_limit' }), { now: initial }), isCode('BOOKING_RATE_LIMIT', 429));
  assert.equal((await createBookingRequest(env, customer(), { now: initial })).reviewUrl, firstResult.reviewUrl);
  assert.equal(db.rows().length, 10);
});

test('configuration fails closed without a private binding, strong secret, HTTPS origin and owner', async () => {
  const { env } = setup();
  for (const changes of [{ BOOKING_DB: undefined }, { BOOKING_LINK_SECRET: 'short' }, { SITE_URL: 'http://chiinails.example' }, { SITE_URL: 'https://chiinails.example/evil' }, { SITE_URL: 'https://user:pass@chiinails.example' }, { BOOKING_OWNER_EMAIL: '' }]) {
    await assert.rejects(createBookingRequest({ ...env, ...changes }, customer(), { now: initial }), isCode('BOOKING_CONFIG', 503));
  }
});

test('token possession never authorizes summaries or actions; verified allowed owner identity is mandatory', async () => {
  const { env, calendar, calls } = setup();
  const result = await createBookingRequest(env, customer(), { now: initial });
  for (const invalid of [undefined, { email: owner.email, subject: owner.subject }, { ...owner, verified: false }, { ...owner, email: 'someone@example.com' }, { ...owner, subject: '' }]) {
    await assert.rejects(getBookingRequest(env, tokenOf(result), { owner: invalid, now: initial }), isCode('BOOKING_OWNER', 403));
    await assert.rejects(decideBookingRequest(env, tokenOf(result), 'accept', { owner: invalid, calendar, now: initial }), isCode('BOOKING_OWNER', 403));
  }
  assert.equal((await getBookingRequest(env, tokenOf(result), { owner, now: initial })).id, result.requestId);
  assert.deepEqual(calls, { availability: 0, insert: 0, lookup: 0 });
  await assert.rejects(getBookingRequest(env, 'not-a-token', { owner, now: initial }), isCode('REQUEST_NOT_FOUND', 404));
  await assert.rejects(getBookingRequest(env, 'a'.repeat(43), { owner, now: initial }), isCode('REQUEST_NOT_FOUND', 404));
});

test('pending requests expire after seven days or appointment start, without claiming or writing Calendar', async () => {
  const { env, db, calendar, calls } = setup();
  const result = await createBookingRequest(env, customer({ date: '2026-11-01', time: '10:00' }), { now: initial });
  assert.equal(result.booking.expiresAt, new Date(initial + 7 * 86400000).toISOString());
  const changesBeforeRead = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  const expired = await getBookingRequest(env, tokenOf(result), { owner, now: initial + 7 * 86400000 });
  assert.equal(expired.status, 'expired');
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, changesBeforeRead);
  assert.equal(db.rows()[0].status, 'pending');
  await assert.rejects(decideBookingRequest(env, tokenOf(result), 'accept', { owner, calendar, now: initial + 7 * 86400000 }), isCode('REQUEST_EXPIRED', 410));
  assert.equal(db.rows()[0].status, 'expired');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 0, insert: 0, lookup: 0 });
});

test('owner cancellation is idempotent and changes pending only, with no Calendar I/O', async () => {
  const { env, calendar, calls } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  assert.equal((await decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial })).status, 'cancelled');
  assert.equal((await decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial })).status, 'cancelled');
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('REQUEST_STATE', 409));
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'unknown', { owner, calendar, now: initial }), isCode('BOOKING_INPUT', 400));
  assert.deepEqual(calls, { availability: 0, insert: 0, lookup: 0 });
});

test('accepted request has exactly four claims and one acknowledged, idempotent Calendar event', async () => {
  const { env, db, calendar, calls } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  const accepted = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.deposit, 10001);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  const repeated = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  assert.deepEqual(repeated, accepted);
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 0 });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial }), isCode('REQUEST_STATE', 409));
});

test('overlapping approvals compete atomically and the losing transaction leaves no partial claims', async () => {
  const { env, db, calendar, calls } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  const two = await createBookingRequest(env, customer({ time: '13:30', idempotencyKey: 'synthetic_second_request_02' }), { now: initial });
  const results = await Promise.allSettled([
    decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial }),
    decideBookingRequest(env, tokenOf(two), 'accept', { owner, calendar, now: initial }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'SLOT_CONFLICT');
  assert.deepEqual(db.rows().map(row => row.status).sort(), ['accepted', 'pending']);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.equal(calls.insert, 1);
});

test('adjacent appointments do not conflict at their shared endpoint', async () => {
  const { env, db, calendar } = setup();
  const one = await createBookingRequest(env, customer({ time: '12:00' }), { now: initial });
  const two = await createBookingRequest(env, customer({ time: '14:00', idempotencyKey: 'synthetic_adjacent_request_02' }), { now: initial });
  await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
  await decideBookingRequest(env, tokenOf(two), 'accept', { owner, calendar, now: initial });
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 8);
});

test('fresh busy Calendar prevents insertion and safely releases unwritten claims', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.availability = async () => { calls.availability++; return { busyIntervals: [{ start: Date.parse('2026-10-21T15:30:00+07:00'), end: Date.parse('2026-10-21T16:30:00+07:00') }] }; };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('SLOT_CONFLICT', 409));
  assert.equal(db.rows()[0].status, 'pending');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.equal(calls.insert, 0);
});

test('unavailable or malformed availability is never interpreted as an empty calendar', async () => {
  for (const availability of [async () => { throw new Error('Synthetic private provider detail'); }, async () => ({}), async () => ({ busyIntervals: [{ start: NaN, end: 1 }] })]) {
    const { env, db, calendar, calls } = setup();
    calendar.availability = availability;
    const created = await createBookingRequest(env, customer(), { now: initial });
    await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_UNAVAILABLE', 503));
    assert.equal(db.rows()[0].status, 'pending');
    assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
    assert.equal(calls.insert, 0);
  }
});

test('concurrent same-request acceptance cannot duplicate provider calls', async () => {
  const { env, db, calendar, calls } = setup();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  calendar.availability = async () => { calls.availability++; entered(); await blocked; return { busyIntervals: [] }; };
  const created = await createBookingRequest(env, customer(), { now: initial });
  const one = decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  await started;
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 1000 }), isCode('REQUEST_IN_PROGRESS', 409));
  release();
  assert.equal((await one).status, 'accepted');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.equal(calls.insert, 1);
});

test('ambiguous successful Calendar write retains claims and recovers by lookup without another insertion', async () => {
  const { env, db, calendar, calls } = setup();
  const write = calendar.createApprovedAppointment;
  calendar.createApprovedAppointment = async appointment => { await write(appointment); throw new Error('Synthetic connection lost after insert'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE', 503));
  assert.equal(db.rows()[0].status, 'reconcile');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial + 1000 }), isCode('REQUEST_STATE', 409));
  const recovered = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 });
  assert.equal(recovered.status, 'accepted');
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 1 });
});

test('ambiguous failed Calendar write must prove absence then recheck before a new insertion', async () => {
  const { env, db, calendar, calls } = setup();
  const write = calendar.createApprovedAppointment;
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic write failed before insert'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  calendar.createApprovedAppointment = write;
  const recovered = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 });
  assert.equal(recovered.status, 'accepted');
  assert.deepEqual(calls, { availability: 2, insert: 2, lookup: 1 });
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
});

test('external conflict after an absent ambiguous write prevents retry insertion', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic uncertain write'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  calendar.availability = async () => { calls.availability++; return { busyIntervals: [{ start: Date.parse(created.booking.startISO), end: Date.parse(created.booking.endISO) }] }; };
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 }), isCode('SLOT_CONFLICT', 409));
  assert.equal(db.rows()[0].status, 'pending');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 1 });
});

test('missing reconciliation support never discards claims or blindly inserts', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic unknown write'); };
  delete calendar.reconcileApprovedAppointment;
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 }), isCode('CALENDAR_RECONCILE'));
  assert.equal(db.rows()[0].status, 'reconcile');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.equal(calls.insert, 1);
});

test('storage failure after acknowledged event remains recoverable and never falsely returns accepted', async () => {
  const { env, db, calendar, calls } = setup();
  const write = calendar.createApprovedAppointment;
  calendar.createApprovedAppointment = async appointment => {
    const event = await write(appointment);
    db.fail = sql => sql.includes("SET status = 'accepted'");
    return event;
  };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('BOOKING_STORAGE', 503));
  assert.equal(db.rows()[0].status, 'reconcile');
  assert.equal((await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 })).status, 'accepted');
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 1 });
});

test('incomplete provider acknowledgement keeps reconciliation state and all claims', async () => {
  const { env, db, calendar } = setup();
  calendar.createApprovedAppointment = async () => ({ eventId: 'synthetic' });
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  assert.equal(db.rows()[0].status, 'reconcile');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
});

test('elapsed request or expired approval lease is checked again immediately before Calendar insertion', async () => {
  for (const delta of [60001, 2 * 86400000]) {
    const { env, db, calendar, calls } = setup();
    let now = initial;
    calendar.availability = async () => { calls.availability++; now += delta; return { busyIntervals: [] }; };
    const created = await createBookingRequest(env, customer(), { now: initial });
    await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: () => now }), isCode(delta === 60001 ? 'REQUEST_IN_PROGRESS' : 'REQUEST_EXPIRED'));
    assert.equal(calls.insert, 0);
    if (delta > 86400000) {
      assert.equal(db.rows()[0].status, 'expired');
      assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
    }
  }
});

test('SQLite constraints independently reject an altered DP and invalid claim grid', async () => {
  const { env, db } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  assert.throws(() => db.sqlite.prepare('UPDATE booking_requests SET deposit = 1 WHERE id = ?').run(created.requestId), /CHECK constraint/);
  assert.throws(() => db.sqlite.prepare('INSERT INTO booking_slot_claims(slot_start, request_id, claimed_at) VALUES (?, ?, ?)').run(1, created.requestId, initial), /CHECK constraint/);
});

test('a stale approval operation cannot write after a newer retry has finished', async () => {
  const { env, db, calendar, calls } = setup();
  let now = initial;
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  calendar.availability = async () => {
    calls.availability++;
    if (calls.availability === 1) { entered(); await blocked; }
    return { busyIntervals: [] };
  };
  const created = await createBookingRequest(env, customer(), { now: initial });
  const oldOperation = decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: () => now });
  await started;
  now += 60001;
  const retried = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: () => now });
  assert.equal(retried.status, 'accepted');
  release();
  await assert.rejects(oldOperation, isCode('REQUEST_IN_PROGRESS', 409));
  assert.equal(db.rows()[0].status, 'accepted');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.equal(calls.insert, 1);
});

test('existing ambiguous event can be recovered after its appointment start without inserting again', async () => {
  const { env, db, calendar, calls } = setup();
  const write = calendar.createApprovedAppointment;
  calendar.createApprovedAppointment = async appointment => { await write(appointment); throw new Error('Synthetic uncertain acknowledgement'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  const recovered = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: Date.parse(created.booking.startISO) + 1000 });
  assert.equal(recovered.status, 'accepted');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 1 });
});

test('absent ambiguous event after start expires without creating a past appointment', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic unknown write'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: Date.parse(created.booking.startISO) + 1000 }), isCode('REQUEST_EXPIRED', 410));
  assert.equal(db.rows()[0].status, 'expired');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 1 });
});

test('an incomplete claim set fails closed before any Calendar I/O on resume', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic unknown write'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  db.sqlite.prepare('DELETE FROM booking_slot_claims WHERE slot_start = (SELECT min(slot_start) FROM booking_slot_claims WHERE request_id = ?)').run(created.requestId);
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 }), isCode('BOOKING_STORAGE', 503));
  assert.deepEqual(calls, { availability: 1, insert: 1, lookup: 0 });
  assert.equal(db.rows()[0].status, 'reconcile');
});

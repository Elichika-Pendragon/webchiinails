import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { BookingRequestError, createBookingRequest as createRequest, getBookingRequest, decideBookingRequest, getBookingAvailability, getBookingPaymentProof } from './booking-requests.js';
import { proof, proofBytes } from './fixtures/payment-proof.js';
import { cleanupExpiredPaymentProofs, PAYMENT_PROOF_RETENTION_MS } from './booking-proofs.js';

const fixtureCalendars = new WeakMap();
const createBookingRequest = (env, input, options = {}) => createRequest(env, input, { calendar: fixtureCalendars.get(env), ...options });

// Real SQLite constraints and transactions, wrapped in the D1 statement shape.
// No real D1 binding, Calendar, credential, customer or network call is used.
class D1TestDatabase {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0002-booking-payment.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0003-booking-duration.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0004-booking-payment-proofs.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0005-booking-calendar-sync-index.sql', import.meta.url), 'utf8'));
    this.fail = null;
  }
  prepare(sql) {
    const database = this;
    return {
      sql, values: [],
      bind(...values) { return { ...this, values: values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value) }; },
      async first() { database.check(this.sql); return database.sqlite.prepare(this.sql).get(...this.values) ?? null; },
      async all() { database.check(this.sql); return { success: true, results: database.sqlite.prepare(this.sql).all(...this.values) }; },
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
const customer = (other = {}) => ({ name: 'Client Test', whatsapp: '081234567890', agreedPrice: '100001', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic_idempotency_001', proof, ...other });
function setup() {
  const db = new D1TestDatabase();
  const env = { BOOKING_DB: db, BOOKING_LINK_SECRET: 'synthetic_secret_only_for_tests_0123456789', BOOKING_OWNER_EMAIL: owner.email, SITE_URL: 'https://chiinails.example' };
  const events = new Map();
  const calls = { availability: 0, insert: 0, lookup: 0 };
  const calendar = {
    async availability() { calls.availability++; return { busyIntervals: [] }; },
    async verifyCalendarWriteAccess() { return true; },
    async readAppointmentState({ bookingId }) { return { state: events.has(bookingId) ? 'active' : 'deleted' }; },
    async createApprovedAppointment(appointment) {
      calls.insert++;
      const startISO = `${appointment.date}T${appointment.time}:00+07:00`;
      const endISO = `${new Date(Date.parse(startISO) + (appointment.durationMinutes ?? 120) * 60000 + 25200000).toISOString().slice(0, 19)}+07:00`;
      const result = { eventId: `chii${appointment.bookingId.replaceAll('-', '')}`, startISO, endISO };
      events.set(appointment.bookingId, result);
      return result;
    },
    async reconcileApprovedAppointment(appointment) {
      calls.lookup++;
      return events.has(appointment.bookingId) ? { found: true, ...events.get(appointment.bookingId), reconciled: true } : { found: false };
    },
  };
  fixtureCalendars.set(env, calendar);
  return { db, env, calendar, calls, events };
}
const tokenOf = result => new URL(result.reviewUrl).searchParams.get('r');
const isCode = (code, status) => error => error instanceof BookingRequestError && error.code === code && (!status || error.status === status);

test('creation stores the canonical five fields and derived DP; token is opaque and stored only as a hash', async () => {
  const { env, db, calendar, calls } = setup();
  const result = await createBookingRequest(env, customer({ deposit: '1', approved: true, paymentVerified: true }), { now: initial, calendar });
  assert.equal(result.status, 'pending');
  assert.equal(result.booking.deposit, 20000);
  assert.equal(result.booking.paymentMode, 'deposit');
  assert.equal(result.booking.paymentPolicy, 'min20k-v2');
  assert.equal(result.booking.remainingBalance, 80001);
  assert.equal(result.booking.whatsapp, '6281234567890');
  assert.equal(result.booking.startISO, '2026-10-21T14:00:00+07:00');
  assert.equal(result.booking.endISO, '2026-10-21T16:00:00+07:00');
  assert.equal(result.booking.expiresAt, '2026-10-21T07:00:00.000Z');
  const token = tokenOf(result);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(result.reviewUrl).origin, env.SITE_URL);
  const stored = db.rows()[0];
  assert.equal(stored.deposit, 10001); // Preserved v1 storage CHECK, not API amount.
  assert.equal(stored.payment_amount, 20000);
  assert.equal(stored.payment_mode, 'deposit');
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(token), false);
  assert.equal(JSON.stringify(stored).includes('paymentVerified'), false);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 1, insert: 0, lookup: 0 });
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

test('payment choice persists the canonical amount and participates in request idempotency', async () => {
  const { env, db } = setup();
  const dp = await createBookingRequest(env, customer({ paymentMode: 'deposit' }), { now: initial });
  await assert.rejects(createBookingRequest(env, customer({ paymentMode: 'full' }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
  const full = await createBookingRequest(env, customer({ paymentMode: 'full', idempotencyKey: 'synthetic_full_request_0001' }), { now: initial });
  assert.equal(dp.booking.deposit, 20000);
  assert.equal(full.booking.paymentMode, 'full');
  assert.equal(full.booking.deposit, 100001);
  assert.equal(full.booking.remainingBalance, 0);
  const stored = db.rows().find(row => row.id === full.requestId);
  assert.equal(stored.payment_amount, 100001);
  assert.equal(stored.payment_mode, 'full');
  assert.equal(stored.deposit, 10001);
  for (const paymentMode of ['legacy', 'FULL', '', null, [], {}]) {
    await assert.rejects(createBookingRequest(env, customer({ paymentMode }), { now: initial }), isCode('BOOKING_INPUT', 400));
  }
});

test('small totals normalize to full with no overcharge and unchanged canonical retries', async () => {
  const { env } = setup();
  for (const agreedPrice of ['1', '19999', '20000']) {
    const one = await createBookingRequest(env, customer({ agreedPrice, paymentMode: 'deposit', idempotencyKey: `synthetic_small_total_${agreedPrice}` }), { now: initial });
    assert.equal(one.booking.paymentMode, 'full');
    assert.equal(one.booking.deposit, Number(agreedPrice));
    assert.equal(one.booking.remainingBalance, 0);
    const repeated = await createBookingRequest(env, customer({ agreedPrice, paymentMode: 'full', idempotencyKey: `synthetic_small_total_${agreedPrice}` }), { now: initial });
    assert.equal(repeated.reviewUrl, one.reviewUrl);
  }
});

test('legacy pending rows keep their original 10% amount, idempotent retry and Calendar snapshot', async () => {
  const { env, db, calendar } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  const legacyHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ name: 'Client Test', whatsapp: '6281234567890', agreedPrice: 100001, date: '2026-10-21', time: '14:00' })))).toString('hex');
  db.sqlite.prepare("UPDATE booking_requests SET payment_mode = 'legacy', payment_amount = NULL, design_type = 'legacy', payload_hash = ? WHERE id = ?").run(legacyHash, created.requestId);
  const reviewed = await getBookingRequest(env, tokenOf(created), { owner, now: initial });
  assert.equal(reviewed.paymentMode, 'legacy');
  assert.equal(reviewed.paymentPolicy, 'legacy-10pct-v1');
  assert.equal(reviewed.deposit, 10001);
  assert.equal(reviewed.remainingBalance, 90000);
  const retried = await createBookingRequest(env, customer({ proof: undefined }), { now: initial });
  assert.equal(retried.reviewUrl, created.reviewUrl);
  assert.equal(retried.booking.deposit, 10001);
  await assert.rejects(createBookingRequest(env, customer({ paymentMode: 'full', proof: undefined }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
  const write = calendar.createApprovedAppointment;
  let received;
  calendar.createApprovedAppointment = async appointment => { received = appointment; return write(appointment); };
  const accepted = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  assert.equal(accepted.deposit, 10001);
  assert.equal(received.paymentMode, 'legacy');
  assert.equal(received.paymentAmount, 10001);
});

test('additive payment migration preserves existing rows and claims without rebuilding tables', async () => {
  const { env, db } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  const source = db.rows()[0];
  delete source.payment_mode;
  delete source.payment_amount;
  delete source.design_type;
  delete source.duration_minutes;
  const legacy = new DatabaseSync(':memory:');
  legacy.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
  const columns = Object.keys(source);
  legacy.prepare(`INSERT INTO booking_requests(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...Object.values(source));
  legacy.prepare('INSERT INTO booking_slot_claims(slot_start,request_id,claimed_at) VALUES (?, ?, ?)').run(source.start_ms, created.requestId, initial);
  const before = legacy.prepare('SELECT * FROM booking_requests').get();
  legacy.exec(readFileSync(new URL('../migrations/0002-booking-payment.sql', import.meta.url), 'utf8'));
  const after = legacy.prepare('SELECT * FROM booking_requests').get();
  assert.equal(after.payment_mode, 'legacy');
  assert.equal(after.payment_amount, null);
  delete after.payment_mode;
  delete after.payment_amount;
  assert.deepEqual(after, before);
  assert.equal(legacy.prepare('SELECT count(*) AS count FROM booking_slot_claims').get().count, 1);
  assert.throws(() => legacy.prepare("UPDATE booking_requests SET payment_mode = 'deposit', payment_amount = NULL").run(), /CHECK constraint/);
  assert.throws(() => legacy.prepare("UPDATE booking_requests SET payment_mode = 'deposit', payment_amount = 10001").run(), /CHECK constraint/);
  assert.throws(() => legacy.prepare("UPDATE booking_requests SET payment_mode = 'full', payment_amount = 20000").run(), /CHECK constraint/);
  legacy.prepare("UPDATE booking_requests SET payment_mode = 'deposit', payment_amount = 20000").run();
  legacy.prepare("UPDATE booking_requests SET payment_mode = 'full', payment_amount = agreed_price").run();
  assert.equal(legacy.prepare('SELECT payment_amount FROM booking_requests').get().payment_amount, 100001);
  legacy.close();
});

test('concurrent creation retries resolve to one SQLite row', async () => {
  const { env, db } = setup();
  const [one, two] = await Promise.all([createBookingRequest(env, customer(), { now: initial }), createBookingRequest(env, customer(), { now: initial })]);
  assert.equal(one.reviewUrl, two.reviewUrl);
  assert.equal(db.rows().length, 1);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 1);
  assert.equal(one.booking.hasPaymentProof, true);
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

test('invalid mobile prefix, length or letters cannot reach Calendar or save a booking and receipt', async () => {
  const { env, db, calls } = setup();
  for (const whatsapp of ['081234567', '08123456789012', '080412345678', '084123456789', '+081234567890', '08123456789x']) {
    await assert.rejects(createBookingRequest(env, customer({ whatsapp }), { now: initial }), error => error.code === 'BOOKING_INPUT' && error.status === 400 && Boolean(error.fields?.whatsapp));
  }
  assert.equal(db.rows().length, 0);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 0);
  assert.deepEqual(calls, { availability: 0, insert: 0, lookup: 0 });
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
  assert.deepEqual(calls, { availability: 1, insert: 0, lookup: 0 });
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
  assert.deepEqual(calls, { availability: 1, insert: 0, lookup: 0 });
});

test('owner cancellation is idempotent and changes pending only, with no Calendar I/O', async () => {
  const { env, calendar, calls } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  assert.equal((await decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial })).status, 'cancelled');
  assert.equal((await decideBookingRequest(env, tokenOf(created), 'cancel', { owner, calendar, now: initial })).status, 'cancelled');
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('REQUEST_STATE', 409));
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'unknown', { owner, calendar, now: initial }), isCode('BOOKING_INPUT', 400));
  assert.deepEqual(calls, { availability: 1, insert: 0, lookup: 0 });
});

test('accepted request has exactly four claims and one acknowledged, idempotent Calendar event', async () => {
  const { env, db, calendar, calls } = setup();
  const created = await createBookingRequest(env, customer(), { now: initial });
  const accepted = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.deposit, 20000);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  const repeated = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  assert.deepEqual(repeated, accepted);
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 0 });
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
  const created = await createBookingRequest(env, customer(), { now: initial });
  calendar.availability = async () => { calls.availability++; return { busyIntervals: [{ start: Date.parse('2026-10-21T15:30:00+07:00'), end: Date.parse('2026-10-21T16:30:00+07:00') }] }; };
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('SLOT_CONFLICT', 409));
  assert.equal(db.rows()[0].status, 'pending');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.equal(calls.insert, 0);
});

test('unavailable or malformed availability is never interpreted as an empty calendar', async () => {
  for (const availability of [async () => { throw new Error('Synthetic private provider detail'); }, async () => ({}), async () => ({ busyIntervals: [{ start: NaN, end: 1 }] })]) {
    const { env, db, calendar, calls } = setup();
    const created = await createBookingRequest(env, customer(), { now: initial });
    calendar.availability = availability;
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
  const created = await createBookingRequest(env, customer(), { now: initial });
  calendar.availability = async () => { calls.availability++; entered(); await blocked; return { busyIntervals: [] }; };
  const one = decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
  await started;
  const two = decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 1000 });
  release();
  const results = await Promise.allSettled([one, two]);
  assert.ok(results.some(result => result.status === 'fulfilled' && result.value.status === 'accepted'));
  assert.ok(results.every(result => result.status === 'fulfilled' ? result.value.status === 'accepted' : result.reason.code === 'REQUEST_IN_PROGRESS'));
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
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 1 });
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
  assert.deepEqual(calls, { availability: 3, insert: 2, lookup: 1 });
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
  assert.deepEqual(calls, { availability: 3, insert: 1, lookup: 1 });
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
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 1 });
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
    const created = await createBookingRequest(env, customer(), { now: initial });
    calendar.availability = async () => { calls.availability++; now += delta; return { busyIntervals: [] }; };
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

test('a late approval preflight returns the existing acknowledgement after a concurrent retry finishes without writing twice', async () => {
  const { env, db, calendar, calls } = setup();
  let now = initial;
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const created = await createBookingRequest(env, customer(), { now: initial });
  calendar.availability = async () => {
    calls.availability++;
    if (calls.availability === 2) { entered(); await blocked; }
    return { busyIntervals: [] };
  };
  const oldOperation = decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: () => now });
  await started;
  now += 60001;
  const retried = await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: () => now });
  assert.equal(retried.status, 'accepted');
  release();
  assert.equal((await oldOperation).status, 'accepted');
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
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 1 });
});

test('absent ambiguous event after start expires without creating a past appointment', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic unknown write'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: Date.parse(created.booking.startISO) + 1000 }), isCode('REQUEST_EXPIRED', 410));
  assert.equal(db.rows()[0].status, 'expired');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 1 });
});

test('an incomplete claim set fails closed before any Calendar I/O on resume', async () => {
  const { env, db, calendar, calls } = setup();
  calendar.createApprovedAppointment = async () => { calls.insert++; throw new Error('Synthetic unknown write'); };
  const created = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  db.sqlite.prepare('DELETE FROM booking_slot_claims WHERE slot_start = (SELECT min(slot_start) FROM booking_slot_claims WHERE request_id = ?)').run(created.requestId);
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial + 60001 }), isCode('BOOKING_STORAGE', 503));
  assert.deepEqual(calls, { availability: 2, insert: 1, lookup: 0 });
  assert.equal(db.rows()[0].status, 'reconcile');
});

test('actual duration drives the owner brief, fresh Calendar bounds and complete atomic claim count', async () => {
  for (const [designType, durationMinutes, time] of [['plain', 60, '14:00'], ['simple', 60, '14:00'], ['simple', 120, '14:00'], ['full-art', 180, '12:00'], ['full-art', 240, '12:00'], ['full-art', 300, '12:00']]) {
    const { env, db, calendar } = setup();
    let checkedBounds;
    calendar.availability = async bounds => { checkedBounds = bounds; return { busyIntervals: [] }; };
    const created = await createBookingRequest(env, customer({ designType, durationMinutes: String(durationMinutes), time }), { now: initial });
    assert.equal(created.booking.designType, designType);
    assert.equal(created.booking.durationMinutes, durationMinutes);
    assert.equal(Date.parse(created.booking.endISO) - Date.parse(created.booking.startISO), durationMinutes * 60000);
    const stored = db.rows()[0];
    assert.equal(stored.end_ms - stored.start_ms, 7200000); // Original v1 column CHECK is preserved.
    assert.equal(stored.duration_minutes, durationMinutes);
    assert.equal((await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial })).status, 'accepted');
    assert.equal(checkedBounds.timeMax, created.booking.endISO);
    assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, durationMinutes / 30);
    assert.equal(db.rows('SELECT max(slot_start) AS last FROM booking_slot_claims')[0].last, Date.parse(created.booking.endISO) - 1800000);
  }
});

test('design and duration are immutable request identity, including old payment-policy retries', async () => {
  const { env, db } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  await assert.rejects(createBookingRequest(env, customer({ designType: 'plain', durationMinutes: '60' }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
  const legacyFinancialHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ name: 'Client Test', whatsapp: '6281234567890', agreedPrice: 100001, date: '2026-10-21', time: '14:00', paymentMode: 'deposit', paymentAmount: 20000, paymentPolicy: 'min20k-v2' })))).toString('hex');
  db.sqlite.prepare("UPDATE booking_requests SET design_type = 'legacy', payload_hash = ? WHERE id = ?").run(legacyFinancialHash, one.requestId);
  const repeated = await createBookingRequest(env, customer({ proof: undefined }), { now: initial });
  assert.equal(repeated.reviewUrl, one.reviewUrl);
  assert.equal(repeated.booking.designType, 'legacy');
  assert.equal(repeated.booking.durationMinutes, 120);
  await assert.rejects(createBookingRequest(env, customer({ designType: 'simple', durationMinutes: '60' }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
});

test('additive duration migration preserves prior payment metadata, original end fields and slot claims', async () => {
  const { env, db } = setup();
  const created = await createBookingRequest(env, customer({ paymentMode: 'full' }), { now: initial });
  const original = db.rows()[0];
  delete original.design_type;
  delete original.duration_minutes;
  const older = new DatabaseSync(':memory:');
  older.exec(readFileSync(new URL('../migrations/0001-booking.sql', import.meta.url), 'utf8'));
  older.exec(readFileSync(new URL('../migrations/0002-booking-payment.sql', import.meta.url), 'utf8'));
  const columns = Object.keys(original);
  older.prepare(`INSERT INTO booking_requests(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...Object.values(original));
  older.prepare('INSERT INTO booking_slot_claims(slot_start,request_id,claimed_at) VALUES(?,?,?)').run(original.start_ms, created.requestId, initial);
  older.exec(readFileSync(new URL('../migrations/0003-booking-duration.sql', import.meta.url), 'utf8'));
  const migrated = older.prepare('SELECT * FROM booking_requests').get();
  assert.equal(migrated.design_type, 'legacy');
  assert.equal(migrated.duration_minutes, 120);
  delete migrated.design_type;
  delete migrated.duration_minutes;
  assert.deepEqual({ ...migrated }, { ...original });
  assert.equal(older.prepare('SELECT count(*) AS count FROM booking_slot_claims').get().count, 1);
  for (const [design, duration] of [['plain', 120], ['simple', 300], ['full-art', 60], ['legacy', 60]]) assert.throws(() => older.prepare('UPDATE booking_requests SET design_type=?,duration_minutes=?').run(design, duration), /CHECK constraint/);
  older.prepare("UPDATE booking_requests SET design_type='full-art',duration_minutes=300").run();
  assert.equal(older.prepare('SELECT duration_minutes AS duration FROM booking_requests').get().duration, 300);
  older.close();
});

test('public availability exposes booleans only, keeps pending free and blocks the entire confirmed actual duration', async () => {
  const { env, db, calendar, calls } = setup();
  const created = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial });
  const selection = { date: '2026-10-21', designType: 'plain', durationMinutes: '60' };
  const before = await getBookingAvailability(env, selection, { now: initial, calendar });
  assert.equal(before.slots.find(slot => slot.time === '14:00').available, true);
  await decideBookingRequest(env, tokenOf(created), 'accept', { owner, now: initial, calendar });
  const changesBeforeRead = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  const result = await getBookingAvailability(env, selection, { now: initial, calendar });
  assert.equal(result.slots.find(slot => slot.time === '11:00').available, true);
  assert.equal(result.slots.find(slot => slot.time === '11:30').available, false);
  assert.equal(result.slots.find(slot => slot.time === '14:00').available, false);
  assert.deepEqual(Object.keys(result).sort(), ['date', 'designType', 'durationMinutes', 'timeZone', 'slots'].sort());
  assert.ok(result.slots.every(slot => Object.keys(slot).sort().join(',') === 'available,time'));
  for (const privateValue of ['Client Test', '6281234567890', created.requestId, tokenOf(created), 'paymentAmount', 'calendarId']) assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, changesBeforeRead);
  assert.equal(calls.insert, 1);
});

test('public availability blocks ambiguous claims and external busy intervals without revealing their sources', async () => {
  const { env, calendar } = setup();
  const created = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '180', time: '12:00' }), { now: initial });
  calendar.createApprovedAppointment = async () => { throw new Error('Synthetic uncertain insert'); };
  await assert.rejects(decideBookingRequest(env, tokenOf(created), 'accept', { owner, now: initial, calendar }), isCode('CALENDAR_RECONCILE'));
  calendar.availability = async () => ({ busyIntervals: [{ start: Date.parse('2026-10-21T09:00:00+07:00'), end: Date.parse('2026-10-21T10:00:00+07:00') }] });
  const result = await getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar });
  assert.equal(result.slots.find(slot => slot.time === '08:30').available, false);
  assert.equal(result.slots.find(slot => slot.time === '10:00').available, true);
  assert.equal(result.slots.find(slot => slot.time === '14:00').available, false);
});

test('availability fails closed on malformed dates, upstream errors or storage failure, with no false free slots', async () => {
  const { env, db, calendar, calls } = setup();
  const good = { date: '2026-10-21', designType: 'plain', durationMinutes: 60 };
  for (const change of [{ date: '2026-02-30' }, { date: '2026-10-19' }, { date: '2027-12-01' }, { designType: 'legacy' }, { durationMinutes: '1e2' }]) await assert.rejects(getBookingAvailability(env, { ...good, ...change }, { now: initial, calendar }), isCode('BOOKING_INPUT', 400));
  assert.equal(calls.availability, 0);
  calendar.availability = async () => { throw new Error('Synthetic private Calendar error'); };
  await assert.rejects(getBookingAvailability(env, good, { now: initial, calendar }), isCode('CALENDAR_UNAVAILABLE', 503));
  calendar.availability = async () => ({ busyIntervals: [] });
  db.fail = sql => sql.includes('SELECT c.slot_start');
  await assert.rejects(getBookingAvailability(env, good, { now: initial, calendar }), isCode('BOOKING_STORAGE', 503));
});

test('elapsed candidates are disabled while infeasible weekend full-art returns no candidates and makes no provider calls', async () => {
  const { env, calendar, calls } = setup();
  const late = Date.parse('2026-10-20T15:00:00+07:00');
  const elapsed = await getBookingAvailability(env, { date: '2026-10-20', designType: 'plain', durationMinutes: 60 }, { now: late, calendar });
  assert.ok(elapsed.slots.length > 0 && elapsed.slots.every(slot => slot.available === false));
  const weekend = await getBookingAvailability(env, { date: '2026-10-24', designType: 'full-art', durationMinutes: 300 }, { now: initial, calendar });
  assert.deepEqual(weekend.slots, []);
  assert.equal(calls.availability, 0);
});

test('new submission checks its actual interval and rejects Busy all-day or partial overlap before any ledger write', async () => {
  for (const busy of [
    { start: Date.parse('2026-10-21T00:00:00+07:00'), end: Date.parse('2026-10-22T00:00:00+07:00') },
    { start: Date.parse('2026-10-21T16:30:00+07:00'), end: Date.parse('2026-10-21T17:00:00+07:00') },
  ]) {
    const { env, db, calendar, calls } = setup();
    let bounds;
    calendar.availability = async input => { calls.availability++; bounds = input; return { busyIntervals: [busy] }; };
    await assert.rejects(createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial }), isCode('SLOT_CONFLICT', 409));
    assert.deepEqual(bounds, { timeMin: '2026-10-21T12:00:00+07:00', timeMax: '2026-10-21T17:00:00+07:00' });
    assert.equal(db.rows().length, 0);
    assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 0);
    assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
    assert.deepEqual(calls, { availability: 1, insert: 0, lookup: 0 });
  }
});

test('new submission fails closed on unavailable Calendar or claims storage without creating a request or receipt', async () => {
  for (const availability of [async () => { throw new Error('Synthetic unavailable'); }, async () => ({}), async () => ({ busyIntervals: [{ start: NaN, end: 1 }] })]) {
    const { env, db, calendar } = setup();
    calendar.availability = availability;
    await assert.rejects(createBookingRequest(env, customer(), { now: initial }), isCode('CALENDAR_UNAVAILABLE', 503));
    assert.equal(db.rows().length, 0);
    assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 0);
  }
  const { env, db } = setup();
  db.fail = sql => sql.includes('SELECT c.slot_start');
  await assert.rejects(createBookingRequest(env, customer(), { now: initial }), isCode('BOOKING_STORAGE', 503));
  assert.equal(db.rows().length, 0);
});

test('matching creation retry returns the original pending request while a new request is blocked by fresh occupancy', async () => {
  const { env, db, calendar, calls } = setup();
  const first = await createBookingRequest(env, customer(), { now: initial });
  calendar.availability = async () => { calls.availability++; return { busyIntervals: [{ start: Date.parse(first.booking.startISO), end: Date.parse(first.booking.endISO) }] }; };
  assert.deepEqual(await createBookingRequest(env, customer(), { now: initial }), first);
  assert.equal(calls.availability, 1);
  await assert.rejects(createBookingRequest(env, customer({ idempotencyKey: 'synthetic_fresh_busy_request' }), { now: initial }), isCode('SLOT_CONFLICT', 409));
  assert.equal(db.rows().length, 1);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 1);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  assert.equal(calls.insert, 0);
});

test('new submission checks dynamic confirmed claims beyond the original two-hour storage end', async () => {
  const { env, db, calendar } = setup();
  const full = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial });
  await decideBookingRequest(env, tokenOf(full), 'accept', { owner, calendar, now: initial });
  // The fake Calendar deliberately returns no busy intervals. D1 must still
  // prevent a one-hour request beginning at the original two-hour endpoint.
  await assert.rejects(createBookingRequest(env, customer({ designType: 'plain', durationMinutes: '60', time: '14:00', idempotencyKey: 'synthetic_claims_after_old_end' }), { now: initial }), isCode('SLOT_CONFLICT', 409));
  assert.equal(db.rows().length, 1);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 10);
});

test('concurrent different-duration approvals leave one winner, complete claims and a single Calendar event', async () => {
  const { env, db, calendar, calls } = setup();
  const one = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial });
  const two = await createBookingRequest(env, customer({ designType: 'plain', durationMinutes: '60', time: '14:00', idempotencyKey: 'synthetic_concurrent_plain_1' }), { now: initial });
  const results = await Promise.allSettled([one, two].map(value => decideBookingRequest(env, tokenOf(value), 'accept', { owner, calendar, now: initial })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'SLOT_CONFLICT').length, 1);
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, winner.durationMinutes / 30);
  assert.equal(calls.insert, 1);
  const source = winner.id === one.requestId ? one : two;
  assert.deepEqual(await decideBookingRequest(env, tokenOf(source), 'accept', { owner, calendar, now: initial }), winner);
  assert.equal(calls.insert, 1);
});

test('required receipt and request persist atomically, with proof digest bound to idempotency', async () => {
  const { env, db, calls } = setup();
  await assert.rejects(createBookingRequest(env, customer({ proof: undefined }), { now: initial }), isCode('BOOKING_INPUT', 400));
  await assert.rejects(createBookingRequest(env, customer({ proof: { ...proof, contentType: 'text/html' } }), { now: initial }), isCode('BOOKING_INPUT', 400));
  assert.equal(calls.availability, 0);
  db.fail = sql => sql.includes('INSERT INTO booking_payment_proofs');
  await assert.rejects(createBookingRequest(env, customer(), { now: initial }), isCode('BOOKING_STORAGE', 503));
  assert.equal(db.rows().length, 0);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 0);
  const one = await createBookingRequest(env, customer(), { now: initial });
  assert.equal(one.booking.hasPaymentProof, true);
  const stored = db.rows('SELECT * FROM booking_payment_proofs')[0];
  assert.deepEqual(stored.content, proofBytes);
  assert.equal(stored.expires_at, Date.parse(one.booking.endISO) + PAYMENT_PROOF_RETENTION_MS);
  assert.equal(stored.created_at, initial);
  assert.equal(JSON.stringify(one).includes(proof.base64), false);
  assert.equal(JSON.stringify(one).includes(stored.sha256), false);
  const altered = proofBytes.slice(); altered[altered.length - 3] ^= 1;
  await assert.rejects(createBookingRequest(env, customer({ proof: { ...proof, base64: Buffer.from(altered).toString('base64') } }), { now: initial }), isCode('IDEMPOTENCY_CONFLICT', 409));
  assert.equal(db.rows().length, 1);
});

test('owner-only proof reads are immutable, expiry denies bytes, and legacy requests have no receipt', async () => {
  const { env, db } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  const token = tokenOf(one);
  const before = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  for (const identity of [undefined, { ...owner, verified: false }, { ...owner, email: 'wrong@example.com' }]) await assert.rejects(getBookingPaymentProof(env, token, { owner: identity, now: initial }), isCode('BOOKING_OWNER', 403));
  assert.deepEqual(await getBookingPaymentProof(env, token, { owner, now: initial }), proofBytes);
  const expiry = Date.parse(one.booking.endISO) + PAYMENT_PROOF_RETENTION_MS;
  assert.equal((await getBookingRequest(env, token, { owner, now: expiry - 1 })).hasPaymentProof, true);
  assert.equal((await getBookingRequest(env, token, { owner, now: expiry })).hasPaymentProof, false);
  await assert.rejects(getBookingPaymentProof(env, token, { owner, now: expiry }), isCode('PROOF_EXPIRED', 410));
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, before);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 1); // GET never deletes.
  db.sqlite.prepare('DELETE FROM booking_payment_proofs WHERE request_id=?').run(one.requestId);
  assert.equal((await getBookingRequest(env, token, { owner, now: initial })).hasPaymentProof, false);
  await assert.rejects(getBookingPaymentProof(env, token, { owner, now: initial }), isCode('PROOF_NOT_FOUND', 404));
});

test('daily cleanup deletes only expired receipts using the index and preserves booking metadata, claims and future images', async () => {
  const { env, db, calendar } = setup();
  const old = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial });
  const future = await createBookingRequest(env, customer({ date: '2026-11-21', time: '10:00', idempotencyKey: 'synthetic_future_receipt_1' }), { now: initial });
  await decideBookingRequest(env, tokenOf(old), 'accept', { owner, calendar, now: initial });
  const expiry = Date.parse(old.booking.endISO) + PAYMENT_PROOF_RETENTION_MS;
  assert.deepEqual(await cleanupExpiredPaymentProofs(env, { now: expiry - 1 }), { deleted: 0 });
  const before = db.rows();
  const claims = db.rows('SELECT * FROM booking_slot_claims');
  assert.deepEqual(await cleanupExpiredPaymentProofs(env, { now: expiry }), { deleted: 1 });
  assert.deepEqual(db.rows(), before);
  assert.deepEqual(db.rows('SELECT * FROM booking_slot_claims'), claims);
  assert.deepEqual(db.rows('SELECT request_id FROM booking_payment_proofs').map(row => row.request_id), [future.requestId]);
  assert.deepEqual(await cleanupExpiredPaymentProofs(env, { now: expiry }), { deleted: 0 });
  const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT request_id FROM booking_payment_proofs WHERE expires_at <= ? ORDER BY expires_at LIMIT 500').all(expiry);
  assert.ok(plan.some(row => row.detail.includes('booking_payment_proofs_expiry')));
});

test('cleanup has a hard 500-row bound and retries remaining expired receipts without deleting booking records', async () => {
  const { env, db } = setup();
  const first = await createBookingRequest(env, customer(), { now: initial });
  const row = db.rows()[0];
  const columns = Object.keys(row);
  const insert = db.sqlite.prepare(`INSERT INTO booking_requests(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
  const insertProof = db.sqlite.prepare(`INSERT INTO booking_payment_proofs(request_id,content_type,content,sha256,created_at,expires_at)
    SELECT ?,content_type,content,sha256,created_at,expires_at FROM booking_payment_proofs WHERE request_id=?`);
  db.sqlite.exec('BEGIN');
  for (let i = 1; i <= 501; i++) {
    const copy = { ...row, id: crypto.randomUUID(), token_hash: i.toString(16).padStart(64, '0'), idempotency_hash: i.toString(16).padStart(64, '0') };
    insert.run(...columns.map(column => copy[column]));
    insertProof.run(copy.id, first.requestId);
  }
  db.sqlite.exec('COMMIT');
  const expiry = Date.parse(first.booking.endISO) + PAYMENT_PROOF_RETENTION_MS;
  assert.deepEqual(await cleanupExpiredPaymentProofs(env, { now: expiry }), { deleted: 500 });
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 2);
  assert.equal(db.rows().length, 502);
  assert.deepEqual(await cleanupExpiredPaymentProofs(env, { now: expiry }), { deleted: 2 });
  assert.equal(db.rows().length, 502);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 0);
});

test('private proof reads fail closed on malformed stored JPEG or D1 read failure', async () => {
  const { env, db } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  db.fail = sql => sql.includes('SELECT content_type, content');
  await assert.rejects(getBookingPaymentProof(env, tokenOf(one), { owner, now: initial }), isCode('BOOKING_STORAGE', 503));
  db.sqlite.prepare('UPDATE booking_payment_proofs SET content=? WHERE request_id=?').run(new TextEncoder().encode('<html>bad</html>'), one.requestId);
  await assert.rejects(getBookingPaymentProof(env, tokenOf(one), { owner, now: initial }), isCode('BOOKING_STORAGE', 503));
});

test('confirmed Calendar deletion releases the entire actual duration, retains history and never recreates an acknowledged event', async () => {
  const { env, db, calendar, events, calls } = setup();
  const one = await createBookingRequest(env, customer({ designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now: initial });
  const accepted = await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
  const eventId = db.rows()[0].calendar_event_id;
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 10);
  events.delete(one.requestId);
  const beforeRetry = { ...calls };
  assert.deepEqual(await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial }), accepted);
  assert.deepEqual(calls, beforeRetry); // Already acknowledged retries stay no-I/O.
  const beforeRead = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  assert.equal((await getBookingRequest(env, tokenOf(one), { owner, now: initial })).status, 'accepted');
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, beforeRead);
  const result = await getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar });
  assert.ok(result.slots.every(slot => slot.available));
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 0);
  const stored = db.rows()[0];
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.calendar_event_id, eventId);
  assert.equal(stored.agreed_price, 100001);
  assert.equal(stored.duration_minutes, 300);
  assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length, 1);
  const reviewed = await getBookingRequest(env, tokenOf(one), { owner, now: initial });
  assert.equal(reviewed.cancelledViaCalendar, true);
  assert.equal(reviewed.status, 'cancelled');
  await assert.rejects(decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial }), isCode('REQUEST_STATE', 409));
  assert.equal(calls.insert, 1);
});

test('Book and a new pending owner acceptance synchronize definite deletion before checking or claiming the replacement slot', async () => {
  for (const trigger of ['Book', 'owner acceptance']) {
    const { env, db, calendar, events, calls } = setup();
    const one = await createBookingRequest(env, customer(), { now: initial });
    const replacementInput = customer({ idempotencyKey: 'synthetic_calendar_replacement', designType: 'plain', durationMinutes: '60' });
    const pendingReplacement = trigger === 'owner acceptance' ? await createBookingRequest(env, replacementInput, { now: initial }) : null;
    await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
    events.delete(one.requestId);
    const replacement = pendingReplacement ?? await createBookingRequest(env, replacementInput, { now: initial });
    assert.equal((await decideBookingRequest(env, tokenOf(replacement), 'accept', { owner, calendar, now: initial })).status, 'accepted');
    assert.equal(db.rows().find(row => row.id === one.requestId).status, 'cancelled');
    assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 2);
    assert.ok(db.rows('SELECT * FROM booking_slot_claims').every(row => row.request_id === replacement.requestId));
    assert.equal(calls.insert, 2);
  }
});

test('unhealthy Calendar, downgraded access and uncertain event lookup retain every confirmed claim', async () => {
  for (const mode of ['freeBusy', 'role', 'event', 'malformed']) {
    const { env, db, calendar } = setup();
    const one = await createBookingRequest(env, customer(), { now: initial });
    await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
    let reads = 0;
    calendar.readAppointmentState = async () => { reads++; if (mode === 'event') throw new Error('Synthetic503'); return mode === 'malformed' ? {} : { state: 'deleted' }; };
    if (mode === 'freeBusy') calendar.availability = async () => { throw new Error('Synthetic403'); };
    if (mode === 'role') calendar.verifyCalendarWriteAccess = async () => false;
    const changes = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
    await assert.rejects(getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar }), isCode('CALENDAR_UNAVAILABLE', 503));
    assert.equal(db.rows()[0].status, 'accepted');
    assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
    assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, changes);
    assert.equal(reads, ['freeBusy', 'role'].includes(mode) ? 0 : 1);
  }
});

test('Calendar sync excludes ambiguous writes, bounds event lookup concurrency and rolls back all releases when a later lookup fails', async () => {
  const { env, db, calendar, events } = setup();
  const bookings = [];
  for (const time of ['08:00', '10:00', '12:00', '14:00']) {
    const created = await createBookingRequest(env, customer({ time, idempotencyKey: `synthetic_daily_${time.replace(':', '')}` }), { now: initial });
    await decideBookingRequest(env, tokenOf(created), 'accept', { owner, calendar, now: initial });
    bookings.push(created);
  }
  events.delete(bookings[0].requestId);
  events.delete(bookings[1].requestId);
  let running = 0;
  let maximum = 0;
  let failLast = true;
  calendar.readAppointmentState = async ({ bookingId }) => {
    running++; maximum = Math.max(maximum, running);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      if (failLast && bookingId === bookings[3].requestId) throw new Error('Synthetic later503');
      return { state: events.has(bookingId) ? 'active' : 'deleted' };
    } finally { running--; }
  };
  const selection = { date: '2026-10-21', designType: 'plain', durationMinutes: 60 };
  await assert.rejects(getBookingAvailability(env, selection, { now: initial, calendar }), isCode('CALENDAR_UNAVAILABLE', 503));
  assert.equal(maximum, 3);
  assert.ok(db.rows().every(row => row.status === 'accepted'));
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 16);
  failLast = false;
  await getBookingAvailability(env, selection, { now: initial, calendar });
  assert.equal(db.rows().filter(row => row.status === 'cancelled').length, 2);
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 8);
});

test('ambiguous writes are never auto-released even when the Calendar has no event', async () => {
  const { env, db, calendar } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  calendar.createApprovedAppointment = async () => { throw new Error('Synthetic unknown insert'); };
  await assert.rejects(decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial }), isCode('CALENDAR_RECONCILE'));
  let reads = 0;
  calendar.readAppointmentState = async () => { reads++; return { state: 'deleted' }; };
  const result = await getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar });
  assert.equal(result.slots.find(slot => slot.time === '14:00').available, false);
  assert.equal(reads, 0);
  assert.equal(db.rows()[0].status, 'reconcile');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
});

test('a late deletion sync cannot delete a replacement booking claim after another sync and owner approval finish', async () => {
  const { env, db, calendar, events, calls } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  const two = await createBookingRequest(env, customer({ idempotencyKey: 'synthetic_delete_race_replacement' }), { now: initial });
  await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
  events.delete(one.requestId);
  let release;
  let entered;
  let first = true;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  calendar.readAppointmentState = async ({ bookingId }) => {
    if (bookingId === one.requestId && first) { first = false; entered(); await blocked; return { state: 'deleted' }; }
    return { state: events.has(bookingId) ? 'active' : 'deleted' };
  };
  const late = getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar });
  await started;
  assert.equal((await decideBookingRequest(env, tokenOf(two), 'accept', { owner, calendar, now: initial })).status, 'accepted');
  release();
  assert.equal((await late).slots.find(slot => slot.time === '14:00').available, false);
  assert.equal(db.rows().find(row => row.id === one.requestId).status, 'cancelled');
  assert.equal(db.rows().find(row => row.id === two.requestId).status, 'accepted');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  assert.ok(db.rows('SELECT * FROM booking_slot_claims').every(row => row.request_id === two.requestId));
  assert.equal(calls.insert, 2);
});

test('failed cancellation batch rolls back claim deletion and requested-day lookup uses the additive index', async () => {
  const { env, db, calendar, events } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
  events.delete(one.requestId);
  db.fail = sql => sql.includes("UPDATE booking_requests SET status = 'cancelled', updated_at");
  await assert.rejects(getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar }), isCode('BOOKING_STORAGE', 503));
  assert.equal(db.rows()[0].status, 'accepted');
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
  const plan = db.sqlite.prepare("EXPLAIN QUERY PLAN SELECT id,calendar_event_id FROM booking_requests WHERE status='accepted' AND start_ms>=? AND start_ms<? AND start_ms+duration_minutes*60000>? ORDER BY start_ms LIMIT 13").all(initial, initial + 86400000, initial);
  assert.ok(plan.some(row => row.detail.includes('booking_requests_status_start')));
});

test('a corrupt requested day with more than twelve accepted rows fails closed before event lookups or release', async () => {
  const { env, db, calendar } = setup();
  const one = await createBookingRequest(env, customer(), { now: initial });
  await decideBookingRequest(env, tokenOf(one), 'accept', { owner, calendar, now: initial });
  const row = db.rows()[0];
  const columns = Object.keys(row);
  const insert = db.sqlite.prepare(`INSERT INTO booking_requests(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
  for (let i = 1; i <= 12; i++) {
    const copy = { ...row, id: crypto.randomUUID(), token_hash: i.toString(16).padStart(64, '0'), idempotency_hash: i.toString(16).padStart(64, '0') };
    insert.run(...columns.map(column => copy[column]));
  }
  let reads = 0;
  calendar.readAppointmentState = async () => { reads++; return { state: 'deleted' }; };
  await assert.rejects(getBookingAvailability(env, { date: '2026-10-21', designType: 'plain', durationMinutes: 60 }, { now: initial, calendar }), isCode('BOOKING_STORAGE', 503));
  assert.equal(reads, 0);
  assert.ok(db.rows().every(value => value.status === 'accepted'));
  assert.equal(db.rows('SELECT * FROM booking_slot_claims').length, 4);
});

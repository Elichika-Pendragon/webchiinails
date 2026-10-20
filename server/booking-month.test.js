import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { getBookingCalendarMonth, getBookingMonthBounds } from './booking-month.js';
import { BookingRequestError } from './booking-requests.js';

const current = Date.parse('2026-10-21T11:00:00+07:00');
const at = value => Date.parse(value);
const busy = (start, end) => ({ start: at(start), end: at(end) });
const selection = { month: '2026-10', designType: 'plain', durationMinutes: '60' };
const isCode = (code, status) => error => error instanceof BookingRequestError && error.code === code && (status === undefined || error.status === status);
const claimRows = (start, end) => Array.from({ length: (at(end) - at(start)) / 1800000 }, (_, index) => ({ slot_start: at(start) + index * 1800000 }));
function fixture(intervals = [], claims = []) {
  const calls = [];
  const reads = [];
  const env = { BOOKING_DB: { prepare(sql) { return { bind(...values) { reads.push({ sql, values }); return { async all() { return { success: true, results: claims }; } }; } }; }, batch() { throw new Error('Month shading must not mutate the ledger'); } } };
  const calendar = { async availability(bounds) { calls.push(bounds); return { busyIntervals: intervals }; } };
  return { env, calendar, calls, reads };
}
const read = (item, input = selection, now = current) => getBookingCalendarMonth(item.env, input, { now, calendar: item.calendar });

test('month marks October 24 all-day with one clipped WIB query, one claim read and no private fields', async () => {
  // Provider normalization includes all-day events regardless of Busy/Free.
  const item = fixture([busy('2026-10-24T00:00:00+07:00', '2026-10-25T00:00:00+07:00')]);
  const result = await read(item);
  assert.deepEqual(result, { month: '2026-10', designType: 'plain', durationMinutes: 60, timeZone: 'Asia/Jakarta', minDate: '2026-10-21', maxDate: '2026-10-31', closedDates: ['2026-10-24'] });
  assert.deepEqual(item.calls, [{ timeMin: '2026-10-21T00:00:00+07:00', timeMax: '2026-11-01T00:00:00+07:00' }]);
  assert.equal(item.reads.length, 1);
  assert.match(item.reads[0].sql, /r\.status IN \('approving', 'reconcile'\)/);
  assert.doesNotMatch(item.reads[0].sql, /UPDATE|DELETE|INSERT|'accepted'/);
  for (const value of ['Ultah', 'birthday', 'calendarId', 'eventId', 'email', 'token', 'BOOKING_DB', 'busyIntervals', 'slot_start']) assert.equal(JSON.stringify(result).includes(value), false);
});

test('partial timed bookings keep a date open until every selected-duration candidate is occupied', async () => {
  const item = fixture([busy('2026-10-30T08:00:00+07:00', '2026-10-30T10:00:00+07:00')]);
  const twoHours = { ...selection, designType: 'simple', durationMinutes: '120' };
  assert.equal((await read(item, twoHours)).closedDates.includes('2026-10-30'), false);
  item.calendar.availability = async () => ({ busyIntervals: [busy('2026-10-30T08:00:00+07:00', '2026-10-30T16:00:00+07:00')] });
  assert.equal((await read(item, twoHours)).closedDates.includes('2026-10-30'), true);
  const fiveHours = fixture([busy('2026-10-30T08:00:00+07:00', '2026-10-30T10:00:00+07:00')]);
  assert.equal((await read(fiveHours, { ...selection, designType: 'full-art', durationMinutes: '300' })).closedDates.includes('2026-10-30'), true);
  assert.equal((await read(fiveHours, twoHours)).closedDates.includes('2026-10-30'), false);
});

test('all exact service durations preserve cadence, weekend fit and elapsed-start rules', async () => {
  for (const [designType, durationMinutes] of [['plain', '60'], ['simple', '60'], ['simple', '120'], ['full-art', '180'], ['full-art', '240'], ['full-art', '300']]) {
    const result = await read(fixture(), { ...selection, designType, durationMinutes });
    assert.equal(result.designType, designType);
    assert.equal(result.durationMinutes, Number(durationMinutes));
    assert.equal(result.closedDates.includes('2026-10-24'), durationMinutes === '300');
  }
  const result = await read(fixture(), selection, at('2026-10-21T14:00:00+07:00'));
  assert.equal(result.closedDates.includes('2026-10-21'), true);
  assert.equal(result.closedDates.includes('2026-10-22'), false);
});

test('unsorted overlapping and touching occupancy merges while a fitting gap stays available', async () => {
  const item = fixture([
    busy('2026-10-24T10:00:00+07:00', '2026-10-24T12:00:00+07:00'),
    busy('2026-10-24T07:00:00+07:00', '2026-10-24T09:00:00+07:00'),
    busy('2026-10-24T08:30:00+07:00', '2026-10-24T10:00:00+07:00'),
    busy('2026-10-25T08:00:00+07:00', '2026-10-25T10:00:00+07:00'),
    busy('2026-10-25T11:00:00+07:00', '2026-10-25T12:00:00+07:00'),
  ]);
  assert.deepEqual((await read(item)).closedDates, ['2026-10-24']);
});

test('half-open all-day boundaries block only their dates and multi-day spans return sorted unique dates', async () => {
  const item = fixture([
    busy('2026-10-25T00:00:00+07:00', '2026-10-27T00:00:00+07:00'),
    busy('2026-10-25T00:00:00+07:00', '2026-10-26T00:00:00+07:00'),
  ]);
  assert.deepEqual((await read(item)).closedDates, ['2026-10-25', '2026-10-26']);
});

test('empty occupancy stays open and a whole-month closure remains bounded', async () => {
  const input = { ...selection, month: '2026-11' };
  assert.deepEqual((await read(fixture(), input)).closedDates, []);
  const closed = fixture([busy('2026-11-01T00:00:00+07:00', '2026-12-01T00:00:00+07:00')]);
  const result = await read(closed, input);
  assert.equal(result.closedDates.length, 30);
  assert.equal(result.closedDates[0], '2026-11-01');
  assert.equal(result.closedDates.at(-1), '2026-11-30');
  assert.equal(closed.calls.length, 1);
});

test('month bounds clip current and final horizon months, including leap years and WIB midnight', async () => {
  assert.deepEqual(getBookingMonthBounds('2026-10', { now: current }), { month: '2026-10', minDate: '2026-10-21', maxDate: '2026-10-31' });
  assert.deepEqual(getBookingMonthBounds('2027-01', { now: current }), { month: '2027-01', minDate: '2027-01-01', maxDate: '2027-01-19' });
  assert.deepEqual(getBookingMonthBounds('2028-02', { now: '2028-01-31T17:00:00Z' }), { month: '2028-02', minDate: '2028-02-01', maxDate: '2028-02-29' });
  const item = fixture();
  await read(item, { ...selection, month: '2027-01' });
  assert.deepEqual(item.calls, [{ timeMin: '2027-01-01T00:00:00+07:00', timeMax: '2027-01-20T00:00:00+07:00' }]);
  const full = fixture();
  await read(full, { ...selection, month: '2026-12' });
  assert.equal(at(full.calls[0].timeMax) - at(full.calls[0].timeMin), 31 * 86400000);
});

test('uncertain claims close the service while accepted claims follow live Calendar deletion without month mutations', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE booking_requests(id TEXT PRIMARY KEY, status TEXT); CREATE TABLE booking_slot_claims(slot_start INTEGER PRIMARY KEY, request_id TEXT);');
  const insert = sqlite.prepare('INSERT INTO booking_requests(id,status) VALUES(?,?)');
  const claim = sqlite.prepare('INSERT INTO booking_slot_claims(slot_start,request_id) VALUES(?,?)');
  for (const [id, status, date] of [['a', 'accepted', '2026-10-29'], ['b', 'approving', '2026-10-30'], ['c', 'reconcile', '2026-10-31']]) {
    insert.run(id, status);
    for (const row of claimRows(`${date}T08:00:00+07:00`, `${date}T17:00:00+07:00`)) claim.run(row.slot_start, id);
  }
  const item = fixture([busy('2026-10-29T08:00:00+07:00', '2026-10-29T17:00:00+07:00')]);
  item.env.BOOKING_DB.prepare = sql => ({ bind: (...values) => ({ all: async () => ({ success: true, results: sqlite.prepare(sql).all(...values) }) }) });
  const initialChanges = sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  assert.deepEqual((await read(item)).closedDates, ['2026-10-29', '2026-10-30', '2026-10-31']);
  item.calendar.availability = async () => ({ busyIntervals: [] });
  assert.deepEqual((await read(item)).closedDates, ['2026-10-30', '2026-10-31']);
  assert.equal(sqlite.prepare('SELECT total_changes() AS changes').get().changes, initialChanges);
  assert.equal(sqlite.prepare("SELECT status FROM booking_requests WHERE id='a'").get().status, 'accepted');
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM booking_slot_claims WHERE request_id='a'").get().count, 18);
  sqlite.close();
});

test('malformed month or service input rejects before Calendar or ledger calls', async () => {
  const item = fixture();
  for (const input of [null, [], {}, { month: '2026-10' }, { ...selection, extra: true }, { ...selection, month: null }, ...['2026-1', '2026-13', '0000-10', '2026-10\n', '2026-09', '2027-02'].map(month => ({ ...selection, month })), { ...selection, designType: 'legacy' }, { ...selection, durationMinutes: 60 }, { ...selection, durationMinutes: '120' }]) {
    await assert.rejects(getBookingCalendarMonth(item.env, input, { now: current, calendar: item.calendar }), isCode('BOOKING_INPUT', 400));
  }
  assert.equal(item.calls.length, 0);
  assert.equal(item.reads.length, 0);
});

test('upstream failure or malformed occupancy never becomes an empty successful calendar', async () => {
  for (const occupancy of [null, {}, { busyIntervals: 'none' }, { busyIntervals: [{ start: NaN, end: 1 }] }, { busyIntervals: [{ start: current, end: current }] }, { busyIntervals: [{ start: current + 1, end: current }] }, { busyIntervals: [busy('2026-09-01T00:00:00+07:00', '2026-09-02T00:00:00+07:00')] }, { busyIntervals: Array(10001).fill({ start: current, end: current + 1 }) }]) {
    const item = fixture(); item.calendar.availability = async () => occupancy;
    await assert.rejects(read(item), isCode('CALENDAR_UNAVAILABLE', 503));
    assert.equal(item.reads.length, 0);
  }
  const item = fixture(); item.calendar.availability = async () => { throw new Error('Private upstream event email token'); };
  await assert.rejects(read(item), error => isCode('CALENDAR_UNAVAILABLE', 503)(error) && !error.message.includes('Private'));
});

test('overflow, corrupt or unavailable in-flight claim storage fails closed without mutations', async () => {
  const good = claimRows('2026-10-24T08:00:00+07:00', '2026-10-24T09:00:00+07:00');
  for (const rows of [null, Array(1501).fill(good[0]), [{ slot_start: NaN }], [{ slot_start: good[0].slot_start + 1 }], [good[0], good[0]], [good[1], good[0]], [{ slot_start: at('2026-11-01T00:00:00+07:00') }]]) {
    await assert.rejects(read(fixture([], rows)), isCode('BOOKING_STORAGE', 503));
  }
  const broken = fixture(); broken.env.BOOKING_DB.prepare = () => { throw new Error('Private ledger failure'); };
  await assert.rejects(read(broken), error => isCode('BOOKING_STORAGE', 503)(error) && !error.message.includes('Private'));
});

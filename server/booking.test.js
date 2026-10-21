import test from 'node:test';
import assert from 'node:assert/strict';
import { salon } from '../src/content.js';
import {
  getOperatingHours, getBookingDateBounds,
  listBookingSlots, normalizeWhatsApp, parseRupiah, calculateDeposit, calculatePayment, calculateLegacyPayment, validateBooking, normalizeBookingDesign, BOOKING_DESIGNS,
} from './booking.js';

const now = Date.parse('2026-10-19T17:30:00Z'); // 20 Oct, 00.30 WIB.
const options = { now };
const form = overrides => ({ name: 'Jesika Aydilla', whatsapp: '081234567890', agreedPrice: '155000', deposit: '20000', date: '2026-10-20', time: '08:00', ...overrides });

test('shared booking rules work without Object.hasOwn on older mobile browsers', () => {
  const original = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  Object.defineProperty(Object, 'hasOwn', { configurable: true, writable: true, value: undefined });
  try {
    for (const [designType, { durations }] of Object.entries(BOOKING_DESIGNS)) {
      for (const durationMinutes of durations) {
        assert.deepEqual(normalizeBookingDesign(designType, String(durationMinutes)), { designType, durationMinutes });
        const result = validateBooking(form({ designType, durationMinutes: String(durationMinutes) }), options);
        assert.equal(result.valid, true);
        assert.equal(result.preview.durationMinutes, durationMinutes);
        assert.ok(listBookingSlots('2026-10-20', { now, designType, durationMinutes }).length > 0);
      }
    }
    for (const designType of ['toString', 'constructor', '__proto__', 'invalid']) {
      assert.equal(normalizeBookingDesign(designType, '60'), null);
      const result = validateBooking(form({ designType, durationMinutes: '60' }), options);
      assert.equal(result.valid, false);
      assert.ok(result.errors.designType);
    }
  } finally {
    if (original) Object.defineProperty(Object, 'hasOwn', original);
    else delete Object.hasOwn;
  }
});

test('hours match the published content for every weekday and weekend', () => {
  for (const date of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']) {
    const hours = getOperatingHours(date);
    const published = salon.openingHours.find(group => group.days.includes(hours.day));
    assert.ok(published, hours.day);
    assert.equal(hours.opens, published.opens);
    assert.equal(hours.closes, published.closes);
    assert.equal(hours.lastStart, published.lastBooking);
    assert.equal(hours.durationMinutes, 120);
  }
});

test('weekday starts include 08.00 through 14.00, ending by 16.00 while the studio closes at 17.00', () => {
  const slots = listBookingSlots('2026-10-20', options);
  assert.deepEqual(slots.map(slot => slot.time), ['08:00', '10:00', '12:00', '14:00']);
  assert.equal(slots[0].time, '08:00');
  assert.equal(slots.at(-1).time, '14:00');
  assert.equal(slots.at(-1).endISO, '2026-10-20T16:00:00+07:00');
  assert.equal(getOperatingHours('2026-10-20').closes, '17:00');
  assert.equal(validateBooking(form({ time: '14:00' }), options).valid, true);
  for (const time of ['14:30', '15:00']) assert.ok(validateBooking(form({ time }), options).errors.time);
  assert.equal(slots[0].label, '08.00–10.00 WIB');
  assert.equal(slots[0].start, Date.parse('2026-10-20T01:00:00Z'));
  assert.equal(slots[0].end - slots[0].start, 120 * 60000);
});

test('both weekend days stop at 10.00 for a noon finish', () => {
  for (const date of ['2026-10-24', '2026-10-25']) {
    const slots = listBookingSlots(date, options);
    assert.deepEqual(slots.map(slot => slot.time), ['08:00', '10:00']);
    assert.equal(slots.at(-1).endISO, `${date}T12:00:00+07:00`);
    assert.ok(validateBooking(form({ date, time: '10:30' }), options).errors.time);
  }
});

test('now is explicit, fixed-offset and independent of a local calendar day', () => {
  assert.deepEqual(getBookingDateBounds({ now: '2026-10-19T23:30:00-07:00', horizonDays: 0 }), { minDate: '2026-10-20', maxDate: '2026-10-20' });
  assert.deepEqual(getBookingDateBounds({ now: new Date(now), horizonDays: 0 }), { minDate: '2026-10-20', maxDate: '2026-10-20' });
  for (const invalid of [undefined, '2026-10-20T00:00:00', '2026-02-30T00:00:00Z', NaN, Infinity, new Date(NaN)]) {
    assert.throws(() => getBookingDateBounds({ now: invalid }), TypeError);
  }
});

test('starts must be strictly in the future, including exact start equality', () => {
  const starts = listBookingSlots('2026-10-20', { now: '2026-10-20T08:00:00+07:00' });
  assert.equal(starts[0].time, '10:00');
  assert.ok(validateBooking(form(), { now: '2026-10-20T08:00:00+07:00' }).errors.time);
  assert.deepEqual(listBookingSlots('2026-10-20', { now: '2026-10-20T14:00:00+07:00' }), []);
  assert.ok(validateBooking(form({ time: '14:00' }), { now: '2026-10-20T14:00:00+07:00' }).errors.time);
});

test('calendar dates reject rollovers, malformed input and invalid leap days', () => {
  for (const date of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-20', '2026-10-20T00:00:00Z', '0000-01-01', '', null, {}, '2026-10-20<script>', '2026-10-20\n']) {
    assert.equal(getOperatingHours(date), null, String(date));
    assert.deepEqual(listBookingSlots(date, options), []);
    assert.ok(validateBooking(form({ date }), options).errors.date);
  }
  assert.equal(getOperatingHours('2028-02-29').day, 'Tuesday');
});

test('horizon uses inclusive WIB dates and rejects outside dates', () => {
  const bounds = getBookingDateBounds(options);
  assert.equal(bounds.minDate, '2026-10-20');
  assert.equal(bounds.maxDate, '2027-01-18');
  assert.ok(listBookingSlots(bounds.maxDate, options).length);
  for (const date of ['2026-10-19', '2027-01-19']) {
    assert.deepEqual(listBookingSlots(date, options), []);
    assert.ok(validateBooking(form({ date }), options).errors.date);
  }
  assert.equal(listBookingSlots('2026-10-21', { now, horizonDays: 0 }).length, 0);
});

test('new starts follow the selected duration while trusted historical validation can retain its old cadence', () => {
  assert.ok(validateBooking(form({ time: '08:15' }), options).errors.time);
  assert.equal(validateBooking(form({ time: '08:15' }), { now, stepMinutes: 15 }).valid, true);
  assert.deepEqual(listBookingSlots('2026-10-24', { now, stepMinutes: 60 }).map(slot => slot.time), ['08:00', '09:00', '10:00']);
  assert.ok(validateBooking(form({ time: '08:30' }), options).errors.time);
  assert.equal(validateBooking(form({ time: '08:30' }), { now, stepMinutes: 30 }).valid, true);
  for (const time of ['8:00', '08:60', '24:00', '07:30', '14:30', '15:00', '15:30', '08:00:00', '', null, {}, '<script>']) assert.ok(validateBooking(form({ time }), options).errors.time, String(time));
});

test('busy and hold intervals exclude any overlap, but touching boundaries are allowed', () => {
  const busyIntervals = [{ start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T12:00:00+07:00' }];
  const holdIntervals = [{ start: Date.parse('2026-10-20T12:00:00+07:00'), end: Date.parse('2026-10-20T14:00:00+07:00') }];
  assert.deepEqual(listBookingSlots('2026-10-20', { now, busyIntervals, holdIntervals }).map(slot => slot.time), ['08:00', '14:00']);
  assert.equal(validateBooking(form({ time: '08:00' }), { now, busyIntervals }).valid, true);
  assert.ok(validateBooking(form({ time: '08:30' }), { now, busyIntervals }).errors.time);
  assert.equal(validateBooking(form({ time: '12:00' }), { now, busyIntervals }).valid, true);
});

test('overlap uses exact milliseconds, not just visible start labels', () => {
  const start = Date.parse('2026-10-20T10:00:00+07:00');
  const busyIntervals = [{ start: start - 1, end: start + 1 }];
  const times = listBookingSlots('2026-10-20', { now, busyIntervals }).map(slot => slot.time);
  assert.equal(times.includes('08:00'), false);
  assert.equal(times.includes('10:00'), false);
  assert.equal(times.includes('12:00'), true);
});

test('malformed supplied availability fails closed instead of silently allowing slots', () => {
  for (const busyIntervals of [null, {}, [{ start: 'not a date', end: now }], [{ start: now, end: now }], [{ start: now + 1, end: now }], [{ start: '2026-02-30T08:00:00+07:00', end: '2026-03-01T09:00:00+07:00' }]]) {
    if (busyIntervals === null) continue; // null explicitly means no supplied intervals.
    assert.throws(() => listBookingSlots('2026-10-20', { now, busyIntervals }), TypeError);
  }
  assert.throws(() => listBookingSlots('2026-10-20', { now, holdIntervals: [{}] }), TypeError);
});

test('WhatsApp normalizes common Indonesian formats and rejects injected/foreign values', () => {
  for (const value of ['081234567890', '6281234567890', '+6281234567890', ' +62 (812) 3456-7890 ']) assert.equal(normalizeWhatsApp(value), '6281234567890');
  for (const value of ['+12025550123', '81234567890', '+62081234567890', '628123', '62812345678901234', '08abc123456789', '08\n1234567890', '++6281234567890', '6e281234567890', {}, 6281234567890, null]) assert.equal(normalizeWhatsApp(value), null, String(value));
});

test('Indonesian mobile prefixes and exact national length boundaries normalize without accepting service numbers', () => {
  for (const prefix of ['81', '82', '83', '85', '86', '87', '88', '89']) {
    for (const length of [9, 10, 11, 12]) {
      const national = prefix + '1234567890'.slice(0, length - 2);
      for (const value of [`0${national}`, `62${national}`, `+62${national}`]) assert.equal(normalizeWhatsApp(value), `62${national}`, value);
    }
  }
  for (const value of ['081234567', '6281234567', '+6281234567', '08123456789012', '628123456789012', '+628123456789012',
    '080412345678', '08001234567', '084123456789', '6280412345678', '628412345678', '+081234567890', '+08 1234 567890',
    '02112345678', '622112345678', '+626281234567890', '08abc123456789', '08123456789x', '08123.456789',
    '081234567890\n', '081234567890\u0000', '０８１２３４５６７８９０', '٠٨١٢٣٤٥٦٧٨٩٠']) assert.equal(normalizeWhatsApp(value), null, value);
});

test('invalid mobile syntax produces only a WhatsApp field error while valid formatted input is canonical', () => {
  for (const whatsapp of ['081234567', '08123456789012', '080412345678', '084123456789', '+081234567890', '08123456789x']) {
    const result = validateBooking(form({ whatsapp }), { now });
    assert.equal(result.valid, false);
    assert.deepEqual(Object.keys(result.errors), ['whatsapp']);
    assert.equal(result.value, null);
  }
  assert.equal(validateBooking(form({ whatsapp: '+62 (812) 3456-7890' }), { now }).value.whatsapp, '6281234567890');
});

test('rupiah accepts digit strings only and never coerces malformed values', () => {
  assert.equal(parseRupiah('155000'), 155000);
  assert.equal(parseRupiah('0'), 0);
  for (const value of ['1e5', '1E5', '-50000', '+50000', '50000.0', '50.000', '50,000', ' 50000 ', '50000\n', '', 'Infinity', '0xFFFF', '50000<script>', null, {}, [], 50000]) assert.equal(parseRupiah(value), null, String(value));
  assert.equal(parseRupiah('10000001'), null);
  assert.equal(parseRupiah('10000001', 20000000), 10000001);
});

test('historical v2 DP calculation remains immutable for old snapshots', () => {
  for (const [total, deposit] of [['155000', 20000], ['200000', 20000], ['155001', 20000], ['200001', 20001], ['20001', 20000], ['20000', 20000], ['19999', 19999], ['11', 11], ['10', 10], ['1', 1], ['000001', 1], ['10000000', 1000000]]) {
    assert.equal(calculateDeposit(total), deposit, total);
  }
  for (const total of ['0', '000', '10000001', '1e5', '-50000', '+50000', '50000.0', '50.000', '50,000', ' 50000 ', '50000\n', '', 'Infinity', '0xFFFF', '50000<script>', null, {}, [], 50000]) {
    assert.equal(calculateDeposit(total), null, String(total));
  }
  assert.equal(calculateDeposit('10000001', 20000000), 1000001);
  assert.equal(calculateDeposit('9007199254740991', Number.MAX_SAFE_INTEGER), 900719925474100);
  assert.equal(calculateDeposit('9007199254740992', Number.MAX_SAFE_INTEGER), null);
  for (const maxAmount of [0, -1, '10000000', Infinity]) assert.throws(() => calculateDeposit('100000', maxAmount), RangeError);
});

test('validation returns normalized declared values and an explicitly unverified preview', () => {
  const result = validateBooking(form({ name: '  Jesika Aydilla  ' }), options);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, { name: 'Jesika Aydilla', whatsapp: '6281234567890', agreedPrice: 155000, deposit: 20000, paymentMode: 'deposit', paymentPolicy: 'manual-min20k-v3', designType: 'simple', durationMinutes: 120, date: '2026-10-20', time: '08:00', quoteStatus: 'customer-declared' });
  assert.equal(result.preview.remainingBalance, 135000);
  assert.equal(result.preview.startISO, '2026-10-20T08:00:00+07:00');
  assert.equal(result.preview.endISO, '2026-10-20T10:00:00+07:00');
  assert.equal(result.preview.timeZone, 'Asia/Jakarta');
  assert.equal(result.preview.quoteVerified, false);
  assert.equal(result.preview.paymentVerified, false);
  assert.equal(result.preview.availabilityVerified, false);
});

test('entered DP stays fixed as the total changes; only remaining balance recalculates', () => {
  for (const [agreedPrice, deposit, remainingBalance] of [['155000', 20000, 135000], ['200000', 20000, 180000], ['155001', 20000, 135001], ['200001', 20001, 180000], ['1', 1, 0]]) {
    const result = validateBooking(form({ agreedPrice, deposit: String(deposit) }), options);
    assert.equal(result.valid, true);
    assert.equal(result.value.deposit, deposit);
    assert.equal(result.preview.remainingBalance, remainingBalance);
  }
  assert.ok(validateBooking(form({ agreedPrice: '0' }), options).errors.agreedPrice);
  assert.ok(validateBooking(form({ agreedPrice: '10000001' }), options).errors.agreedPrice);
  const extended = validateBooking(form({ agreedPrice: '10000001' }), { now, maxAmount: 20000000 });
  assert.equal(extended.valid, true);
  assert.equal(extended.value.deposit, 20000);
});

test('explicit historical validation ignores legacy input and retains the original percentage snapshot', () => {
  const historical = { ...options, paymentPolicy: 'min20k-v2' };
  const expected = validateBooking(form(), historical);
  for (const deposit of [undefined, null, '0', '-1', '50000', '155000', '155001', '1e5', '<script>', {}, [], 0, 1]) {
    assert.deepEqual(validateBooking(form({ deposit }), historical), expected);
  }
  const unread = Object.defineProperty(form(), 'deposit', { get() { throw new Error('must not read customer deposit'); } });
  assert.deepEqual(validateBooking(unread, historical), expected);
  const invalidPrice = validateBooking(form({ agreedPrice: 'invalid', deposit: '50000' }), options);
  assert.ok(invalidPrice.errors.agreedPrice);
  assert.equal('deposit' in invalidPrice.errors, false);
});

test('payment choice uses entered DP or full total, normalizes small totals and rejects invalid modes', () => {
  assert.deepEqual(calculatePayment('155000', 'deposit', '20000'), { paymentMode: 'deposit', deposit: 20000, remainingBalance: 135000, paymentPolicy: 'manual-min20k-v3' });
  assert.deepEqual(calculatePayment('155001', 'full'), { paymentMode: 'full', deposit: 155001, remainingBalance: 0, paymentPolicy: 'manual-min20k-v3' });
  assert.deepEqual(calculateLegacyPayment('1000000'), { paymentMode: 'deposit', deposit: 100000, remainingBalance: 900000, paymentPolicy: 'min20k-v2' });
  for (const mode of ['deposit', 'full']) {
    for (const total of ['1', '19999', '20000']) {
      const result = calculatePayment(total, mode);
      assert.equal(result.paymentMode, 'full');
      assert.equal(result.deposit, Number(total));
      assert.equal(result.remainingBalance, 0);
      const validated = validateBooking(form({ agreedPrice: total, paymentMode: mode }), { now });
      assert.equal(validated.valid, true);
      assert.equal(validated.value.paymentMode, 'full');
    }
  }
  for (const mode of ['', 'legacy', 'cash', 'FULL', null, {}, [], 1]) {
    assert.equal(calculatePayment('155000', mode), null);
    assert.ok(validateBooking(form({ paymentMode: mode }), { now }).errors.paymentMode);
  }
  assert.equal(calculatePayment('invalid', 'full'), null);
  const full = validateBooking(form({ paymentMode: 'full', deposit: '1', paymentAmount: '1' }), { now });
  assert.equal(full.value.deposit, 155000);
  assert.equal(full.preview.remainingBalance, 0);
});

test('new customer DP accepts arbitrary whole Rupiah from Rp20000 through total without a percentage floor', () => {
  for (const deposit of ['20000', '23789', '1000000']) {
    const result = validateBooking(form({ agreedPrice: '1000000', deposit }), options);
    assert.equal(result.valid, true);
    assert.equal(result.value.deposit, Number(deposit));
    assert.equal(result.value.paymentPolicy, 'manual-min20k-v3');
    assert.equal(result.preview.remainingBalance, 1000000 - Number(deposit));
  }
  for (const deposit of [undefined, null, '', '0', '19999', '1000001', '20.000', '2e4', '20000.0', '-20000', ' 20000 ', [], {}, 20000]) {
    const result = validateBooking(form({ agreedPrice: '1000000', deposit, paymentPolicy: 'min20k-v2' }), options);
    assert.equal(result.valid, false, String(deposit));
    assert.ok(result.errors.deposit, String(deposit));
  }
});

test('design selection permits only agreed exact durations and defaults cached clients to simple two hours', () => {
  assert.deepEqual(normalizeBookingDesign(), { designType: 'simple', durationMinutes: 120 });
  for (const [designType, allowed] of Object.entries(BOOKING_DESIGNS)) {
    for (const durationMinutes of allowed.durations) {
      assert.deepEqual(normalizeBookingDesign(designType, String(durationMinutes)), { designType, durationMinutes });
      assert.deepEqual(normalizeBookingDesign(designType, durationMinutes), { designType, durationMinutes });
      const result = validateBooking(form({ designType, durationMinutes: String(durationMinutes), time: '08:00' }), { now });
      assert.equal(result.valid, true);
      assert.equal(result.preview.end - result.preview.start, durationMinutes * 60000);
    }
  }
  for (const [designType, durationMinutes] of [['legacy', '120'], ['plain', '120'], ['simple', '180'], ['full-art', '120'], ['full-art', '3'], ['full-art', '180.0'], ['full-art', true], ['constructor', '120']]) {
    assert.equal(normalizeBookingDesign(designType, durationMinutes), null);
    assert.equal(validateBooking(form({ designType, durationMinutes }), { now }).valid, false);
  }
});

test('all service durations advance from opening without crossing cutoffs or closing', () => {
  const cases = [
    ['plain', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'], ['08:00', '09:00', '10:00']],
    ['simple', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'], ['08:00', '09:00', '10:00']],
    ['simple', 120, ['08:00', '10:00', '12:00', '14:00'], ['08:00', '10:00']],
    ['full-art', 180, ['08:00', '11:00'], ['08:00']],
    ['full-art', 240, ['08:00', '12:00'], ['08:00']],
    ['full-art', 300, ['08:00'], []],
  ];
  for (const [designType, durationMinutes, weekdayStarts, weekendStarts] of cases) {
    const weekday = listBookingSlots('2026-10-21', { now, designType, durationMinutes });
    assert.deepEqual(weekday.map(slot => slot.time), weekdayStarts);
    assert.ok(weekday.every(slot => slot.end <= Date.parse('2026-10-21T17:00:00+07:00')));
    for (const date of ['2026-10-24', '2026-10-25']) assert.deepEqual(listBookingSlots(date, { now, designType, durationMinutes }).map(slot => slot.time), weekendStarts);
    for (const time of weekdayStarts) assert.equal(validateBooking(form({ date: '2026-10-21', designType, durationMinutes: String(durationMinutes), time }), { now }).valid, true);
  }
  assert.equal(validateBooking(form({ date: '2026-10-21', designType: 'full-art', durationMinutes: '240', time: '11:00' }), { now }).valid, false);
  assert.equal(validateBooking(form({ date: '2026-10-21', designType: 'full-art', durationMinutes: '300', time: '12:00' }), { now }).valid, false);
  assert.equal(validateBooking(form({ date: '2026-10-24', designType: 'full-art', durationMinutes: '180', time: '09:30' }), { now }).valid, false);
  assert.equal(validateBooking(form({ designType: 'full-art', durationMinutes: '180', time: '12:30' }), { now }).valid, false);
});

test('elapsed starts are displayable but never validate as a new booking', () => {
  const afterOpening = Date.parse('2026-10-20T09:15:00+07:00');
  const shown = listBookingSlots('2026-10-20', { now: afterOpening, includeElapsed: true, designType: 'plain', durationMinutes: 60 });
  assert.equal(shown[0].time, '08:00');
  assert.equal(listBookingSlots('2026-10-20', { now: afterOpening, designType: 'plain', durationMinutes: 60 })[0].time, '10:00');
  assert.equal(validateBooking(form({ designType: 'plain', durationMinutes: '60', time: '08:00' }), { now: afterOpening, includeElapsed: true }).valid, false);
});

test('malformed forms report field errors without returning partial trusted output', () => {
  for (const value of [null, [], 'bad', {}]) {
    const result = validateBooking(value, options);
    assert.equal(result.valid, false);
    assert.deepEqual(Object.keys(result.errors), ['name', 'whatsapp', 'agreedPrice', 'date', 'time']);
    assert.equal(result.value, null);
    assert.equal(result.preview, null);
  }
  for (const name of ['A', '<script>alert(1)</script>', 'A\nB', 'A'.repeat(81), {}, null]) assert.ok(validateBooking(form({ name }), options).errors.name);
  assert.equal(validateBooking(form({ name: 'Éka Putri', agreedPrice: { valueOf() { throw new Error('must not coerce'); } } }), options).valid, false);
});

test('bad configuration is rejected separately from customer input', () => {
  for (const stepMinutes of [0, -1, 0.5, 301, '30']) assert.throws(() => listBookingSlots('2026-10-20', { now, stepMinutes }), RangeError);
  for (const horizonDays of [-1, 0.5, '90']) assert.throws(() => getBookingDateBounds({ now, horizonDays }), RangeError);
  for (const maxAmount of [0, -1, '10000000', Infinity]) assert.throws(() => validateBooking(form(), { now, maxAmount }), RangeError);
});

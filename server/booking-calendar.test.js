import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthDays, moveCalendarDate } from '../src/scripts/booking-calendar.js';
import { getBookingDateBounds } from './booking.js';

const bounds = { minDate: '2026-10-20', maxDate: '2027-01-18' };

test('inline calendar has six Monday-first rows and disables dates outside inclusive bounds', () => {
  const october = calendarMonthDays('2026-10', bounds);
  assert.equal(october.length, 42);
  assert.deepEqual(october.slice(0, 3), [null, null, null]);
  assert.equal(october[3].date, '2026-10-01');
  assert.equal(october.find(day => day?.date === '2026-10-19').disabled, true);
  assert.equal(october.find(day => day?.date === '2026-10-20').disabled, false);
  const january = calendarMonthDays('2027-01', bounds);
  assert.equal(january.find(day => day?.date === '2027-01-18').disabled, false);
  assert.equal(january.find(day => day?.date === '2027-01-19').disabled, true);
  assert.deepEqual(calendarMonthDays('2026-13', bounds), []);
});

test('calendar date bounds and highlights are based on WIB even before UTC midnight', () => {
  const before = getBookingDateBounds({ now: '2026-10-20T16:59:59Z' });
  const after = getBookingDateBounds({ now: '2026-10-20T17:00:00Z' });
  assert.equal(before.minDate, '2026-10-20');
  assert.equal(after.minDate, '2026-10-21');
  assert.equal(calendarMonthDays('2026-10', after).find(day => day?.date === '2026-10-20').disabled, true);
});

test('calendar keyboard moves by day, week and Monday-first row without selecting a date', () => {
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowLeft', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowRight', bounds), '2026-10-22');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowUp', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowDown', bounds), '2026-10-28');
  assert.equal(moveCalendarDate('2026-11-04', 'Home', bounds), '2026-11-02');
  assert.equal(moveCalendarDate('2026-11-04', 'End', bounds), '2026-11-08');
  assert.equal(moveCalendarDate('2027-01-18', 'ArrowRight', bounds), '2027-01-18');
  assert.equal(moveCalendarDate('2026-10-19', 'ArrowLeft', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'Tab', bounds), null);
  assert.equal(moveCalendarDate('2026-02-30', 'ArrowRight', bounds), null);
});

test('month movement retains the day where possible and handles leap years and bounds', () => {
  const longBounds = { minDate: '2024-01-01', maxDate: '2028-12-31' };
  assert.equal(moveCalendarDate('2026-10-31', 'PageDown', bounds), '2026-11-30');
  assert.equal(moveCalendarDate('2026-12-31', 'PageDown', bounds), '2027-01-18');
  assert.equal(moveCalendarDate('2024-01-31', 'PageDown', longBounds), '2024-02-29');
  assert.equal(moveCalendarDate('2024-02-29', 'PageDown', longBounds, true), '2025-02-28');
  assert.equal(moveCalendarDate('2026-11-30', 'PageUp', bounds), '2026-10-30');
});

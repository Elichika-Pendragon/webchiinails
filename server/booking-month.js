/**
 * SERVER ONLY. Public month shading reads one Google freeBusy range and returns
 * selected-service day availability only. It reads in-flight claim occupancy,
 * never mutates the ledger or synchronizes Calendar deletions, and exposes no
 * event details. Accepted bookings are represented by their live Google events
 * here, so deleting one can reopen the advisory month view. This view cannot
 * release claims: the exact-date, Book and accept checks remain authoritative.
 */
import { getBookingDateBounds, listBookingSlots, normalizeBookingDesign } from './booking.js';
import { BookingRequestError } from './booking-requests.js';
import { createGoogleCalendarProvider } from './google-calendar.js';

const DAY = 86400000;
const CELL = 1800000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inputError = () => new BookingRequestError('BOOKING_INPUT', 400);
const calendarError = () => new BookingRequestError('CALENDAR_UNAVAILABLE');
const isoDay = stamp => new Date(stamp).toISOString().slice(0, 10);

function currentTime(now) {
  let value;
  try { value = typeof now === 'function' ? now() : now ?? Date.now(); }
  catch { throw new BookingRequestError('BOOKING_CONFIG'); }
  const current = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isSafeInteger(current) || current <= 0 || current > 253402214400000) throw new BookingRequestError('BOOKING_CONFIG');
  return current;
}

/** Validate the month and clip it to the inclusive public WIB booking horizon. */
export function getBookingMonthBounds(month, { now } = {}) {
  if (typeof month !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) throw inputError();
  const first = Date.parse(`${month}-01T00:00:00Z`);
  if (!Number.isSafeInteger(first) || isoDay(first).slice(0, 7) !== month) throw inputError();
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = isoDay(next.getTime() - DAY);
  const horizon = getBookingDateBounds({ now: currentTime(now) });
  const minDate = `${month}-01` < horizon.minDate ? horizon.minDate : `${month}-01`;
  const maxDate = last > horizon.maxDate ? horizon.maxDate : last;
  if (minDate > maxDate) throw inputError();
  return { month, minDate, maxDate };
}

/** One occupancy range plus one bounded read of uncertain in-flight claims. */
export async function getBookingCalendarMonth(env, input, { now, calendar } = {}) {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'designType,durationMinutes,month'
    || typeof input.designType !== 'string' || typeof input.durationMinutes !== 'string') throw inputError();
  const design = normalizeBookingDesign(input.designType, input.durationMinutes);
  if (!design) throw inputError();
  const current = currentTime(now);
  const bounds = getBookingMonthBounds(input.month, { now: current });
  const start = Date.parse(`${bounds.minDate}T00:00:00+07:00`);
  const end = Date.parse(`${bounds.maxDate}T00:00:00+07:00`) + DAY;
  const timeMin = `${bounds.minDate}T00:00:00+07:00`;
  const timeMax = `${isoDay(Date.parse(`${bounds.maxDate}T00:00:00Z`) + DAY)}T00:00:00+07:00`;
  let occupancy;
  try {
    const provider = calendar ?? createGoogleCalendarProvider(env, { now: () => currentTime(now) });
    occupancy = await provider.availability({ timeMin, timeMax });
  } catch { throw calendarError(); }
  if (!object(occupancy) || !Array.isArray(occupancy.busyIntervals) || occupancy.busyIntervals.length > 10000
    || occupancy.busyIntervals.some(interval => !object(interval) || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end)
      || interval.end <= interval.start || interval.end <= start || interval.start >= end)) throw calendarError();
  let held;
  try {
    // Accepted claims deliberately stay out of this advisory summary. Their
    // live Calendar events supply occupancy; exact-date checks reconcile any
    // deleted accepted event before treating that booking's claims as free.
    const rows = await env.BOOKING_DB.prepare(`SELECT c.slot_start FROM booking_slot_claims c JOIN booking_requests r ON r.id = c.request_id
      WHERE r.status IN ('approving', 'reconcile') AND c.slot_start < ? AND c.slot_start + ? > ? ORDER BY c.slot_start LIMIT 1501`).bind(end, CELL, start).all();
    if (!rows || rows.success === false || !Array.isArray(rows.results) || rows.results.length > 1500
      || rows.results.some((row, index) => !object(row) || !Number.isSafeInteger(row.slot_start) || row.slot_start % CELL !== 0
        || row.slot_start >= end || row.slot_start + CELL <= start || (index > 0 && row.slot_start <= rows.results[index - 1].slot_start))) throw new Error();
    held = rows.results.map(row => ({ start: row.slot_start, end: row.slot_start + CELL }));
  } catch { throw new BookingRequestError('BOOKING_STORAGE'); }
  const merged = [];
  const intervals = [...occupancy.busyIntervals, ...held].map(interval => ({ start: Math.max(start, interval.start), end: Math.min(end, interval.end) })).sort((a, b) => a.start - b.start);
  for (const interval of intervals) {
    const prior = merged.at(-1);
    if (prior && interval.start <= prior.end) prior.end = Math.max(prior.end, interval.end);
    else merged.push(interval);
  }
  const closedDates = [];
  const latest = currentTime(now);
  for (let stamp = Date.parse(`${bounds.minDate}T00:00:00Z`); stamp <= Date.parse(`${bounds.maxDate}T00:00:00Z`); stamp += DAY) {
    const date = isoDay(stamp);
    if (!listBookingSlots(date, { now: latest, ...design, busyIntervals: merged }).length) closedDates.push(date);
  }
  return { month: bounds.month, ...design, timeZone: 'Asia/Jakarta', minDate: bounds.minDate, maxDate: bounds.maxDate, closedDates };
}

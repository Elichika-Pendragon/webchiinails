/** SERVER ONLY. Private advisory occupancy; never use for Book or acceptance. */
import { getBookingDateBounds } from './booking.js';
import { createGoogleCalendarProvider, GoogleCalendarError } from './google-calendar.js';

// Five maximally hot month keys cost at most 57,600 refresh writes/day at 15s
// (one lease + one publication), leaving headroom below D1 Free's 100k writes.
export const OCCUPANCY_TTL_MS = 15000;
export const OCCUPANCY_LEASE_MS = 60000;
export const OCCUPANCY_FAILURE_COOLDOWN_MS = 15000;
export const OCCUPANCY_REFRESH_TIMEOUT_MS = 45000;
const WAIT_MS = 1500;
const POLL_MS = 125;
const DAY = 86400000;
const OFFSET = 25200000;
const MAX_INTERVALS = 10000;
const MAX_PAYLOAD = 600000;
const encoder = new TextEncoder();
const pendingByDatabase = new WeakMap();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failed = () => new GoogleCalendarError('CALENDAR_UNAVAILABLE');
const inputError = () => new GoogleCalendarError('CALENDAR_INPUT');
const date = value => new Date(value).toISOString().slice(0, 10);
const wibDate = value => date(value + OFFSET);
const midnight = value => Date.parse(`${value}T00:00:00+07:00`);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function clock(now) {
  let value;
  try { value = typeof now === 'function' ? now() : now ?? Date.now(); } catch { throw failed(); }
  const current = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isSafeInteger(current) || current <= 0 || current > 253402214400000) throw failed();
  return current;
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40) throw inputError();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const result = Date.parse(value);
  if (!match || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 || !Number.isSafeInteger(result)
    || date(Date.parse(`${match[1]}T00:00:00Z`)) !== match[1]) throw inputError();
  return result;
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return typeof bytes.toHex === 'function' ? bytes.toHex() : Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function configuration(env) {
  if (typeof window !== 'undefined' || typeof env?.BOOKING_DB?.prepare !== 'function'
    || typeof env.GOOGLE_CALENDAR_ID !== 'string' || !env.GOOGLE_CALENDAR_ID || env.GOOGLE_CALENDAR_ID === 'primary'
    || env.GOOGLE_CALENDAR_ID.length > 1024 || /[\u0000-\u0020\u007f]/.test(env.GOOGLE_CALENDAR_ID)) throw failed();
  return env.BOOKING_DB;
}

// Selected days and all service durations use this same clipped monthly range.
function rangeFor(bounds, now) {
  if (!object(bounds) || Object.keys(bounds).sort().join(',') !== 'timeMax,timeMin') throw inputError();
  const start = timestamp(bounds.timeMin), end = timestamp(bounds.timeMax);
  if (end <= start || end - start > 31 * DAY) throw inputError();
  const month = wibDate(start).slice(0, 7);
  if (wibDate(end - 1).slice(0, 7) !== month) throw inputError();
  const horizon = getBookingDateBounds({ now });
  const first = `${month}-01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = date(next.getTime() - DAY);
  const minDate = first < horizon.minDate ? horizon.minDate : first;
  const maxDate = last > horizon.maxDate ? horizon.maxDate : last;
  if (minDate > maxDate) throw inputError();
  const from = midnight(minDate), to = midnight(maxDate) + DAY;
  if (start < from || end > to) throw inputError();
  const [year, number] = month.split('-').map(Number);
  return { month, slot: (year * 12 + number - 1) % 5, start: from, end: to,
    timeMin: `${minDate}T00:00:00+07:00`, timeMax: `${date(Date.parse(`${maxDate}T00:00:00Z`) + DAY)}T00:00:00+07:00`,
    requestedStart: start, requestedEnd: end };
}

function intervals(value, start, end) {
  if (!Array.isArray(value) || value.length > MAX_INTERVALS) throw failed();
  const sorted = value.map(interval => {
    if (!object(interval) || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end)
      || interval.end <= interval.start || interval.end <= start || interval.start >= end) throw failed();
    return { start: Math.max(start, interval.start), end: Math.min(end, interval.end) };
  }).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

function savedIntervals(row, range, key, current) {
  if (!row || row.cache_key !== key || row.month !== range.month || row.range_start !== range.start || row.range_end !== range.end
    || !Number.isSafeInteger(row.expires_at) || row.expires_at <= current) return null;
  if (row.expires_at > current + OCCUPANCY_TTL_MS || typeof row.payload !== 'string' || row.payload.length > MAX_PAYLOAD) throw failed();
  let data;
  try { data = JSON.parse(row.payload); } catch { throw failed(); }
  if (!Array.isArray(data) || data.length > MAX_INTERVALS) throw failed();
  const result = [];
  for (const pair of data) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Number.isSafeInteger(pair[0]) || !Number.isSafeInteger(pair[1])
      || pair[1] <= pair[0] || pair[0] < range.start || pair[1] > range.end
      || (result.length && pair[0] <= result.at(-1).end)) throw failed();
    result.push({ start: pair[0], end: pair[1] });
  }
  return result;
}

const rowFor = (db, slot) => db.prepare('SELECT * FROM booking_occupancy_cache WHERE slot = ?').bind(slot).first();

async function sharedSnapshot(db, calendarHash, key, range, provider, options) {
  const readClock = () => clock(options.now);
  const wait = options.sleep ?? sleep;
  const started = readClock();
  let row;
  try { row = await rowFor(db, range.slot); } catch { throw failed(); }
  const hit = savedIntervals(row, range, key, readClock());
  if (hit) return hit;
  if (row?.lease_until > readClock() && row.lease_owner === null) throw failed();
  const owner = crypto.randomUUID();
  let acquired;
  try {
    const current = readClock();
    acquired = await db.prepare(`INSERT INTO booking_occupancy_cache
      (slot, cache_key, calendar_hash, month, range_start, range_end, payload, expires_at, lease_owner, lease_until, generation)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 0)
      ON CONFLICT(slot) DO UPDATE SET cache_key = excluded.cache_key, calendar_hash = excluded.calendar_hash,
        month = excluded.month, range_start = excluded.range_start, range_end = excluded.range_end,
        lease_owner = excluded.lease_owner, lease_until = excluded.lease_until, generation = booking_occupancy_cache.generation + 1
      WHERE booking_occupancy_cache.lease_until <= ? AND
        (booking_occupancy_cache.expires_at <= ? OR booking_occupancy_cache.cache_key <> excluded.cache_key
         OR booking_occupancy_cache.range_start <> excluded.range_start OR booking_occupancy_cache.range_end <> excluded.range_end)
      RETURNING generation`).bind(range.slot, key, calendarHash, range.month, range.start, range.end, owner,
        current + OCCUPANCY_LEASE_MS, current, current).first();
  } catch { throw failed(); }
  if (!acquired) {
    // Other isolates wait for the global lease; they never issue duplicate Google
    // requests or serve an expired/free fallback. At most twelve bounded polls.
    for (let elapsed = 0; elapsed < WAIT_MS; elapsed += POLL_MS) {
      await wait(POLL_MS);
      try { row = await rowFor(db, range.slot); } catch { throw failed(); }
      const available = savedIntervals(row, range, key, readClock());
      if (available) return available;
      if (!row || row.lease_owner === null || row.lease_until <= readClock()) throw failed();
    }
    throw failed();
  }
  if (!Number.isSafeInteger(acquired.generation) || acquired.generation < 0) throw failed();
  try {
    // Real Calendar operations already have network deadlines. This outer bound
    // also releases local coalescing if an adapter or a future runtime stalls.
    const timeoutMs = options.refreshTimeoutMs ?? OCCUPANCY_REFRESH_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > OCCUPANCY_REFRESH_TIMEOUT_MS) throw failed();
    let timer, occupancy;
    try {
      occupancy = await Promise.race([
        provider.availability({ timeMin: range.timeMin, timeMax: range.timeMax }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failed()), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
    if (!object(occupancy)) throw failed();
    const result = intervals(occupancy.busyIntervals, range.start, range.end);
    const payload = JSON.stringify(result.map(interval => [interval.start, interval.end]));
    if (payload.length > MAX_PAYLOAD) throw failed();
    const current = readClock();
    if (current < started || current - started >= OCCUPANCY_LEASE_MS) throw failed();
    const published = await db.prepare(`UPDATE booking_occupancy_cache SET payload = ?, expires_at = ?, lease_owner = NULL, lease_until = 0
      WHERE slot = ? AND cache_key = ? AND lease_owner = ? AND generation = ? AND lease_until > ?`)
      .bind(payload, current + OCCUPANCY_TTL_MS, range.slot, key, owner, acquired.generation, current).run();
    if (!published || published.success === false || published.meta?.changes !== 1) throw failed();
    if (readClock() >= current + OCCUPANCY_TTL_MS) throw failed();
    return result;
  } catch {
    // Failure cooldown prevents a failing provider from receiving a new attempt
    // for every customer poll. Invalidation/another lease wins over this update.
    try {
      const current = readClock();
      await db.prepare(`UPDATE booking_occupancy_cache SET lease_owner = NULL, lease_until = ?
        WHERE slot = ? AND cache_key = ? AND lease_owner = ? AND generation = ?`)
        .bind(current + OCCUPANCY_FAILURE_COOLDOWN_MS, range.slot, key, owner, acquired.generation).run();
    } catch { /* Original failure remains closed; lease recovery is bounded. */ }
    throw failed();
  }
}

/** Explicit advisory-only wrapper. All other Calendar methods remain fresh. */
export function createPublicBookingCalendar(env, options = {}) {
  const db = configuration(env);
  const provider = options.calendar ?? createGoogleCalendarProvider(env, { now: () => clock(options.now) });
  if (typeof provider?.availability !== 'function') throw failed();
  let scope;
  const availability = async bounds => {
    const range = rangeFor(bounds, clock(options.now));
    scope ??= digest(`chiinails:occupancy:v1:Asia/Jakarta:${env.GOOGLE_CALENDAR_ID}`);
    const calendarHash = await scope;
    const key = await digest(`${calendarHash}:${range.month}`);
    let pending = pendingByDatabase.get(db);
    if (!pending) { pending = new Map(); pendingByDatabase.set(db, pending); }
    // The monthly range changes at WIB midnight/horizon advancement. Do not
    // coalesce distinct ranges even though they occupy the same physical slot.
    const operationKey = `${key}:${range.start}:${range.end}`;
    let operation = options.coalesce === false ? null : pending.get(operationKey);
    if (!operation) {
      operation = sharedSnapshot(db, calendarHash, key, range, provider, options);
      if (options.coalesce !== false) {
        pending.set(operationKey, operation);
        operation.finally(() => { if (pending.get(operationKey) === operation) pending.delete(operationKey); }).catch(() => {});
      }
    }
    const all = await operation;
    const clipped = all.filter(interval => interval.start < range.requestedEnd && interval.end > range.requestedStart)
      .map(interval => ({ start: Math.max(interval.start, range.requestedStart), end: Math.min(interval.end, range.requestedEnd) }));
    return { timeMin: bounds.timeMin, timeMax: bounds.timeMax, timeZone: 'Asia/Jakarta', busyIntervals: clipped };
  };
  return Object.freeze({ ...provider, availability });
}

/** Invalidate app-known mutations; the status trigger handles ledger changes. */
export async function invalidateBookingOccupancy(env, dateOrRange, options = {}) {
  const db = configuration(env);
  let first, last;
  if (typeof dateOrRange === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrRange)
    && date(Date.parse(`${dateOrRange}T00:00:00Z`)) === dateOrRange) first = last = dateOrRange.slice(0, 7);
  else if (object(dateOrRange)) {
    const start = timestamp(dateOrRange.timeMin), end = timestamp(dateOrRange.timeMax);
    if (end <= start || end - start > 91 * DAY) throw inputError();
    first = wibDate(start).slice(0, 7); last = wibDate(end - 1).slice(0, 7);
  } else throw inputError();
  const calendarHash = await digest(`chiinails:occupancy:v1:Asia/Jakarta:${env.GOOGLE_CALENDAR_ID}`);
  try {
    const result = await db.prepare(`UPDATE booking_occupancy_cache SET expires_at = 0,
      generation = generation + 1, lease_owner = NULL, lease_until = 0
      WHERE calendar_hash = ? AND month >= ? AND month <= ?`).bind(calendarHash, first, last).run();
    if (!result || result.success === false) throw failed();
    return result.meta?.changes ?? 0;
  } catch { throw failed(); }
}

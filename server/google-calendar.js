/**
 * SERVER ONLY. Inactive adapter: no routes, secrets or Calendar grants are
 * created here. The calendar owner must explicitly share the selected calendar
 * with the service account; use no domain-wide delegation or attendees.
 *
 * createApprovedAppointment is for a TRUSTED SERVER CALLER after staff approval
 * and payment checks. Its name is not authorization. Never pass a customer's
 * approved flag through to it. A transactional booking ledger must reserve time
 * and coordinate fresh availability checks; Calendar insertion is not an atomic
 * capacity lock. Reuse the same server-generated bookingId for all retries.
 *
 * References checked 2026-10-20:
 * https://developers.google.com/identity/protocols/oauth2/service-account
 * https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/get
 */
import { validateBooking, BOOKING_DESIGNS, normalizeBookingDesign } from './booking.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy';
const DAY = 86400000;
const encoder = new TextEncoder();
const NOT_FOUND = Symbol('calendar-event-not-found');

export class GoogleCalendarError extends Error {
  constructor(code) {
    const messages = {
      CALENDAR_CONFIG: 'Calendar integration is not configured correctly.',
      CALENDAR_INPUT: 'Invalid calendar request.',
      CALENDAR_AUTH: 'Calendar authorization is unavailable.',
      CALENDAR_TIMEOUT: 'Calendar request timed out; its result may be unknown.',
      CALENDAR_UNAVAILABLE: 'Calendar service is temporarily unavailable.',
      CALENDAR_RESPONSE: 'Calendar returned an invalid or incomplete response.',
      CALENDAR_CONFLICT: 'Calendar event requires manual reconciliation.',
    };
    super(messages[code] || messages.CALENDAR_UNAVAILABLE);
    this.name = 'GoogleCalendarError';
    this.code = code;
  }
}

const failure = code => new GoogleCalendarError(code);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[0] !== value || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) return null;
  const midnight = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== match[1]) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (PKCS8
 * PEM), GOOGLE_CALENDAR_ID (explicit ID, never `primary`). Options allow fake
 * fetch/clock in tests, timeoutMs (default 8s), maxRangeDays (default 31).
 * Credentials and Calendar IDs must be server secrets, never VITE_ variables.
 */
export function createGoogleCalendarProvider(env = {}, options = {}) {
  if (typeof window !== 'undefined' || !record(env) || !record(options)) throw failure('CALENDAR_CONFIG');
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const request = options.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRangeDays = options.maxRangeDays ?? 31;
  if (typeof email !== 'string' || email.length > 254 || !/^[a-z0-9._-]+@[a-z0-9.-]+\.gserviceaccount\.com$/i.test(email)
    || typeof calendarId !== 'string' || !calendarId || calendarId !== calendarId.trim() || calendarId === 'primary' || calendarId.length > 1024 || /[\u0000-\u0020\u007f]/.test(calendarId)
    || typeof pem !== 'string' || pem.length > 16384 || typeof request !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
    || !Number.isInteger(maxRangeDays) || maxRangeDays < 1 || maxRangeDays > 90) throw failure('CALENDAR_CONFIG');
  let keyPromise;
  let cachedToken;
  let pendingToken;
  const clock = () => {
    let result;
    try { result = now(); } catch { throw failure('CALENDAR_CONFIG'); }
    if (!Number.isSafeInteger(result) || result <= 0 || result > 253402214400000) throw failure('CALENDAR_CONFIG');
    return result;
  };

  async function signingKey() {
    if (!keyPromise) keyPromise = (async () => {
      try {
        const normalized = pem.replace(/\\n/g, '\n').trim();
        const match = /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/.exec(normalized);
        if (!match || match[0] !== normalized) throw new Error();
        const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), character => character.charCodeAt(0));
        const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        if (key.algorithm.modulusLength < 2048) throw new Error();
        return key;
      } catch { throw failure('CALENDAR_CONFIG'); }
    })();
    return keyPromise;
  }

  // Timeout covers both headers and JSON body, even if a test fetch ignores abort.
  async function jsonRequest(url, init, stage, allowConflict = false, allowNotFound = false, allowGone = false) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(failure('CALENDAR_TIMEOUT')); }, timeoutMs);
    });
    try {
      return await Promise.race([(async () => {
        // Workers rejects redirect:"error" before network I/O. Manual keeps
        // credentials on this exact endpoint; every redirect is rejected below.
        const response = await request(url, { ...init, redirect: 'manual', signal: controller.signal });
        if (!response || typeof response.status !== 'number') throw failure('CALENDAR_RESPONSE');
        if (allowConflict && response.status === 409) return { conflict: true };
        if (allowNotFound && response.status === 404) return NOT_FOUND;
        if (allowGone && response.status === 410) return NOT_FOUND;
        if (!response.ok) {
          if (stage === 'token' || response.status === 401 || response.status === 403) {
            cachedToken = null;
            throw failure('CALENDAR_AUTH');
          }
          throw failure('CALENDAR_UNAVAILABLE');
        }
        const payload = await response.json();
        if (!record(payload)) throw failure('CALENDAR_RESPONSE');
        return payload;
      })(), timeout]);
    } catch (error) {
      if (error instanceof GoogleCalendarError) throw error;
      throw failure(controller.signal.aborted ? 'CALENDAR_TIMEOUT' : 'CALENDAR_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt - 60000 > clock()) return cachedToken.value;
    if (!pendingToken) pendingToken = (async () => {
      const key = await signingKey();
      const requestedAt = clock();
      const iat = Math.floor(requestedAt / 1000);
      const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
      const claims = base64url(encoder.encode(JSON.stringify({ iss: email, scope: SCOPES, aud: TOKEN_URL, iat, exp: iat + 3600 })));
      const unsigned = `${header}.${claims}`;
      const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned)));
      const payload = await jsonRequest(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(signature)}` }).toString(),
      }, 'token');
      if (typeof payload.access_token !== 'string' || !payload.access_token || payload.access_token.length > 8192 || /[\u0000-\u0020\u007f]/.test(payload.access_token)
        || payload.token_type !== 'Bearer' || !Number.isInteger(payload.expires_in) || payload.expires_in < 1 || payload.expires_in > 3600) throw failure('CALENDAR_RESPONSE');
      cachedToken = { value: payload.access_token, expiresAt: requestedAt + payload.expires_in * 1000 };
      return cachedToken.value;
    })();
    try { return await pendingToken; }
    finally { pendingToken = null; }
  }

  async function api(path, body, allowConflict = false, allowNotFound = false, allowGone = false) {
    const token = await accessToken();
    return jsonRequest(`${API_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, 'calendar', allowConflict, allowNotFound, allowGone);
  }

  async function availability(bounds = {}) {
    if (!record(bounds)) throw failure('CALENDAR_INPUT');
    const { timeMin, timeMax } = bounds;
    const start = timestamp(timeMin);
    const end = timestamp(timeMax);
    const current = clock();
    if (start === null || end === null || end <= start || end - start > maxRangeDays * DAY || start < current - DAY || end > current + 91 * DAY) throw failure('CALENDAR_INPUT');
    const payload = await api('/freeBusy', { timeMin, timeMax, timeZone: 'Asia/Jakarta', calendarExpansionMax: 1, items: [{ id: calendarId }] });
    const result = record(payload.calendars) && Object.hasOwn(payload.calendars, calendarId) ? payload.calendars[calendarId] : null;
    if (payload.kind !== 'calendar#freeBusy' || timestamp(payload.timeMin) !== start || timestamp(payload.timeMax) !== end || !record(result)
      || (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length)) || !Array.isArray(result.busy) || result.busy.length > 10000) throw failure('CALENDAR_RESPONSE');
    const busyIntervals = result.busy.map(interval => {
      const busyStart = timestamp(interval?.start);
      const busyEnd = timestamp(interval?.end);
      if (busyStart === null || busyEnd === null || busyEnd <= busyStart || busyEnd <= start || busyStart >= end) throw failure('CALENDAR_RESPONSE');
      return { start: Math.max(busyStart, start), end: Math.min(busyEnd, end) };
    }).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of busyIntervals) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else merged.push({ ...interval });
    }
    // Return occupancy only, never event names, contacts, calendar IDs or tokens.
    return { timeMin, timeMax, timeZone: 'Asia/Jakarta', busyIntervals: merged };
  }

  async function appointmentEvent(appointment = {}) {
    // Caller owns authorization, approval, DP verification and reservation state.
    if (!record(appointment)) throw failure('CALENDAR_INPUT');
    const bookingId = appointment.bookingId;
    if (typeof bookingId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(bookingId) || /\s/.test(bookingId)) throw failure('CALENDAR_INPUT');
    const requestedStart = typeof appointment.date === 'string' && typeof appointment.time === 'string'
      ? timestamp(`${appointment.date}T${appointment.time}:00+07:00`) : null;
    if (requestedStart === null) throw failure('CALENDAR_INPUT');
    const current = clock();
    const amount = value => Number.isSafeInteger(value) ? String(value) : value;
    const legacySchedule = appointment.designType === undefined || appointment.designType === 'legacy';
    const design = legacySchedule ? { designType: 'simple', durationMinutes: 120 } : normalizeBookingDesign(appointment.designType, appointment.durationMinutes);
    if (!design || (legacySchedule && appointment.durationMinutes !== undefined && appointment.durationMinutes !== 120)) throw failure('CALENDAR_INPUT');
    let checked;
    try {
      // Past starts permit reconciliation of a prior write only, never insertion.
      // This is a trusted server snapshot, never a customer's approval/payment
      // flag. Omitted mode preserves the original adapter's v1 fingerprint.
      // Persisted snapshots keep their original half-hour starts when accepted
      // or reconciled; the public creation path enforces today's duration step.
      checked = validateBooking({ name: appointment.name, whatsapp: appointment.whatsapp, agreedPrice: amount(appointment.agreedPrice), date: appointment.date, time: appointment.time, paymentMode: appointment.paymentMode === 'legacy' ? 'deposit' : appointment.paymentMode, ...design }, { now: Math.min(current, requestedStart - 1), stepMinutes: 30 });
    } catch { throw failure('CALENDAR_INPUT'); }
    if (!checked.valid) throw failure('CALENDAR_INPUT');
    const value = checked.value;
    const legacy = appointment.paymentMode === undefined || appointment.paymentMode === 'legacy';
    if (!legacySchedule && legacy) throw failure('CALENDAR_INPUT');
    const paymentMode = legacy ? 'legacy' : value.paymentMode;
    const paymentAmount = legacy ? Math.floor(value.agreedPrice / 10) + (value.agreedPrice % 10 ? 1 : 0) : value.deposit;
    if ((!legacy && appointment.paymentMode !== paymentMode) || (appointment.paymentAmount !== undefined && appointment.paymentAmount !== paymentAmount)) throw failure('CALENDAR_INPUT');
    const { startISO, endISO } = checked.preview;
    const eventId = `chii${await sha256(`chiinails:booking:v1:${bookingId}`)}`;
    const summary = `Chii Nails · ${value.name}`;
    const sharedDescription = `Booking: ${bookingId}\nNama: ${value.name}\nWhatsApp: ${legacySchedule ? `+${value.whatsapp}` : `https://wa.me/${value.whatsapp}`}\nHarga disepakati: Rp${value.agreedPrice}`;
    const financialDescription = legacy
      ? `${sharedDescription}\nDP 10%: Rp${paymentAmount}\nNominal dan pembayaran diperiksa terpisah oleh operator.`
      : `${sharedDescription}\nPilihan pembayaran: ${paymentMode === 'full' ? 'Full payment' : 'DP 10%, minimal Rp20000'}\nNominal pembayaran: Rp${paymentAmount}\nSisa pembayaran: Rp${value.agreedPrice - paymentAmount}\nNominal dan pembayaran diperiksa terpisah oleh operator.`;
    const description = legacySchedule ? financialDescription : `${financialDescription}\nJenis desain: ${BOOKING_DESIGNS[design.designType].label}\nDurasi: ${design.durationMinutes} menit`;
    const version = legacySchedule ? legacy ? 1 : 2 : 3;
    const source = `chiinails-booking-v${version}`;
    const fingerprint = await sha256(JSON.stringify({ version, calendarId, bookingId, summary, description, startISO, endISO }));
    const body = {
      id: eventId, summary, description,
      start: { dateTime: startISO, timeZone: 'Asia/Jakarta' },
      end: { dateTime: endISO, timeZone: 'Asia/Jakarta' },
      status: 'confirmed', visibility: 'private', transparency: 'opaque',
      extendedProperties: { private: { source, bookingId, fingerprint } },
    };
    return { body, bookingId, eventId, summary, description, fingerprint, source, startISO, endISO, past: requestedStart <= current };
  }

  function verifyEvent(event, expected, reconciled) {
    const { bookingId, eventId, summary, description, fingerprint, source, startISO, endISO } = expected;
    const metadata = event.extendedProperties?.private;
    if (event.id !== eventId || event.status !== 'confirmed' || event.summary !== summary || event.description !== description
      || event.visibility !== 'private' || event.transparency !== 'opaque'
      || timestamp(event.start?.dateTime) !== timestamp(startISO) || timestamp(event.end?.dateTime) !== timestamp(endISO)
      || !record(metadata) || metadata.source !== source || metadata.bookingId !== bookingId || metadata.fingerprint !== fingerprint
      || (event.attendees !== undefined && (!Array.isArray(event.attendees) || event.attendees.length))) throw failure(reconciled ? 'CALENDAR_CONFLICT' : 'CALENDAR_RESPONSE');
    return { eventId, startISO, endISO, reconciled };
  }

  async function createApprovedAppointment(appointment = {}) {
    const expected = await appointmentEvent(appointment);
    const { eventId, body, past } = expected;
    const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
    let event = past ? await api(`${path}/${eventId}`) : await api(`${path}?sendUpdates=none`, body, true);
    const reconciled = past || event.conflict === true;
    if (!past && reconciled) event = await api(`${path}/${eventId}`);
    return verifyEvent(event, expected, reconciled);
  }

  // Recovery must prove whether the original write landed before another insert.
  // A missing event is distinct from a failed lookup. This method never writes.
  async function reconcileApprovedAppointment(appointment = {}) {
    const expected = await appointmentEvent(appointment);
    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${expected.eventId}`;
    const event = await api(path, undefined, false, true);
    if (event === NOT_FOUND) return { found: false };
    return { found: true, ...verifyEvent(event, expected, true) };
  }

  // Definite deletion of an already accepted event can release application
  // claims. Callers must first establish healthy access to this same calendar
  // through free/busy; 403, malformed events and network errors never mean gone.
  async function readAppointmentState(input = {}) {
    if (!record(input) || typeof input.bookingId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.bookingId)
      || typeof input.eventId !== 'string') throw failure('CALENDAR_INPUT');
    const expectedId = `chii${await sha256(`chiinails:booking:v1:${input.bookingId}`)}`;
    if (input.eventId !== expectedId) throw failure('CALENDAR_INPUT');
    const event = await api(`/calendars/${encodeURIComponent(calendarId)}/events/${expectedId}`, undefined, false, true, true);
    if (event === NOT_FOUND) return { state: 'deleted' };
    if (event.id !== expectedId || !['confirmed', 'tentative', 'cancelled'].includes(event.status)) throw failure('CALENDAR_RESPONSE');
    // A cancelled Google event may contain only its ID and status (a tombstone).
    if (event.status === 'cancelled') return { state: 'deleted' };
    const start = timestamp(event.start?.dateTime);
    const end = timestamp(event.end?.dateTime);
    const metadata = event.extendedProperties?.private;
    if (start === null || end === null || end <= start || !record(metadata) || metadata.bookingId !== input.bookingId
      || !['chiinails-booking-v1', 'chiinails-booking-v2', 'chiinails-booking-v3'].includes(metadata.source)) throw failure('CALENDAR_RESPONSE');
    return { state: 'active' };
  }

  // Recheck on every synchronization batch; a cached role would miss a later
  // downgrade where free/busy works but event 404 actually means inaccessible.
  async function verifyCalendarWriteAccess() {
    const result = await api(`/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1&fields=accessRole`);
    if (!['writer', 'owner'].includes(result.accessRole)) throw failure('CALENDAR_AUTH');
    return true;
  }

  return Object.freeze({ availability, createApprovedAppointment, reconcileApprovedAppointment, readAppointmentState, verifyCalendarWriteAccess });
}

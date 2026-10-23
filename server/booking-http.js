/**
 * SERVER ONLY. Cloudflare Pages HTTP boundary for the gated booking workflow.
 * Importing these handlers does not enable booking or create any resources.
 * Every endpoint other than status fails closed unless BOOKING_ENABLED is the
 * exact string "true" and all required bindings/configuration are present.
 *
 * createBookingHttpHandlers(overrides) supports synthetic store/auth/Calendar
 * implementations in tests. Production exports below use the real server-only
 * helpers. All handlers accept (Request, env) and return a sanitized Response.
 */
import { BookingAuthError, getAuthChallenge, signInOwner, requireBookingOwner, signOutOwner } from './booking-auth.js';
import { BookingRequestError, createBookingRequest, getBookingRequest, decideBookingRequest, getBookingAvailability, getBookingPaymentProof } from './booking-requests.js';
import { createGoogleCalendarProvider } from './google-calendar.js';
import { getBookingCalendarMonth, getBookingMonthBounds } from './booking-month.js';
import { normalizeBookingDesign, getOperatingHours, getBookingDateBounds, calculatePayment } from './booking.js';
import { PAYMENT_PROOF_MAX_BYTES, paymentProofBytes, PaymentProofValidationError } from './booking-proofs.js';
import { BookingAdmissionError, issueBookingAdmission, preflightBookingAdmission, submissionAdmission, isBookingAdmissionConfigured } from './booking-admission.js';
import { BookingCodeError, verifyBookingCode, withBookingCodeAdmission } from './booking-codes.js';
import { createPublicBookingCalendar } from './booking-occupancy-cache.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_FIELDS = ['name', 'whatsapp', 'agreedPrice', 'date', 'time', 'idempotencyKey'];
const VALIDATION_FIELDS = ['name', 'whatsapp', 'agreedPrice', 'deposit', 'date', 'time', 'paymentMode', 'designType', 'durationMinutes', 'proof'];
const FIELD_MESSAGES = {
  name: 'Isi nama 2–80 karakter.',
  whatsapp: 'Isi nomor WhatsApp Indonesia yang valid.',
  agreedPrice: 'Isi harga yang disepakati dalam angka Rupiah.',
  date: 'Pilih tanggal yang valid dalam periode pemesanan.',
  time: 'Pilih jam layanan yang masih tersedia.',
  paymentMode: 'Pilih DP atau full payment.',
  designType: 'Pilih jenis desain yang valid.',
  durationMinutes: 'Pilih durasi sesuai konsultasi.',
  deposit: 'Isi DP minimal Rp20.000 dan tidak melebihi harga total.',
  proof: 'Unggah bukti pembayaran dalam format gambar.',
};
const STORE_CODES = new Set([
  'BOOKING_CONFIG', 'BOOKING_INPUT', 'BOOKING_OWNER', 'REQUEST_NOT_FOUND', 'REQUEST_EXPIRED', 'REQUEST_STATE',
  'REQUEST_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT', 'BOOKING_RATE_LIMIT', 'SLOT_CONFLICT', 'CALENDAR_UNAVAILABLE',
  'CALENDAR_RECONCILE', 'BOOKING_STORAGE', 'PROOF_NOT_FOUND', 'PROOF_EXPIRED',
]);
const ERROR_STATUSES = new Set([400, 401, 403, 404, 405, 409, 410, 413, 415, 429, 503]);
const HTTP_ERRORS = {
  BOOKING_DISABLED: [503, 'Booking belum tersedia. Silakan hubungi Chii melalui WhatsApp.'],
  BOOKING_ORIGIN: [403, 'Buka formulir booking melalui situs Chii.'],
  BOOKING_METHOD: [405, 'Metode permintaan tidak didukung.'],
  BOOKING_MEDIA: [415, 'Format pengiriman tidak didukung. Muat ulang formulir lalu coba lagi.'],
  BOOKING_UPDATE_REQUIRED: [409, 'Formulir telah diperbarui. Muat ulang halaman untuk memulihkan isian dan melanjutkan.'],
  BOOKING_BODY: [413, 'Data booking terlalu besar.'],
  BOOKING_INPUT: [400, 'Periksa kembali data booking.'],
  BOOKING_TIMEOUT: [503, 'Permintaan belum selesai. Coba lagi sebentar.'],
  BOOKING_UNAVAILABLE: [503, 'Permintaan belum dapat diproses. Coba lagi sebentar.'],
  BOOKING_BUSY: [503, 'Formulir booking sedang sibuk. Isian tetap tersimpan; coba lagi sebentar.'],
  BOOKING_PUBLIC_RATE_LIMIT: [429, 'Kalender terlalu sering dimuat. Tunggu sebentar lalu coba lagi.'],
  BOOKING_PUBLIC_UNAVAILABLE: [503, 'Kalender belum dapat diperiksa. Coba lagi sebentar.'],
};

export const BOOKING_HTTP_LIMITS = Object.freeze({
  maxInFlightCreations: 8,
  publicReadsPerIpMinute: 300,
  publicIpEntries: 2048,
});

function trustedPublicIp(request) {
  const value = request.headers.get('CF-Connecting-IP');
  if (typeof value !== 'string' || !value || value.length > 45) throw new BookingHttpError('BOOKING_PUBLIC_UNAVAILABLE');
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    if (parts.every(part => part >= 0 && part <= 255)) return parts.join('.');
  } else if (value.includes(':') && /^[0-9a-f:.]+$/i.test(value)) {
    try { return new URL(`http://[${value}]/`).hostname.toLowerCase(); } catch { /* Invalid IPv6 never becomes another shared bucket. */ }
  }
  throw new BookingHttpError('BOOKING_PUBLIC_UNAVAILABLE');
}

class BookingHttpError extends Error {
  constructor(code, allow) {
    const [status, message] = HTTP_ERRORS[code] || HTTP_ERRORS.BOOKING_UNAVAILABLE;
    super(message);
    this.code = HTTP_ERRORS[code] ? code : 'BOOKING_UNAVAILABLE';
    this.status = status;
    this.allow = allow;
  }
}

function secureHeaders(extra = {}) {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Vary', 'Cookie');
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  return headers;
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: secureHeaders(headers) });
}

function protect(response) {
  if (!(response instanceof Response)) throw new BookingHttpError('BOOKING_UNAVAILABLE');
  return new Response(response.body, { status: response.status, headers: secureHeaders(response.headers) });
}

function errorResponse(error) {
  let code = 'BOOKING_UNAVAILABLE';
  let message = HTTP_ERRORS.BOOKING_UNAVAILABLE[1];
  let status = 503;
  let fields;
  let allow;
  if (error instanceof BookingHttpError) {
    ({ code, message, status, allow } = error);
  } else if (error instanceof BookingAuthError) {
    const safe = new BookingAuthError(error.code);
    ({ code, message, status } = safe);
  } else if (error instanceof BookingCodeError) {
    const safe = new BookingCodeError(error.code);
    ({ code, message, status } = safe);
  } else if (error instanceof BookingAdmissionError) {
    const safe = new BookingAdmissionError(error.code);
    ({ code, message, status } = safe);
  } else if (error instanceof PaymentProofValidationError) {
    const known = {
      PROOF_INVALID: [400, 'Gambar bukti pembayaran belum dapat dibuka. Pilih gambar lain.'],
      PROOF_SIZE: [413, 'Gambar bukti masih terlalu besar. Potong bagian bukti pembayaran lalu unggah lagi.'],
      PROOF_UNAVAILABLE: [503, 'Gambar belum dapat diperiksa. Isian tetap tersimpan; coba lagi sebentar.'],
    };
    if (Object.hasOwn(known, error.code)) {
      code = error.code;
      [status, message] = known[code];
      if (status !== 503) fields = { proof: FIELD_MESSAGES.proof };
    }
  } else if (error instanceof BookingRequestError && STORE_CODES.has(error.code)) {
    const safe = new BookingRequestError(error.code, ERROR_STATUSES.has(error.status) ? error.status : 503);
    ({ code, message, status } = safe);
    if (code === 'BOOKING_INPUT' && object(error.fields)) {
      // Return only known field names and fixed copy. Even an internal error
      // accidentally containing user input cannot reflect it into this response.
      const allowed = Object.keys(error.fields).filter(key => VALIDATION_FIELDS.includes(key));
      if (allowed.length) fields = Object.fromEntries(allowed.map(key => [key, FIELD_MESSAGES[key]]));
    }
  }
  return json({ code, message, ...(fields ? { fields } : {}) }, status, allow ? { Allow: allow } : {});
}

function siteOrigin(env) {
  try {
    const url = new URL(env?.SITE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (env.SITE_URL !== url.origin && env.SITE_URL !== `${url.origin}/`)) return null;
    return url.origin;
  } catch { return null; }
}

/** Readiness is deliberately private: status returns only this boolean. */
export function isBookingEnabled(env) {
  return isBookingCoreEnabled(env) && isBookingAdmissionConfigured(env) && typeof env.BOOKING_IMAGES?.fetch === 'function';
}

// The private submission processor never receives the owner's login signing
// secret. Only Pages owner routes need that separate authentication config.
export function isBookingSubmissionEnabled(env) {
  return isBookingCoreEnabled(env, false) && isBookingAdmissionConfigured(env) && typeof env.BOOKING_IMAGES?.fetch === 'function';
}

function isBookingCoreEnabled(env, ownerAuth = true) {
  if (!object(env) || env.BOOKING_ENABLED !== 'true' || !siteOrigin(env)
    || typeof env.BOOKING_DB?.prepare !== 'function' || typeof env.BOOKING_DB?.batch !== 'function') return false;
  const bounded = (value, minimum, maximum) => typeof value === 'string' && encoder.encode(value).length >= minimum && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  return bounded(env.BOOKING_LINK_SECRET, 32, 4096)
    && (!ownerAuth || bounded(env.BOOKING_AUTH_SECRET, 32, 512))
    && typeof env.BOOKING_OWNER_EMAIL === 'string' && env.BOOKING_OWNER_EMAIL.length <= 254
    && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(env.BOOKING_OWNER_EMAIL)
    && (!ownerAuth || typeof env.GOOGLE_OAUTH_CLIENT_ID === 'string' && env.GOOGLE_OAUTH_CLIENT_ID.length <= 256
    && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_OAUTH_CLIENT_ID))
    && typeof env.GOOGLE_SERVICE_ACCOUNT_EMAIL === 'string' && env.GOOGLE_SERVICE_ACCOUNT_EMAIL.length <= 254
    && /^[a-z0-9._-]+@[a-z0-9.-]+\.gserviceaccount\.com$/i.test(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    && typeof env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY === 'string' && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.length <= 16384
    && /^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----$/.test(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n').trim())
    && typeof env.GOOGLE_CALENDAR_ID === 'string' && env.GOOGLE_CALENDAR_ID.length > 0 && env.GOOGLE_CALENDAR_ID.length <= 1024
    && env.GOOGLE_CALENDAR_ID !== 'primary' && !/[\u0000-\u0020\u007f]/.test(env.GOOGLE_CALENDAR_ID);
}

function assertReady(env, owner = false) {
  if (!(owner ? isBookingCoreEnabled(env) : isBookingEnabled(env))) throw new BookingHttpError('BOOKING_DISABLED');
}

function method(request, allowed) {
  if (!(request instanceof Request) || !allowed.includes(request.method)) throw new BookingHttpError('BOOKING_METHOD', allowed.join(', '));
}

function sameOrigin(request, env, mutation = false) {
  const origin = siteOrigin(env);
  if (!origin || new URL(request.url).origin !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new BookingHttpError('BOOKING_ORIGIN');
  const supplied = request.headers.get('Origin');
  if ((supplied !== null && supplied !== origin) || (mutation && supplied !== origin)) throw new BookingHttpError('BOOKING_ORIGIN');
}

function tokenFrom(request) {
  const query = new URL(request.url).searchParams;
  const tokens = query.getAll('token');
  if (tokens.length !== 1 || !TOKEN.test(tokens[0]) || [...query.keys()].some(key => key !== 'token')) throw new BookingRequestError('REQUEST_NOT_FOUND', 404);
  return tokens[0];
}

async function readBodyBytes(request, maximum, timeoutMs) {
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new BookingHttpError('BOOKING_BODY');
  if (!request.body) throw new BookingHttpError('BOOKING_INPUT');
  const reader = request.body.getReader();
  let timer;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reader.cancel().catch(() => {});
      reject(new BookingHttpError('BOOKING_TIMEOUT'));
    }, timeoutMs);
  });
  const read = (async () => {
    const all = new Uint8Array(maximum);
    let size = 0, chunks = 0, emptyChunks = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new BookingHttpError('BOOKING_TIMEOUT');
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new BookingHttpError('BOOKING_INPUT');
      if (++chunks > 4096 || value.byteLength === 0 && ++emptyChunks > 32) throw new BookingHttpError('BOOKING_BODY');
      size += value.byteLength;
      if (size > maximum) throw new BookingHttpError('BOOKING_BODY');
      all.set(value, size - value.byteLength);
    }
    return all.subarray(0, size);
  })();
  try { return await Promise.race([read, timeout]); }
  finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
    // The timeout cancellation wakes a pending read before its lock is released.
    if (!timedOut) reader.releaseLock();
    else read.finally(() => reader.releaseLock()).catch(() => {});
  }
}

async function readJson(request, maximum = 8192, timeoutMs = 5000) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(type)) throw new BookingHttpError('BOOKING_MEDIA');
  const bytes = await readBodyBytes(request, maximum, timeoutMs);
  let value;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { throw new BookingHttpError('BOOKING_INPUT'); }
  if (!object(value)) throw new BookingHttpError('BOOKING_INPUT');
  return value;
}

export const BOOKING_MULTIPART_MAX_BYTES = PAYMENT_PROOF_MAX_BYTES + 16384;

async function readBookingSubmission(request, timeoutMs) {
  const type = request.headers.get('Content-Type') || '';
  // An older open tab must reload, then restore its unchanged draft/key. Do not
  // run the costly JSON/base64 path on the Free CPU budget.
  if (/^application\/json(?:\s*;|\s*$)/i.test(type)) throw new BookingHttpError('BOOKING_UPDATE_REQUIRED');
  if (!/^multipart\/form-data\s*;\s*boundary=(?:[A-Za-z0-9'()+_,.\/:=?-]{1,70}|"[A-Za-z0-9'()+_,.\/:=?-]{1,70}")\s*$/i.test(type)) throw new BookingHttpError('BOOKING_MEDIA');
  // Buffer only the bounded stream before invoking the platform multipart parser.
  const bytes = await readBodyBytes(request, BOOKING_MULTIPART_MAX_BYTES, timeoutMs);
  let fields;
  try { fields = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new BookingHttpError('BOOKING_INPUT'); }
  const entries = [...fields.entries()];
  if (entries.length !== 2 || fields.getAll('booking').length !== 1 || fields.getAll('proof').length !== 1
    || entries.some(([name]) => !['booking', 'proof'].includes(name))) throw new BookingHttpError('BOOKING_INPUT');
  const metadata = fields.get('booking'), file = fields.get('proof');
  if (typeof metadata !== 'string' || encoder.encode(metadata).length > 4096 || !file || typeof file === 'string'
    || file.type !== 'image/jpeg' || file.size < 4 || file.size > PAYMENT_PROOF_MAX_BYTES) throw new BookingHttpError('BOOKING_INPUT');
  let value;
  try { value = JSON.parse(metadata); } catch { throw new BookingHttpError('BOOKING_INPUT'); }
  if (!object(value) || Object.hasOwn(value, 'proof')) throw new BookingHttpError('BOOKING_INPUT');
  return { ...value, proof: { contentType: 'image/jpeg', bytes: new Uint8Array(await file.arrayBuffer()) } };
}

export function createBookingHttpHandlers(overrides = {}) {
  const now = overrides.now ?? Date.now;
  const createRequest = overrides.createBookingRequest ?? createBookingRequest;
  const getRequest = overrides.getBookingRequest ?? getBookingRequest;
  const decideRequest = overrides.decideBookingRequest ?? decideBookingRequest;
  const readAvailability = overrides.getBookingAvailability ?? getBookingAvailability;
  const readCalendarMonth = overrides.getBookingCalendarMonth ?? getBookingCalendarMonth;
  const readProof = overrides.getBookingPaymentProof ?? getBookingPaymentProof;
  const requireOwner = overrides.requireBookingOwner ?? requireBookingOwner;
  const challenge = overrides.getAuthChallenge ?? getAuthChallenge;
  const signIn = overrides.signInOwner ?? signInOwner;
  const signOut = overrides.signOutOwner ?? signOutOwner;
  const issueAdmission = overrides.issueBookingAdmission ?? issueBookingAdmission;
  const preflightAdmission = overrides.preflightBookingAdmission ?? preflightBookingAdmission;
  const admitSubmission = overrides.submissionAdmission ?? submissionAdmission;
  const guardCode = overrides.guardBookingCode ?? (async (env, input, admission) => withBookingCodeAdmission(admission, await verifyBookingCode(env, input.bookingCode, input.whatsapp, { now })));
  const publicCalendar = overrides.createPublicBookingCalendar ?? createPublicBookingCalendar;
  const createCalendar = overrides.createGoogleCalendarProvider ?? createGoogleCalendarProvider;
  const bodyTimeoutMs = overrides.bodyTimeoutMs ?? 5000;
  // A near-limit binary receipt can need over 30 seconds on a weak uplink.
  // Keep uploads bounded without applying the much
  // shorter small-JSON budget to their streaming request body.
  const proofBodyTimeoutMs = overrides.bodyTimeoutMs ?? 120000;
  const authOptions = { now, ...(overrides.fetch ? { fetch: overrides.fetch } : {}) };
  let activeCreations = 0;
  let publicMinute;
  const publicIps = new Map();
  // This is a coarse per-handler/isolate guard, not a global/account DDoS
  // budget. Both public projections share the same IP window. It performs no
  // D1 writes, so normal customer polling does not consume database write quota.
  const admitPublicRead = overrides.publicReadAdmission ?? (request => {
    const ip = trustedPublicIp(request);
    let current;
    try { current = now(); } catch { throw new BookingHttpError('BOOKING_PUBLIC_UNAVAILABLE'); }
    if (!Number.isSafeInteger(current) || current <= 0) throw new BookingHttpError('BOOKING_PUBLIC_UNAVAILABLE');
    const minute = Math.floor(current / 60000);
    if (minute !== publicMinute) { publicIps.clear(); publicMinute = minute; }
    const hits = publicIps.get(ip);
    if (hits !== undefined) {
      if (hits >= BOOKING_HTTP_LIMITS.publicReadsPerIpMinute) throw new BookingHttpError('BOOKING_PUBLIC_RATE_LIMIT');
      publicIps.set(ip, hits + 1);
    } else {
      if (publicIps.size >= BOOKING_HTTP_LIMITS.publicIpEntries) throw new BookingHttpError('BOOKING_PUBLIC_RATE_LIMIT');
      publicIps.set(ip, 1);
    }
  });
  // Keep at most two credential sets per isolate. Tokens/imported RSA keys live
  // in the provider; owner reads/cancel/login never instantiate this adapter.
  const calendarProviders = [];

  function calendar(env) {
    const values = [env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID];
    const prior = calendarProviders.find(entry => entry.values.every((value, index) => value === values[index]));
    if (prior) return prior.provider;
    let provider;
    try { provider = createCalendar(env, { now, ...(overrides.fetch ? { fetch: overrides.fetch } : {}) }); }
    catch { throw new BookingHttpError('BOOKING_UNAVAILABLE'); }
    if (typeof provider?.availability !== 'function' || typeof provider?.createApprovedAppointment !== 'function' || typeof provider?.reconcileApprovedAppointment !== 'function'
      || typeof provider?.readAppointmentState !== 'function' || typeof provider?.verifyCalendarWriteAccess !== 'function') throw new BookingHttpError('BOOKING_UNAVAILABLE');
    calendarProviders.push({ values, provider });
    if (calendarProviders.length > 2) calendarProviders.shift();
    return provider;
  }

  const guarded = handler => async (request, env) => {
    try { return await handler(request, env); }
    catch (error) { return errorResponse(error); }
  };

  return Object.freeze({
    status: guarded(async (request, env) => {
      method(request, ['GET']);
      // Without configured SITE_URL there is no trusted origin to compare; the
      // only response is the public disabled boolean, never missing field names.
      if (siteOrigin(env)) sameOrigin(request, env);
      return json({ enabled: isBookingEnabled(env) });
    }),
    requests: guarded(async (request, env) => {
      if (!(overrides.isSubmissionEnabled ?? isBookingEnabled)(env)) throw new BookingHttpError('BOOKING_DISABLED');
      method(request, ['POST']);
      sameOrigin(request, env, true);
      if (activeCreations >= BOOKING_HTTP_LIMITS.maxInFlightCreations) throw new BookingHttpError('BOOKING_BUSY');
      activeCreations++;
      try {
      const context = await preflightAdmission(request, env, authOptions);
      const input = await readBookingSubmission(request, proofBodyTimeoutMs);
      if (Object.keys(input).some(key => !REQUEST_FIELDS.includes(key) && !['paymentMode', 'deposit', 'designType', 'durationMinutes', 'proof', 'turnstileToken', 'bookingCode'].includes(key)) || REQUEST_FIELDS.some(key => typeof input[key] !== 'string')
        || (input.paymentMode !== undefined && !['deposit', 'full'].includes(input.paymentMode))
        || (input.deposit !== undefined && (typeof input.deposit !== 'string' || !/^\d{1,16}$/.test(input.deposit) || !calculatePayment(input.agreedPrice, input.paymentMode, input.deposit)))
        || (input.designType !== undefined && typeof input.designType !== 'string') || (input.durationMinutes !== undefined && typeof input.durationMinutes !== 'string')
        || !normalizeBookingDesign(input.designType, input.durationMinutes)
        || typeof input.turnstileToken !== 'string' || input.turnstileToken.length > 2048) throw new BookingHttpError('BOOKING_INPUT');
      const { turnstileToken, bookingCode, ...booking } = input;
      const admission = await guardCode(env, { bookingCode, whatsapp: booking.whatsapp }, admitSubmission(env, context, { ...authOptions, turnstileToken }));
      return json(await createRequest(env, booking, { now, calendar: calendar(env), admission }), 201);
      } finally { activeCreations--; }
    }),
    admission: guarded(async (request, env) => {
      assertReady(env);
      method(request, ['GET']);
      sameOrigin(request, env);
      if (new URL(request.url).search) throw new BookingHttpError('BOOKING_INPUT');
      return protect(await issueAdmission(request, env, authOptions));
    }),
    proof: guarded(async (request, env) => {
      assertReady(env, true);
      method(request, ['GET']);
      sameOrigin(request, env);
      const identity = await requireOwner(request, env, authOptions);
      const owner = { email: identity.email, subject: identity.subject, verified: true };
      const bytes = paymentProofBytes(await readProof(env, tokenFrom(request), { owner, now }));
      if (!bytes) throw new BookingHttpError('BOOKING_UNAVAILABLE');
      const headers = secureHeaders();
      headers.set('Content-Type', 'image/jpeg');
      headers.set('Content-Length', String(bytes.byteLength));
      headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
      return new Response(bytes, { headers });
    }),
    availability: guarded(async (request, env) => {
      assertReady(env);
      method(request, ['POST']);
      sameOrigin(request, env, true);
      if (new URL(request.url).search) throw new BookingHttpError('BOOKING_INPUT');
      await admitPublicRead(request, env, authOptions);
      const input = await readJson(request, 1024, bodyTimeoutMs);
      if (Object.keys(input).sort().join(',') !== 'date,designType,durationMinutes' || typeof input.date !== 'string' || typeof input.designType !== 'string'
        || typeof input.durationMinutes !== 'string') throw new BookingHttpError('BOOKING_INPUT');
      const selection = normalizeBookingDesign(input.designType, input.durationMinutes);
      if (!selection) throw new BookingHttpError('BOOKING_INPUT');
      const date = input.date;
      const bounds = getBookingDateBounds({ now: now() });
      if (!getOperatingHours(date) || date < bounds.minDate || date > bounds.maxDate) throw new BookingHttpError('BOOKING_INPUT');
      return json(await readAvailability(env, { date, ...selection }, { now, calendar: publicCalendar(env, { now, calendar: calendar(env) }) }));
    }),
    calendar: guarded(async (request, env) => {
      assertReady(env);
      method(request, ['POST']);
      sameOrigin(request, env, true);
      if (new URL(request.url).search) throw new BookingHttpError('BOOKING_INPUT');
      await admitPublicRead(request, env, authOptions);
      const input = await readJson(request, 1024, bodyTimeoutMs);
      if (Object.keys(input).sort().join(',') !== 'designType,durationMinutes,month' || typeof input.month !== 'string'
        || typeof input.designType !== 'string' || typeof input.durationMinutes !== 'string') throw new BookingHttpError('BOOKING_INPUT');
      const selection = normalizeBookingDesign(input.designType, input.durationMinutes);
      if (!selection) throw new BookingHttpError('BOOKING_INPUT');
      const bounds = getBookingMonthBounds(input.month, { now });
      const result = await readCalendarMonth(env, input, { now, calendar: calendar(env), occupancyCache: true });
      // Explicit response shape protects this public route even if an internal
      // adapter accidentally includes private Calendar or customer properties.
      if (!object(result) || Object.keys(result).sort().join(',') !== 'closedDates,designType,durationMinutes,maxDate,minDate,month,timeZone'
        || result.designType !== selection.designType || result.durationMinutes !== selection.durationMinutes
        || result.month !== bounds.month || result.minDate !== bounds.minDate || result.maxDate !== bounds.maxDate || result.timeZone !== 'Asia/Jakarta'
        || !Array.isArray(result.closedDates) || result.closedDates.length > 31
        || result.closedDates.some((date, index) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
          || !getOperatingHours(date) || date < bounds.minDate || date > bounds.maxDate || (index > 0 && date <= result.closedDates[index - 1]))) throw new BookingHttpError('BOOKING_UNAVAILABLE');
      return json(result);
    }),
    review: guarded(async (request, env) => {
      assertReady(env, true);
      method(request, ['GET', 'POST']);
      sameOrigin(request, env, request.method === 'POST');
      // Authenticate before parsing the lookup token, request body or any PII.
      // The authentication helper performs the session-bound mutation CSRF check.
      const identity = await requireOwner(request, env, authOptions);
      const owner = { email: identity.email, subject: identity.subject, verified: true };
      const token = tokenFrom(request);
      if (request.method === 'GET') return json(await getRequest(env, token, { owner, now }));
      const input = await readJson(request, 1024, bodyTimeoutMs);
      if (Object.keys(input).length !== 1 || !['accept', 'cancel'].includes(input.action)) throw new BookingHttpError('BOOKING_INPUT');
      const options = { owner, now, ...(input.action === 'accept' ? { calendar: calendar(env) } : {}) };
      return json(await decideRequest(env, token, input.action, options));
    }),
    session: guarded(async (request, env) => {
      assertReady(env, true);
      method(request, ['GET', 'POST', 'DELETE']);
      sameOrigin(request, env, request.method !== 'GET');
      const action = request.method === 'GET' ? challenge : request.method === 'POST' ? signIn : signOut;
      return protect(await action(request, env, authOptions));
    }),
  });
}

const handlers = createBookingHttpHandlers();
export const handleBookingStatus = handlers.status;
export const handleBookingRequests = handlers.requests;
export const handleBookingReview = handlers.review;
export const handleBookingSession = handlers.session;
export const handleBookingAvailability = handlers.availability;
export const handleBookingCalendarMonth = handlers.calendar;
export const handleBookingProof = handlers.proof;
export const handleBookingAdmission = handlers.admission;

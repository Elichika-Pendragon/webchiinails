/**
 * SERVER ONLY. D1 request ledger; no resource is provisioned by importing this.
 * Routes must separately verify owner authentication and CSRF before passing
 * { email, subject, verified: true }. A review token is only an opaque lookup.
 * Customer declarations never constitute staff approval or payment evidence.
 *
 * Pending requests expire after at most seven days, or at the appointment start,
 * whichever is earlier. This technical default is provisional studio policy.
 * Slot claims coordinate this application only; edits made directly in Google
 * Calendar cannot share the D1 transaction and may still require reconciliation.
 */
import { validateBooking } from './booking.js';
import { createGoogleCalendarProvider } from './google-calendar.js';

const DAY = 86400000;
const CELL = 1800000;
const LEASE = 60000;
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const messages = {
  BOOKING_CONFIG: 'Booking belum tersedia. Silakan hubungi Chii melalui WhatsApp.',
  BOOKING_INPUT: 'Periksa kembali data booking.',
  BOOKING_OWNER: 'Masuk dengan akun pemilik yang diizinkan.',
  REQUEST_NOT_FOUND: 'Permintaan booking tidak ditemukan.',
  REQUEST_EXPIRED: 'Permintaan booking sudah kedaluwarsa.',
  REQUEST_STATE: 'Status permintaan ini tidak dapat diubah dengan tindakan tersebut.',
  REQUEST_IN_PROGRESS: 'Konfirmasi sedang diproses. Tunggu sebentar lalu muat ulang.',
  IDEMPOTENCY_CONFLICT: 'Data telah berubah. Kirim sebagai permintaan booking baru.',
  BOOKING_RATE_LIMIT: 'Terlalu banyak permintaan. Hubungi Chii melalui WhatsApp.',
  SLOT_CONFLICT: 'Jadwal ini sudah terisi. Hubungi pelanggan untuk memilih waktu lain.',
  CALENDAR_UNAVAILABLE: 'Kalender belum dapat diperiksa. Coba lagi sebentar.',
  CALENDAR_RECONCILE: 'Hasil penyimpanan kalender perlu diperiksa. Coba konfirmasi lagi; jangan membuat booking pengganti.',
  BOOKING_STORAGE: 'Permintaan belum dapat diproses. Coba lagi sebentar.',
};

export class BookingRequestError extends Error {
  constructor(code, status = 503, fields) {
    super(messages[code] || messages.BOOKING_STORAGE);
    this.name = 'BookingRequestError';
    this.code = code;
    this.status = status;
    if (fields) this.fields = fields;
  }
}
const failure = (code, status, fields) => new BookingRequestError(code, status, fields);

function clockOption(now) {
  const read = typeof now === 'function' ? now : () => now ?? Date.now();
  return () => {
    const value = read();
    const result = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
    if (!Number.isSafeInteger(result) || result <= 0 || result > 253402214400000) throw failure('BOOKING_CONFIG');
    return result;
  };
}

function configuration(env) {
  if (typeof window !== 'undefined' || !object(env) || typeof env.BOOKING_DB?.prepare !== 'function' || typeof env.BOOKING_DB?.batch !== 'function'
    || typeof env.BOOKING_LINK_SECRET !== 'string' || env.BOOKING_LINK_SECRET.length < 32 || env.BOOKING_LINK_SECRET.length > 4096
    || typeof env.BOOKING_OWNER_EMAIL !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BOOKING_OWNER_EMAIL) || env.BOOKING_OWNER_EMAIL.length > 254) throw failure('BOOKING_CONFIG');
  let origin;
  try {
    const url = new URL(env.SITE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    origin = url.origin;
  } catch { throw failure('BOOKING_CONFIG'); }
  return { db: env.BOOKING_DB, secret: env.BOOKING_LINK_SECRET, ownerEmail: env.BOOKING_OWNER_EMAIL.toLowerCase(), origin };
}

function verifyOwner(config, owner) {
  if (!object(owner) || owner.verified !== true || typeof owner.email !== 'string' || owner.email.toLowerCase() !== config.ownerEmail
    || typeof owner.subject !== 'string' || !owner.subject.length || owner.subject.length > 255 || /[\u0000-\u001f\u007f]/.test(owner.subject)) throw failure('BOOKING_OWNER', 403);
  return owner.subject;
}

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function hash(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function reviewToken(secret, id) {
  const bytes = await hmac(secret, `chiinails:review:v1:${id}`);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function run(statement) {
  try {
    const result = await statement.run();
    if (result?.success === false) throw new Error();
    return result;
  } catch { throw failure('BOOKING_STORAGE'); }
}
async function first(statement) {
  try { return await statement.first(); } catch { throw failure('BOOKING_STORAGE'); }
}
const byId = (config, id) => first(config.db.prepare('SELECT * FROM booking_requests WHERE id = ?').bind(id));
function summary(row) {
  return {
    id: row.id, status: row.status, name: row.name, whatsapp: row.whatsapp,
    agreedPrice: row.agreed_price, deposit: row.deposit, remainingBalance: row.agreed_price - row.deposit,
    date: row.date, time: row.time, startISO: row.start_iso, endISO: row.end_iso,
    durationMinutes: 120, expiresAt: new Date(row.expires_at).toISOString(),
  };
}
async function expirePending(config, row, now) {
  if (row.status === 'pending' && row.expires_at <= now) {
    await run(config.db.prepare("UPDATE booking_requests SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending' AND expires_at <= ?").bind(now, row.id, now));
    return byId(config, row.id);
  }
  return row;
}
async function lookup(config, token, now, persistExpiry = true) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw failure('REQUEST_NOT_FOUND', 404);
  const row = await first(config.db.prepare('SELECT * FROM booking_requests WHERE token_hash = ?').bind(await hash(token)));
  if (!row) throw failure('REQUEST_NOT_FOUND', 404);
  if (!persistExpiry) return row.status === 'pending' && row.expires_at <= now ? { ...row, status: 'expired' } : row;
  return expirePending(config, row, now);
}
async function created(config, row, now) {
  row = await expirePending(config, row, now);
  return { requestId: row.id, status: row.status, reviewUrl: `${config.origin}/book/approve?r=${await reviewToken(config.secret, row.id)}`, booking: summary(row) };
}

/** Public creation route must additionally enforce activation, same-origin and request-size limits. */
export async function createBookingRequest(env, input, { now } = {}) {
  const config = configuration(env);
  const current = clockOption(now)();
  if (!object(input) || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw failure('BOOKING_INPUT', 400);
  let checked;
  try { checked = validateBooking(input, { now: current }); } catch { throw failure('BOOKING_INPUT', 400); }
  if (!checked.valid) throw failure('BOOKING_INPUT', 400, checked.errors);
  const value = checked.value;
  const payloadHash = await hash(JSON.stringify({ name: value.name, whatsapp: value.whatsapp, agreedPrice: value.agreedPrice, date: value.date, time: value.time }));
  const idemHash = hex(await hmac(config.secret, `chiinails:idempotency:v1:${input.idempotencyKey}`));
  const prior = await first(config.db.prepare('SELECT * FROM booking_requests WHERE idempotency_hash = ?').bind(idemHash));
  if (prior) {
    if (prior.payload_hash !== payloadHash) throw failure('IDEMPOTENCY_CONFLICT', 409);
    return created(config, prior, current);
  }
  const id = crypto.randomUUID();
  const token = await reviewToken(config.secret, id);
  const expires = Math.min(current + 7 * DAY, checked.preview.start);
  const insert = config.db.prepare(`INSERT INTO booking_requests
    (id, token_hash, idempotency_hash, payload_hash, name, whatsapp, agreed_price, deposit, date, time, start_ms, end_ms, start_iso, end_iso, created_at, expires_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (SELECT count(*) FROM booking_requests WHERE whatsapp = ? AND created_at > ?) < 10`).bind(
    id, await hash(token), idemHash, payloadHash, value.name, value.whatsapp, value.agreedPrice, value.deposit, value.date, value.time,
    checked.preview.start, checked.preview.end, checked.preview.startISO, checked.preview.endISO, current, expires, current, value.whatsapp, current - DAY,
  );
  // A statement transaction makes the per-number daily cap atomic. Concurrent
  // retries are reconciled by the unique idempotency hash, never by PII logs.
  try {
    const result = await insert.run();
    if (result?.success === false) throw new Error();
  } catch (error) {
    const concurrent = await first(config.db.prepare('SELECT * FROM booking_requests WHERE idempotency_hash = ?').bind(idemHash));
    if (!concurrent) throw failure('BOOKING_STORAGE');
    if (concurrent.payload_hash !== payloadHash) throw failure('IDEMPOTENCY_CONFLICT', 409);
    return created(config, concurrent, current);
  }
  const row = await byId(config, id);
  if (!row) throw failure('BOOKING_RATE_LIMIT', 429);
  return created(config, row, current);
}

/** Caller must verify owner login first; knowing the URL is never sufficient. */
export async function getBookingRequest(env, token, { owner, now } = {}) {
  const config = configuration(env);
  verifyOwner(config, owner);
  return summary(await lookup(config, token, clockOption(now)(), false));
}

async function claim(config, row, operation, current) {
  const update = config.db.prepare(`UPDATE booking_requests SET status = 'approving', approval_operation = ?, approval_lease_until = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' AND expires_at > ? AND start_ms > ?`).bind(operation, current + LEASE, current, row.id, current, current);
  const cells = Array.from({ length: 4 }, (_, index) => config.db.prepare(`INSERT INTO booking_slot_claims(slot_start, request_id, claimed_at)
    SELECT ?, id, ? FROM booking_requests WHERE id = ? AND approval_operation = ? AND status = 'approving'`).bind(row.start_ms + index * CELL, current, row.id, operation));
  try {
    const results = await config.db.batch([update, ...cells]);
    if (results?.some(result => result?.success === false)) throw new Error();
  } catch (error) {
    if (/UNIQUE constraint failed:\s*booking_slot_claims\.slot_start/i.test(String(error?.message))) throw failure('SLOT_CONFLICT', 409);
    throw failure('BOOKING_STORAGE');
  }
  const next = await byId(config, row.id);
  if (next?.approval_operation !== operation) throw failure('REQUEST_IN_PROGRESS', 409);
  return next;
}

async function releaseUnwritten(config, row, operation, current) {
  try {
    await config.db.batch([
      config.db.prepare("DELETE FROM booking_slot_claims WHERE request_id = ? AND EXISTS (SELECT 1 FROM booking_requests WHERE id = ? AND approval_operation = ? AND status = 'approving')").bind(row.id, row.id, operation),
      config.db.prepare("UPDATE booking_requests SET status = CASE WHEN expires_at <= ? THEN 'expired' ELSE 'pending' END, approval_operation = NULL, approval_lease_until = NULL, updated_at = ? WHERE id = ? AND approval_operation = ? AND status = 'approving'").bind(current, current, row.id, operation),
    ]);
  } catch { throw failure('BOOKING_STORAGE'); }
}
async function resume(config, row, operation, current) {
  await run(config.db.prepare(`UPDATE booking_requests SET approval_operation = ?, approval_lease_until = ?, updated_at = ?
    WHERE id = ? AND status IN ('approving', 'reconcile') AND approval_lease_until <= ?`).bind(operation, current + LEASE, current, row.id, current));
  const next = await byId(config, row.id);
  if (next?.approval_operation !== operation) throw failure('REQUEST_IN_PROGRESS', 409);
  return next;
}
async function verifyClaims(config, row) {
  const claims = await first(config.db.prepare('SELECT count(*) AS count, min(slot_start) AS first, max(slot_start) AS last FROM booking_slot_claims WHERE request_id = ?').bind(row.id));
  if (claims?.count !== 4 || claims.first !== row.start_ms || claims.last !== row.end_ms - CELL) throw failure('BOOKING_STORAGE');
}
async function accepted(config, row, operation, event, subject, current) {
  if (!object(event) || typeof event.eventId !== 'string' || !/^[a-z0-9]{5,1024}$/.test(event.eventId) || event.startISO !== row.start_iso || event.endISO !== row.end_iso) throw failure('CALENDAR_RECONCILE');
  await run(config.db.prepare(`UPDATE booking_requests SET status = 'accepted', calendar_event_id = ?, decided_by = ?, approval_lease_until = NULL, updated_at = ?
    WHERE id = ? AND approval_operation = ? AND status = 'reconcile'`).bind(event.eventId, subject, current, row.id, operation));
  const next = await byId(config, row.id);
  if (next?.status !== 'accepted' || next.calendar_event_id !== event.eventId) throw failure('CALENDAR_RECONCILE');
  return summary(next);
}

/** Owner accept means they have manually checked the agreed amount and DP. */
export async function decideBookingRequest(env, token, action, { owner, now, calendar } = {}) {
  const config = configuration(env);
  const subject = verifyOwner(config, owner);
  if (!['accept', 'cancel'].includes(action)) throw failure('BOOKING_INPUT', 400);
  const clock = clockOption(now);
  const current = clock();
  let row = await lookup(config, token, current);
  if (row.status === 'expired') throw failure('REQUEST_EXPIRED', 410);
  if ((action === 'accept' && row.status === 'accepted') || (action === 'cancel' && row.status === 'cancelled')) return summary(row);
  if (action === 'cancel') {
    if (row.status !== 'pending') throw failure('REQUEST_STATE', 409);
    await run(config.db.prepare("UPDATE booking_requests SET status = 'cancelled', decided_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(subject, current, row.id));
    row = await byId(config, row.id);
    if (row.status !== 'cancelled') throw failure('REQUEST_IN_PROGRESS', 409);
    return summary(row);
  }
  if (!['pending', 'approving', 'reconcile'].includes(row.status)) throw failure('REQUEST_STATE', 409);
  let provider;
  try { provider = calendar ?? createGoogleCalendarProvider(env, { now: clock }); }
  catch { throw failure('BOOKING_CONFIG'); }
  if (typeof provider?.availability !== 'function' || typeof provider?.createApprovedAppointment !== 'function') throw failure('BOOKING_CONFIG');
  const operation = crypto.randomUUID();
  row = row.status === 'pending' ? await claim(config, row, operation, current) : await resume(config, row, operation, current);
  await verifyClaims(config, row);
  const appointment = { bookingId: row.id, name: row.name, whatsapp: row.whatsapp, agreedPrice: row.agreed_price, date: row.date, time: row.time };
  if (row.status === 'reconcile') {
    if (typeof provider.reconcileApprovedAppointment !== 'function') throw failure('CALENDAR_RECONCILE');
    let recovered;
    try { recovered = await provider.reconcileApprovedAppointment(appointment); } catch { throw failure('CALENDAR_RECONCILE'); }
    if (!object(recovered) || typeof recovered.found !== 'boolean') throw failure('CALENDAR_RECONCILE');
    if (recovered.found) return accepted(config, row, operation, recovered, subject, clock());
    // A lookup-only 404 proves the previous event is absent. It is then safe to
    // recheck availability before any new insertion. Retain the existing claims.
    await run(config.db.prepare("UPDATE booking_requests SET status = 'approving', updated_at = ? WHERE id = ? AND approval_operation = ? AND status = 'reconcile'").bind(clock(), row.id, operation));
    row = await byId(config, row.id);
  }
  if (row.start_ms <= clock()) {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('REQUEST_EXPIRED', 410);
  }
  let occupancy;
  try { occupancy = await provider.availability({ timeMin: row.start_iso, timeMax: row.end_iso }); }
  catch {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('CALENDAR_UNAVAILABLE');
  }
  if (!object(occupancy) || !Array.isArray(occupancy.busyIntervals) || occupancy.busyIntervals.some(interval => !object(interval) || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end) || interval.end <= interval.start)) {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('CALENDAR_UNAVAILABLE');
  }
  if (occupancy.busyIntervals.some(interval => interval.start < row.end_ms && interval.end > row.start_ms)) {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('SLOT_CONFLICT', 409);
  }
  const beforeWrite = clock();
  if (row.start_ms <= beforeWrite || row.expires_at <= beforeWrite) {
    await releaseUnwritten(config, row, operation, beforeWrite);
    throw failure('REQUEST_EXPIRED', 410);
  }
  await run(config.db.prepare(`UPDATE booking_requests SET status = 'reconcile', updated_at = ?
    WHERE id = ? AND approval_operation = ? AND status = 'approving' AND approval_lease_until > ?`).bind(beforeWrite, row.id, operation, beforeWrite));
  row = await byId(config, row.id);
  if (row.status !== 'reconcile' || row.approval_operation !== operation) throw failure('REQUEST_IN_PROGRESS', 409);
  let event;
  try { event = await provider.createApprovedAppointment(appointment); } catch { throw failure('CALENDAR_RECONCILE'); }
  return accepted(config, row, operation, event, subject, clock());
}

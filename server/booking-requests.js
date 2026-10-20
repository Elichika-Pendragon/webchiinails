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
import { validateBooking, normalizeBookingDesign, listBookingSlots, getBookingDateBounds, getOperatingHours } from './booking.js';
import { createGoogleCalendarProvider } from './google-calendar.js';
import { validatePaymentProof, paymentProofBytes, PAYMENT_PROOF_RETENTION_MS } from './booking-proofs.js';

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
  SLOT_CONFLICT: 'Jadwal ini sudah terisi. Pilih tanggal atau jam lain.',
  PROOF_NOT_FOUND: 'Bukti pembayaran tidak ditemukan.',
  PROOF_EXPIRED: 'Masa penyimpanan bukti pembayaran telah berakhir.',
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
const REQUEST_SELECT = `SELECT r.*, (SELECT p.expires_at FROM booking_payment_proofs p WHERE p.request_id = r.id) AS proof_expires_at FROM booking_requests r`;
const byId = (config, id) => first(config.db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).bind(id));
const localISO = milliseconds => `${new Date(milliseconds + 25200000).toISOString().slice(0, 19)}+07:00`;
function schedule(row) {
  const designType = row.design_type ?? 'legacy';
  const durationMinutes = row.duration_minutes ?? 120;
  if (designType === 'legacy' ? durationMinutes !== 120 : !normalizeBookingDesign(designType, durationMinutes)) throw failure('BOOKING_STORAGE');
  const end = row.start_ms + durationMinutes * 60000;
  return { designType, durationMinutes, end, endISO: localISO(end) };
}
function summary(row, now = Date.now()) {
  const paymentMode = row.payment_mode ?? 'legacy';
  const amount = paymentMode === 'legacy' ? row.deposit : row.payment_amount;
  if (!['legacy', 'deposit', 'full'].includes(paymentMode) || !Number.isSafeInteger(amount) || amount < 1 || amount > row.agreed_price) throw failure('BOOKING_STORAGE');
  const appointment = schedule(row);
  return {
    id: row.id, status: row.status, name: row.name, whatsapp: row.whatsapp,
    agreedPrice: row.agreed_price, deposit: amount, paymentMode, paymentPolicy: paymentMode === 'legacy' ? 'legacy-10pct-v1' : 'min20k-v2', remainingBalance: row.agreed_price - amount,
    date: row.date, time: row.time, startISO: row.start_iso, endISO: appointment.endISO,
    designType: appointment.designType, durationMinutes: appointment.durationMinutes, expiresAt: new Date(row.expires_at).toISOString(),
    hasPaymentProof: Number.isSafeInteger(row.proof_expires_at) && row.proof_expires_at > now,
    cancelledViaCalendar: row.status === 'cancelled' && typeof row.calendar_event_id === 'string' && row.calendar_event_id.length > 0,
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
  const row = await first(config.db.prepare(`${REQUEST_SELECT} WHERE r.token_hash = ?`).bind(await hash(token)));
  if (!row) throw failure('REQUEST_NOT_FOUND', 404);
  if (!persistExpiry) return row.status === 'pending' && row.expires_at <= now ? { ...row, status: 'expired' } : row;
  return expirePending(config, row, now);
}
async function created(config, row, now) {
  row = await expirePending(config, row, now);
  return { requestId: row.id, status: row.status, reviewUrl: `${config.origin}/book/approve?r=${await reviewToken(config.secret, row.id)}`, booking: summary(row, now) };
}

/** Public creation route must additionally enforce activation, same-origin and request-size limits. */
export async function createBookingRequest(env, input, { now, calendar } = {}) {
  const config = configuration(env);
  const clock = clockOption(now);
  const current = clock();
  if (!object(input) || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw failure('BOOKING_INPUT', 400);
  let checked;
  try { checked = validateBooking(input, { now: current }); } catch { throw failure('BOOKING_INPUT', 400); }
  if (!checked.valid) throw failure('BOOKING_INPUT', 400, checked.errors);
  const value = checked.value;
  const basePayload = { name: value.name, whatsapp: value.whatsapp, agreedPrice: value.agreedPrice, date: value.date, time: value.time };
  const legacyPayloadHash = await hash(JSON.stringify(basePayload));
  const financialPayload = { ...basePayload, paymentMode: value.paymentMode, paymentAmount: value.deposit, paymentPolicy: value.paymentPolicy };
  const financialPayloadHash = await hash(JSON.stringify(financialPayload));
  const bookingPayload = { ...financialPayload, designType: value.designType, durationMinutes: value.durationMinutes };
  const previousPayloadHash = await hash(JSON.stringify(bookingPayload));
  const proof = input.proof === undefined ? null : await validatePaymentProof(input.proof);
  if (input.proof !== undefined && !proof) throw failure('BOOKING_INPUT', 400, { proof: true });
  const payloadHash = proof ? await hash(JSON.stringify({ ...bookingPayload, proofDigest: proof.digest })) : previousPayloadHash;
  const samePayload = row => row.payload_hash === payloadHash || (!proof && (row.design_type ?? 'legacy') === 'legacy' && value.designType === 'simple' && value.durationMinutes === 120
    && (row.payload_hash === financialPayloadHash || ((row.payment_mode ?? 'legacy') === 'legacy' && input.paymentMode !== 'full' && row.payload_hash === legacyPayloadHash)));
  const idemHash = hex(await hmac(config.secret, `chiinails:idempotency:v1:${input.idempotencyKey}`));
  const prior = await first(config.db.prepare(`${REQUEST_SELECT} WHERE r.idempotency_hash = ?`).bind(idemHash));
  if (prior) {
    if (!samePayload(prior)) throw failure('IDEMPOTENCY_CONFLICT', 409);
    return created(config, prior, current);
  }
  if (!proof) throw failure('BOOKING_INPUT', 400, { proof: true });
  // Submission checks availability again. This creates no hold or Calendar
  // event; owner acceptance must still recheck and claim atomically later.
  const blocked = await blockedIntervals(config, env, calendar, checked.preview, clock);
  if (blocked.some(interval => interval.start < checked.preview.end && interval.end > checked.preview.start)) throw failure('SLOT_CONFLICT', 409);
  if (checked.preview.start <= clock()) throw failure('BOOKING_INPUT', 400, { time: true });
  const id = crypto.randomUUID();
  const token = await reviewToken(config.secret, id);
  const expires = Math.min(current + 7 * DAY, checked.preview.start);
  const insert = config.db.prepare(`INSERT INTO booking_requests
    (id, token_hash, idempotency_hash, payload_hash, name, whatsapp, agreed_price, deposit, date, time, start_ms, end_ms, start_iso, end_iso, created_at, expires_at, updated_at, payment_mode, payment_amount, design_type, duration_minutes)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (SELECT count(*) FROM booking_requests WHERE whatsapp = ? AND created_at > ?) < 10`).bind(
    // The existing deposit column is the immutable v1 10% storage value. New
    // payments use the explicit payment_mode/payment_amount snapshot columns.
    id, await hash(token), idemHash, payloadHash, value.name, value.whatsapp, value.agreedPrice, Math.floor(value.agreedPrice / 10) + (value.agreedPrice % 10 ? 1 : 0), value.date, value.time,
    // Original end columns retain their v1 two-hour CHECK. Actual duration/end
    // is derived from the explicit design_type/duration_minutes snapshot.
    checked.preview.start, checked.preview.start + 7200000, checked.preview.startISO, localISO(checked.preview.start + 7200000), current, expires, current, value.paymentMode, value.deposit, value.designType, value.durationMinutes, value.whatsapp, current - DAY,
  );
  const receipt = config.db.prepare(`INSERT INTO booking_payment_proofs(request_id, content_type, content, sha256, created_at, expires_at)
    SELECT id, 'image/jpeg', ?, ?, ?, ? FROM booking_requests WHERE id = ?`).bind(proof.bytes.buffer, proof.digest, current, checked.preview.end + PAYMENT_PROOF_RETENTION_MS, id);
  // The D1 transaction stores the request and its receipt together, or neither.
  // Concurrent retries are reconciled by the unique idempotency hash.
  try {
    const result = await config.db.batch([insert, receipt]);
    if (!Array.isArray(result) || result.some(item => item?.success === false)) throw new Error();
  } catch (error) {
    const concurrent = await first(config.db.prepare(`${REQUEST_SELECT} WHERE r.idempotency_hash = ?`).bind(idemHash));
    if (!concurrent) throw failure('BOOKING_STORAGE');
    if (!samePayload(concurrent)) throw failure('IDEMPOTENCY_CONFLICT', 409);
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
  const current = clockOption(now)();
  return summary(await lookup(config, token, current, false), current);
}

/** Private image read: owner must be verified before any token or BLOB lookup. */
export async function getBookingPaymentProof(env, token, { owner, now } = {}) {
  const config = configuration(env);
  verifyOwner(config, owner);
  const current = clockOption(now)();
  const row = await lookup(config, token, current, false);
  if (!Number.isSafeInteger(row.proof_expires_at)) throw failure('PROOF_NOT_FOUND', 404);
  if (row.proof_expires_at <= current) throw failure('PROOF_EXPIRED', 410);
  const proof = await first(config.db.prepare('SELECT content_type, content, expires_at FROM booking_payment_proofs WHERE request_id = ?').bind(row.id));
  if (!proof) throw failure('PROOF_NOT_FOUND', 404);
  if (proof.expires_at <= current) throw failure('PROOF_EXPIRED', 410);
  const bytes = paymentProofBytes(proof.content);
  if (proof.content_type !== 'image/jpeg' || !bytes) throw failure('BOOKING_STORAGE');
  return bytes;
}

async function claim(config, row, operation, current) {
  const appointment = schedule(row);
  const update = config.db.prepare(`UPDATE booking_requests SET status = 'approving', approval_operation = ?, approval_lease_until = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' AND expires_at > ? AND start_ms > ?`).bind(operation, current + LEASE, current, row.id, current, current);
  const cells = Array.from({ length: appointment.durationMinutes / 30 }, (_, index) => config.db.prepare(`INSERT INTO booking_slot_claims(slot_start, request_id, claimed_at)
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
  const appointment = schedule(row);
  const claims = await first(config.db.prepare('SELECT count(*) AS count, min(slot_start) AS first, max(slot_start) AS last FROM booking_slot_claims WHERE request_id = ?').bind(row.id));
  if (claims?.count !== appointment.durationMinutes / 30 || claims.first !== row.start_ms || claims.last !== appointment.end - CELL) throw failure('BOOKING_STORAGE');
}
async function accepted(config, row, operation, event, subject, current) {
  if (!object(event) || typeof event.eventId !== 'string' || !/^[a-z0-9]{5,1024}$/.test(event.eventId) || event.startISO !== row.start_iso || event.endISO !== schedule(row).endISO) throw failure('CALENDAR_RECONCILE');
  await run(config.db.prepare(`UPDATE booking_requests SET status = 'accepted', calendar_event_id = ?, decided_by = ?, approval_lease_until = NULL, updated_at = ?
    WHERE id = ? AND approval_operation = ? AND status = 'reconcile'`).bind(event.eventId, subject, current, row.id, operation));
  const next = await byId(config, row.id);
  if (next?.status !== 'accepted' || next.calendar_event_id !== event.eventId) throw failure('CALENDAR_RECONCILE');
  return summary(next, current);
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
  if ((action === 'accept' && row.status === 'accepted') || (action === 'cancel' && row.status === 'cancelled')) return summary(row, current);
  if (action === 'cancel') {
    if (row.status !== 'pending') throw failure('REQUEST_STATE', 409);
    await run(config.db.prepare("UPDATE booking_requests SET status = 'cancelled', decided_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(subject, current, row.id));
    row = await byId(config, row.id);
    if (row.status !== 'cancelled') throw failure('REQUEST_IN_PROGRESS', 409);
    return summary(row, current);
  }
  if (!['pending', 'approving', 'reconcile'].includes(row.status)) throw failure('REQUEST_STATE', 409);
  let provider;
  try { provider = calendar ?? createGoogleCalendarProvider(env, { now: clock }); }
  catch { throw failure('BOOKING_CONFIG'); }
  if (typeof provider?.availability !== 'function' || typeof provider?.createApprovedAppointment !== 'function') throw failure('BOOKING_CONFIG');
  let freshOccupancy;
  if (row.status === 'pending') {
    const interval = { start: row.start_ms, end: schedule(row).end, startISO: row.start_iso, endISO: schedule(row).endISO };
    const busyIntervals = await blockedIntervals(config, env, provider, interval, clock);
    // A concurrent approval can finish while the remote preflight is in flight.
    // Return that same acknowledgement, never treat this request's own claims
    // as another customer or attempt a second Calendar insertion.
    const latest = await byId(config, row.id);
    if (latest?.status === 'accepted') return summary(latest, clock());
    if (latest?.status !== 'pending') throw failure('REQUEST_IN_PROGRESS', 409);
    row = latest;
    if (busyIntervals.some(busy => busy.start < interval.end && busy.end > interval.start)) throw failure('SLOT_CONFLICT', 409);
    freshOccupancy = { busyIntervals };
  }
  const operation = crypto.randomUUID();
  row = row.status === 'pending' ? await claim(config, row, operation, current) : await resume(config, row, operation, current);
  await verifyClaims(config, row);
  const snapshot = summary(row, current);
  const appointment = { bookingId: row.id, name: row.name, whatsapp: row.whatsapp, agreedPrice: row.agreed_price, date: row.date, time: row.time, paymentMode: snapshot.paymentMode, paymentAmount: snapshot.deposit, designType: snapshot.designType, durationMinutes: snapshot.durationMinutes };
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
  try { occupancy = freshOccupancy ?? await provider.availability({ timeMin: row.start_iso, timeMax: schedule(row).endISO }); }
  catch {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('CALENDAR_UNAVAILABLE');
  }
  if (!object(occupancy) || !Array.isArray(occupancy.busyIntervals) || occupancy.busyIntervals.some(interval => !object(interval) || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end) || interval.end <= interval.start)) {
    await releaseUnwritten(config, row, operation, clock());
    throw failure('CALENDAR_UNAVAILABLE');
  }
  if (occupancy.busyIntervals.some(interval => interval.start < schedule(row).end && interval.end > row.start_ms)) {
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

async function blockedIntervals(config, env, calendar, interval, clock) {
  let provider;
  let occupancy;
  try {
    provider = calendar ?? createGoogleCalendarProvider(env, { now: clock });
    occupancy = await provider.availability({ timeMin: interval.startISO, timeMax: interval.endISO });
  } catch { throw failure('CALENDAR_UNAVAILABLE'); }
  if (!object(occupancy) || !Array.isArray(occupancy.busyIntervals) || occupancy.busyIntervals.some(interval => !object(interval) || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end) || interval.end <= interval.start)) throw failure('CALENDAR_UNAVAILABLE');
  await synchronizeCalendarDeletions(config, provider, interval, clock());
  let held;
  try {
    const rows = await config.db.prepare(`SELECT c.slot_start FROM booking_slot_claims c JOIN booking_requests r ON r.id = c.request_id
      WHERE r.status IN ('approving', 'reconcile', 'accepted') AND c.slot_start < ? AND c.slot_start + ? > ? ORDER BY c.slot_start LIMIT 97`).bind(interval.end, CELL, interval.start).all();
    if (!rows || rows.success === false || !Array.isArray(rows.results) || rows.results.length > 96 || rows.results.some(row => !Number.isSafeInteger(row.slot_start))) throw new Error();
    held = rows.results.map(row => ({ start: row.slot_start, end: row.slot_start + CELL }));
  } catch { throw failure('BOOKING_STORAGE'); }
  return [...occupancy.busyIntervals, ...held];
}

async function synchronizeCalendarDeletions(config, provider, interval, current) {
  const date = localISO(interval.start).slice(0, 10);
  const dayStart = Date.parse(`${date}T00:00:00+07:00`);
  let acceptedRows;
  try {
    const result = await config.db.prepare(`SELECT id, calendar_event_id FROM booking_requests
      WHERE status = 'accepted' AND start_ms >= ? AND start_ms < ? AND start_ms + duration_minutes * 60000 > ? ORDER BY start_ms LIMIT 13`).bind(dayStart - 300 * 60000, dayStart + DAY, dayStart).all();
    if (!result || result.success === false || !Array.isArray(result.results) || result.results.length > 12) throw new Error();
    acceptedRows = result.results;
  } catch { throw failure('BOOKING_STORAGE'); }
  if (!acceptedRows.length) return;
  if (typeof provider.readAppointmentState !== 'function' || typeof provider.verifyCalendarWriteAccess !== 'function') throw failure('CALENDAR_UNAVAILABLE');
  try { if (await provider.verifyCalendarWriteAccess() !== true) throw new Error(); }
  catch { throw failure('CALENDAR_UNAVAILABLE'); }
  const deleted = [];
  // Bound parallelism and gather all outcomes before any mutation. Partial
  // lookup failures retain every claim from this synchronization attempt.
  for (let index = 0; index < acceptedRows.length; index += 3) {
    let outcomes;
    try {
      outcomes = await Promise.all(acceptedRows.slice(index, index + 3).map(async row => {
        const result = await provider.readAppointmentState({ bookingId: row.id, eventId: row.calendar_event_id });
        if (!object(result) || !['active', 'deleted'].includes(result.state)) throw new Error();
        return { row, state: result.state };
      }));
    } catch { throw failure('CALENDAR_UNAVAILABLE'); }
    deleted.push(...outcomes.filter(outcome => outcome.state === 'deleted').map(outcome => outcome.row));
  }
  if (!deleted.length) return;
  const statements = deleted.flatMap(row => [
    config.db.prepare(`DELETE FROM booking_slot_claims WHERE request_id = ? AND EXISTS
      (SELECT 1 FROM booking_requests WHERE id = ? AND status = 'accepted' AND calendar_event_id = ?)`).bind(row.id, row.id, row.calendar_event_id),
    config.db.prepare(`UPDATE booking_requests SET status = 'cancelled', updated_at = ?
      WHERE id = ? AND status = 'accepted' AND calendar_event_id = ?`).bind(current, row.id, row.calendar_event_id),
  ]);
  try {
    const results = await config.db.batch(statements);
    if (!Array.isArray(results) || results.length !== statements.length || results.some(result => result?.success === false)) throw new Error();
    for (let i = 0; i < results.length; i += 2) {
      const released = results[i]?.meta?.changes;
      const changed = results[i + 1]?.meta?.changes;
      if (!Number.isInteger(released) || released < 0 || released > 10 || ![0, 1].includes(changed) || (changed === 0 && released !== 0)) throw new Error();
    }
  } catch { throw failure('BOOKING_STORAGE'); }
}

/** Public occupancy only. No customer, event, Calendar ID or claim identifiers. */
export async function getBookingAvailability(env, input, { now, calendar } = {}) {
  const config = configuration(env);
  const clock = clockOption(now);
  const current = clock();
  const design = object(input) ? normalizeBookingDesign(input.designType, input.durationMinutes) : null;
  const bounds = getBookingDateBounds({ now: current });
  if (!design || typeof input.date !== 'string' || !getOperatingHours(input.date) || input.date < bounds.minDate || input.date > bounds.maxDate) throw failure('BOOKING_INPUT', 400);
  const candidates = listBookingSlots(input.date, { now: current, ...design, includeElapsed: true });
  const result = { date: input.date, ...design, timeZone: 'Asia/Jakarta', slots: candidates.map(slot => ({ time: slot.time, available: false })) };
  const future = candidates.filter(slot => slot.start > current);
  if (!future.length) return result;
  const blocked = await blockedIntervals(config, env, calendar, { ...future[0], end: future.at(-1).end, endISO: future.at(-1).endISO }, clock);
  const latest = clock();
  result.slots = candidates.map(slot => ({ time: slot.time, available: slot.start > latest && !blocked.some(interval => interval.start < slot.end && interval.end > slot.start) }));
  return result;
}

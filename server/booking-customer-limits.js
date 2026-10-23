/** SERVER ONLY. Request throttling does not require an invitation or access code. */
import { normalizeWhatsApp } from './booking.js';
import { BookingRequestError } from './booking-requests.js';

export const CUSTOMER_REQUEST_LIMITS = Object.freeze({ cooldownMs: 900000, windowMs: 86400000, requestsPerWindow: 3 });
export function withCustomerRequestLimits(env, whatsapp, admission, { now = Date.now } = {}) {
  const db = env?.BOOKING_DB, phone = normalizeWhatsApp(whatsapp);
  if (!phone) throw new BookingRequestError('BOOKING_INPUT', 400, { whatsapp: true });
  if (typeof db?.prepare !== 'function' || typeof admission?.authorizeNew !== 'function') throw new BookingRequestError('BOOKING_CONFIG');
  const clock = () => { const value = typeof now === 'function' ? now() : now; if (!Number.isSafeInteger(value) || value < 1) throw new BookingRequestError('BOOKING_CONFIG'); return value; };
  const condition = current => ({
    sql: `NOT EXISTS(SELECT 1 FROM booking_requests WHERE whatsapp=? AND created_at>?)
      AND (SELECT count(*) FROM booking_requests WHERE whatsapp=? AND created_at>?) < ?
      AND NOT EXISTS(SELECT 1 FROM booking_requests WHERE whatsapp=? AND
        (status IN ('approving','reconcile') OR (status='pending' AND expires_at>?) OR (status='accepted' AND start_ms+duration_minutes*60000>?)))`,
    values: [phone, current-CUSTOMER_REQUEST_LIMITS.cooldownMs, phone, current-CUSTOMER_REQUEST_LIMITS.windowMs, CUSTOMER_REQUEST_LIMITS.requestsPerWindow, phone, current, current],
  });
  async function assertNewAllowed() {
    const gate=condition(clock()); let row;
    try { row=await db.prepare(`SELECT 1 AS allowed WHERE ${gate.sql}`).bind(...gate.values).first(); }
    catch { throw new BookingRequestError('BOOKING_STORAGE'); }
    if (!row) throw new BookingRequestError('BOOKING_RATE_LIMIT', 429);
  }
  return { async authorizeNew(args) {
    await assertNewAllowed();
    const ticket=await admission.authorizeNew(args);
    return { ...ticket, assertNewAllowed,
      insertCondition(current) { const base=ticket.insertCondition(current), gate=condition(current); return { sql:`(${base.sql}) AND (${gate.sql})`, values:[...base.values,...gate.values] }; },
    };
  } };
}

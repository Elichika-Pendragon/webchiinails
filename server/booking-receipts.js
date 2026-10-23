import { requireBookingOwner, BookingAuthError } from './booking-auth.js';
import { issueBookingReceipt, readBookingReceipt, BookingRequestError } from './booking-requests.js';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Cookie' };
const reply = (body, status = 200) => Response.json(body, { status, headers });
async function input(request, env) {
  const origin = new URL(env.SITE_URL).origin;
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json' || Number(request.headers.get('Content-Length')) > 512) throw new BookingRequestError('REQUEST_NOT_FOUND', 404);
  const reader = request.body?.getReader(); if (!reader) throw new BookingRequestError('REQUEST_NOT_FOUND', 404);
  const parts = []; let size = 0, timer;
  try {
    return await Promise.race([(async () => {
      while (true) { const value = await reader.read(); if (value.done) break; size += value.value.length; if (size > 512) { await reader.cancel(); throw new Error(); } parts.push(value.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!data || Array.isArray(data) || Object.keys(data).join(',') !== 'token' || typeof data.token !== 'string') throw new Error();
      return data.token;
    })(), new Promise((_, reject) => { timer = setTimeout(() => { reader.cancel().catch(() => {}); reject(new Error()); }, 5000); })]);
  } catch { throw new BookingRequestError('REQUEST_NOT_FOUND', 404); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function handleReceipt(request, env, options = {}, ownerOnly = false) {
  try {
    // Authenticate owner issuance before reading any booking lookup or PII.
    const identity = ownerOnly ? await requireBookingOwner(request, env, options.auth) : null;
    const token = await input(request, env);
    const value = ownerOnly
      ? await issueBookingReceipt(env, token, { owner: { ...identity, verified: true }, now: options.now })
      : await readBookingReceipt(env, token, { now: options.now });
    return reply(value);
  } catch (error) {
    if (error instanceof BookingAuthError) return reply({ code: error.code, message: error.message }, error.status);
    if (error instanceof BookingRequestError && ['REQUEST_NOT_FOUND', 'REQUEST_STATE', 'BOOKING_STORAGE'].includes(error.code)) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: 'RECEIPT_UNAVAILABLE', message: 'Kuitansi belum dapat dimuat. Coba lagi setelah koneksi pulih.' }, 503);
  }
}

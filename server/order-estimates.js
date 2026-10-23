import { orderChoices, normalizeOrderCode, validOrderCode, randomOrderCode } from '../src/order-code.js';
import { calculateServices, defaultPrices, validPriceSnapshot } from '../src/pricing.js';
import { BookingAuthError, requireBookingOwner } from './booking-auth.js';
import { BookingAdmissionError, preflightBookingAdmission, verifyOrderAdmission } from './booking-admission.js';

export const ORDER_LIMITS = Object.freeze({ lifetimeMs: 30 * 86400000, daily: 100, perSessionDay: 10, active: 5000, allocated: 50000 });
const messages = {
  ORDER_INPUT: [400, 'Periksa kode 5 karakter dan pilihan layanan.'],
  ORDER_MISSING: [404, 'Kode tidak ditemukan atau sudah kedaluwarsa. Periksa kode atau buat lagi dari kalkulator.'],
  ORDER_CONFLICT: [409, 'Rincian telah berubah. Muat ulang kode sebelum menyimpan lagi.'],
  ORDER_CAPACITY: [429, 'Batas kode tercapai. Coba lagi nanti; konsultasi melalui WhatsApp tetap tersedia.'],
  ORDER_UNAVAILABLE: [503, 'Rincian belum dapat diakses. Pilihan tetap ada; coba lagi setelah koneksi pulih.'],
};
export class OrderError extends Error {
  constructor(code = 'ORDER_UNAVAILABLE') { const known = messages[code] ? code : 'ORDER_UNAVAILABLE'; super(messages[known][1]); this.code = known; this.status = messages[known][0]; }
}
const fail = code => new OrderError(code);
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Cookie' } });
const dbFor = env => { if (!env.BOOKING_DB?.prepare || !env.BOOKING_DB?.batch) throw fail(); return env.BOOKING_DB; };
const at = options => { const value = (options.now || Date.now)(); if (!Number.isSafeInteger(value) || value < 1) throw fail(); return value; };
const exact = (input, keys) => input && !Array.isArray(input) && Object.keys(input).sort().join(',') === keys.split(',').sort().join(',');
async function body(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || Number(request.headers.get('Content-Length')) > 4096) throw fail('ORDER_INPUT');
  const reader = request.body?.getReader(); if (!reader) throw fail('ORDER_INPUT');
  let size = 0, timer; const parts = [];
  try {
    return await Promise.race([(async () => {
      while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 4096) { await reader.cancel(); throw fail('ORDER_INPUT'); } parts.push(item.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    })(), new Promise((_, reject) => { timer = setTimeout(() => { reader.cancel().catch(() => {}); reject(fail()); }, 5000); })]);
  } catch (error) { if (error instanceof OrderError) throw error; throw fail('ORDER_INPUT'); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
function failure(error) {
  const safe = error instanceof OrderError || error instanceof BookingAuthError || error instanceof BookingAdmissionError ? error : fail();
  return reply({ code: safe.code, message: safe.message }, safe.status);
}
function choices(value) { try { return orderChoices(value); } catch { throw fail('ORDER_INPUT'); } }
async function catalog(db) {
  const row = await db.prepare('SELECT catalog,revision,updated_at FROM site_prices WHERE id=1').first();
  if (!row) return defaultPrices;
  const snapshot = { prices: JSON.parse(row.catalog), revision: row.revision, updatedAt: row.updated_at };
  if (!validPriceSnapshot(snapshot)) throw fail(); return snapshot.prices;
}
function publicOrder(row) {
  return { code: row.code, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at, choices: JSON.parse(row.choices), estimate: JSON.parse(row.estimate) };
}
async function lookup(db, code, current) {
  if (!validOrderCode(code)) throw fail('ORDER_INPUT');
  const row = await db.prepare('SELECT * FROM order_estimates WHERE code=? AND expires_at>? AND choices IS NOT NULL').bind(normalizeOrderCode(code), current).first();
  if (!row) throw fail('ORDER_MISSING'); return row;
}
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

export async function handlePublicOrders(request, env, options = {}) {
  try {
    if (request.method !== 'POST' || new URL(request.url).search) throw fail('ORDER_INPUT');
    // Reuse existing signed, same-origin anonymous session and shared edge limits.
    const context = await preflightBookingAdmission(request, env, options);
    const input = await body(request), current = at(options), db = dbFor(env);
    if (input?.action === 'lookup' && exact(input, 'action,code')) return reply({ order: publicOrder(await lookup(db, input.code, current)) });
    if (input?.action !== 'create' || !exact(input, 'action,choices,key,token') || typeof input.key !== 'string' || !/^[a-f0-9-]{36}$/.test(input.key)) throw fail('ORDER_INPUT');
    const selected = choices(input.choices), serialized = JSON.stringify(selected);
    const requestHash = await digest(`chii:order:v1:${context.sessionHash}:${input.key}`);
    const old = await db.prepare('SELECT * FROM order_estimates WHERE request_hash=?').bind(requestHash).first();
    if (old) {
      if (old.expires_at <= current || !old.choices) throw fail('ORDER_MISSING');
      if (old.choices !== serialized || old.revision !== 1) throw fail('ORDER_CONFLICT');
      return reply({ order: publicOrder(old) });
    }
    await verifyOrderAdmission(env, context, input.token, requestHash, await digest(serialized), options);
    const estimate = JSON.stringify(calculateServices(await catalog(db), selected.selections, selected));
    // Keep tiny tombstones so a previously issued code can never identify a different order.
    await db.prepare('UPDATE order_estimates SET choices=NULL,estimate=NULL WHERE code IN (SELECT code FROM order_estimates WHERE expires_at<=? AND choices IS NOT NULL ORDER BY expires_at LIMIT 64)').bind(current).run();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = (options.randomCode || randomOrderCode)(); if (!validOrderCode(code)) throw fail();
      const row = await db.prepare(`INSERT INTO order_estimates(code,choices,estimate,request_hash,session_hash,created_at,updated_at,expires_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM order_estimates)< ?
        AND (SELECT count(*) FROM order_estimates WHERE expires_at>?)< ?
        AND (SELECT count(*) FROM order_estimates WHERE created_at>=?)< ?
        AND (SELECT count(*) FROM order_estimates WHERE session_hash=? AND created_at>=?)< ?
        ON CONFLICT DO NOTHING RETURNING *`).bind(code, serialized, estimate, requestHash, context.sessionHash, current, current, current + ORDER_LIMITS.lifetimeMs,
          ORDER_LIMITS.allocated, current, ORDER_LIMITS.active, current - 86400000, ORDER_LIMITS.daily, context.sessionHash, current - 86400000, ORDER_LIMITS.perSessionDay).first();
      if (row) return reply({ order: publicOrder(row) }, 201);
      const same = await db.prepare('SELECT * FROM order_estimates WHERE request_hash=?').bind(requestHash).first();
      if (same) { if (same.choices !== serialized || same.revision !== 1) throw fail('ORDER_CONFLICT'); return reply({ order: publicOrder(same) }); }
      if (!await db.prepare('SELECT 1 FROM order_estimates WHERE code=?').bind(code).first()) throw fail('ORDER_CAPACITY');
    }
    throw fail('ORDER_CAPACITY');
  } catch (error) { return failure(error); }
}

export async function handleOwnerOrders(request, env, options = {}) {
  try {
    if (request.method !== 'POST' || new URL(request.url).search) throw fail('ORDER_INPUT');
    await requireBookingOwner(request, env, options.auth);
    const input = await body(request), db = dbFor(env), current = at(options);
    if (input?.action === 'lookup' && exact(input, 'action,code')) return reply({ order: publicOrder(await lookup(db, input.code, current)) });
    if (input?.action !== 'save' || !exact(input, 'action,code,revision,choices') || !Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision >= Number.MAX_SAFE_INTEGER) throw fail('ORDER_INPUT');
    await lookup(db, input.code, current);
    const selected = choices(input.choices), estimate = calculateServices(await catalog(db), selected.selections, selected);
    const row = await db.prepare('UPDATE order_estimates SET choices=?,estimate=?,revision=revision+1,updated_at=? WHERE code=? AND revision=? AND expires_at>? RETURNING *')
      .bind(JSON.stringify(selected), JSON.stringify(estimate), current, normalizeOrderCode(input.code), input.revision, current).first();
    if (!row) throw fail('ORDER_CONFLICT');
    return reply({ order: publicOrder(row) });
  } catch (error) { return failure(error); }
}

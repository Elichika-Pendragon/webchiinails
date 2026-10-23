import { defaultPrices, validPrices, validPriceSnapshot } from '../src/pricing.js';
import { BookingAuthError, requireBookingOwner } from './booking-auth.js';

const headers = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
};
const reply = (body, status = 200, publicRead = false) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, ...(publicRead ? { 'Cache-Control': 'public, max-age=0, s-maxage=60' } : { Vary: 'Cookie' }) },
});
const problem = (code, status) => Object.assign(new Error(code), { code, status });
const database = env => {
  if (!env.BOOKING_DB || typeof env.BOOKING_DB.prepare !== 'function') throw problem('PRICES_UNAVAILABLE', 503);
  return env.BOOKING_DB;
};
async function readPrices(env) {
  const row = await database(env).prepare('SELECT catalog, revision, updated_at FROM site_prices WHERE id = 1').first();
  if (!row) return { prices: defaultPrices, revision: 0, updatedAt: null };
  const value = { prices: JSON.parse(row.catalog), revision: row.revision, updatedAt: row.updated_at };
  if (!validPriceSnapshot(value)) throw problem('PRICES_UNAVAILABLE', 503);
  return value;
}
async function boundedBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw problem('PRICES_MEDIA', 415);
  if (Number(request.headers.get('Content-Length')) > 8192) throw problem('PRICES_BODY', 413);
  const reader = request.body?.getReader();
  if (!reader) throw problem('PRICES_INPUT', 400);
  const parts = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw problem('PRICES_BODY', 413); }
      parts.push(value);
    }
    const all = new Uint8Array(size); let offset = 0;
    for (const part of parts) { all.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
  } catch (error) { if (error.status) throw error; throw problem('PRICES_INPUT', 400); }
  finally { reader.releaseLock(); }
}
function failure(error) {
  if (error instanceof BookingAuthError) return reply({ error: { code: error.code } }, error.status);
  const allowed = ['PRICES_METHOD', 'PRICES_MEDIA', 'PRICES_BODY', 'PRICES_INPUT', 'PRICES_CONFLICT'];
  return allowed.includes(error.code) ? reply({ error: { code: error.code } }, error.status) : reply({ error: { code: 'PRICES_UNAVAILABLE' } }, 503);
}
export async function handlePublicPrices(request, env, options = {}) {
  try {
    if (request.method !== 'GET') throw problem('PRICES_METHOD', 405);
    // A single cache key per origin: visitors cannot manufacture query variants.
    const key = new Request(`${new URL(request.url).origin}/api/prices`);
    const cached = await options.cache?.match(key);
    if (cached) return cached;
    const response = reply(await readPrices(env), 200, true);
    if (options.cache && options.waitUntil) options.waitUntil(options.cache.put(key, response.clone()));
    return response;
  } catch (error) { return failure(error); }
}
export async function handleOwnerPrices(request, env, options = {}) {
  try {
    if (!['GET', 'POST'].includes(request.method)) throw problem('PRICES_METHOD', 405);
    // Real owner signature, exact configured identity, Origin and CSRF checks.
    await requireBookingOwner(request, env, options.auth);
    if (request.method === 'GET') return reply(await readPrices(env));
    const body = await boundedBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
      || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER
      || !validPrices(body.prices)) throw problem('PRICES_INPUT', 400);
    const now = new Date((options.now || Date.now)()).toISOString();
    const catalog = JSON.stringify(body.prices);
    const db = database(env);
    // Compare-and-swap in one SQL statement. Never save a partial price group.
    const statement = body.revision === 0
      ? db.prepare('INSERT INTO site_prices (id, catalog, revision, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(catalog, now)
      : db.prepare('UPDATE site_prices SET catalog = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision').bind(catalog, now, body.revision);
    const saved = await statement.first();
    if (!saved) throw problem('PRICES_CONFLICT', 409);
    return reply({ prices: body.prices, revision: saved.revision, updatedAt: now });
  } catch (error) { return failure(error); }
}

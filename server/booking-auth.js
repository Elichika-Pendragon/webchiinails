/**
 * SERVER ONLY. Owner authentication for the booking approval API, not Calendar
 * authorization. Google Identity Services supplies an ID token after an owner
 * explicitly chooses sign-in. No OAuth client secret or Calendar scope is used.
 *
 * Required server env: SITE_URL (HTTPS origin), GOOGLE_OAUTH_CLIENT_ID,
 * BOOKING_OWNER_EMAIL (one exact email, never a public frontend variable), and
 * BOOKING_AUTH_SECRET (at least 32 random bytes encoded as a string).
 *
 * A signed, HttpOnly 10-minute challenge binds the CSRF token and Google nonce.
 * A successful login replaces it with a signed, HttpOnly seven-day owner session.
 * Neither cookie contains an email or Google token. Changing the allowlist,
 * client ID, origin or signing secret invalidates existing sessions. Sessions
 * are stateless: deleting a cookie signs this browser out; rotating the secret
 * invalidates every session. A request token alone never authorizes a decision.
 *
 * Callers must catch BookingAuthError and return only its code/message/status.
 * Never serialize error causes, request headers, credentials or internal owner
 * identity. No logging, billing, account creation or external setup occurs here.
 *
 * Google verification guidance checked 2026-10-20:
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_COOKIE = '__Secure-chii_booking_owner';
const CHALLENGE_COOKIE = '__Secure-chii_booking_challenge';
const COOKIE_PATH = '/api/booking';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const CHALLENGE_SECONDS = 10 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const jwksCaches = new WeakMap();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const randomValue = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const opaqueValue = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export class BookingAuthError extends Error {
  constructor(code) {
    const errors = {
      AUTH_CONFIG: [503, 'Owner sign-in is not configured.'],
      AUTH_REQUIRED: [401, 'Owner sign-in is required.'],
      AUTH_FORBIDDEN: [403, 'This account cannot approve bookings.'],
      AUTH_CSRF: [403, 'The sign-in or approval session must be refreshed.'],
      AUTH_INPUT: [400, 'Invalid sign-in request.'],
      AUTH_MEDIA: [415, 'Send a JSON request.'],
      AUTH_METHOD: [405, 'This request method is not supported.'],
      AUTH_BODY: [413, 'The sign-in request is too large.'],
      AUTH_TIMEOUT: [503, 'Owner sign-in timed out. Please try again.'],
      AUTH_UNAVAILABLE: [503, 'Owner sign-in is temporarily unavailable.'],
    };
    const [status, message] = errors[code] || errors.AUTH_UNAVAILABLE;
    super(message);
    this.name = 'BookingAuthError';
    this.code = errors[code] ? code : 'AUTH_UNAVAILABLE';
    this.status = status;
  }
}

const fail = code => new BookingAuthError(code);

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value, limit = 16384) {
  if (typeof value !== 'string' || value.length > limit || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw fail('AUTH_REQUIRED');
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
    if (encode(bytes) !== value) throw new Error();
    return bytes;
  } catch { throw fail('AUTH_REQUIRED'); }
}

function decodeJson(value, limit) {
  try {
    const result = JSON.parse(decoder.decode(decode(value, limit)));
    if (!record(result)) throw new Error();
    return result;
  } catch { throw fail('AUTH_REQUIRED'); }
}

function configuration(env, options = {}) {
  if (typeof window !== 'undefined' || !record(env) || !record(options)) throw fail('AUTH_CONFIG');
  const { SITE_URL: site, GOOGLE_OAUTH_CLIENT_ID: clientId, BOOKING_AUTH_SECRET: secret, BOOKING_OWNER_EMAIL: owner } = env;
  let origin;
  try {
    const url = new URL(site);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (site !== url.origin && site !== `${url.origin}/`)) throw new Error();
    origin = url.origin;
  } catch { throw fail('AUTH_CONFIG'); }
  if (typeof clientId !== 'string' || clientId.length > 256 || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)
    || typeof secret !== 'string' || encoder.encode(secret).length < 32 || secret.length > 512 || /[\u0000-\u001f\u007f]/.test(secret)
    || typeof owner !== 'string' || owner.length > 254 || owner !== owner.trim() || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(owner)) throw fail('AUTH_CONFIG');
  const now = options.now ?? Date.now;
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (typeof now !== 'function' || typeof fetcher !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw fail('AUTH_CONFIG');
  let milliseconds;
  try { milliseconds = now(); } catch { throw fail('AUTH_CONFIG'); }
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 253402214400000) throw fail('AUTH_CONFIG');
  return { origin, clientId, secret, ownerEmail: owner.toLowerCase(), now: Math.floor(milliseconds / 1000), fetcher, timeoutMs };
}

function requestContext(request, config, methods) {
  if (!(request instanceof Request) || !methods.includes(request.method)) throw fail('AUTH_METHOD');
  if (new URL(request.url).origin !== config.origin) throw fail('AUTH_FORBIDDEN');
  const origin = request.headers.get('Origin');
  if ((origin && origin !== config.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw fail('AUTH_CSRF');
  if (!['GET', 'HEAD'].includes(request.method) && origin !== config.origin) throw fail('AUTH_CSRF');
}

async function binding(config) {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${config.origin}\0${config.clientId}\0${config.ownerEmail}`))));
}

async function hmacKey(config) {
  return crypto.subtle.importKey('raw', encoder.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signedCookie(payload, config) {
  const data = encode(encoder.encode(JSON.stringify(payload)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(config), encoder.encode(data))));
  return `${data}.${signature}`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  if (header.length > 16384) throw fail('AUTH_REQUIRED');
  const matches = header.split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  if (matches.length > 1) throw fail('AUTH_REQUIRED');
  return matches.length ? matches[0].slice(name.length + 1) : null;
}

async function verifiedCookie(request, name, kind, config) {
  const value = readCookie(request, name);
  if (!value || value.length > 2048) throw fail('AUTH_REQUIRED');
  const parts = value.split('.');
  if (parts.length !== 2) throw fail('AUTH_REQUIRED');
  let valid;
  try { valid = await crypto.subtle.verify('HMAC', await hmacKey(config), decode(parts[1], 64), encoder.encode(parts[0])); }
  catch { throw fail('AUTH_REQUIRED'); }
  if (!valid) throw fail('AUTH_REQUIRED');
  const payload = decodeJson(parts[0], 2000);
  const lifetime = kind === 'owner' ? SESSION_SECONDS : CHALLENGE_SECONDS;
  if (payload.v !== 1 || payload.kind !== kind || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
    || payload.iat > config.now || payload.exp <= config.now || payload.exp - payload.iat !== lifetime
    || payload.binding !== await binding(config) || !opaqueValue(payload.csrf)
    || (kind === 'owner' ? typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub) : !opaqueValue(payload.nonce))) throw fail('AUTH_REQUIRED');
  return payload;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

function response(body, cookies = []) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function checkCsrf(request, payload) {
  if (!opaqueValue(request.headers.get('X-CSRF-Token')) || request.headers.get('X-CSRF-Token') !== payload.csrf) throw fail('AUTH_CSRF');
}

async function boundedJson(message, maximum, badCode, signal) {
  const contentType = message.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) throw fail(badCode === 'AUTH_INPUT' ? 'AUTH_MEDIA' : badCode);
  const length = message.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw fail(badCode === 'AUTH_INPUT' ? 'AUTH_BODY' : badCode);
  if (!message.body) throw fail(badCode);
  const reader = message.body.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw fail('AUTH_TIMEOUT');
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw fail(badCode === 'AUTH_INPUT' ? 'AUTH_BODY' : badCode);
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(decoder.decode(all));
    if (!record(result)) throw new Error();
    return result;
  } catch (error) {
    if (error instanceof BookingAuthError) throw error;
    throw fail(badCode);
  } finally {
    signal?.removeEventListener('abort', cancel);
    // Cancel incomplete oversized streams without waiting for the remote writer.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function withTimeout(work, milliseconds, onTimeout = () => {}) {
  let timeout;
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => { timeout = setTimeout(() => { onTimeout(); reject(fail('AUTH_TIMEOUT')); }, milliseconds); }),
    ]);
  } finally { clearTimeout(timeout); }
}

async function googleKeys(config, kid) {
  let cached = jwksCaches.get(config.fetcher);
  if (cached?.keys && cached.expires > config.now && (cached.keys.has(kid) || config.now - cached.fetched < 30)) return cached.keys;
  if (cached?.pending) return cached.pending;
  const holder = cached || {};
  const controller = new AbortController();
  holder.pending = withTimeout(async () => {
    let upstream;
    try {
      upstream = await config.fetcher(JWKS_URL, { headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (controller.signal.aborted) throw fail('AUTH_TIMEOUT');
      if (!(upstream instanceof Response) || !upstream.ok) throw fail('AUTH_UNAVAILABLE');
      const document = await boundedJson(upstream, 65536, 'AUTH_UNAVAILABLE', controller.signal);
      if (!Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 20) throw fail('AUTH_UNAVAILABLE');
      const keys = new Map();
      for (const key of document.keys) {
        if (!record(key) || key.kty !== 'RSA' || (key.alg && key.alg !== 'RS256') || (key.use && key.use !== 'sig')
          || typeof key.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key.kid) || keys.has(key.kid)
          || typeof key.n !== 'string' || key.n.length > 1024 || typeof key.e !== 'string' || key.e.length > 16 || key.d) throw fail('AUTH_UNAVAILABLE');
        const imported = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        if (imported.algorithm.modulusLength < 2048) throw fail('AUTH_UNAVAILABLE');
        keys.set(key.kid, imported);
      }
      const control = upstream.headers.get('Cache-Control') || '';
      const maxAge = /(?:^|,)\s*max-age=(\d+)(?:\s*,|\s*$)/i.exec(control);
      const seconds = /\bno-store\b|\bno-cache\b/i.test(control) ? 0 : Math.min(Number(maxAge?.[1] ?? 300), 3600);
      if (controller.signal.aborted) throw fail('AUTH_TIMEOUT');
      holder.keys = keys;
      holder.fetched = config.now;
      holder.expires = config.now + seconds;
      return keys;
    } catch (error) {
      if (error instanceof BookingAuthError) throw error;
      throw fail('AUTH_UNAVAILABLE');
    }
  }, config.timeoutMs, () => controller.abort());
  jwksCaches.set(config.fetcher, holder);
  try { return await holder.pending; }
  finally { holder.pending = null; }
}

async function verifiedGoogleToken(credential, nonce, config) {
  if (typeof credential !== 'string' || credential.length > 12288) throw fail('AUTH_REQUIRED');
  const parts = credential.split('.');
  if (parts.length !== 3) throw fail('AUTH_REQUIRED');
  const header = decodeJson(parts[0], 1024);
  const claims = decodeJson(parts[1], 10000);
  if (header.alg !== 'RS256' || (header.typ && header.typ !== 'JWT') || header.crit || header.jku || header.jwk || header.x5u
    || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) throw fail('AUTH_REQUIRED');
  const key = (await googleKeys(config, header.kid)).get(header.kid);
  if (!key) throw fail('AUTH_REQUIRED');
  let valid;
  try { valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2], 1024), encoder.encode(`${parts[0]}.${parts[1]}`)); }
  catch { throw fail('AUTH_REQUIRED'); }
  if (!valid || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== config.clientId
    || (claims.azp && claims.azp !== config.clientId) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
    || claims.iat > config.now + 60 || claims.iat < config.now - 3600 || claims.exp <= config.now
    || claims.exp <= claims.iat || claims.exp - claims.iat > 7200 || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > config.now))
    || typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub) || claims.nonce !== nonce) throw fail('AUTH_REQUIRED');
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  const authoritative = email.endsWith('@gmail.com') || (typeof claims.hd === 'string' && /^[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(claims.hd) && email.endsWith(`@${claims.hd.toLowerCase()}`));
  if (claims.email_verified !== true || email !== config.ownerEmail || !authoritative) throw fail('AUTH_FORBIDDEN');
  return claims.sub;
}

/** GET /api/booking/auth/session. Does not expose the owner email or Google token. */
export async function getAuthChallenge(request, env, options = {}) {
  const config = configuration(env, options);
  requestContext(request, config, ['GET']);
  try {
    const session = await verifiedCookie(request, SESSION_COOKIE, 'owner', config);
    return response({ authenticated: true, csrfToken: session.csrf, clientId: config.clientId, nonce: null, ownerName: 'Chii' });
  } catch (error) {
    if (!(error instanceof BookingAuthError) || error.status !== 401) throw error;
  }
  let challenge;
  try { challenge = await verifiedCookie(request, CHALLENGE_COOKIE, 'challenge', config); }
  catch (error) {
    if (!(error instanceof BookingAuthError) || error.status !== 401) throw error;
    challenge = { v: 1, kind: 'challenge', iat: config.now, exp: config.now + CHALLENGE_SECONDS, binding: await binding(config), csrf: randomValue(), nonce: randomValue() };
  }
  return response({ authenticated: false, csrfToken: challenge.csrf, clientId: config.clientId, nonce: challenge.nonce, ownerName: 'Chii' }, [
    cookie(CHALLENGE_COOKIE, await signedCookie(challenge, config), challenge.exp - config.now),
    cookie(SESSION_COOKIE, '', 0),
  ]);
}

/** POST JSON { credential, nonce } with X-CSRF-Token and the challenge cookie. */
export async function signInOwner(request, env, options = {}) {
  const config = configuration(env, options);
  requestContext(request, config, ['POST']);
  const challenge = await verifiedCookie(request, CHALLENGE_COOKIE, 'challenge', config);
  checkCsrf(request, challenge);
  const controller = new AbortController();
  const body = await withTimeout(() => boundedJson(request, 16384, 'AUTH_INPUT', controller.signal), config.timeoutMs, () => controller.abort());
  if (!opaqueValue(body.nonce) || body.nonce !== challenge.nonce || Object.keys(body).some(key => !['credential', 'nonce'].includes(key))) throw fail('AUTH_CSRF');
  const subject = await verifiedGoogleToken(body.credential, challenge.nonce, config);
  const session = { v: 1, kind: 'owner', iat: config.now, exp: config.now + SESSION_SECONDS, binding: await binding(config), csrf: randomValue(), sub: subject };
  return response({ authenticated: true, csrfToken: session.csrf, ownerName: 'Chii' }, [
    cookie(SESSION_COOKIE, await signedCookie(session, config), SESSION_SECONDS),
    cookie(CHALLENGE_COOKIE, '', 0),
  ]);
}

/** Internal identity only. GET/HEAD read; every mutation also needs Origin+CSRF. */
export async function requireBookingOwner(request, env, options = {}) {
  const config = configuration(env, options);
  requestContext(request, config, ['GET', 'HEAD', 'POST', 'DELETE']);
  const session = await verifiedCookie(request, SESSION_COOKIE, 'owner', config);
  if (!['GET', 'HEAD'].includes(request.method)) checkCsrf(request, session);
  return { email: config.ownerEmail, subject: session.sub, csrfToken: session.csrf };
}

/** DELETE (or POST) with owner session, exact Origin and X-CSRF-Token. */
export async function signOutOwner(request, env, options = {}) {
  if (!(request instanceof Request) || !['POST', 'DELETE'].includes(request.method)) throw fail('AUTH_METHOD');
  await requireBookingOwner(request, env, options);
  return response({ authenticated: false, ownerName: 'Chii' }, [cookie(SESSION_COOKIE, '', 0), cookie(CHALLENGE_COOKIE, '', 0)]);
}

/** SERVER ONLY. Anonymous admission is not customer identity or payment proof. */
export const BOOKING_ADMISSION_LIMITS = Object.freeze({
  sessionLifetimeMs: 2 * 60 * 60 * 1000,
  reservationLifetimeMs: 2 * 60 * 1000,
  receiptBytes: 256 * 1024 * 1024,
  retainedRequests: 20000,
  newRequestsPerDay: 100,
  newRequestsPerSessionDay: 10,
  transformAttemptsPerMonth: 2000,
  transformsPerRequest: 2,
  globalAttemptsPerDay: 500,
  ipAttemptsPerMinute: 40,
  ipAttemptsPerDay: 100,
  sessionAttemptsPerDay: 30,
  globalSessionsPerDay: 500,
  ipSessionsPerMinute: 60,
  ipSessionsPerDay: 100,
});
const COOKIE = '__Host-chii-booking-anon';
const encoder = new TextEncoder();
const DAY = 86400000;
const contexts = new WeakSet();
let signingCache;
const digestPattern = /^[a-f0-9]{64}$/;
const messages = {
  ADMISSION_CONFIG: 'Booking belum tersedia. Silakan hubungi Chii melalui WhatsApp.',
  ADMISSION_REQUIRED: 'Sesi booking perlu diperbarui. Isian tetap tersimpan; muat ulang lalu coba lagi.',
  ADMISSION_RATE_LIMIT: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi atau hubungi Chii.',
  ADMISSION_CHALLENGE: 'Pemeriksaan keamanan perlu diulang. Isian tetap tersimpan; coba lagi.',
  ADMISSION_UNAVAILABLE: 'Pemeriksaan keamanan belum tersedia. Isian tetap tersimpan; coba lagi sebentar.',
  ADMISSION_IN_PROGRESS: 'Permintaan yang sama sedang diproses. Tunggu sebentar lalu coba lagi.',
  ADMISSION_CAPACITY: 'Booking online belum dapat menerima permintaan baru. Isian tetap tersimpan; hubungi Chii melalui WhatsApp.',
};
export class BookingAdmissionError extends Error {
  constructor(code) { const known = Object.hasOwn(messages,code) ? code : 'ADMISSION_UNAVAILABLE'; super(messages[known]); this.name = 'BookingAdmissionError'; this.code = known; this.status = ({ADMISSION_REQUIRED:403,ADMISSION_RATE_LIMIT:429,ADMISSION_CHALLENGE:403,ADMISSION_IN_PROGRESS:409})[known] ?? 503; }
}
const fail = (code, status) => new BookingAdmissionError(code, status);
const toHex = bytes => typeof bytes.toHex === 'function' ? bytes.toHex() : Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const random = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const time = now => { const value = typeof now === 'function' ? now() : now ?? Date.now(); if (!Number.isSafeInteger(value) || value <= 0) throw fail('ADMISSION_CONFIG'); return value; };
function config(env) {
  let url;
  try { url = new URL(env.SITE_URL); } catch { throw fail('ADMISSION_CONFIG'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || typeof env.BOOKING_DB?.prepare !== 'function' || typeof env.BOOKING_DB?.batch !== 'function'
    || typeof env.BOOKING_LINK_SECRET !== 'string' || env.BOOKING_LINK_SECRET.length < 32 || env.BOOKING_LINK_SECRET.length > 4096
    || typeof env.BOOKING_TURNSTILE_SITE_KEY !== 'string' || !/^[A-Za-z0-9_-]{10,128}$/.test(env.BOOKING_TURNSTILE_SITE_KEY)
    || /^[123]x0{10,}/.test(env.BOOKING_TURNSTILE_SITE_KEY)
    || typeof env.BOOKING_TURNSTILE_SECRET_KEY !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(env.BOOKING_TURNSTILE_SECRET_KEY)
    || /^[123]x0{10,}/.test(env.BOOKING_TURNSTILE_SECRET_KEY)) throw fail('ADMISSION_CONFIG');
  return { db: env.BOOKING_DB, secret: env.BOOKING_LINK_SECRET, origin: url.origin, hostname: url.hostname, siteKey: env.BOOKING_TURNSTILE_SITE_KEY, turnstileSecret: env.BOOKING_TURNSTILE_SECRET_KEY };
}
export function isBookingAdmissionConfigured(env) { try { config(env); return true; } catch { return false; } }
async function mac(secret, data) {
  // One current key per isolate. Rotation replaces it; no unbounded secret map.
  if (!signingCache || signingCache.secret !== secret) {
    const entry = {secret,key:crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])};
    signingCache = entry;
    entry.key.catch(() => { if (signingCache === entry) signingCache = null; });
  }
  const key = await signingCache.key;
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}
function same(left, right) { if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false; let difference = 0; for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i); return difference === 0; }
function origin(request, configuration, mutation = false) {
  const value = request.headers.get('Origin');
  if ((mutation && value !== configuration.origin) || (value !== null && value !== configuration.origin)
    || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw fail('ADMISSION_REQUIRED', 403);
}
function ip(request) {
  // Only Cloudflare's edge-provided header is accepted; never X-Forwarded-For.
  const value = request.headers.get('CF-Connecting-IP');
  if (!value || value.length > 64 || !/^[0-9a-fA-F:.]{3,64}$/.test(value)) throw fail('ADMISSION_UNAVAILABLE');
  return value.toLowerCase();
}
function cookieValue(request) {
  const found = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`));
  return found.length === 1 ? found[0].slice(COOKIE.length + 1) : null;
}
async function readSession(request, configuration, current) {
  const value = cookieValue(request);
  if (!value || value.length > 500) return null;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== '1' || !digestPattern.test(parts[1]) || !digestPattern.test(parts[2]) || !/^\d{13}$/.test(parts[3]) || !digestPattern.test(parts[4])) return null;
  const issued = Number(parts[3]);
  if (!Number.isSafeInteger(issued) || issued > current || issued + BOOKING_ADMISSION_LIMITS.sessionLifetimeMs <= current) return null;
  const signature = await mac(configuration.secret, `chiinails:admission:cookie:v1:${configuration.origin}:${parts.slice(0,4).join('.')}`);
  return same(signature, parts[4]) ? { id: parts[1], nonce: parts[2], issued, expiresAt: issued + BOOKING_ADMISSION_LIMITS.sessionLifetimeMs } : null;
}
const dayWindow = current => { const start = Math.floor((current + 25200000) / DAY) * DAY - 25200000; return { start, end: start + DAY, key: String(start) }; };
const monthWindow = current => { const date = new Date(current + 25200000); const start = Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)-25200000; const end = Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)-25200000; return {start,end,key:String(start)}; };
async function batch(db, statements) {
  try { const results = await db.batch(statements); if (!Array.isArray(results) || results.length !== statements.length || results.some(row => row?.success === false)) throw new Error(); return results; }
  catch { throw fail('ADMISSION_UNAVAILABLE'); }
}
async function first(db, sql, values) { try { return await db.prepare(sql).bind(...values).first(); } catch { throw fail('ADMISSION_UNAVAILABLE'); } }
async function limits(configuration, request, current, session, issuing = false) {
  const daily = dayWindow(current);
  const minute = Math.floor(current / 60000);
  const address = ip(request);
  const ipHash = await mac(configuration.secret, `chiinails:admission:ip:v1:${address}`);
  const sessionHash = session ? await mac(configuration.secret, `chiinails:admission:session:v1:${session.id}`) : null;
  const prefix = issuing ? 'issue' : 'attempt';
  const choices = [
    [`${prefix}:global:${daily.key}`, issuing ? BOOKING_ADMISSION_LIMITS.globalSessionsPerDay : BOOKING_ADMISSION_LIMITS.globalAttemptsPerDay, daily.end + DAY],
    [`${prefix}:ip-day:${ipHash}:${daily.key}`, issuing ? BOOKING_ADMISSION_LIMITS.ipSessionsPerDay : BOOKING_ADMISSION_LIMITS.ipAttemptsPerDay, daily.end + DAY, issuing ? BOOKING_ADMISSION_LIMITS.ipSessionsPerMinute : BOOKING_ADMISSION_LIMITS.ipAttemptsPerMinute],
  ];
  if (sessionHash && !issuing) choices.push([`attempt:session:${sessionHash}:${daily.key}`, BOOKING_ADMISSION_LIMITS.sessionAttemptsPerDay, daily.end + DAY]);
  const gateId=random();
  const guard=choices.map(([, , , burstLimit])=>`coalesce((SELECT hits FROM booking_admission_counters WHERE bucket=?),0) < ?${burstLimit ? ' AND coalesce((SELECT CASE WHEN burst_window=? THEN burst_hits ELSE 0 END FROM booking_admission_counters WHERE bucket=?),0) < ?' : ''}`).join(' AND ');
  const guardValues=choices.flatMap(([key,limit,,burstLimit])=>[key,limit,...(burstLimit?[minute,key,burstLimit]:[])]);
  const statements = [
    configuration.db.prepare(`DELETE FROM booking_admission_counters WHERE bucket IN (SELECT bucket FROM booking_admission_counters WHERE expires_at <= ? ORDER BY expires_at LIMIT 64)`).bind(current),
    configuration.db.prepare(`INSERT INTO booking_admission_gates(id) SELECT ? WHERE ${guard}`).bind(gateId,...guardValues),
    ...choices.map(([key,,expires,burstLimit])=>configuration.db.prepare(`INSERT INTO booking_admission_counters(bucket,hits,expires_at,burst_window,burst_hits) SELECT ?,1,?,?,? WHERE EXISTS(SELECT 1 FROM booking_admission_gates WHERE id=?)
      ON CONFLICT(bucket) DO UPDATE SET hits=hits+1,burst_window=excluded.burst_window,
      burst_hits=CASE WHEN burst_window=excluded.burst_window THEN burst_hits+excluded.burst_hits ELSE excluded.burst_hits END`).bind(key,expires,burstLimit?minute:0,burstLimit?1:0,gateId)),
    configuration.db.prepare('DELETE FROM booking_admission_gates WHERE id=?').bind(gateId),
  ];
  const results = await batch(configuration.db, statements);
  if (results[1].meta?.changes !== 1) throw fail('ADMISSION_RATE_LIMIT',429);
  return { address, ipHash, sessionHash };
}

export async function issueBookingAdmission(request, env, {now} = {}) {
  const configuration = config(env), current = time(now);
  origin(request, configuration);
  if (request.method !== 'GET') throw fail('ADMISSION_REQUIRED',403);
  let session = await readSession(request,configuration,current);
  if (!session) {
    await limits(configuration,request,current,null,true);
    session = {id:random(),nonce:random(),issued:current,expiresAt:current+BOOKING_ADMISSION_LIMITS.sessionLifetimeMs};
  }
  const body = `1.${session.id}.${session.nonce}.${session.issued}`;
  const signature = await mac(configuration.secret,`chiinails:admission:cookie:v1:${configuration.origin}:${body}`);
  return Response.json({siteKey:configuration.siteKey,nonce:session.nonce,expiresAt:session.expiresAt,action:'booking'}, {headers:{
    'Set-Cookie':`${COOKIE}=${body}.${signature}; Path=/; Max-Age=${Math.max(1,Math.floor((session.expiresAt-current)/1000))}; Secure; HttpOnly; SameSite=Strict`,
    'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',
  }});
}

export async function preflightBookingAdmission(request, env, {now} = {}) {
  const configuration=config(env), current=time(now);
  origin(request,configuration,true);
  const session=await readSession(request,configuration,current);
  if (!session || !same(request.headers.get('X-Booking-Nonce'),session.nonce)) throw fail('ADMISSION_REQUIRED',403);
  const keys=await limits(configuration,request,current,session);
  const context=Object.freeze({...session,...keys,origin:configuration.origin});
  contexts.add(context);
  return context;
}

async function verifyTurnstile(configuration, context, token, idempotencyHash, payloadHash, fetcher, current) {
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048 || /[^\x21-\x7e]/.test(token)) throw fail('ADMISSION_CHALLENGE',403);
  if (typeof fetcher !== 'function') throw fail('ADMISSION_UNAVAILABLE');
  // The verifier's idempotency key follows this challenge token. A replacement
  // token after expiry/failure must not replay a cached rejected verification.
  const hash=await mac(configuration.secret,`chiinails:admission:siteverify:v1:${context.nonce}:${idempotencyHash}:${payloadHash}:${token}`);
  const retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const controller=new AbortController();
  let timeout;
  try {
    const result=await Promise.race([Promise.resolve().then(async()=>{
      const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:configuration.turnstileSecret,response:token,remoteip:context.address,idempotency_key:retryKey}).toString(),signal:controller.signal});
      if (!response?.ok || !response.body?.getReader) throw new Error();
      const reader=response.body.getReader();let length=0;const chunks=[];
      try { while(true) { const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>16384){await reader.cancel();throw new Error();}chunks.push(part.value); } }
      finally { reader.releaseLock(); }
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return JSON.parse(new TextDecoder().decode(bytes));
    }),new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error());},5000);})]);
    if (!result || result.success !== true || result.hostname !== configuration.hostname || result.action !== 'booking' || result.cdata !== context.nonce
      || !Number.isFinite(Date.parse(result.challenge_ts)) || Date.parse(result.challenge_ts)>current+60000 || Date.parse(result.challenge_ts)<current-300000) throw fail('ADMISSION_CHALLENGE',403);
  } catch(error) { if(error instanceof BookingAdmissionError)throw error;throw fail('ADMISSION_UNAVAILABLE'); }
  finally { clearTimeout(timeout); }
}

// Estimates use the same verified challenge without reserving receipt/booking capacity.
export async function verifyOrderAdmission(env, context, token, requestHash, payloadHash, { fetch: fetcher = globalThis.fetch?.bind(globalThis), now } = {}) {
  const configuration = config(env), current = time(now);
  if (!contexts.has(context) || context.origin !== configuration.origin || context.expiresAt <= current || !digestPattern.test(requestHash) || !digestPattern.test(payloadHash)) throw fail('ADMISSION_REQUIRED');
  await verifyTurnstile(configuration, context, token, requestHash, payloadHash, fetcher, current);
}

export function submissionAdmission(env, context, {turnstileToken,fetch:fetcher=globalThis.fetch?.bind(globalThis),now} = {}) {
  const configuration=config(env);
  if (!context || !contexts.has(context) || context.origin!==configuration.origin) throw fail('ADMISSION_REQUIRED',403);
  return Object.freeze({
    async authorizeNew({idempotencyHash,payloadHash,maxBytes}) {
      const current=time(now);
      if (context.expiresAt<=current || !digestPattern.test(idempotencyHash) || !digestPattern.test(payloadHash) || !Number.isSafeInteger(maxBytes) || maxBytes<4 || maxBytes>512000) throw fail('ADMISSION_REQUIRED',403);
      const existing=await first(configuration.db,'SELECT payload_hash,expires_at FROM booking_admission_reservations WHERE idempotency_hash = ?',[idempotencyHash]);
      if (existing && existing.expires_at>current) throw fail('ADMISSION_IN_PROGRESS',409);
      await verifyTurnstile(configuration,context,turnstileToken,idempotencyHash,payloadHash,fetcher,current);
      const daily=dayWindow(current), monthly=monthWindow(current), reservationId=random();
      const sessionBucket=`new:session:${context.sessionHash}:${daily.key}`;
      const monthBucket=`transform:month:${monthly.key}`;
      const select=`SELECT 1 FROM booking_admission_reservations WHERE idempotency_hash=? AND reservation_id=?`;
      const statements=[
        configuration.db.prepare('DELETE FROM booking_admission_reservations WHERE idempotency_hash=? AND expires_at<=?').bind(idempotencyHash,current),
        configuration.db.prepare(`DELETE FROM booking_admission_reservations WHERE idempotency_hash IN (SELECT idempotency_hash FROM booking_admission_reservations WHERE expires_at <= ? ORDER BY expires_at LIMIT 128)`).bind(current),
        configuration.db.prepare(`INSERT INTO booking_admission_reservations(idempotency_hash,reservation_id,payload_hash,session_hash,max_bytes,created_at,expires_at)
          SELECT ?,?,?,?,?,?,? WHERE
          (SELECT stored_bytes FROM booking_proof_storage WHERE id=1) + coalesce((SELECT sum(max_bytes) FROM booking_admission_reservations WHERE expires_at>?),0) + ? <= ?
          AND (SELECT request_count FROM booking_proof_storage WHERE id=1) + (SELECT count(*) FROM booking_admission_reservations WHERE expires_at>?) < ?
          AND (SELECT count(*) FROM booking_requests WHERE created_at>=? AND created_at<?) + (SELECT count(*) FROM booking_admission_reservations WHERE expires_at>? AND created_at>=? AND created_at<?) < ?
          AND coalesce((SELECT hits FROM booking_admission_counters WHERE bucket=?),0) + (SELECT count(*) FROM booking_admission_reservations WHERE session_hash=? AND expires_at>?) < ?
          AND coalesce((SELECT hits FROM booking_admission_counters WHERE bucket=?),0) + ? <= ?
          ON CONFLICT(idempotency_hash) DO NOTHING`).bind(idempotencyHash,reservationId,payloadHash,context.sessionHash,maxBytes,current,current+BOOKING_ADMISSION_LIMITS.reservationLifetimeMs,
          current,maxBytes,BOOKING_ADMISSION_LIMITS.receiptBytes,current,BOOKING_ADMISSION_LIMITS.retainedRequests,daily.start,daily.end,current,daily.start,daily.end,BOOKING_ADMISSION_LIMITS.newRequestsPerDay,
          sessionBucket,context.sessionHash,current,BOOKING_ADMISSION_LIMITS.newRequestsPerSessionDay,monthBucket,BOOKING_ADMISSION_LIMITS.transformsPerRequest,BOOKING_ADMISSION_LIMITS.transformAttemptsPerMonth),
        configuration.db.prepare(`INSERT INTO booking_admission_counters(bucket,hits,expires_at) SELECT ?,?,? WHERE EXISTS(${select})
          ON CONFLICT(bucket) DO UPDATE SET hits=hits+excluded.hits`).bind(monthBucket,BOOKING_ADMISSION_LIMITS.transformsPerRequest,monthly.end+DAY,idempotencyHash,reservationId),
      ];
      await batch(configuration.db,statements);
      const reservation=await first(configuration.db,'SELECT reservation_id,payload_hash,expires_at FROM booking_admission_reservations WHERE idempotency_hash=?',[idempotencyHash]);
      if (!reservation) throw fail('ADMISSION_CAPACITY');
      if (reservation.reservation_id!==reservationId) throw fail('ADMISSION_IN_PROGRESS',409);
      let attempts=0;
      return Object.freeze({
        maxAttempts:BOOKING_ADMISSION_LIMITS.transformsPerRequest,
        consumeTransformAttempt() { if(++attempts>BOOKING_ADMISSION_LIMITS.transformsPerRequest)throw fail('ADMISSION_CAPACITY'); },
        insertCondition(currentTime) { return {sql:`EXISTS(SELECT 1 FROM booking_admission_reservations WHERE idempotency_hash=? AND reservation_id=? AND expires_at>?)`,values:[idempotencyHash,reservationId,currentTime]}; },
        finalizeStatements(requestId) { return [
          configuration.db.prepare(`INSERT INTO booking_admission_counters(bucket,hits,expires_at) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM booking_requests WHERE id=?) AND EXISTS(${select})
            ON CONFLICT(bucket) DO UPDATE SET hits=hits+1`).bind(sessionBucket,daily.end+DAY,requestId,idempotencyHash,reservationId),
          configuration.db.prepare('DELETE FROM booking_admission_reservations WHERE idempotency_hash=? AND reservation_id=?').bind(idempotencyHash,reservationId),
        ]; },
        async release() { await batch(configuration.db,[configuration.db.prepare('DELETE FROM booking_admission_reservations WHERE idempotency_hash=? AND reservation_id=?').bind(idempotencyHash,reservationId)]); },
      });
    },
  });
}

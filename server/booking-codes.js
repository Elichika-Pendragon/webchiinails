/** SERVER ONLY. Reusable customer codes authorize requests, never Calendar approval. */
import { normalizeWhatsApp } from './booking.js';
import { BookingAuthError, requireBookingOwner } from './booking-auth.js';
import { preflightBookingAdmission } from './booking-admission.js';

export const BOOKING_CODE_LIMITS = Object.freeze({ cooldownMs: 900000, windowMs: 86400000, requestsPerWindow: 3 });
import { generateBookingCode, normalizeBookingCode } from '../src/booking-code.js';
const permits = new WeakSet();
const known = {
  BOOKING_CODE_REQUIRED: [403, 'Kode atau nomor WhatsApp belum sesuai. Minta kode booking dari Chii setelah konsultasi.'],
  BOOKING_CODE_BUSY: [429, 'Masih ada permintaan atau booking aktif, atau batas pengiriman tercapai. Tunggu minimal 15 menit; maksimal 3 permintaan baru dalam 24 jam. Hubungi Chii jika perlu perubahan.'],
  BOOKING_CODE_INPUT: [400, 'Periksa nama dan nomor WhatsApp Indonesia.'],
  BOOKING_CODE_UNAVAILABLE: [503, 'Kode booking belum dapat diperiksa. Isian tetap tersimpan; coba lagi sebentar.'],
};
export class BookingCodeError extends Error {
  constructor(code) { const value = known[code] ? code : 'BOOKING_CODE_UNAVAILABLE'; super(known[value][1]); this.code = value; this.status = known[value][0]; }
}
const fail = code => new BookingCodeError(code);
const time = now => { const value = typeof now === 'function' ? now() : now ?? Date.now(); if (!Number.isSafeInteger(value) || value < 1) throw fail(); return value; };
const normalizeCode = normalizeBookingCode;
function config(env) {
  if (typeof env?.BOOKING_DB?.prepare !== 'function' || typeof env.BOOKING_DB.batch !== 'function' || typeof env.BOOKING_LINK_SECRET !== 'string' || env.BOOKING_LINK_SECRET.length < 32) throw fail();
  return env.BOOKING_DB;
}
async function hash(env, code) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BOOKING_LINK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`chii:booking-code:v1:${code}`))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function first(db, sql, values = []) { try { return await db.prepare(sql).bind(...values).first(); } catch { throw fail(); } }
const publicRow = row => ({ id: row.id, name: row.customer_name, whatsapp: row.whatsapp, active: row.revoked_at === null, updatedAt: row.updated_at });
export async function issueBookingCode(env, { name, whatsapp }, { now } = {}) {
  const db = config(env), current = time(now), phone = normalizeWhatsApp(whatsapp);
  if (!phone || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw fail('BOOKING_CODE_INPUT');
  const code = normalizeCode(generateBookingCode());
  const digest = await hash(env, code);
  const row = await first(db, `INSERT INTO booking_access_codes(id,whatsapp,customer_name,code_hash,created_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(whatsapp) DO UPDATE SET customer_name=excluded.customer_name,code_hash=excluded.code_hash,updated_at=excluded.updated_at,revoked_at=NULL RETURNING *`,
  [crypto.randomUUID(), phone, name.trim(), digest, current, current]);
  if (!row) throw fail();
  return { customer: publicRow(row), code: code.match(/.{4}/g).join('-') };
}
export async function verifyBookingCode(env, code, whatsapp, { now } = {}) {
  const db = config(env), normalized = normalizeCode(code), phone = normalizeWhatsApp(whatsapp);
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(normalized) || !phone) throw fail('BOOKING_CODE_REQUIRED');
  const digest = await hash(env, normalized);
  const row = await first(db, 'SELECT id FROM booking_access_codes WHERE code_hash=? AND whatsapp=? AND revoked_at IS NULL', [digest, phone]);
  if (!row) throw fail('BOOKING_CODE_REQUIRED');
  const current = () => time(now);
  const condition = at => ({
    sql: `EXISTS(SELECT 1 FROM booking_access_codes c WHERE c.id=? AND c.code_hash=? AND c.whatsapp=? AND c.revoked_at IS NULL
      AND (c.last_request_at IS NULL OR c.last_request_at<=?)
      AND (SELECT count(*) FROM booking_code_requests u WHERE u.code_id=c.id AND u.created_at>?) < ?
      AND NOT EXISTS(SELECT 1 FROM booking_requests r WHERE r.whatsapp=c.whatsapp AND
        (r.status IN ('approving','reconcile') OR (r.status='pending' AND r.expires_at>?) OR (r.status='accepted' AND r.start_ms+r.duration_minutes*60000>?))))`,
    values: [row.id, digest, phone, at - BOOKING_CODE_LIMITS.cooldownMs, at - BOOKING_CODE_LIMITS.windowMs, BOOKING_CODE_LIMITS.requestsPerWindow, at, at],
  });
  const permit = Object.freeze({
    async assertNewAllowed() { const gate=condition(current()); if (!await first(db,`SELECT 1 AS allowed WHERE ${gate.sql}`,gate.values)) throw fail('BOOKING_CODE_BUSY'); },
    condition,
    finalizeStatements(requestId) { return [
      db.prepare('INSERT INTO booking_code_requests(request_id,code_id,created_at) SELECT id,?,created_at FROM booking_requests WHERE id=?').bind(row.id,requestId),
      db.prepare('UPDATE booking_access_codes SET last_request_at=(SELECT created_at FROM booking_requests WHERE id=?) WHERE id=? AND EXISTS(SELECT 1 FROM booking_requests WHERE id=?)').bind(requestId,row.id,requestId),
    ]; },
  });
  permits.add(permit); return permit;
}
export function withBookingCodeAdmission(admission, permit) {
  if (!permits.has(permit) || typeof admission?.authorizeNew !== 'function') throw fail();
  return { async authorizeNew(args) {
    await permit.assertNewAllowed();
    const ticket = await admission.authorizeNew(args);
    return { ...ticket,
      insertCondition(current) { const base=ticket.insertCondition(current), gate=permit.condition(current); return {sql:`(${base.sql}) AND (${gate.sql})`,values:[...base.values,...gate.values]}; },
      finalizeStatements(id) { return [...ticket.finalizeStatements(id),...permit.finalizeStatements(id)]; },
    };
  } };
}
const headers = { 'Content-Type':'application/json', 'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex, nofollow', 'X-Content-Type-Options':'nosniff', 'Cross-Origin-Resource-Policy':'same-origin', Vary:'Cookie' };
const reply = (data,status=200) => Response.json(data,{status,headers});
async function body(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') throw fail('BOOKING_CODE_INPUT');
  if (Number(request.headers.get('Content-Length'))>1024) throw fail('BOOKING_CODE_INPUT');
  const reader=request.body?.getReader(); if(!reader)throw fail('BOOKING_CODE_INPUT');
  const chunks=[];let length=0,timer;
  try {
    return await Promise.race([(async()=>{
      while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>1024){await reader.cancel();throw fail('BOOKING_CODE_INPUT');}chunks.push(part.value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!result||Array.isArray(result)||typeof result!=='object')throw fail('BOOKING_CODE_INPUT');return result;
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(fail());},5000);})]);
  } catch(error){if(error instanceof BookingCodeError)throw error;throw fail('BOOKING_CODE_INPUT');} finally{clearTimeout(timer);reader.releaseLock();}
}
function errorResponse(error) {
  const safe=error instanceof BookingAuthError || error instanceof BookingCodeError ? error : error?.name==='BookingAdmissionError' ? error : fail();
  return reply({code:safe.code,message:safe.message},safe.status);
}
export async function handleBookingCodeCheck(request,env,options={}) {
  try {
    if(env.BOOKING_ENABLED!=='true'||request.method!=='POST'||new URL(request.url).search)throw fail('BOOKING_CODE_REQUIRED');
    await preflightBookingAdmission(request,env,options);
    const input=await body(request);if(Object.keys(input).sort().join(',')!=='code,whatsapp')throw fail('BOOKING_CODE_INPUT');
    await verifyBookingCode(env,input.code,input.whatsapp,options);
    return reply({valid:true});
  }catch(error){return errorResponse(error);}
}
export async function handleOwnerBookingCodes(request,env,options={}) {
  try {
    if(!['GET','POST'].includes(request.method)||new URL(request.url).search)throw fail('BOOKING_CODE_INPUT');
    await requireBookingOwner(request,env,options.auth);
    const db=config(env);
    if(request.method==='GET'){
      const result=await db.prepare('SELECT id,customer_name,whatsapp,updated_at,revoked_at FROM booking_access_codes ORDER BY updated_at DESC LIMIT 50').all();
      if(!Array.isArray(result?.results))throw fail();return reply({customers:result.results.map(publicRow)});
    }
    const input=await body(request);
    if(input.action==='issue'&&Object.keys(input).sort().join(',')==='action,name,whatsapp')return reply(await issueBookingCode(env,input,options));
    if(input.action==='revoke'&&Object.keys(input).sort().join(',')==='action,id'&&typeof input.id==='string'&&/^[a-f0-9-]{36}$/.test(input.id)){
      const row=await first(db,'UPDATE booking_access_codes SET revoked_at=?,updated_at=? WHERE id=? RETURNING id',[time(options.now),time(options.now),input.id]);
      if(!row)throw fail('BOOKING_CODE_INPUT');return reply({revoked:true});
    }
    throw fail('BOOKING_CODE_INPUT');
  }catch(error){return errorResponse(error);}
}

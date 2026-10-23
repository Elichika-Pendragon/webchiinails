import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {getAuthChallenge,signInOwner} from './booking-auth.js';
import {issueBookingCode,verifyBookingCode,withBookingCodeAdmission,handleOwnerBookingCodes,handleBookingCodeCheck} from './booking-codes.js';
import {createBookingRequest} from './booking-requests.js';
import {createBookingHttpHandlers} from './booking-http.js';
import {generateBookingCode,validBookingCode} from '../src/booking-code.js';
import {syntheticAdmission,syntheticNormalization} from './fixtures/synthetic-admission.js';
import {proof} from './fixtures/payment-proof.js';
const authEnv = { SITE_URL: 'https://synthetic.example', GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com', BOOKING_OWNER_EMAIL: 'owner.synthetic@gmail.com', BOOKING_AUTH_SECRET: 'synthetic-test-signing-secret-with-more-than-32-bytes' };
const now = Date.parse('2026-10-23T02:00:00Z');
const auth = { now: () => now };
const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
const base64 = data => Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)).toString('base64url');
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
function request(path = '/api/booking/prices', { method = 'GET', cookie: value, csrf, body, origin = authEnv.SITE_URL, headers = {} } = {}) {
  return new Request(`${authEnv.SITE_URL}${path}`, { method, headers: { ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(value ? { Cookie: value } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}
async function owner(email = authEnv.BOOKING_OWNER_EMAIL) {
  const challenge = await getAuthChallenge(request('/api/booking/auth/session'), authEnv, auth);
  const data = await challenge.json();
  const unsigned = `${base64({ alg: 'RS256', kid: 'test' })}.${base64({ iss: 'https://accounts.google.com', aud: authEnv.GOOGLE_OAUTH_CLIENT_ID, iat: now / 1000, exp: now / 1000 + 600, sub: 'synthetic-owner', email, email_verified: true, nonce: data.nonce })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(unsigned));
  const response = await signInOwner(request('/api/booking/auth/session', { method: 'POST', cookie: cookie(challenge, '__Secure-chii_booking_challenge'), csrf: data.csrfToken, body: { credential: `${unsigned}.${Buffer.from(signature).toString('base64url')}`, nonce: data.nonce } }), authEnv, { ...auth, fetch: async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] }), { headers: { 'Content-Type': 'application/json' } }) });
  return { cookie: cookie(response, '__Secure-chii_booking_owner'), csrf: (await response.json()).csrfToken };
}
const signedOwner = await owner();

class D1 {
 constructor(){this.calls=0;this.sqlite=new DatabaseSync(':memory:');for(const file of ['0001-booking','0002-booking-payment','0003-booking-duration','0004-booking-payment-proofs','0005-booking-calendar-sync-index','0006-booking-manual-payment','0010-booking-access-codes'])this.sqlite.exec(readFileSync(new URL(`../migrations/${file}.sql`,import.meta.url),'utf8'));}
 prepare(sql){this.calls++;const db=this.sqlite;return {sql,values:[],bind(...values){return {...this,values};},async first(){return db.prepare(this.sql).get(...this.values)||null;},async all(){return {results:db.prepare(this.sql).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const result=statements.map(s=>({success:true,meta:{changes:Number(this.sqlite.prepare(s.sql).run(...s.values).changes)}}));this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function fixture(){const db=new D1();return {db,env:{...authEnv,BOOKING_ENABLED:'true',BOOKING_DB:db,BOOKING_LINK_SECRET:'synthetic-code-signing-secret-for-tests-only'}};}
const customer={name:'Synthetic Customer',whatsapp:'081234567890'};
const issued=f=>issueBookingCode(f.env,customer,{now});
const verify=(f,code,phone=customer.whatsapp,at=now)=>verifyBookingCode(f.env,code,phone,{now:at});
const api=(f,body,options={})=>handleOwnerBookingCodes(request('/api/booking/codes',{...signedOwner,...options,...(body?{method:'POST',body}:{} )}),f.env,{auth,now:()=>now});
const input=key=>({...customer,agreedPrice:'100000',paymentMode:'deposit',deposit:'20000',designType:'simple',durationMinutes:'120',date:'2026-10-24',time:'10:00',idempotencyKey:key,proof});
const calendar={async availability(){return {busyIntervals:[]};}};
async function submit(f,code,key,at=now,normal=syntheticNormalization){const permit=await verify(f,code,customer.whatsapp,at);return createBookingRequest(f.env,input(key),{now:()=>at,calendar,admission:withBookingCodeAdmission(syntheticAdmission,permit),normalizeProof:normal});}
test('only owner-issued private codes authorize a matching phone, with no public-code activation',async()=>{
 const f=fixture(),unknown=generateBookingCode();assert(validBookingCode(unknown));
 await assert.rejects(verify(f,unknown),e=>e.code==='BOOKING_CODE_REQUIRED');
 assert.equal((await api(f,{action:'issue',...customer,code:unknown})).status,400);
 const response=await api(f,{action:'issue',...customer});assert.equal(response.status,200);const value=await response.json();assert(validBookingCode(value.code));
 await verify(f,value.code);await verify(f,value.code.toLowerCase());
 await assert.rejects(verify(f,value.code,'081234567891'),e=>e.code==='BOOKING_CODE_REQUIRED');
 const rows=f.db.sqlite.prepare('SELECT * FROM booking_access_codes').all();assert.equal(rows.length,1);assert(!JSON.stringify(rows).includes(value.code.replaceAll('-','')));
});
test('owner code API rejects anonymous accounts, forged sessions, other Google accounts and missing CSRF before DB access',async()=>{
 const f=fixture();for(const options of [{cookie:undefined},{cookie:'__Secure-chii_booking_owner=forged'}]){assert.equal((await api(f,null,options)).status,401);}
 assert.equal(f.db.calls,0);await assert.rejects(owner('unrelated@gmail.com'),e=>e.code==='AUTH_FORBIDDEN');
 assert.equal((await api(f,{action:'issue',...customer},{csrf:undefined})).status,403);assert.equal(f.db.calls,0);
 assert.equal((await api(f,{action:'issue',...customer})).status,200);
 const listed=await api(f);const text=await listed.text();assert(!text.includes('code_hash'));assert(!text.includes('last_request_at'));assert.match(listed.headers.get('Cache-Control'),/no-store/);
});
test('rotation and revocation invalidate the old code without deleting requests or resetting customer identity',async()=>{
 const f=fixture(),one=await issued(f),two=await issued(f);assert.equal(one.customer.id,two.customer.id);assert.notEqual(one.code,two.code);
 await assert.rejects(verify(f,one.code),e=>e.code==='BOOKING_CODE_REQUIRED');await verify(f,two.code);
 assert.equal((await api(f,{action:'revoke',id:two.customer.id})).status,200);await assert.rejects(verify(f,two.code),e=>e.code==='BOOKING_CODE_REQUIRED');
});
test('a code never self-approves; pending creates no slot claim and identical retries stay immutable',async()=>{
 const f=fixture(),item=await issued(f);const result=await submit(f,item.code,'synthetic-code-request-001');assert.equal(result.status,'pending');
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_slot_claims').get().n,0);
 const again=await submit(f,item.code,'synthetic-code-request-001');assert.equal(again.requestId,result.requestId);
 await assert.rejects(submit(f,item.code,'synthetic-code-request-002'),e=>e.code==='BOOKING_CODE_BUSY');
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_requests').get().n,1);
});
test('racing distinct submissions atomically create only one request and receipt',async()=>{
 const f=fixture(),item=await issued(f);let arrivals=0,release;const barrier=new Promise(r=>{release=r;});
 const normalize=async(...args)=>{if(++arrivals===2)release();await barrier;return syntheticNormalization(...args);};
 const result=await Promise.allSettled([submit(f,item.code,'synthetic-code-race-001',now,normalize),submit(f,item.code,'synthetic-code-race-002',now,normalize)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_requests').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_proofs').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_code_requests').get().n,1);
});
test('cooldown and rolling 24-hour quota survive code rotation; the code remains reusable later',async()=>{
 const f=fixture(),item=await issued(f);let at=now;
 for(let i=0;i<3;i++){await submit(f,item.code,`synthetic-code-limit-00${i}`,at);f.db.sqlite.prepare("UPDATE booking_requests SET status='cancelled'").run();if(i===0)await assert.rejects(submit(f,item.code,'synthetic-code-too-fast',at+1000),e=>e.code==='BOOKING_CODE_BUSY');at+=900001;}
 const rotated=await issued(f);await assert.rejects(submit(f,rotated.code,'synthetic-code-limit-004',at),e=>e.code==='BOOKING_CODE_BUSY');await submit(f,rotated.code,'synthetic-code-next-day',now+86400001);
});
test('revocation between validation and commit prevents insertion',async()=>{
 const f=fixture(),item=await issued(f),permit=await verify(f,item.code);const admission=withBookingCodeAdmission(syntheticAdmission,permit);const ticket=await admission.authorizeNew({});
 await api(f,{action:'revoke',id:item.customer.id});const gate=ticket.insertCondition(now);assert.equal(await f.db.prepare(`SELECT 1 WHERE ${gate.sql}`).bind(...gate.values).first(),null);
});
test('public code verification rejects missing session and cross-site probes without leaking customer details',async()=>{
 const f=fixture();const response=await handleBookingCodeCheck(request('/api/booking/access',{method:'POST',body:{code:generateBookingCode(),whatsapp:customer.whatsapp}}),f.env);assert.notEqual(response.status,200);const text=await response.text();assert(!text.includes(customer.name));
});

test('production HTTP gate rejects a missing or self-generated inactive code before ledger or Calendar work',async()=>{
 const f=fixture();let creates=0,calendars=0;
 const provider={availability(){},createApprovedAppointment(){},reconcileApprovedAppointment(){},readAppointmentState(){},verifyCalendarWriteAccess(){}};
 const handlers=createBookingHttpHandlers({now:()=>now,isSubmissionEnabled:()=>true,preflightBookingAdmission:async()=>({}),submissionAdmission:()=>syntheticAdmission,createGoogleCalendarProvider:()=>{calendars++;return provider;},createBookingRequest:async()=>{creates++;return {status:'pending'};}});
 const send=code=>{const data=input('synthetic-http-gate-001');delete data.proof;data.turnstileToken='synthetic';if(code!==undefined)data.bookingCode=code;const form=new FormData();form.set('booking',JSON.stringify(data));form.set('proof',new Blob([Buffer.from(proof.base64,'base64')],{type:'image/jpeg'}),'receipt.jpg');return handlers.requests(new Request(`${f.env.SITE_URL}/api/booking/requests`,{method:'POST',headers:{Origin:f.env.SITE_URL},body:form}),f.env);};
 for(const code of [undefined,generateBookingCode()]){const response=await send(code);assert.equal(response.status,403);assert.equal((await response.json()).code,'BOOKING_CODE_REQUIRED');}
 assert.equal(creates,0);assert.equal(calendars,0);
 const item=await issued(f);assert.equal((await send(item.code)).status,201);assert.equal(creates,1);
});
test('a failed code-ledger write rolls back the request and receipt together',async()=>{
 const f=fixture(),item=await issued(f);
 f.db.sqlite.exec("CREATE TRIGGER synthetic_code_failure BEFORE INSERT ON booking_code_requests BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;");
 await assert.rejects(submit(f,item.code,'synthetic-code-rollback-001'),e=>e.code==='BOOKING_STORAGE');
 for(const table of ['booking_requests','booking_payment_proofs','booking_code_requests'])assert.equal(f.db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 assert.equal(f.db.sqlite.prepare('SELECT last_request_at FROM booking_access_codes').get().last_request_at,null);
});

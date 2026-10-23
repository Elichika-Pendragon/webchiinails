import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {getAuthChallenge,signInOwner} from './booking-auth.js';
import {createBookingRequest} from './booking-requests.js';
import {createBookingHttpHandlers} from './booking-http.js';
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
 constructor(){this.calls=0;this.sqlite=new DatabaseSync(':memory:');for(const file of ['0001-booking','0002-booking-payment','0003-booking-duration','0004-booking-payment-proofs','0005-booking-calendar-sync-index','0006-booking-manual-payment','0007-booking-admission','0008-booking-occupancy-cache','0009-site-prices','0010-booking-access-codes','0011-order-estimates','0012-booking-payment-events'])this.sqlite.exec(readFileSync(new URL(`../migrations/${file}.sql`,import.meta.url),'utf8'));}
 prepare(sql){this.calls++;const db=this.sqlite;return {sql,values:[],bind(...values){return {...this,values};},async first(){return db.prepare(this.sql).get(...this.values)||null;},async all(){return {results:db.prepare(this.sql).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const result=statements.map(s=>({success:true,meta:{changes:Number(this.sqlite.prepare(s.sql).run(...s.values).changes)}}));this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function fixture(){const db=new D1();return {db,env:{...authEnv,BOOKING_ENABLED:'true',BOOKING_DB:db,BOOKING_LINK_SECRET:'synthetic-code-signing-secret-for-tests-only', BOOKING_TURNSTILE_SITE_KEY:'synthetic_site_key_0123456789', BOOKING_TURNSTILE_SECRET_KEY:'synthetic_turnstile_secret_0123456789'}};}

import {recordBookingSettlement,issueBookingReceipt,readBookingReceipt} from './booking-requests.js';
import {handleReceipt} from './booking-receipts.js';
const verifiedOwner={email:authEnv.BOOKING_OWNER_EMAIL,subject:'synthetic-owner',verified:true};
const calendar={async availability(){return {busyIntervals:[]};}};
async function booking(status='accepted',paymentMode='deposit'){
 const f=fixture();const created=await createBookingRequest(f.env,{name:'Synthetic Customer',whatsapp:'081234567890',agreedPrice:'100000',paymentMode,deposit:paymentMode==='full'?'100000':'30000',designType:'simple',durationMinutes:'120',date:'2026-10-24',time:'10:00',idempotencyKey:'synthetic-payment-booking-001',proof},{now:()=>now,calendar,admission:syntheticAdmission,normalizeProof:syntheticNormalization});
 f.token=new URL(created.reviewUrl).searchParams.get('r');f.id=created.requestId;
 if(status!=='pending')f.db.sqlite.prepare("UPDATE booking_requests SET status=?,calendar_event_id=? WHERE id=?").run(status,status==='accepted'?'synthetic-event':null,f.id);
 f.settle=(options={})=>recordBookingSettlement(f.env,f.token,{owner:verifiedOwner,now:()=>now+2*86400000,confirmed:true,expectedAmount:70000,...options});
 f.issue=(options={})=>issueBookingReceipt(f.env,f.token,{owner:verifiedOwner,now:()=>now,...options});
 f.read=async link=>readBookingReceipt(f.env,new URLSearchParams(new URL(link).hash.slice(1)).get('r'),{now:()=>now+2*86400000});
 f.http=(body,options={},settle=true)=>handleReceipt(request(settle?'/api/booking/settle':'/api/booking/receipt-issue',{...signedOwner,...options,method:'POST',body}),f.env,{auth,now:()=>now+2*86400000},true,settle);
 return f;
}
test('same review and customer receipt links survive service completion and show the newly recorded balance',async()=>{
 const f=await booking(),link=(await f.issue()).receiptUrl,before=await f.read(link),original=f.db.sqlite.prepare('SELECT * FROM booking_requests').get();
 assert.equal(before.receipt.paidAmount,30000);assert.equal(before.receipt.amountDue,70000);
 const result=await f.settle();assert.equal(result.payment.paidAmount,100000);assert.equal(result.payment.amountDue,0);assert(result.payment.settledAt);
 assert.equal((await f.issue()).receiptUrl,link);const after=await f.read(link);assert.equal(after.receipt.paidAmount,100000);assert.equal(after.receipt.amountDue,0);
 assert.equal(after.receipt.deposit,30000);assert.equal(after.receipt.remainingBalance,70000);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM booking_requests').get(),original);
 const event=f.db.sqlite.prepare('SELECT * FROM booking_payment_events').get();assert.equal(event.amount,70000);assert.equal(event.recorded_by,'synthetic-owner');assert.equal(event.kind,'balance_received');
});
test('double taps and racing payment confirmations record one immutable balance event',async()=>{
 const f=await booking();const results=await Promise.all([f.settle(),f.settle()]);assert(results.every(x=>x.payment.paidAmount===100000));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_events').get().n,1);
 const original=f.db.sqlite.prepare('SELECT * FROM booking_payment_events').get();await f.settle({now:()=>now+3*86400000});assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM booking_payment_events').get(),original);
});
test('pending/cancelled/full-paid bookings and unconfirmed or wrong amounts cannot be settled',async()=>{
 for(const status of ['pending','cancelled']){const f=await booking(status);await assert.rejects(f.settle(),e=>e.code==='REQUEST_STATE');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_events').get().n,0);}
 const f=await booking();for(const options of [{confirmed:false},{expectedAmount:1},{expectedAmount:'70000'},{expectedAmount:0}])await assert.rejects(f.settle(options),e=>e.code==='REQUEST_STATE');
 const full=await booking('accepted','full');assert.equal((await full.issue()).payment.amountDue,0);await assert.rejects(full.settle({expectedAmount:0}),e=>e.code==='REQUEST_STATE');
});
test('only the exact owner can record payment and the public receipt token never authorizes a mutation',async()=>{
 const f=await booking();for(const owner of [undefined,{...verifiedOwner,email:'random@gmail.com'},{...verifiedOwner,verified:false}])await assert.rejects(f.settle({owner}),e=>e.code==='BOOKING_OWNER');
 const customerToken=new URLSearchParams(new URL((await f.issue()).receiptUrl).hash.slice(1)).get('r');await assert.rejects(recordBookingSettlement(f.env,customerToken,{owner:verifiedOwner,now,confirmed:true,expectedAmount:70000}),e=>e.code==='REQUEST_NOT_FOUND');
});
test('a cancelled receipt requires owner confirmation, shows paid funds and has no amount due',async()=>{
 const f=await booking('cancelled');await assert.rejects(f.issue(),e=>e.code==='REQUEST_STATE');
 const issued=await f.issue({confirmPayment:true}),receipt=(await f.read(issued.receiptUrl)).receipt;
 assert.equal(receipt.status,'cancelled');assert.equal(receipt.paidAmount,30000);assert.equal(receipt.amountDue,null);assert.equal(receipt.settledAt,null);
 assert(!JSON.stringify(receipt).includes('recorded_by'));await f.issue({confirmPayment:true});assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_events').get().n,1);
});
test('owner settlement HTTP enforces login, CSRF and same origin before reading or changing payment data',async()=>{
 const f=await booking(),body={token:f.token,confirmed:true,expectedAmount:70000};
 assert.equal((await f.http(body,{cookie:undefined})).status,401);assert.equal((await f.http(body,{csrf:undefined})).status,403);assert.equal((await f.http(body,{origin:'https://attacker.example'})).status,403);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_events').get().n,0);
 const response=await f.http(body);assert.equal(response.status,200);assert.equal((await response.json()).payment.amountDue,0);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('malformed settlement requests and caller-supplied paid flags cannot alter payment records',async()=>{
 const f=await booking();for(const body of [{token:f.token},{token:f.token,confirmed:true,expectedAmount:70000,paid:true},{token:f.token,confirmed:false,expectedAmount:70000},{token:f.token,confirmed:true,expectedAmount:90000}])assert.notEqual((await f.http(body)).status,200);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_payment_events').get().n,0);
});
test('cancellation receipt preparation has owner/CSRF boundaries and never claims a refund',async()=>{
 const f=await booking('cancelled');const response=await f.http({token:f.token,confirmPayment:true},{},false);assert.equal(response.status,200);const receipt=(await f.read((await response.json()).receiptUrl)).receipt;assert.equal(receipt.amountDue,null);assert(!('refunded' in receipt));
});

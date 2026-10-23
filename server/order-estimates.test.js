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
 constructor(){this.calls=0;this.sqlite=new DatabaseSync(':memory:');for(const file of ['0001-booking','0002-booking-payment','0003-booking-duration','0004-booking-payment-proofs','0005-booking-calendar-sync-index','0006-booking-manual-payment','0007-booking-admission','0008-booking-occupancy-cache','0009-site-prices','0010-booking-access-codes','0011-order-estimates'])this.sqlite.exec(readFileSync(new URL(`../migrations/${file}.sql`,import.meta.url),'utf8'));}
 prepare(sql){this.calls++;const db=this.sqlite;return {sql,values:[],bind(...values){return {...this,values};},async first(){return db.prepare(this.sql).get(...this.values)||null;},async all(){return {results:db.prepare(this.sql).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const result=statements.map(s=>({success:true,meta:{changes:Number(this.sqlite.prepare(s.sql).run(...s.values).changes)}}));this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function fixture(){const db=new D1();return {db,env:{...authEnv,BOOKING_ENABLED:'true',BOOKING_DB:db,BOOKING_LINK_SECRET:'synthetic-code-signing-secret-for-tests-only', BOOKING_TURNSTILE_SITE_KEY:'synthetic_site_key_0123456789', BOOKING_TURNSTILE_SECRET_KEY:'synthetic_turnstile_secret_0123456789'}};}

import {handlePublicOrders,handleOwnerOrders} from './order-estimates.js';
import {issueBookingAdmission} from './booking-admission.js';
import {randomOrderCode,validOrderCode,normalizeOrderCode,orderChoices} from '../src/order-code.js';
import {estimatePayment} from '../src/order-payment.js';
import {handleReceipt} from './booking-receipts.js';
const choice={selections:[{id:'nail-art-0',quantity:1}],kit:false,glue:false};
const create=(i=1,choices=choice)=>({action:'create',key:`00000000-0000-4000-a000-${String(i).padStart(12,'0')}`,choices,token:'good'});
async function setup(){
 const f=fixture();
 const initial=await issueBookingAdmission(request('/api/booking/admission',{headers:{'CF-Connecting-IP':'198.51.100.42'}}),f.env,{now});
 const session=await initial.json(),anon=initial.headers.get('Set-Cookie').split(';')[0];f.random=randomOrderCode;
 f.public=(body,options={})=>handlePublicOrders(request('/api/booking/orders',{method:'POST',cookie:anon,headers:{'CF-Connecting-IP':'198.51.100.42','X-Booking-Nonce':session.nonce},body,...options}),f.env,{now:()=>now,randomCode:()=>f.random(),fetch:async(url,init)=>Response.json({success:new URLSearchParams(init.body).get('response')==='good',hostname:'synthetic.example',action:'booking',cdata:session.nonce,challenge_ts:new Date(now).toISOString()})});
 f.owner=(body,options={})=>handleOwnerOrders(request('/api/booking/order-editor',{...signedOwner,method:'POST',body,...options}),f.env,{auth,now:()=>now});
 f.rows=()=>f.db.sqlite.prepare('SELECT count(*) n FROM order_estimates WHERE choices IS NOT NULL').get().n;
 return f;
}
test('five-character references and choices are bounded; estimates cannot carry identity or credentials', () => {
  for (let i=0;i<100;i++) { const code=randomOrderCode(); assert(validOrderCode(code)); assert.equal(code.length,5); assert.match(code,/[A-Z]/); assert.match(code,/[2-9]/); }
  assert.equal(normalizeOrderCode(' a7b2c '),'A7B2C');
  for(const code of ['ABCDE','12345','IO0A7','A7B2CX','<img>'])assert.equal(validOrderCode(code),false);
  assert.deepEqual(orderChoices({selections:[{id:'extras-2',quantity:1},{id:'nail-art-0',quantity:1}],kit:false,glue:false}).selections.map(x=>x.id),['nail-art-0','extras-2']);
  for(const choices of [{...choice,name:'private'}, {...choice,selections:[]}, {...choice,selections:[{id:'nail-art-0',quantity:1,name:'injected'}]}, {...choice,selections:[{id:'extras-0',quantity:1},{id:'extras-1',quantity:1}]}, {...choice,selections:[{id:'extras-3',quantity:51}]}, {...choice,selections:[{id:'nail-art-0',quantity:1.5}]}])assert.throws(()=>orderChoices(choices));
});

test('public estimate creation requires signed nonce, same origin and a fresh valid challenge',async()=>{
 const f=await setup();
 for(const options of [{cookie:undefined},{origin:'https://attacker.example'},{headers:{'X-Booking-Nonce':'f'.repeat(64)}}])assert.equal((await f.public(create(),options)).status,403);
 const bad=await f.public({...create(),token:'bad'});assert.equal(bad.status,403);assert.equal(f.rows(),0);
 const response=await f.public(create());assert.equal(response.status,201);const data=await response.json();assert(validOrderCode(data.order.code));assert.equal(data.order.estimate.min,25000);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 const serialized=JSON.stringify(data);for(const key of ['whatsapp','session_hash','request_hash','BOOKING_LINK_SECRET','reviewUrl'])assert(!serialized.includes(`"${key}"`));
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_requests').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM booking_slot_claims').get().n,0);
});

test('collision retries and uncertain-response retries do not overwrite an existing order',async()=>{
 const f=await setup();let code='A7B2C';f.random=()=>code;
 const first=(await (await f.public(create())).json()).order;assert.equal(first.code,'A7B2C');
 const again=(await (await f.public(create())).json()).order;assert.equal(again.code,first.code);assert.equal(f.rows(),1);
 let collisions=0;f.random=()=>++collisions<3?'A7B2C':'D8E3F';
 const second=(await (await f.public(create(2,{...choice,kit:true}))).json()).order;assert.equal(second.code,'D8E3F');assert.equal(first.estimate.min,25000);assert.equal(second.estimate.min,47000);assert.equal(f.rows(),2);
 assert.equal((await f.public(create(1,{...choice,glue:true}))).status,409);
});

test('owner-only edits keep the code, recalculate server prices and reject stale editors atomically',async()=>{
 const f=await setup(),order=(await (await f.public(create())).json()).order;
 assert.equal((await f.owner({action:'lookup',code:order.code},{cookie:undefined})).status,401);
 assert.equal((await f.owner({action:'save',code:order.code,revision:1,choices:choice},{csrf:undefined})).status,403);
 const updated={...choice,selections:[...choice.selections,{id:'extras-2',quantity:1}]};
 const a=await f.owner({action:'save',code:order.code,revision:1,choices:updated});assert.equal(a.status,200);const saved=(await a.json()).order;assert.equal(saved.code,order.code);assert.equal(saved.revision,2);assert.equal(saved.estimate.min,30000);
 assert.equal((await f.owner({action:'save',code:order.code,revision:1,choices:choice})).status,409);
 const latest=(await (await f.public({action:'lookup',code:order.code})).json()).order;assert.equal(latest.revision,2);assert.equal(latest.estimate.min,30000);
 assert.equal((await f.public({action:'save',code:order.code,revision:2,choices:choice})).status,400);
 assert.equal((await f.owner({action:'save',code:order.code,revision:2,choices:{...choice,total:1}})).status,400);
});

test('expired codes cannot be resolved or reassigned, and creation has an atomic per-session ceiling',async()=>{
 const f=await setup();const old=(await (await f.public(create())).json()).order;
 f.db.sqlite.prepare('UPDATE order_estimates SET created_at=?,expires_at=? WHERE code=?').run(now-31*86400000,now-1,old.code);
 assert.equal((await f.public({action:'lookup',code:old.code})).status,404);
 assert.equal((await f.owner({action:'save',code:old.code,revision:1,choices:choice})).status,404);
 let attempts=0;f.random=()=>++attempts===1?old.code:'G9H4J';const saved=(await (await f.public(create(2))).json()).order;assert.equal(saved.code,'G9H4J');
 assert.equal(f.db.sqlite.prepare('SELECT choices FROM order_estimates WHERE code=?').get(old.code).choices,null);
 f.random=randomOrderCode;
 for(let i=3;i<=11;i++)assert.equal((await f.public(create(i))).status,201);
 assert.equal((await f.public(create(12))).status,429);assert.equal(f.rows(),10);
});

test('estimate import seeds editable amounts, preserves entered DP, and respects full payment and ranges',()=>{
 const order={estimate:{min:62000,max:75000}};
 assert.deepEqual(estimatePayment(order,{paymentMode:'deposit',deposit:''}),{total:'62000',deposit:'20000'});
 assert.deepEqual(estimatePayment(order,{paymentMode:'deposit',deposit:'30000'}),{total:'62000',deposit:'30000'});
 assert.deepEqual(estimatePayment(order,{paymentMode:'full',deposit:''}),{total:'62000',deposit:'62000'});
 assert.deepEqual(estimatePayment({estimate:{min:6000}},{paymentMode:'deposit',deposit:''}),{total:'6000',deposit:'6000'});
 assert.equal(estimatePayment({estimate:{min:10000001}},{paymentMode:'deposit',deposit:''}),null);
 const html=readFileSync(new URL('../src/pages/book.astro',import.meta.url),'utf8');
 const control=html.match(/<input\b[^>]*id="booking-order-code"[^>]*>/)[0];assert(!/required|pattern=/.test(control));
 assert(html.indexOf('booking-order-code')>html.indexOf('fields.map'));assert(!/name="agreedPrice"[^>]*readonly/.test(html));
});

test('only owner-accepted bookings expose a separate signed printable receipt, never the approval token',async()=>{
 const f=await setup();const created=await createBookingRequest(f.env,{name:'Synthetic Customer',whatsapp:'081234567890',agreedPrice:'100000',paymentMode:'deposit',deposit:'30000',designType:'simple',durationMinutes:'120',date:'2026-10-24',time:'10:00',idempotencyKey:'synthetic-receipt-001',proof},{now:()=>now,calendar:{async availability(){return {busyIntervals:[]};}},admission:syntheticAdmission,normalizeProof:syntheticNormalization});
 const token=new URL(created.reviewUrl).searchParams.get('r');
 const issue=options=>handleReceipt(request('/api/booking/receipt-issue',{...signedOwner,method:'POST',body:{token},...options}),f.env,{auth,now:()=>now},true);
 assert.equal((await issue({cookie:undefined})).status,401);assert.equal((await issue({csrf:undefined})).status,403);assert.equal((await issue()).status,409);
 f.db.sqlite.prepare("UPDATE booking_requests SET status='accepted',calendar_event_id='synthetic-event' WHERE id=?").run(created.requestId);
 const response=await issue();assert.equal(response.status,200);const issued=await response.json();assert.equal(issued.whatsapp,'6281234567890');
 assert(!issued.receiptUrl.includes(token));const publicToken=new URLSearchParams(new URL(issued.receiptUrl).hash.slice(1)).get('r');assert.match(publicToken,/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
 const read=value=>handleReceipt(request('/api/booking/receipt',{method:'POST',body:{token:value}}),f.env,{now:()=>now});
 for(const value of [token,'A7B2C',publicToken.slice(0,-1)+(publicToken.endsWith('A')?'B':'A')])assert.equal((await read(value)).status,404);
 const receipt=await read(publicToken);assert.equal(receipt.status,200);const data=await receipt.json();assert.equal(data.receipt.deposit,30000);assert.equal(data.receipt.remainingBalance,70000);assert(!JSON.stringify(data).includes('whatsapp'));assert(!JSON.stringify(data).includes('token_hash'));assert(!JSON.stringify(data).includes('proof'));
 assert.equal(receipt.headers.get('Cache-Control'),'private, no-store');
 f.db.sqlite.prepare("UPDATE booking_requests SET status='cancelled' WHERE id=?").run(created.requestId);assert.equal((await (await read(publicToken)).json()).receipt.status,'cancelled');
});

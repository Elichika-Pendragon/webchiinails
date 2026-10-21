import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {BOOKING_ADMISSION_LIMITS as LIMITS, BookingAdmissionError, isBookingAdmissionConfigured, issueBookingAdmission, preflightBookingAdmission, submissionAdmission} from './booking-admission.js';
import {proof,proofBytes} from './fixtures/payment-proof.js';

// Real SQLite transactions/constraints; Siteverify is an isolated test transport.
class D1 {
  constructor({migrate=true}={}) {
    this.sqlite=new DatabaseSync(':memory:');
    for(const file of ['0001-booking','0002-booking-payment','0003-booking-duration','0004-booking-payment-proofs','0005-booking-calendar-sync-index','0006-booking-manual-payment',...(migrate?['0007-booking-admission']:[])]) this.sqlite.exec(readFileSync(new URL(`../migrations/${file}.sql`,import.meta.url),'utf8'));
  }
  prepare(sql) {const db=this.sqlite;return {sql,values:[],bind(...values){return {...this,values};},async first(){return db.prepare(this.sql).get(...this.values)??null;},async all(){return {success:true,results:db.prepare(this.sql).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}};}
  async batch(statements){this.sqlite.exec('BEGIN');try{const values=statements.map(statement=>({success:true,meta:{changes:Number(this.sqlite.prepare(statement.sql).run(...statement.values).changes)}}));this.sqlite.exec('COMMIT');return values;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  rows(sql,...values){return this.sqlite.prepare(sql).all(...values);}
}
const initial=Date.parse('2026-10-20T08:00:00+07:00');
const origin='https://booking.example';
const baseEnv=db=>({BOOKING_DB:db,BOOKING_LINK_SECRET:'synthetic_admission_secret_only_for_tests_0123456789',BOOKING_OWNER_EMAIL:'owner@example.com',BOOKING_TURNSTILE_SITE_KEY:'synthetic_site_key_0123456789',BOOKING_TURNSTILE_SECRET_KEY:'synthetic_turnstile_secret_0123456789',SITE_URL:origin});
const code=(value,status)=>error=>error instanceof BookingAdmissionError&&error.code===value&&(status===undefined||error.status===status);
const request=(path='requests',headers={},method='POST')=>new Request(`${origin}/api/booking/${path}`,{method,headers:{Origin:origin,'CF-Connecting-IP':'198.51.100.42',...headers}});
const hashes=i=>({idempotencyHash:i.toString(16).padStart(64,'0'),payloadHash:(i+10000).toString(16).padStart(64,'0'),maxBytes:512000});
async function session(env,{now=initial,headers={}}={}) {
  const issued=await issueBookingAdmission(request('admission',headers,'GET'),env,{now});
  const body=await issued.json();
  return {body,cookie:issued.headers.get('Set-Cookie').split(';')[0],response:issued};
}
async function context(env,s,{now=initial,headers={}}={}) {return preflightBookingAdmission(request('requests',{Cookie:s.cookie,'X-Booking-Nonce':s.body.nonce,...headers}),env,{now});}
const verify=(s,changes={},now=initial,seen=[])=>async(url,init)=>{seen.push({url,body:new URLSearchParams(init.body)});return Response.json({success:true,hostname:'booking.example',action:'booking',cdata:s.body.nonce,challenge_ts:new Date(now).toISOString(),...changes});};
const authorize=(env,c,s,i,options={})=>submissionAdmission(env,c,{turnstileToken:'synthetic_valid_token',fetch:verify(s),now:initial,...options}).authorizeNew(hashes(i));
function seedRequest(db,id,created=initial){const start=Date.parse('2026-10-21T08:00:00+07:00');return db.prepare(`INSERT INTO booking_requests(id,token_hash,idempotency_hash,payload_hash,name,whatsapp,agreed_price,deposit,date,time,start_ms,end_ms,start_iso,end_iso,created_at,expires_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,id.padEnd(64,'a'),id.padEnd(64,'b'),id.padEnd(64,'c'),'Synthetic Customer','6281234567890',100000,10000,'2026-10-21','08:00',start,start+7200000,'2026-10-21T08:00:00+07:00','2026-10-21T10:00:00+07:00',created,start,created);}

test('admission config fails closed on missing binding, weak secret, non-HTTPS origin or missing challenge configuration',()=>{
  const env=baseEnv(new D1());assert.equal(isBookingAdmissionConfigured(env),true);
  for(const field of Object.keys(env).filter(key=>key!=='BOOKING_OWNER_EMAIL')){const copy={...env};delete copy[field];assert.equal(isBookingAdmissionConfigured(copy),false,field);}
  for(const SITE_URL of ['http://booking.example','https://booking.example/path','https://user:pass@booking.example','https://booking.example/?x=1'])assert.equal(isBookingAdmissionConfigured({...env,SITE_URL}),false);
  for(const field of ['BOOKING_TURNSTILE_SITE_KEY','BOOKING_TURNSTILE_SECRET_KEY'])assert.equal(isBookingAdmissionConfigured({...env,[field]:'1x0000000000000000000000000000000AA'}),false);
  assert.equal(new BookingAdmissionError('ADMISSION_REQUIRED').status,403);assert.equal(new BookingAdmissionError('ADMISSION_RATE_LIMIT').status,429);assert.equal(new BookingAdmissionError('ADMISSION_IN_PROGRESS').status,409);
  assert.equal(new BookingAdmissionError('arbitrary-private-value').code,'ADMISSION_UNAVAILABLE');
});

test('anonymous session is signed, secure, nonce-bound, origin-bound and expires without exposing credentials',async()=>{
  const env=baseEnv(new D1()),s=await session(env);
  assert.equal(s.response.headers.get('Cache-Control'),'private, no-store, max-age=0');
  assert.match(s.response.headers.get('Set-Cookie'),/Path=\/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict/);
  assert.deepEqual(Object.keys(s.body).sort(),['action','expiresAt','nonce','siteKey']);
  assert.equal(s.body.action,'booking');assert.match(s.body.nonce,/^[a-f0-9]{64}$/);
  const c=await context(env,s);assert.equal(c.nonce,s.body.nonce);
  const reused=await session(env,{headers:{Cookie:s.cookie},now:initial+1000});assert.equal(reused.body.nonce,s.body.nonce);
  for(const headers of [{Cookie:s.cookie,'X-Booking-Nonce':'a'.repeat(64)},{Cookie:s.cookie.slice(0,-1)+'x','X-Booking-Nonce':s.body.nonce},{Cookie:`${s.cookie};${s.cookie}`,'X-Booking-Nonce':s.body.nonce},{Cookie:s.cookie,'X-Booking-Nonce':s.body.nonce,Origin:'https://attacker.example'},{Cookie:s.cookie,'X-Booking-Nonce':s.body.nonce,'Sec-Fetch-Site':'cross-site'}])await assert.rejects(preflightBookingAdmission(request('requests',headers),env,{now:initial}),code('ADMISSION_REQUIRED',403));
  await assert.rejects(context(env,s,{now:initial+LIMITS.sessionLifetimeMs}),code('ADMISSION_REQUIRED',403));
  assert.equal(JSON.stringify(s.body).includes(env.BOOKING_LINK_SECRET),false);
  assert.throws(()=>submissionAdmission(env,{...c},{turnstileToken:'token'}),code('ADMISSION_REQUIRED',403));
});

test('trusted-IP and session burst controls run before receipt, challenge or Google work',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env);
  const c=await context(env,s);assert.ok(c.ipHash&&c.sessionHash);
  const bucket=db.rows("SELECT bucket FROM booking_admission_counters WHERE bucket LIKE 'attempt:session:%'")[0].bucket;
  db.sqlite.prepare('UPDATE booking_admission_counters SET hits=? WHERE bucket=?').run(LIMITS.sessionAttemptsPerDay,bucket);
  await assert.rejects(context(env,s),code('ADMISSION_RATE_LIMIT',429));
  await assert.rejects(context(env,s,{headers:{'CF-Connecting-IP':'','X-Forwarded-For':'198.51.100.99'}}),code('ADMISSION_UNAVAILABLE',503));
  assert.equal(JSON.stringify(db.rows('SELECT * FROM booking_admission_counters')).includes('198.51.100.42'),false);
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('reusing a valid signed session spends no issue quota or D1 writes',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env);
  const before=db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket');
  const writes=db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  for(let i=0;i<8;i++){const reused=await session(env,{headers:{Cookie:s.cookie},now:initial+i+1});assert.equal(reused.body.nonce,s.body.nonce);}
  assert.deepEqual(db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket'),before);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes,writes);
});

test('one IP can spend at most one fifth of global session/attempt quotas',async()=>{
  const db=new D1(),env=baseEnv(db);let last;
  for(let i=0;i<LIMITS.ipSessionsPerDay;i++){
    const now=initial+Math.floor(i/30)*60000;
    last=await session(env,{now});await context(env,last,{now});
  }
  const now=initial+600000;
  const globals=db.rows("SELECT * FROM booking_admission_counters WHERE bucket LIKE '%:global:%' ORDER BY bucket");
  assert.ok(globals.every(row=>row.hits===100));
  await assert.rejects(session(env,{now}),code('ADMISSION_RATE_LIMIT',429));await assert.rejects(context(env,last,{now}),code('ADMISSION_RATE_LIMIT',429));
  assert.deepEqual(db.rows("SELECT * FROM booking_admission_counters WHERE bucket LIKE '%:global:%' ORDER BY bucket"),globals);
  assert.equal(LIMITS.ipSessionsPerDay/LIMITS.globalSessionsPerDay,0.2);assert.equal(LIMITS.ipAttemptsPerDay/LIMITS.globalAttemptsPerDay,0.2);
  const other=await session(env,{now,headers:{'CF-Connecting-IP':'192.0.2.30'}});await context(env,other,{now,headers:{'CF-Connecting-IP':'192.0.2.30'}});
});

test('a rejected session/IP cannot spend the global allowance or create fresh IP counter rows',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env);await context(env,s);
  db.sqlite.prepare("UPDATE booking_admission_counters SET hits=? WHERE bucket LIKE 'attempt:session:%'").run(LIMITS.sessionAttemptsPerDay);
  const before=db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket');
  const writes=db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  for(let i=1;i<=12;i++)await assert.rejects(context(env,s,{headers:{'CF-Connecting-IP':`203.0.113.${i}`}}),code('ADMISSION_RATE_LIMIT',429));
  assert.deepEqual(db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket'),before);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes,writes);
  assert.equal(db.rows('SELECT * FROM booking_admission_gates').length,0);
});

test('global denial is write-free and does not grow IP/session counter cardinality',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env);await context(env,s);
  db.sqlite.prepare("UPDATE booking_admission_counters SET hits=? WHERE bucket LIKE 'attempt:global:%'").run(LIMITS.globalAttemptsPerDay);
  const before=db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket');
  const writes=db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  for(let i=1;i<=12;i++)await assert.rejects(context(env,s,{headers:{'CF-Connecting-IP':`203.0.113.${i}`}}),code('ADMISSION_RATE_LIMIT',429));
  assert.deepEqual(db.rows('SELECT * FROM booking_admission_counters ORDER BY bucket'),before);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes,writes);
  assert.equal(db.rows('SELECT * FROM booking_admission_gates').length,0);
});

test('IP minute bursts reset in one existing daily row without creating per-minute buckets',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env);await context(env,s);
  db.sqlite.prepare("UPDATE booking_admission_counters SET burst_hits=? WHERE bucket LIKE 'attempt:ip-day:%'").run(LIMITS.ipAttemptsPerMinute);
  await assert.rejects(context(env,s),code('ADMISSION_RATE_LIMIT',429));
  const count=db.rows('SELECT * FROM booking_admission_counters').length;
  await context(env,s,{now:initial+60000});
  const row=db.rows("SELECT * FROM booking_admission_counters WHERE bucket LIKE 'attempt:ip-day:%'")[0];
  assert.equal(row.burst_hits,1);assert.equal(row.hits,2);assert.equal(db.rows('SELECT * FROM booking_admission_counters').length,count);
  assert.equal(db.rows("SELECT * FROM booking_admission_counters WHERE bucket LIKE '%ip-minute%'").length,0);
});

test('Siteverify binds action, configured hostname, fresh timestamp and cData nonce',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s),seen=[];
  const ticket=await authorize(env,c,s,1,{fetch:verify(s,{},initial,seen)});
  assert.equal(seen.length,1);assert.equal(seen[0].url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(seen[0].body.get('remoteip'),'198.51.100.42');assert.equal(seen[0].body.get('secret'),env.BOOKING_TURNSTILE_SECRET_KEY);
  assert.match(seen[0].body.get('idempotency_key'),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  ticket.consumeTransformAttempt();ticket.consumeTransformAttempt();assert.throws(()=>ticket.consumeTransformAttempt(),code('ADMISSION_CAPACITY'));
  await ticket.release();
  assert.equal(db.rows("SELECT hits FROM booking_admission_counters WHERE bucket LIKE 'transform:%'")[0].hits,2,'failed/unused reservations do not refund external-attempt allowance');
  for(const changes of [{success:false},{hostname:'attacker.example'},{action:'other'},{cdata:'0'.repeat(64)},{challenge_ts:new Date(initial-300001).toISOString()},{challenge_ts:new Date(initial+60001).toISOString()}])await assert.rejects(authorize(env,c,s,2,{fetch:verify(s,changes)}),code('ADMISSION_CHALLENGE',403));
  await assert.rejects(authorize(env,c,s,3,{fetch:async()=>Response.json({secret:'do not expose'}, {status:500})}),code('ADMISSION_UNAVAILABLE',503));
  await assert.rejects(authorize(env,c,s,4,{fetch:async()=>new Response('x'.repeat(16385))}),code('ADMISSION_UNAVAILABLE',503));
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('parallel same-key requests reserve and charge one normalization; concurrent work returns a retryable state',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s);
  const results=await Promise.allSettled([authorize(env,c,s,1),authorize(env,c,s,1)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.ok(code('ADMISSION_IN_PROGRESS',409)(results.find(result=>result.status==='rejected').reason));
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,1);
  assert.equal(db.rows("SELECT hits FROM booking_admission_counters WHERE bucket LIKE 'transform:%'")[0].hits,2);
});

test('a fresh challenge token after verifier failure gets a fresh verifier idempotency key',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s),seen=[];
  await assert.rejects(authorize(env,c,s,1,{turnstileToken:'synthetic_expired_token',fetch:verify(s,{success:false},initial,seen)}),code('ADMISSION_CHALLENGE',403));
  const ticket=await authorize(env,c,s,1,{turnstileToken:'synthetic_replacement_token',fetch:verify(s,{},initial,seen)});
  assert.notEqual(seen[0].body.get('idempotency_key'),seen[1].body.get('idempotency_key'));await ticket.release();
});

test('atomic receipt-byte reservations prevent parallel overrun and release capacity on failure',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s);
  db.sqlite.prepare('UPDATE booking_proof_storage SET stored_bytes=? WHERE id=1').run(LIMITS.receiptBytes-512000);
  const results=await Promise.allSettled([authorize(env,c,s,1),authorize(env,c,s,2)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.ok(code('ADMISSION_CAPACITY',503)(results.find(result=>result.status==='rejected').reason));
  await results.find(result=>result.status==='fulfilled').value.release();
  const retry=await authorize(env,c,s,3);assert.ok(retry);await retry.release();
});

test('expired reservations cannot commit, erase a replacement lease or overrun storage after recovery',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s),old=await authorize(env,c,s,1);
  const later=initial+LIMITS.reservationLifetimeMs+1;
  const newer=await authorize(env,c,s,1,{now:later,fetch:verify(s,{},later)});
  const guard=old.insertCondition(later);assert.equal(db.rows(`SELECT 1 AS valid WHERE ${guard.sql}`,...guard.values).length,0);
  await old.release();assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,1);
  const fresh=newer.insertCondition(later);assert.equal(db.rows(`SELECT 1 AS valid WHERE ${fresh.sql}`,...fresh.values).length,1);
  await newer.release();assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('monthly normalization allowance and daily successful-request allowance are atomically bounded',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s),first=await authorize(env,c,s,1);
  await first.release();db.sqlite.prepare("UPDATE booking_admission_counters SET hits=? WHERE bucket LIKE 'transform:%'").run(LIMITS.transformAttemptsPerMonth-2);
  const last=await authorize(env,c,s,2);await assert.rejects(authorize(env,c,s,3),code('ADMISSION_CAPACITY',503));await last.release();
  assert.equal(db.rows("SELECT hits FROM booking_admission_counters WHERE bucket LIKE 'transform:%'")[0].hits,LIMITS.transformAttemptsPerMonth);
  db.sqlite.prepare("UPDATE booking_admission_counters SET hits=0 WHERE bucket LIKE 'transform:%'").run();
  for(let i=0;i<LIMITS.newRequestsPerDay;i++)await seedRequest(db,`daily-${i}`).run();
  await assert.rejects(authorize(env,c,s,4),code('ADMISSION_CAPACITY',503));
});

test('retained metadata has its own bound, independent of receipt cleanup',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s);
  db.sqlite.prepare('UPDATE booking_proof_storage SET request_count=? WHERE id=1').run(LIMITS.retainedRequests);
  await assert.rejects(authorize(env,c,s,1),code('ADMISSION_CAPACITY',503));
  await assert.rejects(seedRequest(db,'overflow').run(),/metadata capacity/);
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('per-session new-booking cap does not lock another customer supplying the same phone',async()=>{
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s);
  for(let i=1;i<=LIMITS.newRequestsPerSessionDay;i++){const ticket=await authorize(env,c,s,i);await db.batch([seedRequest(db,`same-phone-${i}`),...ticket.finalizeStatements(`same-phone-${i}`)]);}
  await assert.rejects(authorize(env,c,s,100),code('ADMISSION_CAPACITY',503));
  const other=await session(env),otherContext=await context(env,other),newTicket=await authorize(env,otherContext,other,101);
  await db.batch([seedRequest(db,'same-phone-other'),...newTicket.finalizeStatements('same-phone-other')]);
  assert.equal(db.rows('SELECT * FROM booking_requests').length,11);
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('additive migration initializes historical bytes and insert/delete/rollback keep exact accounting',async()=>{
  const db=new D1({migrate:false});await seedRequest(db,'historical').run();
  const insert=(id)=>db.prepare("INSERT INTO booking_payment_proofs(request_id,content_type,content,sha256,created_at,expires_at) VALUES(?,'image/jpeg',?,?,?,?)").bind(id,proofBytes,'a'.repeat(64),initial,initial+1000);
  await insert('historical').run();db.sqlite.exec(readFileSync(new URL('../migrations/0007-booking-admission.sql',import.meta.url),'utf8'));
  assert.equal(db.rows('SELECT stored_bytes FROM booking_proof_storage')[0].stored_bytes,proofBytes.length);
  await seedRequest(db,'next').run();await insert('next').run();assert.equal(db.rows('SELECT stored_bytes FROM booking_proof_storage')[0].stored_bytes,proofBytes.length*2);
  await seedRequest(db,'rollback').run();await assert.rejects(db.batch([insert('rollback'),seedRequest(db,'next')]));
  assert.equal(db.rows('SELECT stored_bytes FROM booking_proof_storage')[0].stored_bytes,proofBytes.length*2);
  assert.throws(()=>db.sqlite.prepare("UPDATE booking_payment_proofs SET content=x'FFD8FFD9' WHERE request_id='next'").run(),/immutable/);
  await db.prepare('DELETE FROM booking_payment_proofs WHERE expires_at<=?').bind(initial+1000).run();
  assert.deepEqual({...db.rows('SELECT stored_bytes,stored_count FROM booking_proof_storage')[0]},{stored_bytes:0,stored_count:0});
});

test('new creation normalizes once, stores normalized bytes/hash, and source-identical retries bypass a consumed challenge',async()=>{
  const {createBookingRequest}=await import('./booking-requests.js');
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s),seen=[];
  let transformations=0,google=0;
  const normalizedBytes=new Uint8Array([...proofBytes.slice(0,2),255,254,0,4,65,66,...proofBytes.slice(2)]);
  const normalizedDigest=Buffer.from(await crypto.subtle.digest('SHA-256',normalizedBytes)).toString('hex');
  const normalizeProof=async(_env,source,ticket)=>{ticket.consumeTransformAttempt();transformations++;return {bytes:normalizedBytes,digest:normalizedDigest};};
  const calendar={async availability(){google++;return {busyIntervals:[]};}};
  const input={name:'Synthetic Client',whatsapp:'081234567890',agreedPrice:'100000',deposit:'20000',date:'2026-10-21',time:'08:00',designType:'simple',durationMinutes:'120',idempotencyKey:'synthetic_admission_request_001',proof};
  const admission=submissionAdmission(env,c,{turnstileToken:'synthetic_valid_token',fetch:verify(s,{},initial,seen),now:initial});
  const result=await createBookingRequest(env,input,{now:initial,calendar,admission,normalizeProof});
  const record=db.rows('SELECT * FROM booking_payment_proofs')[0];
  assert.deepEqual(new Uint8Array(record.content),normalizedBytes);assert.equal(record.sha256,normalizedDigest);
  assert.equal(db.rows('SELECT stored_bytes FROM booking_proof_storage')[0].stored_bytes,normalizedBytes.length);
  const retry=await createBookingRequest(env,{...input,proof:{contentType:'image/jpeg',bytes:proofBytes}},{now:initial,calendar,admission:submissionAdmission(env,c,{turnstileToken:'',fetch:async()=>{throw new Error('must not run');},now:initial}),normalizeProof});
  assert.equal(retry.requestId,result.requestId);assert.equal(transformations,1);assert.equal(google,1);assert.equal(seen.length,1);
  assert.equal(db.rows('SELECT * FROM booking_requests').length,1);assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);
});

test('normalization or Calendar failures release inflight bytes and never save unchecked source bytes',async()=>{
  const {createBookingRequest}=await import('./booking-requests.js');
  const db=new D1(),env=baseEnv(db),s=await session(env),c=await context(env,s);
  const input={name:'Synthetic Client',whatsapp:'081234567890',agreedPrice:'100000',deposit:'20000',date:'2026-10-21',time:'08:00',designType:'simple',durationMinutes:'120',idempotencyKey:'synthetic_admission_failure_001',proof};
  const admission=()=>submissionAdmission(env,c,{turnstileToken:'synthetic_valid_token',fetch:verify(s),now:initial});
  await assert.rejects(createBookingRequest(env,input,{now:initial,admission:admission(),calendar:{availability(){throw new Error('must not run');}},normalizeProof:async()=>{throw new Error('synthetic decode failure');}}),/synthetic decode failure/);
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);assert.equal(db.rows('SELECT * FROM booking_requests').length,0);
  await assert.rejects(createBookingRequest(env,input,{now:initial,admission:admission(),calendar:{availability(){throw new Error('synthetic unavailable');}},normalizeProof:async(_env,source)=>source}),error=>error.code==='CALENDAR_UNAVAILABLE');
  assert.equal(db.rows('SELECT * FROM booking_admission_reservations').length,0);assert.equal(db.rows('SELECT * FROM booking_payment_proofs').length,0);
  assert.equal(db.rows("SELECT hits FROM booking_admission_counters WHERE bucket LIKE 'transform:%'")[0].hits,4);
});

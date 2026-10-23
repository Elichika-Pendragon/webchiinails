import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingAuthError } from './booking-auth.js';
import { BookingAdmissionError } from './booking-admission.js';
import { BookingRequestError } from './booking-requests.js';
import { createBookingHttpHandlers, isBookingEnabled, BOOKING_MULTIPART_MAX_BYTES, BOOKING_HTTP_LIMITS } from './booking-http.js';
import { proof, proofBytes } from './fixtures/payment-proof.js';
import { PAYMENT_PROOF_MAX_BYTES, normalizePaymentProof, validatePaymentProof, PaymentProofValidationError } from './booking-proofs.js';

// Synthetic adapters only: no resources, DB queries, credentials or network I/O.
const env = {
  BOOKING_ENABLED: 'true', SITE_URL: 'https://synthetic.example',
  BOOKING_DB: { prepare() {}, batch() {} },
  BOOKING_LINK_SECRET: 'synthetic-link-signing-secret-with-32-bytes',
  BOOKING_AUTH_SECRET: 'synthetic-auth-signing-secret-with-32-bytes',
  BOOKING_OWNER_EMAIL: 'owner.synthetic@gmail.com',
  GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'synthetic@project.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nU1lOVEhFVElD\n-----END PRIVATE KEY-----',
  GOOGLE_CALENDAR_ID: 'synthetic-calendar@group.calendar.google.com',
  BOOKING_IMAGES: { async fetch() { throw new Error('Synthetic HTTP boundary must not call Images'); } },
  BOOKING_TURNSTILE_SITE_KEY: 'synthetic_turnstile_site_key_2026',
  BOOKING_TURNSTILE_SECRET_KEY: 'synthetic_turnstile_secret_key_2026',
};
const current = Date.parse('2026-10-20T12:00:00Z');
const reviewToken = 'A'.repeat(43);
const input = { name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', deposit: '20000', date: '2026-10-21', time: '14:00', idempotencyKey: 'synthetic-request-key-1', proof };
const summary = { id: 'synthetic-request-id', status: 'pending', name: input.name, whatsapp: '6281234567890', agreedPrice: 100000, deposit: 20000, paymentMode: 'deposit', paymentPolicy: 'manual-min20k-v3', remainingBalance: 80000, date: input.date, time: input.time, startISO: '2026-10-21T14:00:00+07:00', endISO: '2026-10-21T16:00:00+07:00', durationMinutes: 120, expiresAt: '2026-10-21T07:00:00.000Z' };
const created = { requestId: summary.id, status: 'pending', reviewUrl: `${env.SITE_URL}/book/approve?r=${reviewToken}`, booking: summary };
const identity = { email: env.BOOKING_OWNER_EMAIL, subject: 'synthetic-owner', csrfToken: 'C'.repeat(43) };
const uploadedInput = value => ({...value,proof:{contentType:'image/jpeg',bytes:proofBytes}});
const metadataOf = value => {const {proof:ignored,...metadata}=value;return {turnstileToken:'synthetic-turnstile-response',...metadata};};
function multipart(value=input) {
  const form=new FormData();
  form.append('booking',JSON.stringify(metadataOf(value)));
  if(value.proof!==undefined) {
    const bytes=value.proof?.bytes??(typeof value.proof?.base64==='string'?Buffer.from(value.proof.base64,'base64'):proofBytes);
    form.append('proof',new Blob([bytes],{type:value.proof?.contentType??'image/jpeg'}),'receipt.jpg');
  }
  return form;
}
const rawMultipart = (body, headers={}) => request('requests',{method:'POST',body,headers:{'Content-Type':'multipart/form-data; boundary=synthetic-boundary',...headers}});

function request(path, { method = 'GET', body, origin = env.SITE_URL, headers = {}, base = env.SITE_URL } = {}) {
  const values = { 'CF-Connecting-IP':'198.51.100.42', ...headers };
  if (!['GET', 'HEAD'].includes(method) && origin !== null) values.Origin = origin;
  if(path==='requests' && method==='POST' && body && typeof body==='object' && !(body instanceof FormData) && !(body instanceof Uint8Array))body=multipart(body);
  if (body !== undefined && !(body instanceof FormData) && !Object.keys(values).some(key => key.toLowerCase() === 'content-type')) values['Content-Type'] = 'application/json';
  return new Request(`${base}/api/booking/${path}`, { method, headers: values, body: body === undefined ? undefined : typeof body === 'string'||body instanceof FormData||body instanceof Uint8Array ? body : JSON.stringify(body) });
}

function fixture(extra = {}) {
  const calls = [];
  const admissionCalls = [];
  const cacheCalls = [];
  const admissionContext=Object.freeze({synthetic:true});
  const admission=Object.freeze({syntheticAdmission:true});
  const provider = { availability() {}, createApprovedAppointment() {}, reconcileApprovedAppointment() {}, readAppointmentState() {}, verifyCalendarWriteAccess() {} };
  const options = {
    guardBookingCustomer: (env, input, admission) => admission, // Synthetic transport boundary; real phone limits have SQLite integration tests.
    now: () => current,
    createBookingRequest: async (config, body, settings) => { calls.push(['create', config, body, settings]); return created; },
    getBookingRequest: async (config, token, settings) => { calls.push(['read', config, token, settings]); return summary; },
    decideBookingRequest: async (config, token, action, settings) => { calls.push(['decide', config, token, action, settings]); return { ...summary, status: action === 'accept' ? 'accepted' : 'cancelled' }; },
    getBookingAvailability: async (config, selection, settings) => { calls.push(['availability', config, selection, settings]); return { ...selection, timeZone: 'Asia/Jakarta', slots: [{ time: '08:00', available: true }, { time: '08:30', available: false }] }; },
    getBookingCalendarMonth: async (config, selection, settings) => { calls.push(['calendarMonth', config, selection, settings]); return { ...selection, durationMinutes: Number(selection.durationMinutes), timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] }; },
    getBookingPaymentProof: async (config, token, settings) => { calls.push(['proof', config, token, settings]); return proofBytes; },
    requireBookingOwner: async (incoming, config, settings) => { calls.push(['owner', incoming, config, settings]); return identity; },
    getAuthChallenge: async () => { calls.push(['challenge']); return Response.json({ authenticated: false, csrfToken: 'C'.repeat(43), clientId: env.GOOGLE_OAUTH_CLIENT_ID, nonce: 'N'.repeat(43) }); },
    signInOwner: async () => { calls.push(['signIn']); return Response.json({ authenticated: true, csrfToken: 'D'.repeat(43) }); },
    signOutOwner: async () => { calls.push(['signOut']); return Response.json({ authenticated: false }); },
    createGoogleCalendarProvider: (config, settings) => { calls.push(['calendar', config, settings]); return provider; },
    issueBookingAdmission:async()=>{admissionCalls.push(['issue']);return Response.json({siteKey:env.BOOKING_TURNSTILE_SITE_KEY,nonce:'N'.repeat(64),action:'booking',expiresAt:current+7200000});},
    preflightBookingAdmission:async(incoming,config,settings)=>{admissionCalls.push(['preflight',incoming,config,settings]);return admissionContext;},
    submissionAdmission:(config,context,settings)=>{admissionCalls.push(['submission',config,context,settings]);return admission;},
    createPublicBookingCalendar:(config,settings)=>{cacheCalls.push([config,settings]);return settings.calendar;},
    ...extra,
  };
  return { handlers: createBookingHttpHandlers(options), calls, provider, options, admissionCalls,cacheCalls,admissionContext,admission };
}

function secure(response) {
  assert.match(response.headers.get('Content-Type'), /^application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
}

test('readiness requires exact activation and every binding; existing owner access survives missing upload-only bindings', async () => {
  const item = fixture();
  assert.equal(isBookingEnabled(env), true);
  for (const field of Object.keys(env)) {
    const missing = { ...env };
    delete missing[field];
    assert.equal(isBookingEnabled(missing), false, field);
    const status = await item.handlers.status(request('status'), missing);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { enabled: false });
    secure(status);
    const uploadOnly=['BOOKING_IMAGES','BOOKING_TURNSTILE_SITE_KEY','BOOKING_TURNSTILE_SECRET_KEY'].includes(field);
    for (const route of uploadOnly?['requests','admission','availability','calendar']:['requests', 'admission','review', 'session', 'availability', 'calendar', 'proof']) {
      const response = await item.handlers[route](request(route, { method: route === 'requests' ? 'POST' : 'GET', ...(route === 'requests' ? { body: input } : {}) }), missing);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'BOOKING_DISABLED');
      secure(response);
    }
  }
  assert.equal(item.calls.length, 0);
  assert.equal(item.admissionCalls.length,0);
  for (const value of [true, 'TRUE', '1', 1, false, 'false', undefined]) assert.equal(isBookingEnabled({ ...env, BOOKING_ENABLED: value }), false);
  assert.deepEqual(await (await item.handlers.status(request('status'), env)).json(), { enabled: true });
  for(const field of ['BOOKING_IMAGES','BOOKING_TURNSTILE_SITE_KEY','BOOKING_TURNSTILE_SECRET_KEY']) {
    const missing={...env};delete missing[field];
    assert.equal((await fixture().handlers.review(request(`review?token=${reviewToken}`),missing)).status,200);
    assert.equal((await fixture().handlers.proof(request(`proof?token=${reviewToken}`),missing)).status,200);
    assert.equal((await fixture().handlers.session(request('auth/session'),missing)).status,200);
  }
});

test('unsafe origins and malformed required settings cannot enable booking', () => {
  for (const change of [{ SITE_URL: 'http://synthetic.example' }, { SITE_URL: 'https://synthetic.example/other' }, { BOOKING_DB: {} }, { BOOKING_LINK_SECRET: 'short' }, { BOOKING_AUTH_SECRET: 'short' }, { GOOGLE_OAUTH_CLIENT_ID: 'bad' }, { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'personal@gmail.com' }, { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not a PEM key' }, { GOOGLE_CALENDAR_ID: 'primary' }, { GOOGLE_CALENDAR_ID: ' calendar ' }, { BOOKING_OWNER_EMAIL: ' padded@gmail.com' }]) assert.equal(isBookingEnabled({ ...env, ...change }), false);
});

test('creation forwards binary proof and fresh Calendar plus admission without owner auth or token in the fingerprint input', async () => {
  const item = fixture();
  const response = await item.handlers.requests(request('requests', { method: 'POST', body: input }), env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), created);
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'create']);
  assert.equal(item.calls[1][1], env);
  assert.deepEqual(item.calls[1][2], uploadedInput(input));
  assert.equal(item.calls[1][3].now(), current);
  assert.equal(item.calls[1][3].calendar, item.provider);
  assert.equal(item.calls[1][3].admission,item.admission);
  assert.deepEqual(item.admissionCalls.map(call=>call[0]),['preflight','submission']);
  assert.equal(item.admissionCalls[1][2],item.admissionContext);
  assert.equal(item.admissionCalls[1][3].turnstileToken,'synthetic-turnstile-response');
  assert.equal('turnstileToken' in item.calls[1][2],false);
  assert.equal(item.cacheCalls.length,0,'Creation must not use advisory Calendar cache');
});

test('creation rejects cross-site, missing Origin and different-host requests before ledger access', async () => {
  const item = fixture();
  for (const change of [{ origin: null }, { origin: 'https://attacker.example' }, { base: 'https://preview.example' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } }]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: input, ...change }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'BOOKING_ORIGIN');
  }
  assert.equal(item.calls.length, 0);
  assert.equal(item.admissionCalls.length,0);
});

test('eight in-flight creations bound isolate memory; ninth is busy before admission or body reads and success releases capacity', async () => {
  const holds=[];let blocking=true,preflights=0;
  const item=fixture({preflightBookingAdmission:incoming=>{preflights++;assert.equal(incoming.bodyUsed,false);return blocking?new Promise(resolve=>holds.push(resolve)):{};}});
  const pending=Array.from({length:BOOKING_HTTP_LIMITS.maxInFlightCreations},()=>item.handlers.requests(request('requests',{method:'POST',body:input}),env));
  assert.equal(holds.length,8);assert.equal(preflights,8);
  const ninth=request('requests',{method:'POST',body:input});const busy=await item.handlers.requests(ninth,env);
  assert.equal(busy.status,503);assert.equal((await busy.json()).code,'BOOKING_BUSY');secure(busy);
  assert.equal(ninth.bodyUsed,false);assert.equal(preflights,8);assert.equal(item.calls.length,0);
  // Staff review is independent of customer upload slots.
  assert.equal((await item.handlers.review(request(`review?token=${reviewToken}`),env)).status,200);
  blocking=false;for(const resolve of holds)resolve({});
  assert.deepEqual((await Promise.all(pending)).map(response=>response.status),Array(8).fill(201));
  assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:input}),env)).status,201);
});

test('preflight, parsing and downstream errors always release their creation slot', async () => {
  const holds=[];let preflights=0;
  const item=fixture({preflightBookingAdmission:()=>{preflights++;return preflights<=8?new Promise((resolve,reject)=>holds.push({resolve,reject})):{};}});
  const pending=Array.from({length:8},()=>item.handlers.requests(request('requests',{method:'POST',body:input}),env));
  holds[0].reject(new BookingAdmissionError('ADMISSION_REQUIRED'));
  assert.equal((await pending[0]).status,403);
  // Seven slots stay occupied while repeated parser failures recycle the eighth.
  for(let i=0;i<12;i++)assert.equal((await item.handlers.requests(rawMultipart('bad multipart'),env)).status,400);
  assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:input}),env)).status,201);
  for(const hold of holds.slice(1))hold.resolve({});await Promise.all(pending);
  let failing=true;
  const downstream=fixture({createBookingRequest:async()=>{if(failing)throw new Error('private downstream failure');return created;}});
  for(let i=0;i<12;i++){const response=await downstream.handlers.requests(request('requests',{method:'POST',body:input}),env);assert.equal(response.status,503);assert.equal((await response.json()).code,'BOOKING_UNAVAILABLE');}
  failing=false;assert.equal((await downstream.handlers.requests(request('requests',{method:'POST',body:input}),env)).status,201);
});

test('public payment mode permits only deposit or full, retaining omitted-mode cached-client compatibility', async () => {
  const item = fixture();
  for (const paymentMode of ['deposit', 'full']) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, paymentMode } }), env);
    assert.equal(response.status, 201);
    assert.equal(item.calls.at(-1)[2].paymentMode, paymentMode);
  }
  const count = item.calls.length;
  for (const paymentMode of ['legacy', '', 'cash', 'FULL', true, null, {}, []]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, paymentMode } }), env);
    assert.equal(response.status, 400);
  }
  assert.equal(item.calls.length, count);
});

test('public design and duration fields are strict strings and permit only the agreed combinations', async () => {
  const item = fixture();
  for (const [designType, durationMinutes] of [['plain', '60'], ['gel', '60'], ['removal', '60'], ['simple', '60'], ['simple', '120'], ['full-art', '180'], ['full-art', '240'], ['full-art', '300']]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, designType, durationMinutes } }), env);
    assert.equal(response.status, 201);
    assert.equal(item.calls.at(-1)[2].durationMinutes, durationMinutes);
  }
  const count = item.calls.length;
  for (const [designType, durationMinutes] of [['legacy', '120'], ['plain', '120'], ['simple', '300'], ['full-art', 180], ['full-art', '180.0'], [null, '60']]) {
    assert.equal((await item.handlers.requests(request('requests', { method: 'POST', body: { ...input, designType, durationMinutes } }), env)).status, 400);
  }
  assert.equal(item.calls.length, count);
});

test('public availability uses bounded same-origin POST JSON and returns only occupancy without owner auth', async () => {
  const item = fixture();
  const route = 'availability';
  const body = { date: '2026-10-21', designType: 'full-art', durationMinutes: '180' };
  const incoming = extra => request(route, { method: 'POST', body, ...extra });
  const response = await item.handlers.availability(incoming(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { date: '2026-10-21', designType: 'full-art', durationMinutes: 180, timeZone: 'Asia/Jakarta', slots: [{ time: '08:00', available: true }, { time: '08:30', available: false }] });
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'availability']);
  assert.equal(item.cacheCalls.length,1);
  const bad = fixture();
  for (const change of [{}, { ...body, extra: '1' }, { ...body, designType: 'legacy' }, { ...body, durationMinutes: '120' }, { ...body, durationMinutes: 180 }, { ...body, date: '2026-02-30' }, { ...body, date: '2027-12-31' }, { ...body, date: '2026-10-19' }]) {
    assert.equal((await bad.handlers.availability(incoming({ body: change }), env)).status, 400);
  }
  assert.equal((await bad.handlers.availability(request(`${route}?extra=1`, { method: 'POST', body }), env)).status, 400);
  assert.equal(bad.calls.length, 0);
  assert.equal((await bad.handlers.availability(incoming({ base: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.availability(incoming({ origin: null }), env)).status, 403);
  assert.equal((await bad.handlers.availability(request(route), env)).status, 405);
  const failing = fixture({ getBookingAvailability: async () => { throw new BookingRequestError('CALENDAR_UNAVAILABLE'); } });
  const failure = await failing.handlers.availability(incoming(), env);
  assert.equal(failure.status, 503);
  assert.equal('slots' in await failure.json(), false);
});

test('month Calendar route returns only bounded closure dates through same-origin POST without owner authentication', async () => {
  const item = fixture();
  const body = { month: '2026-10', designType: 'simple', durationMinutes: '120' };
  const response = await item.handlers.calendar(request('calendar', { method: 'POST', body }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { month: '2026-10', designType: 'simple', durationMinutes: 120, timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] });
  secure(response);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'calendarMonth']);
  assert.deepEqual(item.calls[1][2], body);
  assert.equal(item.calls[1][3].calendar, item.provider);
  assert.equal(item.calls[1][3].occupancyCache,true);
  const bad = fixture();
  for (const changed of [{}, { month: '2026-10' }, { ...body, extra: true }, { ...body, designType: 'plain' }, { ...body, durationMinutes: 120 }, { ...body, designType: 'legacy' }, ...[202610, '2026-1', '2026-13', '0000-10', '2026-10\n', '2026-09', '2027-02'].map(month => ({ ...body, month }))]) {
    assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body: changed }), env)).status, 400);
  }
  assert.equal((await bad.handlers.calendar(request('calendar?extra=1', { method: 'POST', body }), env)).status, 400);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, origin: null }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, origin: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, base: 'https://other.example' }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Sec-Fetch-Site': 'cross-site' } }), env)).status, 403);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  assert.equal((await bad.handlers.calendar(request('calendar', { method: 'POST', body, headers: { 'Content-Length': '1025' } }), env)).status, 413);
  assert.equal(bad.calls.length, 0);
});

test('coarse public limiter permits shared studio WiFi: fifty tabs average133 reads/min and an initial200-read burst', async () => {
  const item=fixture();
  for(let i=0;i<200;i++){
    const route=i%2?'calendar':'availability';
    const body=route==='calendar'?{month:'2026-10',designType:'simple',durationMinutes:'120'}:{date:'2026-10-21',designType:'simple',durationMinutes:'120'};
    assert.equal((await item.handlers[route](request(route,{method:'POST',body}),env)).status,200);
  }
  assert.equal(item.calls.filter(call=>call[0]==='calendarMonth').length,100);
  assert.equal(item.calls.filter(call=>call[0]==='availability').length,100);
  assert.equal(item.admissionCalls.length,0,'Public polling does not run D1 submission/session counters');
});

test('public day/month share300 reads per IP/min; excess rejects before body, cache, Calendar or ledger work', async () => {
  let now=current;const item=fixture({now:()=>now});
  const dayBody={date:'2026-10-21',designType:'simple',durationMinutes:'120'};
  const monthBody={month:'2026-10',designType:'simple',durationMinutes:'120'};
  for(let i=0;i<BOOKING_HTTP_LIMITS.publicReadsPerIpMinute;i++){
    const route=i%2?'calendar':'availability';
    assert.equal((await item.handlers[route](request(route,{method:'POST',body:route==='calendar'?monthBody:dayBody}),env)).status,200);
  }
  const before=item.calls.length,cacheBefore=item.cacheCalls.length;
  for(const route of ['availability','calendar']){
    const incoming=request(route,{method:'POST',body:'{malformed-json'});
    const response=await item.handlers[route](incoming,env);assert.equal(response.status,429);assert.equal((await response.json()).code,'BOOKING_PUBLIC_RATE_LIMIT');secure(response);assert.equal(incoming.bodyUsed,false);
  }
  assert.equal(item.calls.length,before);assert.equal(item.cacheCalls.length,cacheBefore);
  assert.equal((await item.handlers.availability(request('availability',{method:'POST',body:dayBody,headers:{'CF-Connecting-IP':'198.51.100.43'}}),env)).status,200,'Another customer IP retains its own window');
  now+=60000;
  assert.equal((await item.handlers.availability(request('availability',{method:'POST',body:dayBody}),env)).status,200,'Minute expiry releases existing IP budget');
});

test('public IP state is bounded to2048 entries and expires without writing to D1', async () => {
  let now=current;const item=fixture({now:()=>now});
  for(let i=0;i<BOOKING_HTTP_LIMITS.publicIpEntries;i++){
    const incoming=request('availability',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':`2001:db8::${i.toString(16)}`}});
    assert.equal((await item.handlers.availability(incoming,env)).status,400);
  }
  const overflow=request('calendar',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':'2001:db8::ffff'}});
  assert.equal((await item.handlers.calendar(overflow,env)).status,429);assert.equal(overflow.bodyUsed,false);
  assert.equal((await item.handlers.calendar(request('calendar',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':'2001:db8::1'}}),env)).status,400,'Existing IP entries remain usable when map is full');
  now+=60000;
  assert.equal((await item.handlers.calendar(request('calendar',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':'2001:db8::ffff'}}),env)).status,400);
  assert.equal(item.calls.length,0);assert.equal(item.cacheCalls.length,0);assert.equal(item.admissionCalls.length,0);
});

test('public limiter trusts only valid edge IPs, normalizes IPv6, and exposes an explicit synthetic override', async () => {
  const item=fixture();
  for(const ip of ['', 'not-an-ip','999.1.1.1','198.51.100.1, 198.51.100.2',':::', 'example.com','2001:db8::1%zone']){
    const incoming=request('availability',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':ip,'X-Forwarded-For':'198.51.100.42'}});
    assert.equal((await item.handlers.availability(incoming,env)).status,503);assert.equal(incoming.bodyUsed,false);
  }
  const missing=request('calendar',{method:'POST',body:'{bad-json'});missing.headers.delete('CF-Connecting-IP');
  assert.equal((await item.handlers.calendar(missing,env)).status,503);assert.equal(missing.bodyUsed,false);
  for(let i=0;i<300;i++)assert.equal((await item.handlers.availability(request('availability',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':i%2?'2001:db8::1':'2001:0db8:0:0:0:0:0:1'}}),env)).status,400);
  assert.equal((await item.handlers.calendar(request('calendar',{method:'POST',body:'{bad-json',headers:{'CF-Connecting-IP':'2001:db8::1'}}),env)).status,429);
  assert.equal(item.calls.length,0);
  let allowed=0;
  const override=fixture({publicReadAdmission:incoming=>{assert.equal(incoming.bodyUsed,false);allowed++;}});
  const incoming=request('availability',{method:'POST',body:{date:'2026-10-21',designType:'simple',durationMinutes:'120'}});incoming.headers.delete('CF-Connecting-IP');
  assert.equal((await override.handlers.availability(incoming,env)).status,200);assert.equal(allowed,1);
});

test('month Calendar rejects private, mismatched or malformed internal response shapes and redacts failures', async () => {
  const monthInput = { month: '2026-10', designType: 'simple', durationMinutes: '120' };
  const valid = { ...monthInput, durationMinutes: 120, timeZone: 'Asia/Jakarta', minDate: '2026-10-20', maxDate: '2026-10-31', closedDates: ['2026-10-24'] };
  for (const result of [null, { ...valid, eventName: 'private-event' }, { ...valid, month: '2026-11' }, { ...valid, designType: 'plain' }, { ...valid, durationMinutes: '120' }, { ...valid, durationMinutes: 60 }, { ...valid, minDate: '2026-10-01' }, { ...valid, maxDate: '2026-11-01' }, { ...valid, timeZone: 'UTC' }, { ...valid, closedDates: null }, { ...valid, closedDates: ['2026-10-24', '2026-10-24'] }, { ...valid, closedDates: ['2026-10-25', '2026-10-24'] }, { ...valid, closedDates: ['2026-10-19'] }, { ...valid, closedDates: ['2026-10-32'] }, { ...valid, closedDates: ['2026-10-24\n'] }, { ...valid, closedDates: Array(32).fill('2026-10-24') }]) {
    const item = fixture({ getBookingCalendarMonth: async () => result });
    const response = await item.handlers.calendar(request('calendar', { method: 'POST', body: monthInput }), env);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(await response.json()).includes('private-event'), false);
    secure(response);
  }
  for (const error of [new Error('private token event email'), new BookingRequestError('CALENDAR_UNAVAILABLE')]) {
    const item = fixture({ getBookingCalendarMonth: async () => { throw error; } });
    const response = await item.handlers.calendar(request('calendar', { method: 'POST', body: monthInput }), env);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal('closedDates' in body, false);
    assert.equal(JSON.stringify(body).includes('private token'), false);
  }
});

test('method and CORS preflight fallthrough fail closed with explicit allowed methods', async () => {
  const item = fixture();
  for (const [handler, route, method, allowed] of [['status', 'status', 'POST', 'GET'], ['requests', 'requests', 'GET', 'POST'], ['admission','admission','POST','GET'], ['review', `review?token=${reviewToken}`, 'DELETE', 'GET, POST'], ['session', 'auth/session', 'PUT', 'GET, POST, DELETE'], ['requests', 'requests', 'OPTIONS', 'POST'], ['calendar', 'calendar', 'GET', 'POST'], ['calendar', 'calendar', 'OPTIONS', 'POST']]) {
    const response = await item.handlers[handler](request(route, { method }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allowed);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
});

test('creation rejects malformed, oversized, wrong media and unexpected fields before expensive work', async () => {
  const item = fixture();
  for (const [body, headers, status, code] of [
    [input, { 'Content-Type': 'text/plain' }, 415, 'BOOKING_MEDIA'],
    ['{bad json', {}, 409, 'BOOKING_UPDATE_REQUIRED'],
    ['[]', {}, 409, 'BOOKING_UPDATE_REQUIRED'],
    ['x'.repeat(BOOKING_MULTIPART_MAX_BYTES + 1), {'Content-Type':'multipart/form-data; boundary=synthetic-boundary'}, 413, 'BOOKING_BODY'],
    [input, { 'Content-Length': String(BOOKING_MULTIPART_MAX_BYTES + 1) }, 413, 'BOOKING_BODY'],
    [{ ...input, proof: undefined }, {}, 400, 'BOOKING_INPUT'],
    [{ ...input, approved: true }, {}, 400, 'BOOKING_INPUT'],
    [{ ...input, deposit: '1' }, {}, 400, 'BOOKING_INPUT'],
    [{ ...input, agreedPrice: 100000 }, {}, 400, 'BOOKING_INPUT'],
    [{ name: input.name }, {}, 400, 'BOOKING_INPUT'],
  ]) {
    const response = await item.handlers.requests(request('requests', { method: 'POST', body, headers }), env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
  assert.equal(item.admissionCalls.every(call=>call[0]==='preflight'),true);
});

test('anonymous admission is issued through the exact same-origin private endpoint without owner or Calendar work', async () => {
  const item=fixture({issueBookingAdmission:async()=>new Response(JSON.stringify({siteKey:env.BOOKING_TURNSTILE_SITE_KEY,nonce:'N'.repeat(64),action:'booking',expiresAt:current+7200000}),{headers:{'Set-Cookie':'__Host-chii-booking-anon=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict','Access-Control-Allow-Origin':'*','Cache-Control':'public'}})});
  const response=await item.handlers.admission(request('admission'),env);
  assert.equal(response.status,200);secure(response);
  const body=await response.json();assert.equal(body.action,'booking');assert.equal(body.siteKey,env.BOOKING_TURNSTILE_SITE_KEY);
  assert.equal(JSON.stringify(body).includes(env.BOOKING_OWNER_EMAIL),false);
  assert.equal(response.headers.getSetCookie().length,1);
  for(const incoming of [request('admission?extra=1'),request('admission',{headers:{Origin:'https://other.example'}}),request('admission',{base:'https://other.example'}),request('admission',{headers:{'Sec-Fetch-Site':'cross-site'}})])assert.ok([400,403].includes((await item.handlers.admission(incoming,env)).status));
  assert.equal(item.calls.length,0);assert.equal(item.cacheCalls.length,0);
});

test('admission denial precedes body reads, multipart parsing, Calendar creation and ledger work', async () => {
  for(const code of ['ADMISSION_REQUIRED','ADMISSION_RATE_LIMIT','ADMISSION_UNAVAILABLE']) {
    const item=fixture({preflightBookingAdmission:async incoming=>{assert.equal(incoming.bodyUsed,false);throw new BookingAdmissionError(code);}});
    const incoming=rawMultipart('malformed-body-that-must-not-be-parsed');
    const response=await item.handlers.requests(incoming,env);
    assert.equal(response.status,new BookingAdmissionError(code).status);
    assert.equal((await response.json()).code,code);
    assert.equal(incoming.bodyUsed,false);
    assert.equal(item.calls.length,0);assert.equal(item.admissionCalls.length,0);secure(response);
  }
});

test('old JSON uploads get a recoverable update-required response without decoding the image or changing the key', async () => {
  const item=fixture();
  const original=JSON.stringify(input);
  const incoming=request('requests',{method:'POST',body:original});
  const response=await item.handlers.requests(incoming,env);
  assert.equal(response.status,409);const body=await response.json();assert.equal(body.code,'BOOKING_UPDATE_REQUIRED');
  assert.equal(incoming.bodyUsed,false);assert.equal(item.calls.length,0);secure(response);
  assert.equal(input.idempotencyKey,'synthetic-request-key-1');
});

test('multipart duplicate, unknown and missing fields or extra files reject before normalization or Calendar', async () => {
  const cases=[];
  const duplicateMetadata=multipart();duplicateMetadata.append('booking',JSON.stringify(metadataOf(input)));cases.push(duplicateMetadata);
  const duplicateProof=multipart();duplicateProof.append('proof',new Blob([proofBytes],{type:'image/jpeg'}),'extra.jpg');cases.push(duplicateProof);
  const unknown=multipart();unknown.append('approved','true');cases.push(unknown);
  const extraFile=multipart();extraFile.append('other',new Blob([proofBytes],{type:'image/jpeg'}),'private.jpg');cases.push(extraFile);
  const missingProof=multipart();missingProof.delete('proof');cases.push(missingProof);
  const missingMetadata=multipart();missingMetadata.delete('booking');cases.push(missingMetadata);
  const proofString=multipart();proofString.set('proof','data:image/jpeg;base64,not-a-file');cases.push(proofString);
  const metadataFile=multipart();metadataFile.set('booking',new Blob([JSON.stringify(metadataOf(input))],{type:'application/json'}),'booking.json');cases.push(metadataFile);
  const item=fixture();
  for(const form of cases){const response=await item.handlers.requests(request('requests',{method:'POST',body:form}),env);assert.equal(response.status,400);assert.equal((await response.json()).code,'BOOKING_INPUT');secure(response);}
  assert.equal(item.calls.length,0);
});

test('multipart metadata must be bounded JSON object with typed challenge and booking values', async () => {
  const invalidMetadata=['{bad json','[]','null','true',JSON.stringify({...metadataOf(input),proof:{base64:'nested'}}),' '.repeat(4097),
    ...[null,123,{},[],true,'x'.repeat(2049)].map(turnstileToken=>JSON.stringify({...metadataOf(input),turnstileToken}))];
  const absent={...metadataOf(input)};delete absent.turnstileToken;invalidMetadata.push(JSON.stringify(absent));
  const item=fixture();
  for(const value of invalidMetadata){const form=multipart();form.set('booking',value);const response=await item.handlers.requests(request('requests',{method:'POST',body:form}),env);assert.equal(response.status,400);assert.equal((await response.json()).code,'BOOKING_INPUT');}
  assert.equal(item.calls.length,0);
  const valid=JSON.stringify(metadataOf(input));
  const exact=multipart();exact.set('booking',valid+' '.repeat(4096-Buffer.byteLength(valid)));
  assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:exact}),env)).status,201,'Exactly4096 metadata bytes are parsed; domain validation remains downstream');
  const unicode=multipart();unicode.set('booking',JSON.stringify({...metadataOf(input),name:'é'.repeat(2048)}));
  assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:unicode}),env)).status,400,'Metadata cap counts bytes, not UTF16 characters');
});

test('multipart parser enforces exact JPEG file byte boundaries; image decoding belongs to the downstream proof validator', async () => {
  for(const [size,status] of [[0,400],[3,400],[PAYMENT_PROOF_MAX_BYTES,201],[PAYMENT_PROOF_MAX_BYTES+1,400]]) {
    const item=fixture(),form=multipart();form.set('proof',new Blob([new Uint8Array(size)],{type:'image/jpeg'}),'customer-private-filename.jpg');
    const response=await item.handlers.requests(request('requests',{method:'POST',body:form}),env);assert.equal(response.status,status);
    if(status===201){const proof=item.calls.find(call=>call[0]==='create')[2].proof;assert.equal(proof.bytes.byteLength,size);assert.deepEqual(Object.keys(proof).sort(),['bytes','contentType']);}
    else assert.equal(item.calls.length,0);
  }
  for(const type of ['image/png','image/svg+xml','text/html','application/octet-stream','']) {
    const item=fixture(),form=multipart();form.set('proof',new Blob([proofBytes],{type}),'receipt.jpg');
    assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:form}),env)).status,400);assert.equal(item.calls.length,0);
  }
});

test('malformed multipart content types, bodies and declared lengths never reach expensive work', async () => {
  const item=fixture();
  for(const type of ['multipart/form-data','multipart/form-data; boundary=','multipart/form-data; boundary='+ 'x'.repeat(71),'multipart/form-data; boundary=ok; charset=utf-8','text/plain']) {
    const response=await item.handlers.requests(request('requests',{method:'POST',body:'broken',headers:{'Content-Type':type}}),env);assert.equal(response.status,415);
  }
  for(const body of ['not-a-multipart','--synthetic-boundary\r\nContent-Disposition: form-data; name="booking"\r\n\r\n{bad\r\n--synthetic-boundary--','--synthetic-boundary\r\nContent-Disposition: form-data; name="proof"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\ntruncated'])assert.equal((await item.handlers.requests(rawMultipart(body),env)).status,400);
  for(const length of ['-1','1e6','NaN',String(BOOKING_MULTIPART_MAX_BYTES+1)])assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:input,headers:{'Content-Length':length}}),env)).status,413);
  assert.equal(item.calls.length,0);
});

test('streamed bytes are capped even with missing or falsely small Content-Length and the stream is cancelled', async () => {
  for(const length of [undefined,'1']) {
    const item=fixture();let cancelled=false;
    const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(BOOKING_MULTIPART_MAX_BYTES+1));},cancel(){cancelled=true;}});
    const incoming=new Request(`${env.SITE_URL}/api/booking/requests`,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'multipart/form-data; boundary=synthetic-boundary',...(length?{'Content-Length':length}:{})},body,duplex:'half'});
    const response=await item.handlers.requests(incoming,env);assert.equal(response.status,413);assert.equal((await response.json()).code,'BOOKING_BODY');assert.equal(cancelled,true);assert.equal(item.calls.length,0);
  }
});

test('ordinary fragmented multipart preserves exact source bytes and the immutable request key', async () => {
  const template=request('requests',{method:'POST',body:input});
  const contentType=template.headers.get('Content-Type'),bytes=new Uint8Array(await template.arrayBuffer());
  let offset=0;
  const stream=new ReadableStream({pull(controller){if(offset>=bytes.length)return controller.close();controller.enqueue(bytes.subarray(offset,offset+3));offset+=3;}});
  const incoming=new Request(`${env.SITE_URL}/api/booking/requests`,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':contentType},body:stream,duplex:'half'});
  const item=fixture();const response=await item.handlers.requests(incoming,env);assert.equal(response.status,201);
  assert.deepEqual(item.calls.find(call=>call[0]==='create')[2],uploadedInput(input));
});

test('excessive tiny or empty multipart chunks stop at a bounded count and cancel before parsing', async () => {
  for(const value of [new Uint8Array([1]),new Uint8Array(0)]) {
    const item=fixture();let pulls=0,cancelled=false;
    const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(value);},cancel(){cancelled=true;}});
    const incoming=new Request(`${env.SITE_URL}/api/booking/requests`,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'multipart/form-data; boundary=synthetic-boundary'},body:stream,duplex:'half'});
    const response=await item.handlers.requests(incoming,env);assert.equal(response.status,413);assert.equal((await response.json()).code,'BOOKING_BODY');assert.equal(cancelled,true);assert.ok(pulls<=(value.length===0?34:4098));assert.equal(item.calls.length,0);
  }
});

test('non-byte upload stream chunks receive a controlled input error and are cancelled', async () => {
  const item=fixture();let cancelled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue('invalid-byte-stream');},cancel(){cancelled=true;}});
  const incoming=new Request(`${env.SITE_URL}/api/booking/requests`,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'multipart/form-data; boundary=synthetic-boundary'},body:stream,duplex:'half'});
  const response=await item.handlers.requests(incoming,env);assert.equal(response.status,400);assert.equal((await response.json()).code,'BOOKING_INPUT');assert.equal(cancelled,true);assert.equal(item.calls.length,0);
});

test('missing or demonstration upload resources disable new submissions while preserving owner review', async () => {
  for(const change of [{BOOKING_IMAGES:{}},{BOOKING_TURNSTILE_SITE_KEY:'1x00000000000000000000AA'},{BOOKING_TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'},{BOOKING_TURNSTILE_SECRET_KEY:'short'},{BOOKING_TURNSTILE_SITE_KEY:'spaces are invalid'}]) {
    const config={...env,...change};assert.equal(isBookingEnabled(config),false);
    const item=fixture();assert.equal((await item.handlers.requests(request('requests',{method:'POST',body:input}),config)).status,503);assert.equal(item.admissionCalls.length,0);
    assert.equal((await item.handlers.review(request(`review?token=${reviewToken}`),config)).status,200);
  }
});

test('real normalizer failures retain fixed actionable proof errors without reflecting provider details', async () => {
  for(const [bytes,providerStatus,expectedStatus,expectedCode] of [[new Uint8Array([255,216,255,217]),200,400,'PROOF_INVALID'],[proofBytes,413,413,'PROOF_SIZE'],[proofBytes,503,503,'PROOF_UNAVAILABLE']]) {
    let attempts=0;
    const item=fixture({createBookingRequest:async(_config,body)=>normalizePaymentProof({BOOKING_IMAGES:{fetch:async()=>new Response('private decoder diagnostics',{status:providerStatus})}},await validatePaymentProof(body.proof),{maxAttempts:2,consumeTransformAttempt(){attempts++;}})});
    const response=await item.handlers.requests(request('requests',{method:'POST',body:{...input,proof:{contentType:'image/jpeg',bytes}}}),env);
    assert.equal(response.status,expectedStatus);secure(response);
    const body=await response.json();assert.equal(body.code,expectedCode);assert.equal(JSON.stringify(body).includes('private decoder'),false);
    assert.equal('fields' in body,expectedStatus!==503);
    if(body.fields)assert.deepEqual(Object.keys(body.fields),['proof']);
    assert.equal(attempts,expectedCode==='PROOF_INVALID'?0:expectedCode==='PROOF_SIZE'?2:1);
  }
  const error=new PaymentProofValidationError('PRIVATE_UNKNOWN_CODE',400);error.message='private decoder diagnostics';
  const item=fixture({createBookingRequest:async()=>{throw error;}});
  const response=await item.handlers.requests(request('requests',{method:'POST',body:input}),env);
  assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'BOOKING_UNAVAILABLE');assert.equal(JSON.stringify(body).includes('PRIVATE'),false);assert.equal(JSON.stringify(body).includes('private decoder'),false);
});

test('slow request bodies are timed out and cancelled without touching the ledger', async () => {
  let cancelled = false;
  const item = fixture({ bodyTimeoutMs: 10 });
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const incoming = new Request(`${env.SITE_URL}/api/booking/requests`, { method: 'POST', headers: { Origin: env.SITE_URL, 'Content-Type': 'multipart/form-data; boundary=synthetic-boundary' }, body, duplex: 'half' });
  const response = await item.handlers.requests(incoming, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'BOOKING_TIMEOUT');
  assert.equal(cancelled, true);
  assert.equal(item.calls.length, 0);
});

test('default receipt upload accepts a weak-uplink body arriving after 45 seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const item = fixture();
  const template=request('requests',{method:'POST',body:input});
  const contentType=template.headers.get('Content-Type');
  const bytes=new Uint8Array(await template.arrayBuffer());
  let upload;
  const body = new ReadableStream({ start(controller) { upload = controller; controller.enqueue(bytes.slice(0, 32)); } });
  const incoming = new Request(`${env.SITE_URL}/api/booking/requests`, { method: 'POST', headers: { Origin: env.SITE_URL, 'Content-Type': contentType }, body, duplex: 'half' });
  const response = item.handlers.requests(incoming, env);
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(45000);
  upload.enqueue(bytes.slice(32));
  upload.close();
  assert.equal((await response).status, 201);
  assert.deepEqual(item.calls.map(call => call[0]), ['calendar', 'create']);
  assert.deepEqual(item.calls[1][2], uploadedInput(input));
});

test('default receipt upload still cancels a stalled body after two minutes without touching the ledger', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const item = fixture();
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const incoming = new Request(`${env.SITE_URL}/api/booking/requests`, { method: 'POST', headers: { Origin: env.SITE_URL, 'Content-Type': 'multipart/form-data; boundary=synthetic-boundary' }, body, duplex: 'half' });
  const pending = item.handlers.requests(incoming, env);
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(120000);
  const response = await pending;
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'BOOKING_TIMEOUT');
  assert.equal(cancelled, true);
  assert.equal(item.calls.length, 0);
});

test('unauthenticated review cannot inspect tokens, bodies or private ledger data', async () => {
  const item = fixture({ requireBookingOwner: async () => { throw new BookingAuthError('AUTH_REQUIRED'); } });
  for (const incoming of [request('review?token=invalid'), request(`review?token=${reviewToken}`, { method: 'POST', body: '{bad json' })]) {
    const response = await item.handlers.review(incoming, env);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'AUTH_REQUIRED');
    assert.equal(JSON.stringify(body).includes(summary.name), false);
    assert.equal(JSON.stringify(body).includes(env.BOOKING_OWNER_EMAIL), false);
    secure(response);
  }
  assert.equal(item.calls.length, 0);
});

test('read-only review authenticates first and forwards verified internal owner identity', async () => {
  const item = fixture();
  const response = await item.handlers.review(request(`review?token=${reviewToken}`), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), summary);
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'read']);
  assert.equal(item.calls[1][2], reviewToken);
  assert.deepEqual(item.calls[1][3].owner, { email: identity.email, subject: identity.subject, verified: true });
  assert.equal('csrfToken' in item.calls[1][3].owner, false);
  assert.equal('calendar' in item.calls[1][3], false);
});

test('payment-proof image requires owner auth before token lookup and uses private image-only response headers', async () => {
  const denied = fixture({ requireBookingOwner: async () => { throw new BookingAuthError('AUTH_REQUIRED'); } });
  for (const token of ['invalid', reviewToken]) {
    const response = await denied.handlers.proof(request(`proof?token=${token}`), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'AUTH_REQUIRED');
    secure(response);
  }
  assert.equal(denied.calls.length, 0);
  const item = fixture();
  const response = await item.handlers.proof(request(`proof?token=${reviewToken}`), env);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), proofBytes);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Content-Length'), String(proofBytes.length));
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'proof']);
  assert.deepEqual(item.calls[1][3].owner, { email: identity.email, subject: identity.subject, verified: true });
});

test('payment-proof route rejects bad or duplicate tokens, cross-site reads, mutations and expired bytes', async () => {
  const item = fixture();
  for (const suffix of ['?token=invalid', `?token=${reviewToken}&token=${reviewToken}`, `?token=${reviewToken}&extra=1`]) assert.equal((await item.handlers.proof(request(`proof${suffix}`), env)).status, 404);
  assert.equal(item.calls.every(call => call[0] === 'owner'), true);
  const before = item.calls.length;
  assert.equal((await item.handlers.proof(request(`proof?token=${reviewToken}`, { origin: 'https://attacker.example', headers: { Origin: 'https://attacker.example' } }), env)).status, 403);
  assert.equal((await item.handlers.proof(request(`proof?token=${reviewToken}`, { method: 'POST', body: {} }), env)).status, 405);
  assert.equal(item.calls.length, before);
  const expired = fixture({ getBookingPaymentProof: async () => { throw new BookingRequestError('PROOF_EXPIRED', 410); } });
  const response = await expired.handlers.proof(request(`proof?token=${reviewToken}`), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'PROOF_EXPIRED');
  secure(response);
});

test('malformed and duplicate review tokens produce no store lookup after authentication', async () => {
  const item = fixture();
  for (const path of ['review', 'review?token=invalid', `review?token=${reviewToken}&token=${reviewToken}`, `review?token=${reviewToken}&other=1`]) {
    const response = await item.handlers.review(request(path), env);
    assert.equal(response.status, 404);
  }
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'owner', 'owner', 'owner']);
});

test('owner mutation CSRF rejection occurs before decision payload parsing or storage', async () => {
  const item = fixture({ requireBookingOwner: async incoming => {
    assert.equal(incoming.method, 'POST');
    assert.equal(incoming.headers.get('Origin'), env.SITE_URL);
    throw new BookingAuthError('AUTH_CSRF');
  } });
  const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: '{bad json' }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'AUTH_CSRF');
  assert.equal(item.calls.length, 0);
});

test('cancellation forwards only the explicit action and never instantiates Calendar', async () => {
  const item = fixture();
  const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: { action: 'cancel' }, headers: { 'X-CSRF-Token': identity.csrfToken } }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'cancelled');
  assert.deepEqual(item.calls.map(call => call[0]), ['owner', 'decide']);
  assert.equal(item.calls[1][3], 'cancel');
  assert.equal('calendar' in item.calls[1][4], false);
});

test('accept lazily caches the Calendar provider per credential set and invalidates rotations', async () => {
  const item = fixture();
  const send = config => item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body: { action: 'accept' }, headers: { 'X-CSRF-Token': identity.csrfToken } }), config);
  assert.equal((await send(env)).status, 200);
  assert.equal((await send({ ...env })).status, 200);
  assert.equal(item.calls.filter(call => call[0] === 'calendar').length, 1);
  const decision = item.calls.find(call => call[0] === 'decide');
  assert.equal(decision[4].calendar, item.provider);
  assert.equal(decision[4].owner.verified, true);
  assert.equal((await send({ ...env, GOOGLE_CALENDAR_ID: 'rotated-calendar@group.calendar.google.com' })).status, 200);
  assert.equal(item.calls.filter(call => call[0] === 'calendar').length, 2);
});

test('invalid decisions and oversized bodies never initialize Calendar or decide', async () => {
  const item = fixture();
  for (const body of [{ action: 'approve' }, { action: 'accept', approved: true }, {}, { action: 'accept', note: 'x'.repeat(1024) }]) {
    const response = await item.handlers.review(request(`review?token=${reviewToken}`, { method: 'POST', body }), env);
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal(item.calls.every(call => call[0] === 'owner'), true);
});

test('auth/session delegates its three methods without touching store or Calendar and preserves cookies', async () => {
  const upstreamHeaders = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public' });
  upstreamHeaders.append('Set-Cookie', '__Secure-chii_booking_owner=synthetic; Path=/api/booking; Secure; HttpOnly');
  upstreamHeaders.append('Set-Cookie', '__Secure-chii_booking_challenge=; Path=/api/booking; Max-Age=0; Secure; HttpOnly');
  const item = fixture({ signInOwner: async () => new Response(JSON.stringify({ authenticated: true, csrfToken: 'D'.repeat(43) }), { headers: upstreamHeaders }) });
  const signedIn = await item.handlers.session(request('auth/session', { method: 'POST', body: { credential: 'synthetic', nonce: 'N'.repeat(43) } }), env);
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).authenticated, true);
  assert.equal(signedIn.headers.getSetCookie().length, 2);
  secure(signedIn);
  assert.equal((await item.handlers.session(request('auth/session'), env)).status, 200);
  assert.equal((await item.handlers.session(request('auth/session', { method: 'DELETE', headers: { 'X-CSRF-Token': identity.csrfToken } }), env)).status, 200);
  assert.deepEqual(item.calls.map(call => call[0]), ['challenge', 'signOut']);
});

test('typed failures preserve safe status/code while untrusted details and unknown errors are redacted', async () => {
  const privateDetail = 'private-email@example.com private-key synthetic-secret';
  const validation = new BookingRequestError('BOOKING_INPUT', 400, { name: privateDetail, date: 'bad date', password: privateDetail });
  validation.message = privateDetail;
  const item = fixture({ createBookingRequest: async () => { throw validation; } });
  const response = await item.handlers.requests(request('requests', { method: 'POST', body: input }), env);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'BOOKING_INPUT');
  assert.deepEqual(Object.keys(body.fields).sort(), ['date', 'name']);
  assert.equal(JSON.stringify(body).includes(privateDetail), false);
  for (const error of [new Error(privateDetail), { status: 400, code: privateDetail, message: privateDetail }, new BookingRequestError(privateDetail, 400)]) {
    const failing = fixture({ createBookingRequest: async () => { throw error; } });
    const safe = await failing.handlers.requests(request('requests', { method: 'POST', body: input }), env);
    assert.equal(safe.status, 503);
    assert.deepEqual(await safe.json(), { code: 'BOOKING_UNAVAILABLE', message: 'Permintaan belum dapat diproses. Coba lagi sebentar.' });
  }
});

test('Pages wrappers resolve correctly and remain disabled without configuration', async () => {
  for (const [path, method, status] of [['status', 'GET', 200], ['requests', 'POST', 503], ['admission','GET',503], ['review', 'GET', 503], ['auth/session', 'GET', 503], ['availability', 'GET', 503], ['calendar', 'POST', 503], ['proof', 'GET', 503]]) {
    const wrapper = await import(`../functions/api/booking/${path}.js`);
    const response = await wrapper.onRequest({ request: request(path, { method }), env: {} });
    assert.equal(response.status, status);
    secure(response);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_PROCESSOR_CONFIG_FIELDS, bookingProcessorConfig, forwardBookingSubmission } from './booking-processor.js';
import { createBookingHttpHandlers, isBookingSubmissionEnabled } from './booking-http.js';

const origin = 'https://chiinails.pages.dev';
const config = {
  BOOKING_ENABLED:'true',SITE_URL:origin,BOOKING_LINK_SECRET:'synthetic-only-link-secret-with-32-bytes',
  BOOKING_OWNER_EMAIL:'owner@example.test',BOOKING_TURNSTILE_SITE_KEY:'synthetic_site_key_0123456789',
  BOOKING_TURNSTILE_SECRET_KEY:'synthetic_turnstile_secret_0123456789',
  GOOGLE_SERVICE_ACCOUNT_EMAIL:'synthetic@project.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\nU1lOVEhFVElD\n-----END PRIVATE KEY-----',
  GOOGLE_CALENDAR_ID:'synthetic@group.calendar.google.com',
};
const incoming = (extra={}) => new Request(`${origin}/api/booking/requests`, {
  method:'POST',headers:{Origin:origin,'Content-Type':'multipart/form-data; boundary=synthetic','CF-Connecting-IP':'198.51.100.1'},body:'synthetic bytes',...extra,
});

test('Pages transfers the original untouched stream once with only submission configuration',async()=>{
  let calls=0;
  const request=incoming();
  const response=await forwardBookingSubmission(request,{
    ...config,BOOKING_AUTH_SECRET:'must-never-leave-Pages',UNRELATED_SECRET:'private',
    BOOKING_PROCESSOR:{getByName(name){assert.equal(name,'booking-v1');return {async submit(got,settings){
      calls++; assert.equal(got,request);assert.equal(got.bodyUsed,false);
      assert.equal(got.headers.get('CF-Connecting-IP'),'198.51.100.1');
      assert.equal(got.headers.get('Origin'),origin);
      assert.deepEqual(Object.keys(settings).sort(),[...BOOKING_PROCESSOR_CONFIG_FIELDS].sort());
      assert.equal(settings.BOOKING_AUTH_SECRET,undefined);assert.equal(settings.UNRELATED_SECRET,undefined);
      assert.equal(await got.text(),'synthetic bytes');
      return Response.json({requestId:'synthetic-id'},{status:201});
    }};}},
  });
  assert.equal(response.status,201);assert.equal(calls,1);
});

test('processor outage never triggers another attempt or reflects internal secrets',async()=>{
  let calls=0;
  const response=await forwardBookingSubmission(incoming(),{...config,BOOKING_PROCESSOR:{getByName(){return {async submit(){calls++;throw Error('sensitive internal detail');}};}}});
  assert.equal(calls,1);assert.equal(response.status,503);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  const body=await response.text();assert.ok(!body.includes('sensitive'));assert.ok(body.includes('Isian tetap tersimpan'));
});

test('disabled, unbound, incomplete and oversized submissions fail before private RPC',async()=>{
  let calls=0;
  const binding={getByName(){calls++;throw Error('must not run');}};
  for(const env of [{...config,BOOKING_PROCESSOR:binding,BOOKING_ENABLED:'false'},{...config,BOOKING_PROCESSOR:binding,BOOKING_SUBMISSIONS_DISABLED:'true'},config,{...config,BOOKING_PROCESSOR:binding,BOOKING_LINK_SECRET:undefined}]){
    assert.equal((await forwardBookingSubmission(incoming(),env)).status,503);
  }
  const large=incoming({headers:{Origin:origin,'Content-Length':'528385'}});
  assert.equal((await forwardBookingSubmission(large,{...config,BOOKING_PROCESSOR:binding})).status,413);
  assert.equal(calls,0);
});

test('wrong method, origin and path never cross the private boundary',async()=>{
  const env={...config,BOOKING_PROCESSOR:{getByName(){throw Error('must not run');}}};
  assert.equal((await forwardBookingSubmission(new Request(`${origin}/api/booking/requests`),env)).status,405);
  for(const request of [incoming({headers:{Origin:'https://attacker.example'}}),incoming({headers:{Origin:origin,'Sec-Fetch-Site':'cross-site'}}),new Request(`${origin}/api/booking/review`,{method:'POST',headers:{Origin:origin}}),new Request(`${origin}/api/booking/requests?secret=x`,{method:'POST',headers:{Origin:origin}})]){
    assert.equal((await forwardBookingSubmission(request,env)).status,403);
  }
});

test('submission readiness works without owner login secrets while owner access still requires them',async()=>{
  const env={...config,BOOKING_DB:{prepare(){},batch(){}},BOOKING_IMAGES:{fetch(){}}};
  assert.equal(isBookingSubmissionEnabled(env),true);
  const handlers=createBookingHttpHandlers({isSubmissionEnabled:isBookingSubmissionEnabled});
  const owner=await handlers.review(new Request(`${origin}/api/booking/review?token=${'A'.repeat(43)}`),env);
  assert.equal(owner.status,503);
  for(const field of BOOKING_PROCESSOR_CONFIG_FIELDS){const missing={...env};delete missing[field];assert.equal(isBookingSubmissionEnabled(missing),false,field);}
  assert.equal(bookingProcessorConfig({...config,BOOKING_AUTH_SECRET:'excluded'}).BOOKING_AUTH_SECRET,undefined);
});

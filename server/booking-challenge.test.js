import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingChallengeError, createBookingChallenge } from '../src/scripts/booking-challenge.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const session = {siteKey:'synthetic-site-key',nonce:'a'.repeat(64),expiresAt:Date.now()+7200000,action:'booking',...options.session};
  const container = {hidden:true,clientWidth:options.width ?? 400};
  const calls = [], widgets = [], removed = [], timers = new Map();
  let nextTimer=0;
  const turnstile = {
    render(element,settings) {assert.equal(element,container);widgets.push(settings);return String(widgets.length);},
    execute(id) {calls.push(['execute',id]);if(options.auto) widgets.at(-1).callback('token-'+widgets.length);},
    remove(id) {removed.push(id);},
  };
  const challenge = createBookingChallenge({
    container:options.noContainer?null:container,
    api:options.api || (async path=>{calls.push(['api',path]);return session;}),
    load:options.load || (async()=>{calls.push(['load']);return turnstile;}),
    setTimer(callback,ms) {const id=++nextTimer;timers.set(id,{callback,ms});return id;},
    clearTimer(id) {timers.delete(id);},
  });
  return {challenge,session,container,calls,widgets,removed,timers,turnstile};
}

test('fresh challenge per Book uses session nonce, fixed action, and removes widget after success',async()=>{
  const f=fixture({auto:true});
  assert.deepEqual(await f.challenge.verify(),{nonce:'a'.repeat(64),token:'token-1'});
  assert.deepEqual(await f.challenge.verify(),{nonce:'a'.repeat(64),token:'token-2'});
  assert.equal(f.calls.filter(([type])=>type==='api').length,2);
  assert.equal(f.widgets[0].cData,f.session.nonce);
  assert.equal(f.widgets[0].action,'booking');
  assert.equal(f.widgets[0].execution,'execute');
  assert.equal(f.widgets[0]['response-field'],false);
  assert.equal(f.container.hidden,true);
  assert.deepEqual(f.removed,['1','2']);
  assert.equal(f.timers.size,0);
});

test('small screens receive a compact challenge; larger forms receive flexible layout',async()=>{
  for(const [width,size] of [[280,'compact'],[300,'flexible'],[400,'flexible']]) {
    const f=fixture({width,auto:true});await f.challenge.verify();assert.equal(f.widgets[0].size,size);
  }
});

test('duplicate Book cannot request a second session while session fetch is pending',async()=>{
  let release;
  const f=fixture({api:()=>new Promise(resolve=>{release=resolve;})});
  const first=f.challenge.verify();
  await assert.rejects(f.challenge.verify(),error=>error.code==='CHALLENGE_IN_PROGRESS');
  f.challenge.cancel();release(f.session);
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(f.widgets.length,0);
});

test('page departure during script loading never starts a late widget',async()=>{
  let release;
  const f=fixture({load:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.challenge.verify();await tick();f.challenge.cancel();release(f.turnstile);
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(f.widgets.length,0);assert.equal(f.container.hidden,true);
});

test('offline/page departure cancels visible challenge and ignores its late callback',async()=>{
  const f=fixture();const pending=f.challenge.verify();await tick();
  const rejected=assert.rejects(pending,{name:'AbortError'});
  f.challenge.cancel();f.widgets[0].callback('late-token');await rejected;
  assert.equal(f.container.hidden,true);assert.equal(f.timers.size,0);assert.deepEqual(f.removed,['1']);
  const next=f.challenge.verify();await tick();f.widgets[1].callback('fresh-token');
  assert.equal((await next).token,'fresh-token');
});

test('invalid admission metadata fails before loading third-party code',async()=>{
  for(const session of [{nonce:'bad'},{siteKey:'bad'},{action:'accept'},{expiresAt:0},{expiresAt:NaN}]) {
    const f=fixture({session});await assert.rejects(f.challenge.verify(),BookingChallengeError);
    assert.equal(f.calls.some(([type])=>type==='load'),false);assert.equal(f.widgets.length,0);
  }
});

test('script failures and missing container fail closed while permitting another attempt',async()=>{
  let fail=true;
  const f=fixture({load:async()=>{if(fail) throw new BookingChallengeError();return f.turnstile;},auto:true});
  await assert.rejects(f.challenge.verify(),BookingChallengeError);fail=false;
  assert.equal((await f.challenge.verify()).token,'token-1');
  await assert.rejects(fixture({noContainer:true}).challenge.verify(),BookingChallengeError);
});

test('provider error, expiry, timeout and invalid token produce bounded errors with no orphan widget',async()=>{
  for(const [callback,argument,code] of [['error-callback',undefined,'CHALLENGE_UNAVAILABLE'],['expired-callback',undefined,'CHALLENGE_EXPIRED'],['timeout-callback',undefined,'CHALLENGE_TIMEOUT'],['callback','', 'CHALLENGE_UNAVAILABLE'],['callback','x'.repeat(2049),'CHALLENGE_UNAVAILABLE']]) {
    const f=fixture();const pending=f.challenge.verify();await tick();
    const rejected=assert.rejects(pending,error=>error.code===code);
    f.widgets[0][callback](argument);await rejected;
    assert.equal(f.container.hidden,true);assert.equal(f.timers.size,0);assert.deepEqual(f.removed,['1']);
  }
});

test('challenge has a two-minute upper bound independent of provider callbacks',async()=>{
  const f=fixture();const pending=f.challenge.verify();await tick();
  const rejected=assert.rejects(pending,error=>error.code==='CHALLENGE_TIMEOUT');
  const timer=[...f.timers.values()][0];assert.equal(timer.ms,120000);timer.callback();await rejected;
  assert.equal(f.timers.size,0);assert.equal(f.container.hidden,true);
});

test('admission HTTP errors retain their fixed code and do not load a widget',async()=>{
  const f=fixture({api:async()=>{throw Object.assign(new Error('request'),{code:'ADMISSION_RATE_LIMIT',status:429});}});
  await assert.rejects(f.challenge.verify(),error=>error.code==='ADMISSION_RATE_LIMIT'&&error.status===429);
  assert.equal(f.widgets.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/booking-images.js';
import { proofBytes } from './fixtures/payment-proof.js';

const request = (bytes = proofBytes, headers = {}) => new Request('https://booking-images.internal/normalize', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Chii-Image-Attempt': '1', ...headers }, body: bytes });
function images({ output = proofBytes, info = { width: 2, height: 2 }, failure } = {}) {
  const calls = [];
  const binding = {
    async info(stream) { calls.push('info'); await new Response(stream).arrayBuffer(); if (failure === 'info') throw new Error('private'); return info; },
    input(stream) {
      calls.push('input');
      return { transform(options) {
        calls.push(options);
        return { async output(options) {
          calls.push(options); await new Response(stream).arrayBuffer();
          if (failure === 'output') throw new Error('private');
          return { response() { return new Response(output, { headers: { 'Content-Type': 'image/jpeg' } }); } };
        } };
      } };
    },
  };
  return { binding, calls };
}

test('private image helper rejects public origins, wrong methods and missing bindings', async () => {
  assert.equal((await worker.fetch(new Request('https://example.com/normalize', { method: 'POST' }), {})).status, 404);
  assert.equal((await worker.fetch(new Request('https://booking-images.internal/normalize'), {})).status, 405);
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal((await worker.fetch(request(proofBytes, { 'Content-Type': 'image/png' }), {})).status, 422);
  assert.equal((await worker.fetch(request(proofBytes, { 'X-Chii-Image-Attempt': '3' }), {})).status, 422);
});

test('private image helper checks metadata then requests a full JPEG decode/re-encode once', async () => {
  for (const attempt of ['1', '2']) {
    const fixture = images();
    const response = await worker.fetch(request(proofBytes, { 'X-Chii-Image-Attempt': attempt }), { IMAGES: fixture.binding });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), proofBytes);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(response.headers.get('Content-Security-Policy'), /sandbox/);
    assert.deepEqual(fixture.calls, ['info','input',{ width:attempt==='1'?1600:1200,height:attempt==='1'?1600:1200,fit:'scale-down' },{ format:'image/jpeg',quality:attempt==='1'?82:72,anim:false }]);
  }
});

test('invalid source containers and dimensions cannot pass on metadata alone', async () => {
  for (const bytes of [new Uint8Array([255,216,255,217]), proofBytes.subarray(0,-2), new TextEncoder().encode('<svg>not JPEG</svg>')]) {
    const fixture = images();
    assert.equal((await worker.fetch(request(bytes), { IMAGES: fixture.binding })).status, 422);
    assert.deepEqual(fixture.calls, []);
  }
  for (const info of [{ width:1601,height:2 }, { width:0,height:2 }, { width:2,height:NaN }]) {
    const fixture=images({info});
    assert.equal((await worker.fetch(request(),{ IMAGES:fixture.binding })).status,422);
    assert.deepEqual(fixture.calls,['info']);
  }
});

test('corrupt generated output, quota/provider failures and expansion return sanitized private errors', async () => {
  const huge = new Uint8Array(512001);
  for (const [options,status] of [[{output:huge},413],[{output:new Uint8Array([255,216,255,217])},503],[{failure:'info'},503],[{failure:'output'},503]]) {
    const fixture=images(options);
    const response=await worker.fetch(request(),{IMAGES:fixture.binding});
    assert.equal(response.status,status);
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.doesNotMatch(await response.text(),/private|stack|customer/i);
    assert.ok(fixture.calls.filter(value=>value==='input').length<=1);
  }
});

test('private helper admits at most eight concurrent images and releases its guard after completion or error', {timeout:3000}, async t => {
  const fixture=images();const releases=[];let infoCalls=0,allReady;
  const ready=new Promise(resolve=>{allReady=resolve;});
  fixture.binding.info=async stream=>{infoCalls++;await new Response(stream).arrayBuffer();await new Promise(resolve=>{releases.push(resolve);if(releases.length===8)allReady();});return {width:2,height:2};};
  t.after(()=>releases.forEach(release=>release()));
  const held=Array.from({length:8},()=>worker.fetch(request(),{IMAGES:fixture.binding}));
  const denied=await worker.fetch(request(),{IMAGES:fixture.binding});
  assert.equal(denied.status,503);
  assert.equal(denied.headers.get('Cache-Control'),'private, no-store');
  await ready;
  assert.equal(infoCalls,8,'pressure rejection performs no ninth Images call');
  releases.splice(0).forEach(release=>release());
  assert.ok((await Promise.all(held)).every(response=>response.status===200));
  const failures=await Promise.all(Array.from({length:8},()=>worker.fetch(request(),{IMAGES:images({failure:'output'}).binding})));
  assert.ok(failures.every(response=>response.status===503));
  assert.equal((await worker.fetch(request(),{IMAGES:images().binding})).status,200,'finally releases admission after errors');
});

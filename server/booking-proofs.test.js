import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import { validatePaymentProof, paymentProofBytes, PAYMENT_PROOF_MAX_BYTES, bytesToHex, inspectPaymentProofJpeg, normalizePaymentProof, boundedProofBytes, cleanupExpiredPaymentProofs } from './booking-proofs.js';
import { proof, proofBytes } from './fixtures/payment-proof.js';

test('receipt parser accepts a real synthetic JPEG with a stable SHA-256 digest', async () => {
  const result = await validatePaymentProof(proof);
  assert.deepEqual(result.bytes, proofBytes);
  assert.equal(result.digest, Buffer.from(await crypto.subtle.digest('SHA-256', proofBytes)).toString('hex'));
  assert.equal(result.digest.length, 64);
  assert.deepEqual(paymentProofBytes(proofBytes.buffer), proofBytes);
  assert.deepEqual(paymentProofBytes([...proofBytes]), proofBytes);
});

test('receipt parser rejects missing, noncanonical, oversized, HTML, SVG and wrong media type inputs', async () => {
  const bad = [undefined, null, [], {}, { ...proof, contentType: 'image/svg+xml' }, { ...proof, filename: 'private.jpg' },
    { ...proof, base64: `data:image/jpeg;base64,${proof.base64}` }, { ...proof, base64: `${proof.base64}\n` },
    { ...proof, base64: proof.base64.slice(1) }, { ...proof, base64: proof.base64.replace(/\//g, '_') },
    { ...proof, base64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') },
    { ...proof, base64: Buffer.from('<html>not an image</html>').toString('base64') },
    { ...proof, base64: Buffer.from(proofBytes.slice(0, -2)).toString('base64') }];
  const large = new Uint8Array(PAYMENT_PROOF_MAX_BYTES + 1);
  large.set([255, 216, 255]); large.set([255, 217], large.length - 2);
  bad.push({ ...proof, base64: Buffer.from(large).toString('base64') });
  for (const value of bad) assert.equal(await validatePaymentProof(value), null);
  assert.equal(paymentProofBytes([255, 216, 255, -1, 255, 217]), null);
  // Canonical base64 padding bits must match the decoded bytes exactly.
  assert.equal(await validatePaymentProof({ ...proof, base64: '/9j/2R==' }), null);
});

test('the exact 500 KiB decoded boundary remains bounded and hashes without recursion', async () => {
  const bytes = new Uint8Array(PAYMENT_PROOF_MAX_BYTES);
  bytes.set([255, 216, 255]); bytes.set([255, 217], bytes.length - 2);
  const result = await validatePaymentProof({ ...proof, base64: Buffer.from(bytes).toString('base64') });
  assert.equal(result.bytes.length, PAYMENT_PROOF_MAX_BYTES);
});

test('binary and legacy transports produce one immutable digest, including a subarray source', async () => {
  const padded = new Uint8Array(proofBytes.length + 20);
  padded.set(proofBytes, 10);
  const binary = await validatePaymentProof({ contentType: 'image/jpeg', bytes: padded.subarray(10, -10) });
  const legacy = await validatePaymentProof(proof);
  assert.equal(binary.digest, legacy.digest);
  assert.deepEqual(binary.bytes, proofBytes);
  assert.equal((await validatePaymentProof({ contentType: 'image/jpeg', bytes: proofBytes.buffer })).digest, legacy.digest);
  assert.equal(await validatePaymentProof({ ...proof, bytes: proofBytes }), null);
  assert.equal(await validatePaymentProof({ contentType: 'image/jpeg', bytes: [...proofBytes] }), null);
});

test('native hexadecimal and strict base64 paths retain equivalent bytes and canonical rules', async t => {
  const original = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64');
  const hexOriginal = Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toHex');
  t.after(() => {
    if (original) Object.defineProperty(Uint8Array, 'fromBase64', original); else delete Uint8Array.fromBase64;
    if (hexOriginal) Object.defineProperty(Uint8Array.prototype, 'toHex', hexOriginal); else delete Uint8Array.prototype.toHex;
  });
  let calls = 0;
  Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, value(value, options) {
    calls++;
    assert.deepEqual(options, { lastChunkHandling: 'strict' });
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) throw new SyntaxError('padding');
    return new Uint8Array(bytes);
  } });
  Object.defineProperty(Uint8Array.prototype, 'toHex', { configurable: true, value() { return Buffer.from(this).toString('hex'); } });
  assert.equal((await validatePaymentProof(proof)).digest, Buffer.from(await crypto.subtle.digest('SHA-256', proofBytes)).toString('hex'));
  assert.equal(await validatePaymentProof({ ...proof, base64: '/9j/2R==' }), null);
  const before = calls;
  assert.equal(await validatePaymentProof({ ...proof, base64: proof.base64 + '\n' }), null);
  assert.equal(calls, before, 'alphabet/size guard precedes native decode');
  assert.equal(bytesToHex(new Uint8Array([0, 127, 255])), '007fff');
});

test('new-image preflight rejects incomplete containers and bounded dimension bombs', () => {
  assert.deepEqual(inspectPaymentProofJpeg(proofBytes), { width: 2, height: 2 });
  assert.equal(inspectPaymentProofJpeg(new Uint8Array([255, 216, 255, 217])), null);
  assert.equal(inspectPaymentProofJpeg(proofBytes.subarray(0, -2)), null);
  const oversized = proofBytes.slice();
  const sof = oversized.findIndex((byte, index) => byte === 255 && oversized[index + 1] === 192);
  assert.ok(sof > 0);
  oversized[sof + 7] = 6; oversized[sof + 8] = 65;
  assert.equal(inspectPaymentProofJpeg(oversized), null, 'width 1601 rejected');
  const truncatedSegment = proofBytes.slice(); truncatedSegment[4] = 255; truncatedSegment[5] = 255;
  assert.equal(inspectPaymentProofJpeg(truncatedSegment), null);
  const excessiveSegments = new Uint8Array([...proofBytes.subarray(0, 2), ...Array.from({ length: 257 }, () => [255, 225, 0, 2]).flat(), ...proofBytes.subarray(2)]);
  assert.equal(inspectPaymentProofJpeg(excessiveSegments), null, 'marker work is bounded independently of file size');
  const excessiveFill = new Uint8Array([255,216,...new Uint8Array(256).fill(255),217]);
  assert.equal(inspectPaymentProofJpeg(excessiveFill),null,'long marker fill cannot create a linear scan of the whole upload');
});

const ticket = () => {
  let count = 0;
  return { maxAttempts: 2, consumeTransformAttempt() { if (++count > 2) throw new Error('budget'); }, get count() { return count; } };
};
const imageResponse = bytes => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' } });

test('normalization stores the generated image and hashes it separately from original retry identity', async () => {
  const sourceBytes = new Uint8Array([...proofBytes.subarray(0, 2), 255, 225, 0, 6, 11, 22, 33, 44, ...proofBytes.subarray(2)]);
  const source = await validatePaymentProof({ contentType: 'image/jpeg', bytes: sourceBytes });
  const admission = ticket();
  const normalized = await normalizePaymentProof({ BOOKING_IMAGES: { async fetch(request) {
    assert.equal(request.url, 'https://booking-images.internal/normalize');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('X-Chii-Image-Attempt'), '1');
    assert.deepEqual(new Uint8Array(await request.arrayBuffer()), sourceBytes);
    return imageResponse(proofBytes);
  } } }, source, admission);
  assert.deepEqual(normalized.bytes, proofBytes);
  assert.notEqual(normalized.digest, source.digest, 'source and normalized digests have distinct jobs');
  assert.equal(normalized.digest, (await validatePaymentProof(proof)).digest);
  assert.equal(admission.count, 1);
});

test('a size expansion gets only one prepaid smaller fallback', async () => {
  const source = await validatePaymentProof(proof);
  const attempts = [];
  const admission = ticket();
  const result = await normalizePaymentProof({ BOOKING_IMAGES: { async fetch(request) {
    attempts.push(request.headers.get('X-Chii-Image-Attempt'));
    return attempts.length === 1 ? new Response(null, { status: 413 }) : imageResponse(proofBytes);
  } } }, source, admission);
  assert.deepEqual(result.bytes, proofBytes);
  assert.deepEqual(attempts, ['1', '2']);
  assert.equal(admission.count, 2);
  const capped = ticket();
  await assert.rejects(normalizePaymentProof({ BOOKING_IMAGES: { fetch: async () => new Response(null, { status: 413 }) } }, source, capped), error => error.code === 'PROOF_SIZE' && error.status === 413);
  assert.equal(capped.count, 2);
});

test('unchecked originals, missing bindings/budgets, invalid outputs and provider errors fail closed', async () => {
  const source = await validatePaymentProof(proof);
  await assert.rejects(normalizePaymentProof({}, source, ticket()), error => error.code === 'PROOF_UNAVAILABLE');
  await assert.rejects(normalizePaymentProof({ BOOKING_IMAGES: { fetch: async () => imageResponse(proofBytes) } }, source), error => error.code === 'PROOF_UNAVAILABLE');
  let calls = 0;
  await assert.rejects(normalizePaymentProof({ BOOKING_IMAGES: { fetch: async () => { calls++; } } }, await validatePaymentProof({ ...proof, base64: '/9j/2Q==' }), ticket()), error => error.code === 'PROOF_INVALID' && error.status === 400);
  assert.equal(calls, 0);
  for (const response of [new Response('private decoder details', { status: 503 }), new Response(null, { status: 422 }), imageResponse(new Uint8Array([255,216,255,217])), new Response(proofBytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=999' } })]) {
    const admission = ticket();
    await assert.rejects(normalizePaymentProof({ BOOKING_IMAGES: { fetch: async () => response } }, source, admission), error => ['PROOF_INVALID', 'PROOF_UNAVAILABLE'].includes(error.code) && !error.message.includes('private decoder details'));
    assert.equal(admission.count, 1, 'failed decoding/provider errors do not trigger repeated transformations');
  }
});

test('a stalled private transform aborts within the deadline and does not retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const source = await validatePaymentProof(proof);
  let signal;
  const admission = ticket();
  const pending = normalizePaymentProof({ BOOKING_IMAGES: { fetch(request) { signal = request.signal; return new Promise(() => {}); } } }, source, admission);
  const rejected = assert.rejects(pending, error => error.code === 'PROOF_UNAVAILABLE');
  await Promise.resolve();
  t.mock.timers.tick(10000);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(admission.count, 1);
});

test('binary response reading bounds actual bytes and cancels overflowing streams', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(PAYMENT_PROOF_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(boundedProofBytes(stream), error => error.code === 'PROOF_SIZE');
  assert.equal(cancelled, true);
});

test('proof stream uses bounded allocation while preserving ordinary fragmented JPEG bytes', async () => {
  let offset=0;
  const stream=new ReadableStream({pull(controller){if(offset>=proofBytes.length)return controller.close();controller.enqueue(proofBytes.subarray(offset,offset+3));offset+=3;}});
  const bytes=await boundedProofBytes(stream);
  assert.deepEqual(bytes,proofBytes);assert.equal(bytes.byteLength,proofBytes.length);
  assert.equal(bytes.buffer.byteLength,PAYMENT_PROOF_MAX_BYTES,'One bounded backing allocation, not a retained object per chunk');
  for(const max of [0,-1,Infinity,PAYMENT_PROOF_MAX_BYTES+1])await assert.rejects(boundedProofBytes(new Blob([proofBytes]).stream(),max),error=>error.code==='PROOF_INVALID');
});

test('excessive tiny, empty or non-byte proof chunks reject and cancel without starving the deadline', async () => {
  for(const [value,code] of [[new Uint8Array([1]),'PROOF_SIZE'],[new Uint8Array(0),'PROOF_SIZE'],['invalid-string-chunk','PROOF_INVALID']]) {
    let pulls=0,cancelled=false;
    const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(value);},cancel(){cancelled=true;}});
    await assert.rejects(boundedProofBytes(stream),error=>error.code===code);
    assert.equal(cancelled,true);assert.ok(pulls<=(typeof value==='string'?2:value.length===0?34:4098));
  }
});

test('response body deadlines cancel a stalled image stream', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let cancelled=false;
  const stream=new ReadableStream({cancel(){cancelled=true;}});
  const pending=boundedProofBytes(stream);
  const rejected=assert.rejects(pending,error=>error.code==='PROOF_UNAVAILABLE');
  t.mock.timers.tick(10000);
  await rejected;
  assert.equal(cancelled,true);
});

test('provider failure cancellation cannot keep a request pending indefinitely', async () => {
  const response=new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:503});
  await assert.rejects(normalizePaymentProof({BOOKING_IMAGES:{fetch:async()=>response}},await validatePaymentProof(proof),ticket()),error=>error.code==='PROOF_UNAVAILABLE');
});

test('bounded receipt cleanup counts deleted rows rather than D1 accounting-trigger changes', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    for(const name of ['0001-booking','0002-booking-payment','0003-booking-duration','0004-booking-payment-proofs','0005-booking-calendar-sync-index','0006-booking-manual-payment','0007-booking-admission']) db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
    const current=Date.parse('2026-10-21T01:00:00Z'),start=current+86400000;
    const insertRequest=db.prepare(`INSERT INTO booking_requests(id,token_hash,idempotency_hash,payload_hash,name,whatsapp,agreed_price,deposit,date,time,start_ms,end_ms,start_iso,end_iso,created_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertProof=db.prepare(`INSERT INTO booking_payment_proofs(request_id,content_type,content,sha256,created_at,expires_at) VALUES(?,'image/jpeg',?,?,?,?)`);
    db.exec('BEGIN');
    for(let i=0;i<502;i++) {
      const id='synthetic-'+i,hash=i.toString(16).padStart(64,'0');
      insertRequest.run(id,hash,hash,hash,'Synthetic Customer','6281234567890',100000,10000,'2026-10-22','08:00',start,start+7200000,'2026-10-22T08:00:00+07:00','2026-10-22T10:00:00+07:00',current-1000,start,current-1000);
      insertProof.run(id,proofBytes,hash,current-1000,i===501?current+86400000:current);
    }
    db.exec('COMMIT');
    const deltas=[];
    const env={BOOKING_DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},async all(){
      const before=db.prepare('SELECT total_changes() AS count').get().count;
      const results=db.prepare(sql).all(...values);
      const changes=db.prepare('SELECT total_changes() AS count').get().count-before;
      deltas.push(changes);return {success:true,results,meta:{changes}};
    }};}}};
    assert.deepEqual(await cleanupExpiredPaymentProofs(env,{now:current}),{deleted:500});
    assert.equal(deltas[0],1000,'real trigger updates add to D1 total_changes metadata');
    assert.equal(db.prepare('SELECT count(*) AS count FROM booking_payment_proofs').get().count,2);
    assert.equal(db.prepare('SELECT stored_bytes FROM booking_proof_storage WHERE id=1').get().stored_bytes,proofBytes.length*2);
    assert.deepEqual(await cleanupExpiredPaymentProofs(env,{now:current}),{deleted:1});
    assert.deepEqual(await cleanupExpiredPaymentProofs(env,{now:current}),{deleted:0});
    assert.equal(db.prepare('SELECT request_count FROM booking_proof_storage WHERE id=1').get().request_count,502);
    assert.equal(db.prepare('SELECT count(*) AS count FROM booking_requests').get().count,502);
    assert.equal(db.prepare('SELECT stored_bytes FROM booking_proof_storage WHERE id=1').get().stored_bytes,proofBytes.length);
    const queryPlan=db.prepare('EXPLAIN QUERY PLAN SELECT request_id FROM booking_payment_proofs WHERE expires_at<=? ORDER BY expires_at LIMIT 500').all(current);
    assert.ok(queryPlan.some(row=>row.detail.includes('booking_payment_proofs_expiry')));
  } finally {db.close();}
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePaymentProof, PAYMENT_PROOF_LIMIT, PaymentProofError } from '../src/scripts/booking-proof.js';

function fixture({ width = 4000, height = 3000, sizes = [128], abort } = {}) {
  const draws = [];
  let closed = 0;
  let attempts = 0;
  const image = { width, height, close() { closed++; } };
  const canvas = {
    width: 0, height: 0,
    getContext() { return { fillStyle: '', fillRect: (...args) => draws.push(['white', ...args]), drawImage: (...args) => draws.push(['image', ...args]) }; },
    toBlob(callback, type, quality) {
      attempts++;
      draws.push(['encoded', this.width, this.height, type, quality]);
      abort?.();
      callback(new Blob([new Uint8Array(sizes[Math.min(attempts - 1, sizes.length - 1)])], { type }));
    },
  };
  return { draws, canvas, options: { decodeImage: async () => image, createCanvas: () => canvas }, get attempts() { return attempts; }, get closed() { return closed; } };
}
const file = (changes = {}) => ({ size: 1000, type: 'image/png', name: 'private-receipt-name.png', ...changes });
const settle = async () => { for (let step = 0; step < 8; step++) await Promise.resolve(); };

function nativeDecoder(t, { bitmap, autoLoad = true } = {}) {
  const images = [];
  const revoked = [];
  const replace = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
  };
  replace('createImageBitmap', bitmap);
  replace('Image', class {
    constructor() { this.width = 600; this.height = 400; this.currentSource = ''; images.push(this); }
    get src() { return this.currentSource; }
    set src(value) { this.currentSource = value; if (value && autoLoad) queueMicrotask(() => this.onload?.()); }
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:synthetic-proof');
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  return { images, revoked };
}

test('proof rejects oversized or unsupported selections before decoding', async () => {
  let decoded = false;
  const options = { decodeImage: async () => { decoded = true; } };
  await assert.rejects(preparePaymentProof(file({ size: 10 * 1024 * 1024 + 1 }), options), error => error instanceof PaymentProofError && error.code === 'PROOF_SIZE');
  await assert.rejects(preparePaymentProof(file({ type: 'application/pdf' }), options), error => error.code === 'PROOF_TYPE');
  assert.equal(decoded, false);
});

test('proof is redrawn at a bounded size and returns only compressed bytes plus their digest', async () => {
  const image = fixture();
  const result = await preparePaymentProof(file(), image.options);
  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(result.blob.size, 128);
  const encoded = image.draws.find(call => call[0] === 'encoded');
  assert.deepEqual(encoded.slice(1, 4), [1600, 1200, 'image/jpeg']);
  assert.equal(image.draws[0][0], 'white');
  assert.equal(image.draws[1][0], 'image');
  assert.equal((await result.blob.arrayBuffer()).byteLength, 128);
  assert.equal('base64' in result, false);
  const expected = Buffer.from(await crypto.subtle.digest('SHA-256', new Uint8Array(128))).toString('hex');
  assert.equal(result.digest, expected);
  assert.equal('name' in result, false);
  assert.equal(image.closed, 1);
  assert.equal(image.canvas.width, 0);
  assert.equal(image.canvas.height, 0);
});

test('proof compression retries within its budget and never upscales a small receipt', async () => {
  const image = fixture({ width: 600, height: 400, sizes: [PAYMENT_PROOF_LIMIT + 1, 200] });
  const result = await preparePaymentProof(file(), image.options);
  assert.equal(image.attempts, 2);
  assert.equal(result.blob.size, 200);
  assert(image.draws.filter(call => call[0] === 'encoded').every(call => call[1] <= 600 && call[2] <= 400));
});

test('proof decoding failure explains HEIC conversion rather than pretending it is supported', async () => {
  await assert.rejects(preparePaymentProof(file({ type: 'image/heic', name: 'receipt.heic' }), { decodeImage: async () => { throw new Error('unsupported'); } }), error => error.code === 'PROOF_DECODE' && /HEIC/.test(error.message));
});

test('proof aborts stale encoding and releases the decoded image', async () => {
  const controller = new AbortController();
  const image = fixture({ abort: () => controller.abort() });
  await assert.rejects(preparePaymentProof(file(), { ...image.options, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(image.closed, 1);
});

test('proof cannot exceed the final encoded-size limit after bounded attempts', async () => {
  const image = fixture({ sizes: [PAYMENT_PROOF_LIMIT + 1] });
  await assert.rejects(preparePaymentProof(file(), image.options), error => error.code === 'PROOF_SIZE');
  assert.equal(image.attempts, 5);
  assert.equal(image.closed, 1);
});

test('a stalled bitmap decoder falls back and closes a bitmap that finishes late', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finishBitmap;
  let lateClosed = 0;
  const decoder = nativeDecoder(t, { bitmap: () => new Promise(resolve => { finishBitmap = resolve; }) });
  const canvas = fixture();
  const pending = preparePaymentProof(file(), { createCanvas: canvas.options.createCanvas });
  t.mock.timers.tick(12000);
  const result = await pending;
  assert.equal(result.blob.size, 128);
  assert.equal(decoder.images.length, 1);
  assert.deepEqual(decoder.revoked, ['blob:synthetic-proof']);
  assert.equal(decoder.images[0].onload, null);
  assert.equal(decoder.images[0].onerror, null);
  finishBitmap({ close() { lateClosed++; } });
  await settle();
  assert.equal(lateClosed, 1);
});

test('aborting a stalled bitmap decoder settles promptly without starting its fallback', async t => {
  let finishBitmap;
  let lateClosed = 0;
  const decoder = nativeDecoder(t, { bitmap: () => new Promise(resolve => { finishBitmap = resolve; }) });
  const controller = new AbortController();
  const pending = preparePaymentProof(file(), { signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  controller.abort();
  await rejected;
  assert.equal(decoder.images.length, 0);
  finishBitmap({ close() { lateClosed++; } });
  await settle();
  assert.equal(lateClosed, 1);
});

test('stalled bitmap and fallback image decoders recover with a bounded retry message', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const decoder = nativeDecoder(t, { bitmap: () => new Promise(() => {}), autoLoad: false });
  const pending = preparePaymentProof(file());
  const rejected = assert.rejects(pending, error => error instanceof PaymentProofError && error.code === 'PROOF_TIMEOUT' && /unggah lagi/.test(error.message));
  t.mock.timers.tick(12000);
  await settle();
  assert.equal(decoder.images.length, 1);
  t.mock.timers.tick(12000);
  await rejected;
  assert.equal(decoder.images[0].src, '');
  assert.equal(decoder.images[0].onload, null);
  assert.equal(decoder.images[0].onerror, null);
  assert.deepEqual(decoder.revoked, ['blob:synthetic-proof']);
});

test('bitmap rejection preserves the image fallback and releases its object URL', async t => {
  const decoder = nativeDecoder(t, { bitmap: async () => { throw new Error('unsupported decoder options'); } });
  const canvas = fixture();
  const result = await preparePaymentProof(file(), { createCanvas: canvas.options.createCanvas });
  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(decoder.images.length, 1);
  assert.deepEqual(decoder.revoked, ['blob:synthetic-proof']);
});

test('a stalled JPEG encoder times out and releases the image and backing canvas', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const image = fixture();
  let lateCallback;
  image.canvas.toBlob = callback => { lateCallback = callback; };
  const pending = preparePaymentProof(file(), image.options);
  const rejected = assert.rejects(pending, error => error.code === 'PROOF_TIMEOUT');
  await settle();
  assert.equal(typeof lateCallback, 'function');
  t.mock.timers.tick(12000);
  await rejected;
  assert.equal(image.closed, 1);
  assert.equal(image.canvas.width, 0);
  assert.equal(image.canvas.height, 0);
  lateCallback(new Blob(['late'], { type: 'image/jpeg' }));
  await settle();
  assert.equal(image.closed, 1);
});

test('aborting a stalled encoder does not wait for its callback or accept its late result', async () => {
  const image = fixture();
  const controller = new AbortController();
  let lateCallback;
  image.canvas.toBlob = callback => { lateCallback = callback; };
  const pending = preparePaymentProof(file(), { ...image.options, signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  await settle();
  controller.abort();
  await rejected;
  assert.equal(image.closed, 1);
  assert.equal(image.canvas.width, 0);
  lateCallback(new Blob(['late'], { type: 'image/jpeg' }));
  await settle();
  assert.equal(image.closed, 1);
});

test('synchronous encoder failures release the image and canvas', async () => {
  const image = fixture();
  image.canvas.toBlob = () => { throw new Error('encoder failed'); };
  await assert.rejects(preparePaymentProof(file(), image.options), /encoder failed/);
  assert.equal(image.closed, 1);
  assert.equal(image.canvas.width, 0);
  assert.equal(image.canvas.height, 0);
});

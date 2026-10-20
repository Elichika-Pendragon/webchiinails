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
  return { draws, options: { decodeImage: async () => image, createCanvas: () => canvas }, get attempts() { return attempts; }, get closed() { return closed; } };
}
const file = (changes = {}) => ({ size: 1000, type: 'image/png', name: 'private-receipt-name.png', ...changes });

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
  assert.equal(Buffer.from(result.base64, 'base64').byteLength, 128);
  const expected = Buffer.from(await crypto.subtle.digest('SHA-256', new Uint8Array(128))).toString('hex');
  assert.equal(result.digest, expected);
  assert.equal('name' in result, false);
  assert.equal(image.closed, 1);
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

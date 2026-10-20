import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePaymentProof, paymentProofBytes, PAYMENT_PROOF_MAX_BYTES } from './booking-proofs.js';
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

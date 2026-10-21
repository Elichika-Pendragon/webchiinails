import { boundedProofBytes, inspectPaymentProofJpeg, PAYMENT_PROOF_MAX_EDGE, PAYMENT_PROOF_MAX_PIXELS, PaymentProofValidationError } from '../server/booking-proofs.js';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
const failure = (code, status) => Response.json({ error: code }, { status, headers: privateHeaders });
let inFlight = 0;
const deadline = operation => {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(new PaymentProofValidationError()), 10000); })])
    .finally(() => clearTimeout(timer));
};

// Service binding only. There are no routes, preview URLs, public image URLs,
// storage buckets or customer data in logs. Every POST performs at most one
// prepaid transform; the Pages caller decides whether a second pass is allowed.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== 'https://booking-images.internal' || url.pathname !== '/normalize' || url.search || url.hash) return failure('NOT_FOUND', 404);
    if (request.method !== 'POST') return failure('METHOD', 405);
    if (request.headers.get('Content-Type') !== 'image/jpeg' || !['1', '2'].includes(request.headers.get('X-Chii-Image-Attempt'))) return failure('PROOF_INVALID', 422);
    if (typeof env?.IMAGES?.info !== 'function' || typeof env.IMAGES.input !== 'function') return failure('PROOF_UNAVAILABLE', 503);
    // Bound simultaneous input/output buffers within this isolate's memory.
    if (inFlight >= 8) return failure('PROOF_UNAVAILABLE', 503);
    inFlight++;
    try {
      const bytes = await boundedProofBytes(request.body);
      if (!inspectPaymentProofJpeg(bytes)) return failure('PROOF_INVALID', 422);
      const info = await deadline(() => env.IMAGES.info(new Blob([bytes]).stream()));
      if (!Number.isInteger(info?.width) || !Number.isInteger(info?.height) || info.width < 1 || info.height < 1
        || info.width > PAYMENT_PROOF_MAX_EDGE || info.height > PAYMENT_PROOF_MAX_EDGE || info.width * info.height > PAYMENT_PROOF_MAX_PIXELS) return failure('PROOF_INVALID', 422);
      const first = request.headers.get('X-Chii-Image-Attempt') === '1';
      let transformed;
      try {
        transformed = await deadline(() => env.IMAGES.input(new Blob([bytes]).stream())
          .transform({ width: first ? 1600 : 1200, height: first ? 1600 : 1200, fit: 'scale-down' })
          .output({ format: 'image/jpeg', quality: first ? 82 : 72, anim: false }));
      } catch (error) { return error?.code === 9412 ? failure('PROOF_INVALID', 422) : failure('PROOF_UNAVAILABLE', 503); }
      const output = transformed.response({ headers: privateHeaders });
      if (!output.ok || output.headers.get('Content-Type') !== 'image/jpeg') return failure('PROOF_UNAVAILABLE', 503);
      const normalized = await boundedProofBytes(output.body);
      if (!inspectPaymentProofJpeg(normalized)) return failure('PROOF_UNAVAILABLE', 503);
      return new Response(normalized, { headers: { ...privateHeaders, 'Content-Type': 'image/jpeg' } });
    } catch (error) {
      if (error.code === 'PROOF_SIZE') return failure('PROOF_SIZE', 413);
      if (error.code === 'PROOF_INVALID' || error.code === 9412) return failure('PROOF_INVALID', 422);
      return failure('PROOF_UNAVAILABLE', 503);
    } finally {
      inFlight--;
    }
  },
};

/** SERVER ONLY. Receipt bytes stay in D1, never Calendar, WhatsApp or logs. */
export const PAYMENT_PROOF_MAX_BYTES = 500 * 1024;
export const PAYMENT_PROOF_RETENTION_MS = 30 * 86400000;
export const PAYMENT_PROOF_BODY_MAX_BYTES = 700 * 1024;
export const PAYMENT_PROOF_MAX_EDGE = 1600;
export const PAYMENT_PROOF_MAX_PIXELS = PAYMENT_PROOF_MAX_EDGE ** 2;
const IMAGE_TIMEOUT_MS = 10000;

export class PaymentProofValidationError extends Error {
  constructor(code = 'PROOF_UNAVAILABLE', status = 503) {
    super(code === 'PROOF_INVALID' ? 'Gambar bukti pembayaran tidak valid. Pilih gambar lain.'
      : code === 'PROOF_SIZE' ? 'Gambar bukti pembayaran masih terlalu besar. Pilih gambar lain.'
      : 'Bukti pembayaran belum dapat diperiksa. Coba lagi sebentar.');
    this.name = 'PaymentProofValidationError';
    this.code = code;
    this.status = status;
  }
}

export function bytesToHex(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected receipt bytes.');
  if (typeof bytes.toHex === 'function') return bytes.toHex();
  const parts = new Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) parts[index] = bytes[index].toString(16).padStart(2, '0');
  return parts.join('');
}

const digestBytes = async bytes => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
const discardBody = response => { try { response.body?.cancel().catch(() => {}); } catch { /* Failure responses are never read or logged. */ } };

function canonicalBase64(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 4 * Math.ceil(PAYMENT_PROOF_MAX_BYTES / 3)
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(value, { lastChunkHandling: 'strict' });
    const binary = atob(value);
    if (btoa(binary) !== value) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch { return null; }
}

export function paymentProofBytes(value) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value)
    : Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? Uint8Array.from(value) : null;
  // A bounded legacy storage/source check, not proof of pixel decoding. New
  // receipts must additionally pass the private Images normalization below.
  return bytes && bytes.length >= 4 && bytes.length <= PAYMENT_PROOF_MAX_BYTES
    && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes.at(-2) === 255 && bytes.at(-1) === 217 ? bytes : null;
}

export async function validatePaymentProof(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.contentType !== 'image/jpeg') return null;
  const keys = Object.keys(value).sort().join(',');
  const raw = keys === 'bytes,contentType' && (value.bytes instanceof Uint8Array || value.bytes instanceof ArrayBuffer) ? value.bytes
    : keys === 'base64,contentType' ? canonicalBase64(value.base64) : null;
  const bytes = paymentProofBytes(raw);
  if (!bytes) return null;
  return { bytes, digest: await digestBytes(bytes) };
}

/** Cheap JPEG container/dimension preflight. Images.output must decode pixels. */
export function inspectPaymentProofJpeg(value) {
  const bytes = paymentProofBytes(value);
  if (!bytes) return null;
  let offset = 2, dimensions = null, segments = 0;
  while (offset < bytes.length - 2) {
    if (++segments > 256) return null;
    if (bytes[offset++] !== 255) return null;
    let fill = 0;
    while (bytes[offset] === 255) { if (++fill > 16) return null; offset++; }
    const marker = bytes[offset++];
    if (!marker || marker === 216 || marker === 217 || marker >= 208 && marker <= 215 || marker === 1) return null;
    if (offset + 2 > bytes.length - 2) return null;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) return null;
    if (marker === 192 || marker === 194) {
      if (dimensions || length < 8 || bytes[offset + 2] !== 8) return null;
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      const components = bytes[offset + 7];
      if (![1, 3].includes(components) || length !== 8 + 3 * components || !width || !height
        || width > PAYMENT_PROOF_MAX_EDGE || height > PAYMENT_PROOF_MAX_EDGE || width * height > PAYMENT_PROOF_MAX_PIXELS) return null;
      dimensions = { width, height };
    } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) return null;
    if (marker === 218) {
      // A complete scan container is required; Images may repair entropy-level
      // defects only if it can generate a new, nonempty JPEG. Missing EOI and
      // truncated segments never reach the decoder. This is not payment validation.
      const components = bytes[offset + 2];
      return dimensions && [1, 3].includes(components) && length === 6 + 2 * components && offset + length < bytes.length - 2 ? dimensions : null;
    }
    offset += length;
  }
  return null;
}

export async function boundedProofBytes(stream, maxBytes = PAYMENT_PROOF_MAX_BYTES) {
  if (!stream || typeof stream.getReader !== 'function' || !Number.isSafeInteger(maxBytes)
    || maxBytes < 1 || maxBytes > PAYMENT_PROOF_MAX_BYTES) throw new PaymentProofValidationError('PROOF_INVALID', 400);
  const reader = stream.getReader();
  let timer, timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      // Reject before cancellation wakes a pending read as EOF.
      reject(new PaymentProofValidationError());
      reader.cancel().catch(() => {});
    }, IMAGE_TIMEOUT_MS);
  });
  const read = (async () => {
    // Bound allocation independently of attacker-controlled stream chunk count.
    const bytes = new Uint8Array(maxBytes);
    let size = 0, chunks = 0, emptyChunks = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new PaymentProofValidationError();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new PaymentProofValidationError('PROOF_INVALID', 400);
      if (++chunks > 4096 || value.byteLength === 0 && ++emptyChunks > 32) throw new PaymentProofValidationError('PROOF_SIZE', 413);
      size += value.byteLength;
      if (size > maxBytes) throw new PaymentProofValidationError('PROOF_SIZE', 413);
      bytes.set(value, size - value.byteLength);
    }
    return bytes.subarray(0, size);
  })();
  try { return await Promise.race([read, timeout]); }
  finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
    if (!timedOut) reader.releaseLock();
    else read.finally(() => reader.releaseLock()).catch(() => {});
  }
}

/** Admission prepays two attempts; this local guard consumes each actual call. */
export async function normalizePaymentProof(env, source, context) {
  if (!inspectPaymentProofJpeg(source?.bytes)) throw new PaymentProofValidationError('PROOF_INVALID', 400);
  if (typeof env?.BOOKING_IMAGES?.fetch !== 'function' || typeof context?.consumeTransformAttempt !== 'function'
    || context.maxAttempts !== 2) throw new PaymentProofValidationError();
  for (let attempt = 1; attempt <= context.maxAttempts; attempt++) {
    await context.consumeTransformAttempt();
    let response;
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PaymentProofValidationError()); }, IMAGE_TIMEOUT_MS); });
      response = await Promise.race([env.BOOKING_IMAGES.fetch(new Request('https://booking-images.internal/normalize', {
        method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Chii-Image-Attempt': String(attempt) }, body: source.bytes, signal: controller.signal,
      })), timeout]);
    } catch { throw new PaymentProofValidationError(); }
    finally { clearTimeout(timer); }
    if (!(response instanceof Response)) throw new PaymentProofValidationError();
    if (response.status === 413) { discardBody(response); if (attempt < context.maxAttempts) continue; throw new PaymentProofValidationError('PROOF_SIZE', 413); }
    if (response.status === 422) { discardBody(response); throw new PaymentProofValidationError('PROOF_INVALID', 400); }
    if (!response.ok || response.headers.get('Content-Type') !== 'image/jpeg' || response.headers.get('Cache-Control') !== 'private, no-store') {
      discardBody(response);
      throw new PaymentProofValidationError();
    }
    let bytes;
    try { bytes = await boundedProofBytes(response.body); }
    catch (error) { if (error.code === 'PROOF_SIZE' && attempt < context.maxAttempts) continue; throw error; }
    if (!inspectPaymentProofJpeg(bytes)) throw new PaymentProofValidationError();
    return { bytes, digest: await digestBytes(bytes) };
  }
  throw new PaymentProofValidationError('PROOF_SIZE', 413);
}

/** Daily scheduled cleanup, bounded to 500 indexed expired receipt rows. */
export async function cleanupExpiredPaymentProofs(env, { now = Date.now() } = {}) {
  const current = typeof now === 'function' ? now() : now;
  if (typeof env?.BOOKING_DB?.prepare !== 'function' || !Number.isSafeInteger(current) || current <= 0) throw new Error('Receipt cleanup is not configured.');
  const result = await env.BOOKING_DB.prepare(`DELETE FROM booking_payment_proofs WHERE request_id IN
    (SELECT request_id FROM booking_payment_proofs WHERE expires_at <= ? ORDER BY expires_at LIMIT 500)
    RETURNING request_id`).bind(current).all();
  if (!result || result.success === false || !Array.isArray(result.results) || result.results.length > 500) throw new Error('Receipt cleanup did not complete.');
  // D1 meta.changes may include accounting-trigger writes. RETURNING counts
  // only receipts removed by this statement, while both changes stay atomic.
  return { deleted: result.results.length };
}

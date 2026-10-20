/** SERVER ONLY. Receipt bytes stay in D1, never Calendar, WhatsApp or logs. */
export const PAYMENT_PROOF_MAX_BYTES = 500 * 1024;
export const PAYMENT_PROOF_RETENTION_MS = 30 * 86400000;
export const PAYMENT_PROOF_BODY_MAX_BYTES = 700 * 1024;

export function paymentProofBytes(value) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value)
    : Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? Uint8Array.from(value) : null;
  // Content is served only as a non-sniffable image. Customer HTML/SVG and data
  // URLs are never accepted; browsers decode the JPEG, never execute its bytes.
  return bytes && bytes.length >= 4 && bytes.length <= PAYMENT_PROOF_MAX_BYTES
    && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes.at(-2) === 255 && bytes.at(-1) === 217 ? bytes : null;
}

export async function validatePaymentProof(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'base64,contentType'
    || value.contentType !== 'image/jpeg' || typeof value.base64 !== 'string'
    || value.base64.length < 8 || value.base64.length > 4 * Math.ceil(PAYMENT_PROOF_MAX_BYTES / 3)
    || value.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64)) return null;
  let binary;
  try { binary = atob(value.base64); } catch { return null; }
  if (btoa(binary) !== value.base64) return null;
  const bytes = paymentProofBytes(Uint8Array.from(binary, character => character.charCodeAt(0)));
  if (!bytes) return null;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  return { bytes, digest };
}

/** Daily scheduled cleanup, bounded to 500 indexed expired receipt rows. */
export async function cleanupExpiredPaymentProofs(env, { now = Date.now() } = {}) {
  const current = typeof now === 'function' ? now() : now;
  if (typeof env?.BOOKING_DB?.prepare !== 'function' || !Number.isSafeInteger(current) || current <= 0) throw new Error('Receipt cleanup is not configured.');
  const result = await env.BOOKING_DB.prepare(`DELETE FROM booking_payment_proofs WHERE request_id IN
    (SELECT request_id FROM booking_payment_proofs WHERE expires_at <= ? ORDER BY expires_at LIMIT 500)`).bind(current).run();
  if (!result || result.success === false) throw new Error('Receipt cleanup did not complete.');
  return { deleted: Number.isSafeInteger(result.meta?.changes) ? result.meta.changes : 0 };
}

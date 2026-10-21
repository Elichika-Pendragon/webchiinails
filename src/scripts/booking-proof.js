export const PAYMENT_PROOF_LIMIT = 500 * 1024;
const SOURCE_LIMIT = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const PREPARATION_STAGE_TIMEOUT = 12000;

export class PaymentProofError extends Error {
  constructor(code, message) { super(message); this.name = 'PaymentProofError'; this.code = code; }
}
function check(signal) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); }

function boundedPreparation(operation, signal, releaseLate) {
  check(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) {
        if (!error) { try { releaseLate?.(value); } catch {} }
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => finish(new PaymentProofError('PROOF_TIMEOUT', 'Gambar terlalu lama disiapkan. Coba unggah lagi atau pilih gambar yang lebih kecil.')), PREPARATION_STAGE_TIMEOUT);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { Promise.resolve(operation()).then(value => finish(null, value), error => finish(error)); }
    catch (error) { finish(error); }
  });
}

async function decodeLocalImage(file, signal) {
  check(signal);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await boundedPreparation(() => createImageBitmap(file, { imageOrientation: 'from-image' }), signal, value => value?.close?.());
      return bitmap;
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = new Image();
    await boundedPreparation(() => new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('decode'));
      image.src = url;
    }), signal);
    check(signal);
    return image;
  } catch (error) {
    if (image) image.src = '';
    throw error;
  } finally {
    if (image) { image.onload = null; image.onerror = null; }
    URL.revokeObjectURL(url);
  }
}

const jpegBlob = (canvas, quality, signal) => boundedPreparation(() => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), 'image/jpeg', quality);
}), signal);

/** Decode and redraw only a user-selected image; filenames/metadata never leave here. */
export async function preparePaymentProof(file, { signal, decodeImage = decodeLocalImage, createCanvas = () => document.createElement('canvas') } = {}) {
  if (!file || !Number.isFinite(file.size) || file.size < 1 || file.size > SOURCE_LIMIT) throw new PaymentProofError('PROOF_SIZE', 'Pilih gambar maksimal 10 MB.');
  if (!TYPES.has(file.type) && !(file.type === '' && /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) throw new PaymentProofError('PROOF_TYPE', 'Gunakan gambar JPEG, PNG, atau WebP.');
  check(signal);
  let image;
  let canvas;
  try {
    try { image = await decodeImage(file, signal); }
    catch (error) {
      if (error.name === 'AbortError' || error.code === 'PROOF_TIMEOUT') throw error;
      throw new PaymentProofError('PROOF_DECODE', /heic|heif/i.test(file.type || file.name || '')
        ? 'Browser ini belum dapat membuka HEIC. Pilih JPEG, PNG, atau WebP.'
        : 'Gambar belum dapat dibuka. Pilih JPEG, PNG, atau WebP yang valid.');
    }
    check(signal);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new PaymentProofError('PROOF_DECODE', 'Ukuran gambar tidak valid. Pilih gambar lain.');
    canvas = createCanvas();
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new PaymentProofError('PROOF_BROWSER', 'Browser belum dapat menyiapkan gambar. Coba Chrome atau Safari terbaru.');
    const startEdge = Math.min(1600, Math.max(width, height));
    const attempts = [[startEdge, .84], [startEdge, .66], [Math.min(startEdge, 1200), .72], [Math.min(startEdge, 900), .68], [Math.min(startEdge, 675), .62]];
    let blob;
    for (const [edge, quality] of attempts) {
      check(signal);
      const scale = Math.min(1, edge / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await jpegBlob(canvas, quality, signal);
      check(signal);
      if (blob.type !== 'image/jpeg') throw new PaymentProofError('PROOF_BROWSER', 'Browser belum dapat menyiapkan JPEG. Coba browser lain.');
      if (blob.size > 0 && blob.size <= PAYMENT_PROOF_LIMIT) break;
    }
    if (!blob?.size || blob.size > PAYMENT_PROOF_LIMIT) throw new PaymentProofError('PROOF_SIZE', 'Gambar masih terlalu besar. Potong bagian bukti pembayaran lalu unggah lagi.');
    const bytes = new Uint8Array(await boundedPreparation(() => blob.arrayBuffer(), signal));
    check(signal);
    const digest = Array.from(new Uint8Array(await boundedPreparation(() => crypto.subtle.digest('SHA-256', bytes), signal)), byte => byte.toString(16).padStart(2, '0')).join('');
    check(signal);
    return { contentType: 'image/jpeg', digest, blob };
  } finally {
    image?.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

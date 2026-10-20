export const PAYMENT_PROOF_LIMIT = 500 * 1024;
const SOURCE_LIMIT = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export class PaymentProofError extends Error {
  constructor(code, message) { super(message); this.name = 'PaymentProofError'; this.code = code; }
}
function check(signal) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); }

async function decodeLocalImage(file, signal) {
  check(signal);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (signal?.aborted) { bitmap.close(); check(signal); }
      return bitmap;
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      let timer;
      const finish = error => {
        clearTimeout(timer);
        image.onload = null; image.onerror = null;
        signal?.removeEventListener('abort', abort);
        if (error) { image.src = ''; reject(error); } else resolve();
      };
      const abort = () => finish(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = () => finish();
      image.onerror = () => finish(new Error('decode'));
      timer = setTimeout(() => finish(new Error('decode-timeout')), 12000);
      image.src = url;
    });
    check(signal);
    return image;
  } finally { URL.revokeObjectURL(url); }
}

const jpegBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), 'image/jpeg', quality);
});

/** Decode and redraw only a user-selected image; filenames/metadata never leave here. */
export async function preparePaymentProof(file, { signal, decodeImage = decodeLocalImage, createCanvas = () => document.createElement('canvas') } = {}) {
  if (!file || !Number.isFinite(file.size) || file.size < 1 || file.size > SOURCE_LIMIT) throw new PaymentProofError('PROOF_SIZE', 'Pilih gambar maksimal 10 MB.');
  if (!TYPES.has(file.type) && !(file.type === '' && /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) throw new PaymentProofError('PROOF_TYPE', 'Gunakan gambar JPEG, PNG, atau WebP.');
  check(signal);
  let image;
  try {
    try { image = await decodeImage(file, signal); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new PaymentProofError('PROOF_DECODE', /heic|heif/i.test(file.type || file.name || '')
        ? 'Browser ini belum dapat membuka HEIC. Pilih JPEG, PNG, atau WebP.'
        : 'Gambar belum dapat dibuka. Pilih JPEG, PNG, atau WebP yang valid.');
    }
    check(signal);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new PaymentProofError('PROOF_DECODE', 'Ukuran gambar tidak valid. Pilih gambar lain.');
    const canvas = createCanvas();
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
      blob = await jpegBlob(canvas, quality);
      check(signal);
      if (blob.type !== 'image/jpeg') throw new PaymentProofError('PROOF_BROWSER', 'Browser belum dapat menyiapkan JPEG. Coba browser lain.');
      if (blob.size > 0 && blob.size <= PAYMENT_PROOF_LIMIT) break;
    }
    if (!blob?.size || blob.size > PAYMENT_PROOF_LIMIT) throw new PaymentProofError('PROOF_SIZE', 'Gambar masih terlalu besar. Potong bagian bukti pembayaran lalu unggah lagi.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    check(signal);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    check(signal);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return { contentType: 'image/jpeg', base64: btoa(binary), digest, blob };
  } finally { image?.close?.(); }
}

// Recovery belongs to this browser tab. Never store login data, owner links or
// a cached availability result here. The receipt is written separately so typing
// never serializes a large image into synchronous Web Storage.
export const BOOKING_DRAFT_TTL = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'chii.booking.draft.v1';
const FIELD_LIMITS = { name: 80, whatsapp: 40, agreedPrice: 16, paymentMode: 12, deposit: 16, serviceDuration: 24, date: 10, time: 5 };
const token = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const live = (value, now) => value?.version === 1 && token(value.id) && Number.isFinite(value.createdAt) && value.createdAt <= now && value.expiresAt === value.createdAt + BOOKING_DRAFT_TTL && value.expiresAt > now;

function cleanFields(values = {}) {
  return Object.fromEntries(Object.entries(FIELD_LIMITS).map(([name, limit]) => [name, typeof values[name] === 'string' ? values[name].slice(0, limit) : '']));
}

function browserReceiptStore(indexedDB) {
  let database;
  const open = () => {
    if (!database) database = new Promise((resolve, reject) => {
      if (!indexedDB?.open) return reject(new Error('storage'));
      const request = indexedDB.open('chii-booking-recovery', 1);
      let settled = false;
      const fail = () => { if (settled) return; settled = true; clearTimeout(timeout); reject(new Error('storage')); };
      const timeout = setTimeout(fail, 3000);
      request.onupgradeneeded = () => request.result.createObjectStore('receipts', { keyPath: 'id' });
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timeout);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return database;
  };
  const transaction = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('receipts', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('storage'));
      work(tx.objectStore('receipts'), value => { result = value; });
    });
  };
  return {
    get: id => transaction('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result); }),
    put: value => transaction('readwrite', store => store.put(value)),
    remove: id => transaction('readwrite', store => store.delete(id)),
    purge: now => transaction('readwrite', store => {
      const request = store.openCursor();
      request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (!Number.isFinite(cursor.value?.expiresAt) || cursor.value.expiresAt <= now) cursor.delete(); cursor.continue(); };
    }),
  };
}

export function createBookingDraft(options = {}) {
  const now = options.now || Date.now;
  const crypto = options.crypto || globalThis.crypto;
  let storage;
  let indexedDB;
  // Accessing the browser properties themselves can throw in private/denied modes.
  try { storage = options.storage === undefined ? globalThis.sessionStorage : options.storage; } catch { /* Memory-only fallback. */ }
  try { indexedDB = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB; } catch { /* Memory-only fallback. */ }
  const receipts = options.receiptStore || browserReceiptStore(indexedDB);
  const onState = options.onState || (() => {});
  let metadata = null;
  let receiptDigest = '';
  let queue = Promise.resolve();
  let generation = 0;
  let receiptPending = false;
  let pendingDigest = '';
  let pendingOperation = null;
  let receiptRevision = 0;
  const state = { metadataSaved: false, receiptSaved: false, restored: false, hasReceipt: false };
  const publish = changes => { Object.assign(state, changes); onState({ ...state }); };
  // A denied or hung storage operation cannot hold the form or Book indefinitely.
  const bounded = operation => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('storage-timeout')), 3000);
    Promise.resolve().then(operation).then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  const removeMetadata = () => { try { storage?.removeItem(STORAGE_KEY); } catch { /* Continue without persistent recovery. */ } };
  const newId = () => {
    if (!crypto?.getRandomValues) throw new Error('secure-random');
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const read = () => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (raw.length > 4096) throw new Error('draft');
      const value = JSON.parse(raw);
      if (!live(value, now())) throw new Error('draft');
      metadata = {
        version: 1, id: value.id, createdAt: value.createdAt, expiresAt: value.expiresAt,
        fields: cleanFields(value.fields), proofDigest: token(value.proofDigest) ? value.proofDigest : '',
        requestKey: token(value.requestKey) ? value.requestKey : '',
        requestSignature: typeof value.requestSignature === 'string' && value.requestSignature.length <= 1024 ? value.requestSignature : '',
      };
      publish({ metadataSaved: true, restored: true, hasReceipt: Boolean(metadata.proofDigest) });
      return { ...metadata, fields: { ...metadata.fields } };
    } catch { removeMetadata(); return null; }
  };
  const save = snapshot => {
    try {
      if (!live(metadata, now())) {
        const createdAt = now();
        metadata = { version: 1, id: newId(), createdAt, expiresAt: createdAt + BOOKING_DRAFT_TTL };
        receiptDigest = '';
        receiptRevision++;
      }
      Object.assign(metadata, {
        fields: cleanFields(snapshot.fields),
        proofDigest: token(snapshot.proofDigest) ? snapshot.proofDigest : '',
        requestKey: token(snapshot.requestKey) ? snapshot.requestKey : '',
        requestSignature: typeof snapshot.requestSignature === 'string' && snapshot.requestSignature.length <= 1024 ? snapshot.requestSignature : '',
      });
      if (!storage?.setItem) throw new Error('storage');
      storage.setItem(STORAGE_KEY, JSON.stringify(metadata));
      publish({ metadataSaved: true, hasReceipt: Boolean(metadata.proofDigest), receiptSaved: Boolean(metadata.proofDigest) && metadata.proofDigest === receiptDigest });
      return true;
    } catch { publish({ metadataSaved: false }); return false; }
  };
  const saveProof = async proof => {
    if (!state.metadataSaved || !metadata || !live(metadata, now()) || !token(proof?.digest) || proof.contentType !== 'image/jpeg' || typeof proof.base64 !== 'string' || proof.base64.length > 682668 || !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.base64)) return false;
    if (receiptPending && pendingDigest === proof.digest) return pendingOperation;
    if (receiptDigest === proof.digest && !receiptPending) return true;
    const current = generation;
    const revision = ++receiptRevision;
    const record = { id: metadata.id, expiresAt: metadata.expiresAt, digest: proof.digest, contentType: proof.contentType, base64: proof.base64 };
    receiptPending = true;
    pendingDigest = proof.digest;
    const operation = queue.catch(() => {}).then(() => bounded(() => receipts.put(record)));
    queue = operation;
    pendingOperation = operation.then(() => true, () => false);
    try {
      await operation;
      if (generation !== current || revision !== receiptRevision) return false;
      receiptDigest = record.digest;
      publish({ receiptSaved: metadata?.proofDigest === record.digest });
      return true;
    } catch { if (generation === current && revision === receiptRevision) publish({ receiptSaved: false }); return false; }
    finally { if (generation === current && revision === receiptRevision) { receiptPending = false; pendingDigest = ''; pendingOperation = null; } }
  };
  const loadProof = async () => {
    if (!metadata?.proofDigest || !live(metadata, now())) return null;
    const current = generation;
    const expected = metadata.proofDigest;
    try {
      const record = await bounded(() => receipts.get(metadata.id));
      if (current !== generation || record?.expiresAt !== metadata?.expiresAt || record.expiresAt <= now() || record.digest !== expected || record.contentType !== 'image/jpeg' || typeof record.base64 !== 'string' || record.base64.length > 682668 || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.base64)) throw new Error('draft-proof');
      const binary = atob(record.base64);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      if (!bytes.length || bytes.length > 512000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('draft-proof');
      const hash = await bounded(() => crypto.subtle.digest('SHA-256', bytes));
      const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      if (current !== generation || digest !== expected) throw new Error('draft-proof');
      receiptDigest = digest;
      publish({ receiptSaved: true });
      return { contentType: record.contentType, base64: record.base64, digest, blob: new Blob([bytes], { type: record.contentType }) };
    } catch { if (current === generation) publish({ receiptSaved: false }); return null; }
  };
  const removeProof = () => {
    receiptRevision++;
    receiptPending = false; pendingDigest = ''; pendingOperation = null;
    receiptDigest = '';
    publish({ receiptSaved: false, hasReceipt: false });
    const id = metadata?.id;
    if (id) queue = queue.catch(() => {}).then(() => bounded(() => receipts.remove(id))).catch(() => {});
  };
  const clear = () => {
    generation++;
    receiptPending = false;
    pendingDigest = ''; pendingOperation = null;
    removeProof();
    metadata = null;
    removeMetadata();
    publish({ metadataSaved: false, receiptSaved: false, restored: false, hasReceipt: false });
  };
  // Remove abandoned receipt records on the next booking visit. Reads always
  // enforce expiry even if the browser was closed when the 24 hours elapsed.
  bounded(() => receipts.purge?.(now())).catch(() => {});
  return { read, save, saveProof, loadProof, removeProof, clear, state: () => ({ ...state }) };
}

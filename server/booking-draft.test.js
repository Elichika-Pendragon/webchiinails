import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { BOOKING_DRAFT_TTL, createBookingDraft } from '../src/scripts/booking-draft.js';

function fixture(overrides = {}) {
  const values = new Map();
  const images = new Map();
  const writes = [];
  let clock = 100000;
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const receiptStore = { async put(value) { writes.push(value); images.set(value.id, structuredClone(value)); }, async get(id) { return images.get(id); }, async remove(id) { images.delete(id); }, async purge(now) { for (const [id, value] of images) if (value.expiresAt <= now) images.delete(id); } };
  const options = { storage, receiptStore, crypto: webcrypto, now: () => clock, ...overrides };
  return { values, images, writes, storage, receiptStore, options, create: extra => createBookingDraft({ ...options, ...extra }), advance: amount => { clock += amount; } };
}
const fields = { name: 'Synthetic Customer', whatsapp: '+62 812 3456 7890', agreedPrice: '100000', paymentMode: 'deposit', deposit: '35000', serviceDuration: 'simple:120', date: '2026-10-30', time: '08:00' };
async function proof(label = 'fixture') {
  const bytes = Buffer.concat([Buffer.from([255, 216, 255, 219]), Buffer.from(label), Buffer.from([255, 217])]);
  const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  return { contentType: 'image/jpeg', blob: new Blob([bytes], { type: 'image/jpeg' }), digest };
}

test('per-tab metadata stores only bounded booking fields and exact retry identity, never URLs or credentials', () => {
  const f = fixture(); const draft = f.create();
  draft.save({ fields: { ...fields, authorization: 'private', reviewUrl: 'https://example.invalid/private' }, proofDigest: 'a'.repeat(64), requestKey: 'b'.repeat(64), requestSignature: 'canonical booking signature', accessToken: 'private', reviewUrl: 'private' });
  const raw = [...f.values.values()][0];
  assert.doesNotMatch(raw, /authorization|reviewUrl|accessToken|private/);
  assert(raw.length < 1024);
  const restored = f.create().read();
  assert.deepEqual(restored.fields, fields);
  assert.equal(restored.fields.deposit, '35000');
  assert.equal(restored.requestKey, 'b'.repeat(64));
  assert.equal(restored.proofDigest, 'a'.repeat(64));
  const otherTab = fixture().create();
  assert.equal(otherTab.read(), null);
});

test('prepared JPEG restores byte-for-byte with verified digest and without rewriting on typing', async () => {
  const f = fixture(); const draft = f.create(); const prepared = await proof();
  draft.save({ fields, proofDigest: prepared.digest });
  assert.equal(await draft.saveProof(prepared), true);
  for (let index = 0; index < 8; index++) {
    draft.save({ fields: { ...fields, name: `Synthetic ${index}` }, proofDigest: prepared.digest });
    await draft.saveProof(prepared);
  }
  assert.equal(f.writes.length, 1);
  const next = f.create(); next.read();
  const restored = await next.loadProof();
  assert.equal('base64' in restored, false);
  assert.equal(restored.digest, prepared.digest);
  assert.equal(restored.blob.type, 'image/jpeg');
  assert.deepEqual(await restored.blob.arrayBuffer(), await prepared.blob.arrayBuffer());
  assert.equal(f.writes[0].version, 2);
  assert.equal('base64' in f.writes[0], false);
  assert.equal(next.read().fields.deposit, '35000');
});

test('a legacy base64 receipt restores as a verified Blob without changing retry identity or expiry', async () => {
  const f=fixture(); const draft=f.create(); const prepared=await proof('old-format');
  draft.save({fields,proofDigest:prepared.digest,requestKey:'b'.repeat(64),requestSignature:'original immutable signature'});
  await draft.saveProof(prepared);
  const old=[...f.images.values()][0];
  delete old.version;
  old.base64=Buffer.from(await old.blob.arrayBuffer()).toString('base64');
  delete old.blob;
  const originalMetadata=[...f.values.values()][0];
  const next=f.create(); const metadata=next.read();
  const restored=await next.loadProof();
  assert.deepEqual(await restored.blob.arrayBuffer(),await prepared.blob.arrayBuffer());
  assert.equal(restored.digest,prepared.digest);
  assert.equal('base64' in restored,false);
  assert.equal(metadata.requestKey,'b'.repeat(64));
  assert.equal(metadata.requestSignature,'original immutable signature');
  assert.equal([...f.values.values()][0],originalMetadata);
  assert.equal(f.writes.length,1,'reading a legacy receipt does not race a migration write');
});

test('unknown receipt versions and noncanonical legacy base64 cannot become ready proof', async () => {
  for(const invalid of ['version','base64','type']) {
    const f=fixture(); const draft=f.create(); const prepared=await proof();
    draft.save({fields,proofDigest:prepared.digest}); await draft.saveProof(prepared);
    const record=[...f.images.values()][0];
    if(invalid==='version') record.version=3;
    if(invalid==='type') record.blob=new Blob([await prepared.blob.arrayBuffer()],{type:'image/svg+xml'});
    if(invalid==='base64') { delete record.version; record.base64=Buffer.from(await prepared.blob.arrayBuffer()).toString('base64')+'\n'; delete record.blob; }
    const next=f.create();next.read();
    assert.equal(await next.loadProof(),null,invalid);
    assert.equal(next.state().receiptSaved,false);
    assert.equal(next.read().fields.name,fields.name,'text progress survives receipt rejection');
  }
});

test('every current service choice and the typed manual amount survive draft recovery without payment recalculation', () => {
  for (const serviceDuration of ['plain:60', 'gel:60', 'removal:60', 'simple:60', 'simple:120', 'full-art:180', 'full-art:240', 'full-art:300']) {
    const f = fixture();
    f.create().save({ fields: { ...fields, serviceDuration, agreedPrice: '1000000', deposit: '20000' } });
    const restored = f.create().read();
    assert.equal(restored.fields.serviceDuration, serviceDuration);
    assert.equal(restored.fields.agreedPrice, '1000000');
    assert.equal(restored.fields.deposit, '20000');
  }
});

test('a missing old draft deposit stays blank and oversized payment text remains bounded', () => {
  const f = fixture(); const { deposit, ...oldFields } = fields;
  const draft = f.create(); draft.save({ fields: oldFields });
  assert.equal(f.create().read().fields.deposit, '', 'an old draft must require a newly entered amount');
  draft.save({ fields: { ...fields, deposit: '9'.repeat(1000) } });
  const restored = f.create().read();
  assert.equal(restored.fields.deposit.length, 16);
});

test('two callers share one pending receipt write', async () => {
  const f = fixture(); let release; let calls = 0;
  const draft = f.create({ receiptStore: { ...f.receiptStore, put: async value => { calls++; await new Promise(resolve => { release = resolve; }); f.images.set(value.id, value); } } });
  const prepared = await proof(); draft.save({ fields, proofDigest: prepared.digest });
  const first = draft.saveProof(prepared); const second = draft.saveProof(prepared);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1); release();
  assert.equal(await first, true); assert.equal(await second, true);
});

test('24-hour expiry rejects metadata and receipts rather than restoring a stale booking', async () => {
  const f = fixture(); const draft = f.create(); const prepared = await proof();
  draft.save({ fields, proofDigest: prepared.digest }); await draft.saveProof(prepared);
  f.advance(BOOKING_DRAFT_TTL);
  const next = f.create();
  assert.equal(next.read(), null);
  assert.equal(await next.loadProof(), null);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.images.size, 0);
  assert.equal(f.values.size, 0);
});

test('explicit clear removes metadata and waits behind any receipt write before deletion', async () => {
  const f = fixture(); let release;
  const draft = f.create({ receiptStore: { ...f.receiptStore, put: async value => { await new Promise(resolve => { release = resolve; }); f.images.set(value.id, value); } } });
  const prepared = await proof(); draft.save({ fields, proofDigest: prepared.digest });
  const writing = draft.saveProof(prepared); await new Promise(resolve => setTimeout(resolve, 0));
  draft.clear(); release(); await writing;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.values.size, 0); assert.equal(f.images.size, 0);
  assert.equal(draft.state().metadataSaved, false);
});

test('denied session storage never throws, blocks the form or falsely claims recovery', async () => {
  const f = fixture({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } } });
  const draft = f.create(); const prepared = await proof();
  assert.equal(draft.read(), null);
  assert.equal(draft.save({ fields, proofDigest: prepared.digest }), false);
  assert.equal(await draft.saveProof(prepared), false);
  assert.equal(draft.state().metadataSaved, false);
  assert.equal(f.writes.length, 0);
  assert.doesNotThrow(() => draft.clear());
});

test('receipt quota failure preserves text recovery while accurately reporting missing image recovery', async () => {
  const f = fixture(); const draft = f.create({ receiptStore: { ...f.receiptStore, put: async () => { throw new Error('quota'); } } });
  const prepared = await proof(); draft.save({ fields, proofDigest: prepared.digest });
  assert.equal(await draft.saveProof(prepared), false);
  assert.equal(draft.state().metadataSaved, true);
  assert.equal(draft.state().receiptSaved, false);
  assert.equal(f.create().read().fields.name, fields.name);
});

test('corrupt JPEG bytes or digest never restores ready proof', async () => {
  for (const corrupt of ['bytes', 'digest', 'header']) {
    const f = fixture(); const draft = f.create(); const prepared = await proof();
    draft.save({ fields, proofDigest: prepared.digest }); await draft.saveProof(prepared);
    const record = [...f.images.values()][0];
    if (corrupt === 'bytes') record.blob = new Blob([new Uint8Array([255, 216, 255, 1, 255, 217])], { type: 'image/jpeg' });
    if (corrupt === 'digest') record.digest = 'f'.repeat(64);
    if (corrupt === 'header') record.blob = new Blob(['not a JPEG'], { type: 'image/jpeg' });
    const next = f.create(); next.read();
    assert.equal(await next.loadProof(), null, corrupt);
    assert.equal(next.state().receiptSaved, false);
  }
});

test('malformed oversized or future metadata is discarded safely', () => {
  for (const raw of ['not-json', 'x'.repeat(4097), JSON.stringify({ version: 1, id: 'a'.repeat(64), createdAt: 900000, expiresAt: 900000 + BOOKING_DRAFT_TTL })]) {
    const f = fixture(); f.values.set('chii.booking.draft.v1', raw);
    assert.equal(f.create().read(), null);
    assert.equal(f.values.size, 0);
  }
});

test('a stalled browser digest has a bounded fallback instead of leaving proof restoration busy', { timeout: 6000 }, async () => {
  const f = fixture(); const draft = f.create(); const prepared = await proof();
  draft.save({ fields, proofDigest: prepared.digest }); await draft.saveProof(prepared);
  const next = f.create({ crypto: { getRandomValues: value => webcrypto.getRandomValues(value), subtle: { digest: () => new Promise(() => {}) } } });
  next.read();
  assert.equal(await next.loadProof(), null);
  assert.equal(next.state().receiptSaved, false);
});

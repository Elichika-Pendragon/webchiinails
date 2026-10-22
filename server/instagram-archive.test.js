import test from 'node:test';
import assert from 'node:assert/strict';
import bootstrap from '../public/data/instagram-archive.json' with { type: 'json' };
import { publicInstagramArchive, selectInstagramShowcase } from '../src/instagram-showcase.js';
import { mergeInstagramArchive, refreshInstagramArchive, discoverInstagramLinks, ARCHIVE_KEY, REFRESH_KEY } from './instagram-archive.js';
import { onRequest } from '../functions/api/instagram-archive.js';

const fresh = { id: 'NewChii12345', url: 'https://www.instagram.com/p/NewChii12345/' };
const now = Date.parse('2026-10-22T03:00:00+07:00');
function storage() {
  const records = new Map(), writes = [];
  return { records, writes, async get(key) { return records.has(key) ? JSON.parse(records.get(key)) : null; },
    async put(key, value) { records.set(key, value); writes.push(key); } };
}

test('manual seed contains 279 distinct real captured links and records the 280-count discrepancy', () => {
  const archive = publicInstagramArchive(bootstrap);
  assert.equal(archive.posts.length, 279);
  assert.equal(new Set(archive.posts.map(post => post.id)).size, 279);
  assert.equal(bootstrap.displayedPostCount, 280);
  assert.match(bootstrap.coverageNote, /unresolved/);
  assert.equal(archive.posts.some(post => 'timestamp' in post), false);
});

test('each visit shows 3 grid-recent plus 9 distinct archive posts with stable selection within the visit', () => {
  const a = selectInstagramShowcase(bootstrap, { seed: 'visit-a' });
  const b = selectInstagramShowcase(bootstrap, { seed: 'visit-b' });
  assert.equal(a.length, 12); assert.equal(new Set(a.map(post => post.id)).size, 12);
  assert.deepEqual(a.slice(0, 3).map(post => post.id), bootstrap.recentIds);
  assert.deepEqual(a, selectInstagramShowcase(bootstrap, { seed: 'visit-a' }));
  assert.notDeepEqual(a.slice(3).map(post => post.id), b.slice(3).map(post => post.id));
});

test('malformed archive data cannot add unsafe destinations, mismatched IDs, credentials or private fields', () => {
  const archive = publicInstagramArchive({ ...bootstrap, secret: 'private',
    posts: [{ ...fresh, token: 'private' }, { ...fresh },
      { id: 'Mismatch', url: fresh.url }, { id: 'Evil12345', url: 'https://evil.test/p/Evil12345/' }],
    recentIds: [fresh.id, fresh.id, 'absent'] });
  assert.deepEqual(archive.posts, [fresh]); assert.deepEqual(archive.recentIds, [fresh.id]);
  assert.equal(JSON.stringify(archive).includes('private'), false);
});

test('first-page refresh adds unknown IDs, retains the entire old archive, and ignores known pinned post for recency', () => {
  const found = [bootstrap.posts[0], fresh, ...bootstrap.posts.slice(1, 5)];
  const next = mergeInstagramArchive(bootstrap, found, now);
  assert.equal(next.posts.length, 280); assert.deepEqual(next.newIds, [fresh.id]);
  assert.equal(next.recentIds[0], fresh.id);
  assert.equal(next.recentIds.includes(bootstrap.pinnedIds[0]), false);
  assert.equal(next.lastSuccessAt, new Date(now).toISOString());
  assert.equal(next.posts.some(post => 'timestamp' in post), false);
  assert.equal(mergeInstagramArchive(next, found, now).posts.length, 280);
});

test('browser collector waits for owner anchors, rejects media, and does not supply cookies or authentication', async () => {
  const result = await discoverInstagramLinks({ async quickAction(action, options) {
    assert.equal(action, 'content'); assert.equal(options.cookies, undefined);
    assert.equal(options.authenticate, undefined); assert.equal(options.url, 'https://www.instagram.com/chii.nails_/');
    assert.equal(options.gotoOptions.timeout, 6000); assert.equal(options.waitForSelector.timeout, 7000);
    assert.deepEqual(options.rejectResourceTypes, ['image', 'media', 'font']);
    return Response.json({ success: true, result: '<a href="/chii.nails_/p/NewChii12345/">post</a>' },
      { headers: { 'x-browser-ms-used': '2500' } });
  } });
  assert.deepEqual(result, { links: [fresh], browserMs: 2500 });
});

test('one hourly attempt persists the union and subsequent delivery does not launch a browser again', async () => {
  const store = storage(); let calls = 0;
  const env = { INSTAGRAM_SCRAPING_ENABLED: 'true', INSTAGRAM_LINKS: store, BROWSER: {} };
  const discover = async () => { calls++; return { links: [fresh], browserMs: 2500 }; };
  assert.deepEqual(await refreshInstagramArchive(env, bootstrap, { now, discover }), { status: 'fresh', total: 280, added: 1 });
  assert.equal((await store.get(ARCHIVE_KEY)).posts.length, 280);
  assert.equal((await refreshInstagramArchive(env, bootstrap, { now: now + 1000, discover })).status, 'not-due');
  assert.equal(calls, 1);
});

test('failed discovery never replaces the saved archive, while daily admission budget stops new browser calls', async () => {
  const store = storage(); await store.put(ARCHIVE_KEY, JSON.stringify(bootstrap));
  const before = store.records.get(ARCHIVE_KEY); let calls = 0;
  const env = { INSTAGRAM_SCRAPING_ENABLED: 'true', INSTAGRAM_LINKS: store, BROWSER: {} };
  const discover = async () => { calls++; throw new Error('private upstream diagnostics'); };
  assert.equal((await refreshInstagramArchive(env, bootstrap, { now, discover })).status, 'stale');
  assert.equal(store.records.get(ARCHIVE_KEY), before);
  await store.put(REFRESH_KEY, JSON.stringify({ day: new Date(now).toISOString().slice(0, 10),
    attemptedAt: new Date(now - 3600000).toISOString(), attempts: 24, reservedMs: 360000 }));
  assert.equal((await refreshInstagramArchive(env, bootstrap, { now, discover })).status, 'daily-budget');
  assert.equal(calls, 1);
});

test('visitor endpoint returns only saved public links, falls back on storage failure, and cannot trigger collection', async () => {
  const context = { request: new Request('https://example.com/api/instagram-archive?bypass=1'),
    env: { INSTAGRAM_LINKS: { get: async () => { throw new Error('private storage details'); } },
      BROWSER: { quickAction() { assert.fail('Visitors must not scrape'); } } } };
  const response = await onRequest(context);
  assert.equal(response.status, 200); assert.equal((await response.json()).posts.length, 279);
  const write = await onRequest({ request: new Request(context.request.url, { method: 'POST' }) });
  assert.equal(write.status, 405);
});

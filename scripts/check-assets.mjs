import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { seoPages } from './seo.mjs';
const root = new URL('../dist/', import.meta.url);
async function walk(folder) {
  const result = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const file = new URL(item.name + (item.isDirectory() ? '/' : ''), folder);
    if (item.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
}
const files = await walk(root);
const javascript = files.filter(file => file.pathname.endsWith('.js'));
let raw = 0, gzip = 0;
for (const file of javascript) {
  const source = await readFile(file, 'utf8');
  assert.ok(!/react-dom|react\.production|hydrateRoot|createRoot|react\.transitional\.element|INSTAGRAM_ACCESS_TOKEN|TOKEN_ENCRYPTION_KEY|GOOGLE_SERVICE_ACCOUNT|GOOGLE_CALENDAR_ID|BEGIN PRIVATE KEY/.test(source), `No React runtime or secret code: ${file.pathname}`);
  raw += Buffer.byteLength(source); gzip += gzipSync(source).length;
}
const bookingPage = { path: '/book', file: 'book.html' };
for (const page of [...seoPages, bookingPage]) {
  const html = await readFile(new URL(page.file, root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/(?:images|fonts|_astro)\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    assert.ok((await stat(new URL(`.${match[1]}`, root))).isFile(), `${page.path}: asset ${match[1]} exists`);
  }
}
const bookingHtml = await readFile(new URL(bookingPage.file, root), 'utf8');
const depositInput = bookingHtml.match(/<input\b[^>]*id="booking-deposit"[^>]*>/)?.[0] || '';
assert.match(depositInput, /\sreadonly(?:\s|=|>|\/)/, 'DP is calculated, never customer-editable');
assert.ok(bookingHtml.includes('DP 10%') && bookingHtml.includes('transfer atau QRIS'), 'Current deposit and payment copy');
assert.ok(!bookingHtml.includes('Jessica') && !bookingHtml.includes('Mulai terakhir'), 'Customer-facing booking copy uses Chii and Last book');
const bookingIds = [...bookingHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(bookingIds).size, bookingIds.length, 'Booking IDs are unique so labels and action links target the correct control');
assert.match(bookingHtml, /<meta name="robots" content="noindex, nofollow"/);
assert.ok(!seoPages.some(page => page.path === bookingPage.path), 'Booking preview stays outside SEO routes');
const header = bookingHtml.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] || '';
assert.ok(header && !/href="\/book(?:["/#?])/.test(header), 'No booking link in shared header/menu');
assert.ok(!/astro-island|client:load|client:visible/.test(bookingHtml), 'Booking is static HTML without framework hydration');
const sitemap = files.find(file => file.pathname.endsWith('/sitemap.xml'));
if (sitemap) assert.ok(!(await readFile(sitemap, 'utf8')).includes('/book'), 'Booking preview is excluded from sitemap');
console.log(JSON.stringify({ pages: seoPages.length, browserJsFiles: javascript.length, browserJsBytes: raw, browserJsGzipBytes: gzip, reactClientRuntime: false }, null, 2));

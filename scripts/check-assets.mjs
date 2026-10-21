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
const approvalPage = { path: '/book/approve', file: 'book/approve.html' };
for (const page of [...seoPages, bookingPage, approvalPage]) {
  const html = await readFile(new URL(page.file, root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/(?:images|fonts|_astro)\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    assert.ok((await stat(new URL(`.${match[1]}`, root))).isFile(), `${page.path}: asset ${match[1]} exists`);
  }
}
const bookingHtml = await readFile(new URL(bookingPage.file, root), 'utf8');
const depositInput = bookingHtml.match(/<input\b[^>]*id="booking-deposit"[^>]*>/)?.[0] || '';
assert.ok(!/\sreadonly(?:\s|=|>|\/)/.test(depositInput), 'DP accepts the amount the customer paid');
assert.equal(bookingHtml.match(/<label\b[^>]*for="booking-deposit"[^>]*>([^<]*)<\/label>/)?.[1], 'DP · min. Rp20.000', 'Current minimum DP label');
assert.ok(bookingHtml.includes('minimum Rp20.000') && bookingHtml.includes('full payment') && bookingHtml.includes('transfer atau QRIS'), 'Current payment choices and minimum');
for (const name of ['paymentMode', 'serviceDuration', 'time']) assert.match(bookingHtml, new RegExp(`<select\\b[^>]*name="${name}"[^>]*required`), `${name} choice is required`);
for (const value of ['plain:60', 'gel:60', 'removal:60', 'simple:60', 'simple:120', 'full-art:180', 'full-art:240', 'full-art:300']) assert.ok(bookingHtml.includes(`value="${value}"`), `Combined service choice ${value} exists`);
assert.match(bookingHtml, /<input\b[^>]*name="deposit"[^>]*inputmode="numeric"[^>]*required/, 'Customers must enter their DP amount');
assert.ok(!/<input\b[^>]*name="deposit"[^>]*readonly/.test(bookingHtml) && !bookingHtml.includes('10%'), 'Current DP is editable without a percentage rule');
assert.ok(!/id="booking-(?:designType|durationMinutes|slots)"/.test(bookingHtml), 'Combined service and native time dropdowns replace separate duration and slot grid');
assert.match(bookingHtml, /<input\b[^>]*name="paymentProof"[^>]*required/, 'Payment proof is required before Book');
assert.ok(!bookingHtml.includes('Jessica') && !bookingHtml.includes('Mulai terakhir'), 'Customer-facing booking copy uses Chii and Last book');
const bookingIds = [...bookingHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(bookingIds).size, bookingIds.length, 'Booking IDs are unique so labels and action links target the correct control');
assert.match(bookingHtml, /<meta name="robots" content="noindex, nofollow"/);
assert.ok(!seoPages.some(page => page.path === bookingPage.path), 'Booking preview stays outside SEO routes');
const header = bookingHtml.match(/<header[\s>][\s\S]*?<\/header>/)?.[0] || '';
assert.ok(header && !/href="\/book(?:["/#?])/.test(header), 'No booking link in shared header/menu');
assert.ok(!/astro-island|client:load|client:visible/.test(bookingHtml), 'Booking is static HTML without framework hydration');
assert.match(bookingHtml, /<button\b[^>]*id="booking-review"[^>]*disabled[^>]*>Book<\/button>/, 'Book starts disabled until the required values are valid');
const approvalHtml = await readFile(new URL(approvalPage.file, root), 'utf8');
assert.match(approvalHtml, /<meta name="robots" content="noindex, nofollow"/);
assert.match(approvalHtml, /<meta name="referrer" content="no-referrer"/);
assert.ok(!/astro-island|client:load|client:visible|<iframe\b/.test(approvalHtml), 'Approval is static HTML without framework hydration or embeds');
assert.ok(!/accounts\.google\.com\/gsi\/client/.test(approvalHtml), 'Google sign-in loads only after an owner action');
assert.ok(!/BOOKING_(?:LINK|AUTH)_SECRET|BOOKING_OWNER_EMAIL|GOOGLE_SERVICE_ACCOUNT|GOOGLE_CALENDAR_ID|BEGIN PRIVATE KEY/.test(approvalHtml), 'Approval HTML contains no credentials or private calendar configuration');
const sitemap = files.find(file => file.pathname.endsWith('/sitemap.xml'));
if (sitemap) assert.ok(!(await readFile(sitemap, 'utf8')).includes('/book'), 'Booking preview is excluded from sitemap');
console.log(JSON.stringify({ pages: seoPages.length, browserJsFiles: javascript.length, browserJsBytes: raw, browserJsGzipBytes: gzip, reactClientRuntime: false }, null, 2));

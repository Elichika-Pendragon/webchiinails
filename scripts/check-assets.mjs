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
  assert.ok(!/react-dom|react\.production|hydrateRoot|createRoot|react\.transitional\.element|INSTAGRAM_ACCESS_TOKEN|TOKEN_ENCRYPTION_KEY/.test(source), `No React runtime or secret code: ${file.pathname}`);
  raw += Buffer.byteLength(source); gzip += gzipSync(source).length;
}
for (const page of seoPages) {
  const html = await readFile(new URL(page.file, root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/(?:images|fonts|_astro)\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    assert.ok((await stat(new URL(`.${match[1]}`, root))).isFile(), `${page.path}: asset ${match[1]} exists`);
  }
}
console.log(JSON.stringify({ pages: seoPages.length, browserJsFiles: javascript.length, browserJsBytes: raw, browserJsGzipBytes: gzip, reactClientRuntime: false }, null, 2));

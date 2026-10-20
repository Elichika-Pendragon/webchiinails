import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { siteSettings, seoPages, sitemap } from './seo.mjs';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const settings = siteSettings(env);
for (const page of seoPages) {
  const html = await readFile(new URL(`../dist/${page.file}`, import.meta.url), 'utf8');
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${page.path}: one main heading`);
  assert.ok(html.includes('Palembang'), `${page.path}: local content is available without JavaScript`);
  assert.ok(html.includes(page.title.replaceAll('&', '&amp;')), `${page.path}: unique page title`);
  assert.ok(!/<astro-island\b|component-url=|hydrateRoot\(/.test(html), 'No React client hydration');
  assert.ok(!/tanpa DP|tidak memerlukan DP|No deposit/.test(html), 'Current booking deposit rules');
  if (page.path === '/about') {
    assert.equal((html.match(/<summary\b/g) || []).length, 6);
    assert.ok(html.includes('Booking wajib DP') && html.includes('Last book') && html.includes('14:00') && html.includes('10:00'));
  }
}
const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
if (settings.indexable) {
  await writeFile(new URL('../dist/sitemap.xml', import.meta.url), sitemap(settings.origin));
  robots.push(`Sitemap: ${settings.origin}/sitemap.xml`);
} else await unlink(new URL('../dist/sitemap.xml', import.meta.url)).catch(error => { if (error.code !== 'ENOENT') throw error; });
await writeFile(new URL('../dist/robots.txt', import.meta.url), `${robots.join('\n')}\n`);
const verification = 'googlefe4df279dce4c32d.html';
assert.deepEqual(await readFile(new URL(`../dist/${verification}`, import.meta.url)), await readFile(new URL(`../public/${verification}`, import.meta.url)));
// Astro emits a renderer chunk for installed framework integrations, even when
// no page hydrates. Remove only React renderer chunks proven unreferenced by
// every generated page and every other browser chunk. A future island fails
// this guard rather than silently deleting code that the page actually needs.
const assets = new URL('../dist/_astro/', import.meta.url);
const scripts = (await readdir(assets)).filter(name => name.endsWith('.js'));
const contents = new Map(await Promise.all(scripts.map(async name => [name, await readFile(new URL(name, assets), 'utf8')])));
const pages = await Promise.all(seoPages.map(page => readFile(new URL(`../dist/${page.file}`, import.meta.url), 'utf8')));
for (const [name, source] of contents) {
  if (!/^client\..+\.js$/.test(name) || !/react\.transitional\.element/.test(source)) continue;
  assert.ok(!pages.some(html => html.includes(name)) && ![...contents].some(([other, code]) => other !== name && code.includes(name)), 'React client runtime must remain unreferenced');
  await unlink(new URL(name, assets));
  console.log(`Removed unused framework renderer ${name}`);
}
console.log(`Validated ${seoPages.length} static pages. ${settings.indexable ? 'Production sitemap generated.' : 'Noindex guard enabled; sitemap omitted.'}`);

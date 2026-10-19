import { readFile, writeFile, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { render } from '../.prerender/entry-server.js';
import { salon } from '../src/content.js';
import { escapeHtml, seoPages, seoHead, siteSettings, sitemap } from './seo.mjs';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const settings = siteSettings(env);
const year = new Date().getFullYear();
for (const page of seoPages) {
  const file = new URL(`../dist/${page.file}`, import.meta.url);
  let html = await readFile(file, 'utf8');
  // The entire stylesheet is about 5 KB gzipped. Inline it in the static HTML
  // so the first render does not wait for another stylesheet round trip.
  for (const match of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
    const href = match[0].match(/href="(\/assets\/[^"?]+\.css)"/)?.[1];
    assert.ok(href && !href.includes('..'), 'Expected a local built stylesheet');
    const css = await readFile(new URL(`../dist${href}`, import.meta.url), 'utf8');
    assert.ok(!/<\/style/i.test(css), 'Stylesheet must be safe to inline');
    html = html.replace(match[0], `<style>${css}</style>`);
  }
  const body = render(page.path, year);
  assert.equal((body.match(/<h1\b/g) || []).length, 1, 'Each page must contain one visible main heading');
  assert.ok(body.includes('Palembang'), 'Location must be present without JavaScript');
  if (page.path === '/about') {
    assert.equal((body.match(/<summary\b/g) || []).length, 6);
    assert.ok(body.includes('Booking wajib DP'));
    assert.ok(body.includes('15.00') && body.includes('10.00'));
  }
  const root = '<div id="root"></div>';
  assert.ok(html.includes(root), 'Expected the empty client root before prerendering');
  html = html.replace(root, `<div id="root" data-prerendered="true" data-year="${year}">${body}</div>`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace('</head>', `    ${seoHead(page, settings, salon, env.GOOGLE_SITE_VERIFICATION || '')}\n  </head>`);
  assert.ok(!/tanpa DP|tidak memerlukan DP|No deposit/.test(html));
  await writeFile(file, html);
}

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
if (settings.indexable) {
  await writeFile(new URL('../dist/sitemap.xml', import.meta.url), sitemap(settings.origin));
  robots.push(`Sitemap: ${settings.origin}/sitemap.xml`);
} else {
  await unlink(new URL('../dist/sitemap.xml', import.meta.url)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
await writeFile(new URL('../dist/robots.txt', import.meta.url), `${robots.join('\n')}\n`);
console.log(`Prerendered ${seoPages.length} pages. ${settings.indexable ? 'Production SEO URLs and sitemap generated.' : 'Indexing disabled until SITE_URL is configured for production.'}`);

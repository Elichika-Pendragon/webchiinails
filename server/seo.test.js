import test from 'node:test';
import assert from 'node:assert/strict';
import { salon } from '../src/content.js';
import { siteSettings, structuredData, seoPages, seoHead, safeJson, sitemap } from '../scripts/seo.mjs';

test('SEO cannot index missing-domain or branch-preview builds', () => {
  assert.equal(siteSettings({}).indexable, false);
  assert.equal(siteSettings({ SITE_URL: 'https://chii.test/', CF_PAGES_BRANCH: 'preview' }).indexable, false);
  assert.equal(siteSettings({ SITE_URL: 'https://chii.test/', CF_PAGES_BRANCH: 'main' }).indexable, true);
  assert.equal(siteSettings({ SITE_URL: 'https://chii.test', SEO_INDEXABLE: 'false' }).indexable, false);
  for (const value of ['http://chii.test', 'https://chii.test/about', 'https://secret@chii.test', 'https://chii.test/?x=1']) {
    assert.throws(() => siteSettings({ SITE_URL: value }));
  }
});
test('structured data uses actual weekday/weekend opening times, separate from booking cutoffs', () => {
  const data = structuredData(seoPages[0], 'https://chii.test', salon);
  const business = data['@graph'].find(item => item['@type'] === 'NailSalon');
  assert.equal(business.openingHoursSpecification[0].closes, '17:00');
  assert.equal(business.openingHoursSpecification[1].closes, '12:00');
  assert.match(business.description, /15.00/);
  assert.match(business.description, /10.00/);
  assert.equal(business.address.addressLocality, 'Palembang');
  assert.equal(business.hasMap, salon.maps);
  assert.equal(business.geo.latitude, -2.9707861);
  assert.equal(business.geo.longitude, 104.7923294);
  assert.equal('aggregateRating' in business, false);
});
test('canonical and sitemap URLs agree and metadata is safely escaped', () => {
  const settings = siteSettings({ SITE_URL: 'https://chii.test/' });
  const head = seoHead(seoPages[1], settings, salon, 'verification"<tag>');
  assert.equal((head.match(/rel="canonical"/g) || []).length, 1);
  assert.match(head, /href="https:\/\/chii.test\/about"/);
  assert.ok(sitemap(settings.origin).includes('<loc>https://chii.test/about</loc>'));
  assert.equal(head.includes('verification"<tag>'), false);
  assert.equal(safeJson({ value: '</script>' }).includes('</script>'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeed, selectHeroMedia, heroFallbacks } from '../src/feed-data.js';
import { salon } from '../src/content.js';

test('hero selects newest image previews and keeps their actual Instagram destinations', () => {
  const feed = normalizeFeed({ posts: [
    { id: 'old', url: 'https://www.instagram.com/p/old/', imageUrl: 'https://cdn.example/wide.jpg', timestamp: '2026-01-01' },
    { id: 'new', url: 'https://www.instagram.com/reel/new/', imageUrl: 'https://cdn.example/tall.jpg', timestamp: '2026-02-01' },
    { id: 'no-preview', url: 'https://www.instagram.com/p/missing/', timestamp: '2026-03-01' },
    { id: 'unsafe', url: 'https://evil.example/p/post/', imageUrl: 'https://cdn.example/x.jpg', timestamp: '2026-04-01' },
  ] });
  const hero = selectHeroMedia(feed);
  assert.equal(hero.length, 4);
  assert.deepEqual(hero.slice(0, 2).map(post => post.id), ['new', 'old']);
  assert.equal(hero[0].url, 'https://www.instagram.com/reel/new/');
  assert.equal(hero[0].backup, heroFallbacks[0]);
  assert.equal(hero[2].id, heroFallbacks[2].id);
});

test('missing/unsafe media keeps usable local frames without exposing unsafe image URLs', () => {
  assert.deepEqual(normalizeFeed({ posts: null }), []);
  const feed = normalizeFeed({ posts: [{ id: 'x', url: 'https://www.instagram.com/p/x/', imageUrl: 'javascript:alert(1)', timestamp: '2026-01-01' }] });
  assert.equal(feed[0].imageUrl, undefined);
  assert.deepEqual(selectHeroMedia(feed).map(post => post.id), heroFallbacks.map(post => post.id));
});

test('location links target the verified Maps place and route, not the Search share redirect', () => {
  const place = new URL(salon.maps), directions = new URL(salon.directions), embed = new URL(salon.mapEmbed);
  assert.equal(place.pathname, '/maps');
  assert.equal(place.searchParams.get('cid'), '13060782932404739183');
  assert.equal(directions.pathname, '/maps/dir/');
  assert.equal(directions.searchParams.get('destination'), '-2.9707861,104.7923294');
  assert.equal(embed.pathname, '/maps/embed');
  assert.ok(embed.searchParams.get('pb').includes('0xb54138e0c6781c6f'));
});

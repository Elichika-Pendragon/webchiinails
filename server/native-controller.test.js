import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { posts, salon } from '../src/content.js';
import { normalizeFeed, selectHeroMedia } from '../src/feed-data.js';

// Execute the real browser entry with bounded DOM/event adapters. No browser,
// third-party script, real timer, network request or account is used by this test.
const controller = (await readFile(new URL('../src/scripts/client.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
class Node {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.dataset = {}; this.events = {}; this.hidden = false; this._text = ''; this.width = 330; this.height = 200; this.scrollLeft = 0; this.clientWidth = 330; this.scrollWidth = 1400; }
  set className(value) { this.attributes.class = value; }
  get className() { return this.attributes.class || ''; }
  get classList() { return { contains: name => this.className.split(' ').includes(name), add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; }, toggle: (name, on) => { this.className = this.className.split(' ').filter(item => item !== name).concat(on ? [name] : []).join(' '); } }; }
  set textContent(value) { this._text = String(value); this.children.forEach(child => { child.parentNode = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  get firstChild() { return this.children[0]; }
  get lastChild() { return this.children.at(-1); }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  set src(value) { this.setAttribute('src', value); }
  get src() { return this.getAttribute('src'); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  prepend(node) { this.insertBefore(node, this.children[0] || null); }
  insertBefore(node, before) { if (node === before) return node; node.remove(); const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, node); node.parentNode = this; this.inserts = (this.inserts || 0) + 1; return node; }
  remove() { if (this.parentNode) { const index = this.parentNode.children.indexOf(this); this.parentNode.children.splice(index, 1); this.parentNode = null; } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[2] === undefined ? this.getAttribute(attr[1]) !== null : this.getAttribute(attr[1]) === attr[2];
    return this.tagName === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector); }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(item => item.trim().split(/\s+/));
    const match = (node, parts) => { if (!node.matches(parts.at(-1))) return false; if (parts.length === 1) return true; let parent = node.parentNode; while (parent) { if (match(parent, parts.slice(0, -1))) return true; parent = parent.parentNode; } return false; };
    const output = []; const walk = node => { for (const child of node.children) { if (selectors.some(parts => match(child, parts))) output.push(child); walk(child); } }; walk(this); return output;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) { (this.events[type] ||= []).push(handler); }
  emit(type, values = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, ...values }; for (const handler of this.events[type] || []) handler(event); return event; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  getBoundingClientRect() { return { width: this.width, height: this.height, top: this.top || 0, bottom: (this.top || 0) + this.height }; }
  focus() { this.owner.activeElement = this; }
  scrollBy(options) { this.lastScroll = options; this.scrollLeft += options.left; }
}
function harness({ hero = true, gallery = true, controls = false, response, maps = [], idle = true, intersection = true } = {}) {
  const document = new Node('document'); document.readyState = 'loading'; document.body = new Node('body'); document.append(document.body); document.createElement = tag => { const node = new Node(tag); node.owner = document; return node; }; document.createTextNode = text => { const node = document.createElement(''); node.textContent = text; return node; };
  const make = (tag, className, parent = document.body) => { const node = document.createElement(tag); node.className = className; parent?.append(node); return node; };
  const heroes = [];
  if (hero) for (const fallback of selectHeroMedia(posts)) { const link = make('a', 'mosaic-photo-link'); const picture = make('picture', '', link); if (fallback.image === 'french') make('source', '', picture); const img = make('img', '', picture); img.src = `/images/${fallback.image}.webp`; heroes.push(link); }
  let track;
  if (gallery) {
    const section = make('section', ''); section.setAttribute('id', 'gallery'); track = make('div', 'instagram-track', section);
    for (const post of posts) { const card = make('article', 'instagram-slide', track); const preview = make('div', 'post-placeholder', card); make('img', 'photo', preview).src = `/images/${post.image}.webp`; make('p', '', preview).textContent = 'Instagram post'; const link = make('a', 'post-original', card); link.href = post.url; link.append(document.createTextNode(`${post.title} `), make('span', '', null)); }
    const previous = make('button', '', section); previous.setAttribute('aria-label', 'Postingan sebelumnya'); const next = make('button', '', section); next.setAttribute('aria-label', 'Postingan berikutnya'); make('span', '', section).setAttribute('aria-live', 'polite');
  }
  let menu, trigger, panel, close;
  if (controls) {
    menu = make('button', 'menu-toggle'); menu.setAttribute('aria-expanded', 'false'); make('nav', '').setAttribute('id', 'main-navigation');
    const widget = make('div', 'chat-widget'); panel = make('section', '', widget); panel.setAttribute('id', 'chat-panel'); panel.hidden = true; close = make('button', 'icon-button', panel); trigger = make('button', 'chat-trigger', widget); trigger.append(make('svg', '', null), document.createTextNode('Chat with us'));
  }
  const mapAreas = maps.map(options => {
    const column = make('div', 'map-column'); const area = make('div', 'map-area', column); area.hidden = Boolean(options.hidden); area.top = options.top || 0;
    const cover = make('div', 'map-loading-cover', area); const place = make('div', 'map-place', cover); make('button', '', place).textContent = 'Muat peta interaktif ↗';
    make('p', 'muted', column).textContent = 'Temukan lokasi tepatnya lewat Google Maps.';
    const direct = make('a', 'button', column); direct.href = salon.maps; direct.rel = 'noopener noreferrer'; direct.target = '_blank'; direct.textContent = 'Open Google Maps';
    return area;
  });
  const events = {}, timers = new Map(), intervals = [], fetches = [], observers = [], idleCallbacks = [];
  let timerId = 0;
  class Observer { constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); } observe(node) { this.node = node; } disconnect() { this.disconnected = true; } }
  const context = { document, posts, salon, normalizeFeed, selectHeroMedia, URL, AbortController, Promise, getComputedStyle: () => ({ visibility: 'visible' }), matchMedia: () => ({ matches: true }), innerHeight: 800,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    addEventListener: (type, handler) => { (events[type] ||= []).push(handler); }, removeEventListener: (type, handler) => { events[type] = (events[type] || []).filter(item => item !== handler); }, IntersectionObserver: Observer, ResizeObserver: Observer, MutationObserver: Observer,
    fetch: (...args) => { fetches.push(args); return response ? response(...args) : Promise.resolve({ ok: false }); },
  };
  if (idle) context.requestIdleCallback = (callback, options) => idleCallbacks.push({ callback, options });
  if (!intersection) delete context.IntersectionObserver;
  context.window = context;
  vm.runInNewContext(`${controller}\nglobalThis.qa={updateHero,updateGallery,states,setMenu,setChat};`, context, { timeout: 1000 });
  return { ...context.qa, window: context, document, heroes, track, menu, trigger, panel, close, mapAreas, events, timers, intervals, fetches, observers, idleCallbacks, fire: (type, event) => { for (const fn of events[type] || []) fn(event); } };
}
// make(..., null) is used for detached nodes just like document.createElement.
const settle = () => new Promise(resolve => setImmediate(resolve));

test('hero AVIF/network errors select the local WebP backup and keep it on repeated feeds', () => {
  const app = harness({ gallery: false });
  const first = app.heroes[0], img = first.querySelector('img');
  assert.ok(first.querySelector('source'));
  img.onerror();
  assert.equal(first.querySelector('source'), null);
  assert.equal(img.src, '/images/french.webp');
  app.updateHero(posts);
  assert.equal(first.querySelector('source'), null);
  const feed = [{ id: 'new', imageUrl: 'https://cdn.example/new.jpg', url: 'https://www.instagram.com/p/new/', alt: 'New' }];
  app.updateHero(feed); assert.equal(img.src, feed[0].imageUrl); img.onerror();
  assert.equal(img.src, '/images/french.webp'); assert.equal(first.href, posts[1].url);
  app.updateHero(feed); assert.equal(img.src, '/images/french.webp');
});

test('missing preview images keep all four fixed hero slots usable', () => {
  const app = harness({ gallery: false });
  app.updateHero([{ id: 'text-only', url: posts[0].url, title: 'No preview' }]);
  assert.deepEqual(app.heroes.map(link => link.querySelector('img').src), ['/images/french.webp', '/images/pink.webp', '/images/presson.webp', '/images/maroon.webp']);
});

test('unchanged gallery polling preserves loaded iframe/card identity without DOM moves', () => {
  const app = harness({ hero: false }); const first = app.track.children[0]; const frame = app.document.createElement('iframe'); first.prepend(frame); const inserts = app.track.inserts;
  app.updateGallery(posts.map(post => ({ ...post, title: 'Updated caption' })));
  assert.equal(app.track.children[0], first); assert.equal(first.querySelector('iframe'), frame); assert.equal(app.track.inserts, inserts); assert.equal(frame.title, 'Instagram: Updated caption');
});

test('gallery permutations keep identity, while removed or changed post URLs cancel old work', () => {
  const app = harness({ hero: false }); const states = new Map(app.states); const original = [...app.track.children];
  app.updateGallery([posts[2], posts[0], posts[3], posts[1]]);
  assert.deepEqual(app.track.children, [original[2], original[0], original[3], original[1]]);
  const replaced = states.get(posts[0].id); const oldObserver = { disconnect() { this.done = true; } }; replaced.nearObserver = oldObserver;
  app.updateGallery([{ ...posts[0], url: 'https://www.instagram.com/p/replacement/' }]);
  assert.equal(replaced.cancelled, true); assert.equal(oldObserver.done, true); assert.equal(replaced.card.parentNode, null); assert.notEqual(app.states.get(posts[0].id).card, replaced.card); assert.equal(app.track.children.length, 1);
});

test('API captions stay literal text and unsafe permalink/image protocols are rejected', () => {
  const app = harness({ hero: false }); const title = '<img src=x onerror=alert(1)> & "caption"';
  const feed = normalizeFeed({ posts: [{ id: 'safe', url: 'https://www.instagram.com/p/safe/', imageUrl: 'javascript:alert(1)', title, timestamp: '2026-10-20T00:00:00Z' }, { id: 'bad', url: 'javascript:alert(1)', timestamp: '2026-10-20T00:00:00Z' }] });
  assert.equal(feed.length, 1); assert.equal(feed[0].imageUrl, undefined); app.updateGallery(feed);
  assert.equal(app.track.children[0].getAttribute('aria-label'), title); assert.equal(app.track.querySelector('.post-original').firstChild.textContent, `${title} `); assert.equal(app.track.querySelectorAll('img').length, 1); assert.equal(app.track.querySelector('script'), null);
});

test('hidden galleries do not load Instagram; removed cards ignore late embed-script completion', async () => {
  const app = harness({ hero: false }); const gallery = app.document.querySelector('#gallery');
  const activation = app.observers.find(observer => observer.node === gallery);
  assert.equal(app.document.querySelectorAll('script').length, 0);
  gallery.hidden = true; activation.callback([{ isIntersecting: true }]);
  assert.equal(app.document.querySelectorAll('script').length, 0);
  gallery.hidden = false; activation.callback([{ isIntersecting: true }]);
  const first = app.states.get(posts[0].id); const near = app.observers.find(observer => observer.node === first.card);
  near.callback([{ isIntersecting: true }]); near.callback([{ isIntersecting: true }]);
  assert.equal(app.document.querySelectorAll('script').length, 1);
  const script = app.document.querySelector('script'); assert.equal(script.src, 'https://www.instagram.com/embed.js');
  app.updateGallery(posts.slice(1));
  let processed = 0; app.window.instgrm = { Embeds: { process() { processed++; } } }; script.onload(); await settle();
  assert.equal(first.cancelled, true); assert.equal(first.host.parentNode, null); assert.equal(processed, 0);
});

test('gallery keyboard control does not steal arrow keys from nested links; Escape restores controls', () => {
  const app = harness({ controls: true }); const link = app.track.querySelector('.post-original');
  const nested = app.track.emit('keydown', { key: 'ArrowRight', target: link }); assert.equal(nested.prevented, undefined);
  const own = app.track.emit('keydown', { key: 'ArrowRight' }); assert.equal(own.prevented, true); assert.equal(app.track.lastScroll.behavior, 'auto');
  app.trigger.emit('click'); assert.equal(app.panel.hidden, false); assert.equal(app.document.activeElement, app.close);
  app.document.emit('keydown', { key: 'Escape' }); assert.equal(app.panel.hidden, true); assert.equal(app.document.activeElement, app.trigger);
  app.menu.emit('click'); app.document.emit('keydown', { key: 'Escape' }); assert.equal(app.menu.getAttribute('aria-expanded'), 'false'); assert.equal(app.document.activeElement, app.menu);
});

test('polling pauses while hidden, avoids overlap, aborts on pagehide and resumes safely', async () => {
  let resolve;
  const app = harness({ gallery: false, response: () => new Promise(done => { resolve = done; }) });
  assert.equal(app.fetches.length, 1); assert.equal(app.intervals[0].delay, 300000);
  app.intervals[0].fn(); assert.equal(app.fetches.length, 1);
  app.fire('pagehide', {}); assert.equal(app.fetches[0][1].signal.aborted, true);
  resolve({ ok: false }); await settle(); app.document.hidden = true; app.intervals[0].fn(); assert.equal(app.fetches.length, 1);
  app.document.hidden = false; app.document.emit('visibilitychange'); assert.equal(app.fetches.length, 2);
  resolve({ ok: false }); await settle(); assert.equal(app.timers.size, 0);
});

test('automatic maps wait for window load and idle, then initialize only a nearby shown area', () => {
  const app = harness({ hero: false, gallery: false, maps: [{}, { hidden: true }] });
  assert.equal(app.document.querySelectorAll('iframe').length, 0); assert.equal(app.idleCallbacks.length, 0); assert.equal(app.observers.length, 0);
  app.fire('load', {}); assert.equal(app.idleCallbacks.length, 2); assert.equal(app.document.querySelectorAll('iframe').length, 0);
  app.idleCallbacks.forEach(item => item.callback()); assert.equal(app.observers.length, 2);
  assert.equal(app.observers[0].options.rootMargin, '200px');
  app.observers[0].callback([{ isIntersecting: false }]); app.observers[1].callback([{ isIntersecting: true }]);
  assert.equal(app.document.querySelectorAll('iframe').length, 0);
  app.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(app.mapAreas[0].querySelectorAll('iframe').length, 1); assert.equal(app.mapAreas[1].querySelectorAll('iframe').length, 0); assert.equal(app.observers[0].disconnected, true);
});

test('manual/automatic map races create one exposed frame, and load clears outside status/busy work', () => {
  const app = harness({ hero: false, gallery: false, maps: [{}] }); const area = app.mapAreas[0]; const button = area.querySelector('button');
  app.fire('load', {}); app.idleCallbacks[0].callback(); const observer = app.observers[0];
  button.emit('click'); observer.callback([{ isIntersecting: true }]); button.emit('click');
  assert.equal(area.querySelectorAll('iframe').length, 1); assert.equal(observer.disconnected, true); assert.equal(button.disabled, true);
  const frame = area.querySelector('iframe'); assert.equal(frame.src, salon.mapEmbed); assert.equal(frame.title, 'Google Maps — Dewi Salon & Chii.Nails, Palembang');
  assert.equal(area.querySelector('.map-loading-cover'), null, 'Google can paint before its full load event');
  const status = area.parentNode.querySelector('.map-status'); assert.equal(status.parentNode, area.parentNode); assert.equal(area.contains(status), false); assert.equal(status.getAttribute('role'), 'status');
  assert.equal(area.getAttribute('aria-busy'), 'true'); assert.equal(area.parentNode.querySelector('a').href, salon.maps);
  assert.equal(app.timers.size, 1); frame.emit('load'); assert.equal(app.timers.size, 0); assert.equal(area.getAttribute('aria-busy'), 'false'); assert.equal(status.parentNode, null); assert.equal(area.parentNode.querySelector('a').href, salon.maps);
});

test('slow maps remain exposed with a neutral notice/direct link, and a late load clears that notice', () => {
  const app = harness({ hero: false, gallery: false, maps: [{}] }); const area = app.mapAreas[0];
  const direct = area.parentNode.querySelector('a');
  area.querySelector('button').emit('click'); app.fire('load', {}); app.idleCallbacks[0].callback();
  assert.equal(app.observers.length, 0); assert.equal(area.querySelectorAll('iframe').length, 1);
  const fallback = [...app.timers.values()].find(timer => timer.delay === 12000); fallback.fn();
  const status = area.parentNode.querySelector('.map-status'); assert.ok(status.textContent.includes('membutuhkan waktu lebih lama')); assert.ok(!status.textContent.includes('belum bisa dimuat'));
  assert.equal(area.querySelector('.map-loading-cover'), null); assert.equal(area.getAttribute('aria-busy'), 'true'); assert.equal(area.parentNode.querySelector('a'), direct); assert.equal(direct.href, salon.maps);
  area.querySelector('iframe').emit('load'); assert.equal(status.parentNode, null); assert.equal(area.getAttribute('aria-busy'), 'false'); assert.equal(area.parentNode.querySelector('a'), direct);
});

test('map observer/idle fallbacks still delay loading and remove scroll watchers after a visible request', () => {
  const app = harness({ hero: false, gallery: false, maps: [{ top: 1500 }, { hidden: true }], idle: false, intersection: false });
  app.fire('load', {}); assert.equal(app.document.querySelectorAll('iframe').length, 0);
  for (const timer of [...app.timers.values()].filter(item => item.delay === 200)) timer.fn();
  assert.equal(app.document.querySelectorAll('iframe').length, 0); assert.equal(app.events.scroll.length, 2);
  app.mapAreas[0].top = 900; app.fire('scroll', {});
  assert.equal(app.mapAreas[0].querySelectorAll('iframe').length, 1); assert.equal(app.mapAreas[1].querySelectorAll('iframe').length, 0);
  assert.equal(app.events.scroll.length, 1); assert.equal(app.events.resize.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { posts, salon } from '../src/content.js';
import { normalizeFeed, selectHeroMedia } from '../src/feed-data.js';
import { studioPhotos, photoSourceSet } from '../src/studio-photos.js';
import { selectInstagramShowcase } from '../src/instagram-showcase.js';
import archiveFixture from '../public/data/instagram-archive.json' with { type: 'json' };

// Execute the real browser entry with bounded DOM/event adapters. No browser,
// third-party script, real timer, network request or account is used by this test.
const controller = (await readFile(new URL('../src/scripts/client.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
class Node {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.style = {}; this.dataset = {}; this.events = {}; this.hidden = false; this._text = ''; this.width = 330; this.height = 200; this.scrollLeft = 0; this.clientWidth = 330; this.scrollWidth = 1400; }
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
  removeAttribute(key) { delete this.attributes[key]; }
  decode() { return Promise.resolve(); }
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
  scrollTo(options) { this.lastScroll = options; this.scrollLeft = options.left; }
}
function harness({ hero = true, curatedHero = false, gallery = true, archive = false, heroSlide = false, heroSlideMobile = false, photoRandom = 0.999, photoReduced = true, controls = false, response, maps = [], idle = true, intersection = true } = {}) {
  const document = new Node('document'); document.readyState = 'loading'; document.body = new Node('body'); document.append(document.body); document.createElement = tag => { const node = new Node(tag); node.owner = document; return node; }; document.createTextNode = text => { const node = document.createElement(''); node.textContent = text; return node; };
  const make = (tag, className, parent = document.body) => { const node = document.createElement(tag); node.className = className; parent?.append(node); return node; };
  const heroes = [];
  if (hero) for (const fallback of selectHeroMedia(posts)) {
    const link = make('a', 'mosaic-photo-link'); const picture = make('picture', '', link);
    if (!curatedHero && fallback.image === 'french') make('source', '', picture);
    const img = make('img', '', picture);
    if (curatedHero) {
      link.dataset.curated = 'true'; link.href = '/custom-sets#studio-portfolio';
      img.src = '/images/jessica-french-gold-720.webp';
      img.setAttribute('srcset', '/images/jessica-french-gold-360.webp 360w, /images/jessica-french-gold-720.webp 720w, /images/jessica-french-gold-1080.webp 1080w');
    } else img.src = `/images/${fallback.image}.webp`;
    heroes.push(link);
  }
  let track;
  if (gallery) {
    const section = make('section', ''); section.setAttribute('id', 'gallery'); track = make('div', 'instagram-track', section);
    if (archive) track.dataset.instagramArchive = '/api/instagram-archive';
    for (const post of posts) { const card = make('article', 'instagram-slide', track); const preview = make('div', 'post-placeholder', card); make('img', 'photo', preview).src = `/images/${post.image}.webp`; make('p', '', preview).textContent = 'Instagram post'; const link = make('a', 'post-original', card); link.href = post.url; link.append(document.createTextNode(`${post.title} `), make('span', '', null)); }
    const previous = make('button', '', section); previous.setAttribute('aria-label', 'Postingan sebelumnya'); const next = make('button', '', section); next.setAttribute('aria-label', 'Postingan berikutnya'); make('span', '', section).setAttribute('aria-live', 'polite');
  }
  let heroFeature, slideLink, slideLinks = [];
  if (heroSlide) {
    heroFeature = make('section', 'mosaic'); heroFeature.setAttribute('data-hero-slideshow', '');
    for (let index = 0; index < 4; index++) {
      const panel = make('div', index === 0 ? 'mosaic-feature' : 'mosaic-support', heroFeature);
      const link = make('a', 'mosaic-photo-link', panel); link.dataset.curated = 'true'; link.href = '/custom-sets#studio-portfolio';
      if (heroSlideMobile && index > 0) { link.width = 0; link.height = 0; }
      const img = make('img', 'photo', link); img.src = `/images/${studioPhotos[index].name}-720.webp`; img.alt = studioPhotos[index].alt;
      img.setAttribute('srcset', photoSourceSet(studioPhotos[index])); img.setAttribute('sizes', index === 0 ? '(max-width: 720px) calc(100vw - 40px), 642px' : '200px');
      slideLinks.push(link);
    }
    slideLink = slideLinks[0];
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
  const photoMotion = { matches: photoReduced, addEventListener(type, handler) { (this.events ||= {})[type] = handler; }, emit(matches) { this.matches = matches; this.events?.change?.(); } };
  const context = { Math: Object.assign(Object.create(Math), { random: () => photoRandom }), document, posts, salon, normalizeFeed, selectHeroMedia, selectInstagramShowcase, studioPhotos, photoSourceSet, URL, AbortController, Promise, getComputedStyle: () => ({ visibility: 'visible' }), matchMedia: query => query === '(prefers-reduced-motion: reduce)' ? photoMotion : { matches: true }, innerHeight: 800,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval: (fn, delay) => { intervals.push({ fn, delay, active: true }); return intervals.length; }, clearInterval: id => { if (intervals[id - 1]) intervals[id - 1].active = false; },
    addEventListener: (type, handler) => { (events[type] ||= []).push(handler); }, removeEventListener: (type, handler) => { events[type] = (events[type] || []).filter(item => item !== handler); }, IntersectionObserver: Observer, ResizeObserver: Observer, MutationObserver: Observer,
    fetch: (...args) => { fetches.push(args); return response ? response(...args) : Promise.resolve({ ok: false }); },
  };
  if (idle) context.requestIdleCallback = (callback, options) => idleCallbacks.push({ callback, options });
  if (!intersection) delete context.IntersectionObserver;
  context.window = context;
  vm.runInNewContext(`${controller}\nglobalThis.qa={updateHero,updateGallery,states,setMenu,setChat};`, context, { timeout: 1000 });
  return { ...context.qa, window: context, document, heroes, track, heroFeature, slideLink, slideLinks, photoMotion, menu, trigger, panel, close, mapAreas, events, timers, intervals, fetches, observers, idleCallbacks, fire: (type, event) => { for (const fn of events[type] || []) fn(event); } };
}
// make(..., null) is used for detached nodes just like document.createElement.
const settle = () => new Promise(resolve => setImmediate(resolve));
const photoTimers = app => app.intervals.filter(timer => timer.active && timer.delay === 8000);
const exposePhotos = app => app.observers.find(observer => observer.node === app.heroFeature)?.callback([{ isIntersecting: true }]);
const tickPhoto = app => { const active = photoTimers(app); assert.equal(active.length, 1); active[0].fn(); return active[0].fn; };

test('new visits randomize the whole opening mosaic without duplicate photos or changing the source catalog', () => {
  const a = harness({ hero: false, gallery: false, heroSlide: true, photoRandom: 0.1 });
  const b = harness({ hero: false, gallery: false, heroSlide: true, photoRandom: 0.8 });
  const sources = app => app.slideLinks.map(link => link.querySelector('img').src);
  assert.notDeepEqual(sources(a), sources(b));
  assert.equal(new Set(sources(a)).size, 4);
  assert.equal(a.heroFeature.querySelectorAll('img').length, 4);
  assert.equal(studioPhotos[0].name, 'jessica-french-gold');
  const current = sources(a); a.fire('pageshow');
  assert.deepEqual(sources(a), current, 'Returning to the open document must not reshuffle it');
});

test('mobile randomizes only its visible opening photo and restores the fallback on load failure', () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true, photoRandom: 0.1 });
  const first = app.slideLink.querySelector('img');
  assert.notEqual(first.src, `/images/${studioPhotos[0].name}-720.webp`);
  app.slideLinks.slice(1).forEach((link, index) => assert.equal(link.querySelector('img').src, `/images/${studioPhotos[index + 1].name}-720.webp`));
  first.onerror();
  assert.equal(first.src, `/images/${studioPhotos[0].name}-720.webp`);
  assert.equal(first.alt, studioPhotos[0].alt);
  exposePhotos(app); assert.equal(photoTimers(app).length, 1);
});

test('desktop mosaic changes one tile at a time in round-robin order without duplicate designs', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, photoReduced: false });
  exposePhotos(app);
  const expectedPhotos = [4, 5, 0, 1, 2, 3];
  for (let tick = 0; tick < expectedPhotos.length; tick++) {
    const panel = tick % 4, before = app.slideLinks.map(link => link.querySelector('img'));
    const deliverTick = tickPhoto(app); deliverTick();
    assert.equal(app.heroFeature.querySelectorAll('img').length, 5, 'Only one next image is requested, including repeated timer delivery');
    const next = app.slideLinks[panel].querySelectorAll('img')[1];
    assert.equal(next.src, `/images/${studioPhotos[expectedPhotos[tick]].name}-720.webp`);
    assert.equal(next.sizes, before[panel].getAttribute('sizes') || before[panel].sizes);
    for (let index = 0; index < 4; index++) assert.equal(app.slideLinks[index].querySelector('img'), before[index]);
    await next.onload();
    [...app.timers.values()].find(timer => timer.delay === 650).fn();
    assert.equal(app.heroFeature.querySelectorAll('img').length, 4);
    assert.equal(app.slideLinks[panel].querySelector('img'), next);
    assert.equal(new Set(app.slideLinks.map(link => link.querySelector('img').src)).size, 4);
    for (let index = 0; index < 4; index++) if (index !== panel) assert.equal(app.slideLinks[index].querySelector('img'), before[index]);
  }
});

test('mobile rotates all six photos in the visible tile without loading hidden supporting tiles', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true });
  exposePhotos(app);
  const supporting = app.slideLinks.slice(1).map(link => link.querySelector('img'));
  for (const index of [1, 2, 3, 4, 5, 0]) {
    tickPhoto(app); const next = app.slideLink.querySelectorAll('img')[1];
    assert.equal(next.src, `/images/${studioPhotos[index].name}-720.webp`);
    for (let panel = 1; panel < 4; panel++) {
      assert.equal(app.slideLinks[panel].querySelectorAll('img').length, 1);
      assert.equal(app.slideLinks[panel].querySelector('img'), supporting[panel - 1]);
    }
    await next.onload(); assert.equal(app.slideLink.querySelectorAll('img').length, 1);
  }
});

test('hero rotates one decoded photograph every eight visible seconds with a covered crossfade', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true, photoReduced: false });
  const active = () => app.intervals.filter(timer => timer.active);
  const visibility = app.observers.find(observer => observer.node === app.heroFeature);
  const initial = app.slideLink.querySelector('img');
  assert.equal(app.document.querySelector('[data-hero-controls]'), null, 'Autoplay needs no manual control markup');
  assert.equal(visibility.options.threshold, 0, 'A partly visible tall mosaic starts without a quarter-height threshold');
  assert.equal(app.slideLink.querySelectorAll('img').length, 1); assert.equal(active().length, 0);
  visibility.callback([{ isIntersecting: true }]); assert.equal(active().length, 1); assert.equal(active()[0].delay, 8000);
  active()[0].fn(); const next = app.slideLink.querySelectorAll('img')[1];
  assert.equal(active().length, 0); assert.equal(app.slideLink.querySelectorAll('img').length, 2);
  assert.equal(next.src, '/images/jessica-red-silver-720.webp'); assert.equal(next.srcset, photoSourceSet(studioPhotos[1]));
  assert.equal(next.sizes, initial.getAttribute('sizes')); assert.equal(next.width, studioPhotos[1].width); assert.equal(next.height, studioPhotos[1].height);
  assert.equal(next.getAttribute('aria-hidden'), 'true'); assert.equal(initial.parentNode, app.slideLink);
  let decodeReady; next.decode = () => new Promise(resolve => { decodeReady = resolve; });
  next.onload(); assert.equal(next.classList.contains('is-visible'), false); decodeReady(); await settle();
  assert.equal(next.classList.contains('is-visible'), true); assert.equal(initial.parentNode, app.slideLink);
  const fade = [...app.timers.values()].find(timer => timer.delay === 650); assert.ok(fade); fade.fn();
  assert.equal(initial.parentNode, null); assert.equal(app.slideLink.querySelector('img'), next); assert.equal(next.className, 'photo');
  assert.equal(next.getAttribute('aria-hidden'), null); assert.equal(next.alt, studioPhotos[1].alt);
  assert.equal(active().length, 1);
  visibility.callback([{ isIntersecting: false }]); assert.equal(active().length, 0);
  app.document.hidden = true; visibility.callback([{ isIntersecting: true }]); assert.equal(active().length, 0);
  app.document.hidden = false; app.document.emit('visibilitychange'); assert.equal(active().length, 1);
  app.document.hidden = true; app.document.emit('visibilitychange'); assert.equal(active().length, 0);
});

test('hover, focus and pointer interactions cannot stop automatic photos or move Instagram', async () => {
  const app = harness({ hero: false, heroSlide: true, heroSlideMobile: true, photoReduced: false });
  const active = () => app.intervals.filter(timer => timer.active && timer.delay === 8000);
  const instagramPosition = app.track.scrollLeft;
  exposePhotos(app);
  for (const [node, event] of [[app.heroFeature, 'mouseenter'], [app.slideLink, 'pointerdown'], [app.slideLink, 'focusin'], [app.heroFeature, 'mouseleave']]) {
    node.emit(event); assert.equal(active().length, 1);
  }
  tickPhoto(app); assert.equal(active().length, 0);
  const next = app.slideLink.querySelectorAll('img')[1]; await next.onload();
  [...app.timers.values()].find(timer => timer.delay === 650).fn();
  assert.equal(active().length, 1); assert.equal(app.track.scrollLeft, instagramPosition);
  tickPhoto(app); const following = app.slideLink.querySelectorAll('img')[1];
  assert.equal(following.src, `/images/${studioPhotos[2].name}-720.webp`);
});

test('reduced motion automatically replaces photos without a fade or manual controls', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true });
  exposePhotos(app);
  tickPhoto(app); const next = app.slideLink.querySelectorAll('img')[1];
  assert.equal(next.src, `/images/${studioPhotos[1].name}-720.webp`); await next.onload();
  assert.equal(app.slideLink.querySelectorAll('img').length, 1); assert.equal(app.slideLink.querySelector('img'), next);
  assert.equal([...app.timers.values()].some(timer => timer.delay === 650), false);
  assert.equal(photoTimers(app).length, 1);
});

test('without IntersectionObserver automatic photo rotation starts and still pauses in a hidden tab', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true, intersection: false });
  tickPhoto(app); const next = app.slideLink.querySelectorAll('img')[1]; await next.onload();
  assert.equal(app.slideLink.querySelector('img'), next); assert.equal(photoTimers(app).length, 1);
  app.document.hidden = true; app.document.emit('visibilitychange'); assert.equal(photoTimers(app).length, 0);
  app.document.hidden = false; app.document.emit('visibilitychange'); assert.equal(photoTimers(app).length, 1);
});

test('motion preference changes cancel stale layers and restart automatic replacement', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true, photoReduced: false });
  exposePhotos(app); const initial = app.slideLink.querySelector('img'); tickPhoto(app);
  const stale = app.slideLink.querySelectorAll('img')[1]; let decodeReady;
  stale.decode = () => new Promise(resolve => { decodeReady = resolve; }); stale.onload();
  app.photoMotion.emit(true); decodeReady(); await settle();
  assert.equal(stale.parentNode, null); assert.equal(initial.parentNode, app.slideLink); assert.equal(photoTimers(app).length, 1);
  tickPhoto(app); const next = app.slideLink.querySelectorAll('img')[1]; await next.onload();
  assert.equal(app.slideLink.querySelector('img'), next); assert.equal([...app.timers.values()].some(timer => timer.delay === 650), false);
  app.photoMotion.emit(false); assert.equal(photoTimers(app).length, 1);
});

test('failed or stale hero image work never removes the photograph already displayed', async () => {
  const app = harness({ hero: false, gallery: false, heroSlide: true, heroSlideMobile: true, photoReduced: false });
  exposePhotos(app);
  const initial = app.slideLink.querySelector('img');
  tickPhoto(app); let next = app.slideLink.querySelectorAll('img')[1]; next.onerror();
  assert.equal(app.slideLink.querySelectorAll('img').length, 1); assert.equal(initial.parentNode, app.slideLink);
  tickPhoto(app); next = app.slideLink.querySelectorAll('img')[1];
  next.decode = () => Promise.reject(new Error('decode')); await next.onload();
  assert.equal(app.slideLink.querySelectorAll('img').length, 1); assert.equal(initial.parentNode, app.slideLink);
  tickPhoto(app); next = app.slideLink.querySelectorAll('img')[1];
  let decodeReady; next.decode = () => new Promise(resolve => { decodeReady = resolve; }); next.onload();
  app.fire('pagehide', {}); decodeReady(); await settle();
  assert.equal(app.slideLink.querySelectorAll('img').length, 1); assert.equal(initial.parentNode, app.slideLink);
  assert.equal(app.intervals.filter(timer => timer.active).length, 0);
  app.fire('pageshow', {}); tickPhoto(app); next = app.slideLink.querySelectorAll('img')[1];
  app.document.hidden = true; app.document.emit('visibilitychange');
  assert.equal(next.parentNode, null); assert.equal(initial.parentNode, app.slideLink);
});

test('Instagram feed refresh preserves curated hero photography and responsive sources', () => {
  const app = harness({ curatedHero: true });
  const snapshots = app.heroes.map(link => ({ link, img: link.querySelector('img'), src: link.querySelector('img').src, srcset: link.querySelector('img').getAttribute('srcset'), href: link.href }));
  const feed = normalizeFeed({ posts: [{ id: 'fresh-studio-set', url: 'https://www.instagram.com/p/fresh-studio-set/', imageUrl: 'https://cdn.example/fresh-studio-set.jpg', title: 'Fresh studio set', alt: 'New Instagram preview', timestamp: '2026-10-21T00:00:00Z' }] });
  assert.equal(feed.length, 1);
  app.updateHero(feed);
  for (const { link, img, src, srcset, href } of snapshots) {
    assert.equal(img.src, src); assert.equal(img.getAttribute('srcset'), srcset); assert.equal(link.href, href);
  }
  app.updateGallery(feed);
  assert.equal(app.track.children.length, 1);
  assert.equal(app.track.querySelector('.post-original').href, feed[0].url);
  assert.equal(app.track.querySelector('img').src, feed[0].imageUrl);
});

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

test('a slow native Instagram post survives the notice and replaces its preview when ready', async () => {
  const app = harness({ hero: false });
  app.observers.find(observer => observer.node === app.document.querySelector('#gallery')).callback([{ isIntersecting: true }]);
  const state = app.states.get(posts[0].id);
  app.observers.find(observer => observer.node === state.card).callback([{ isIntersecting: true }]);
  const frame = app.document.createElement('iframe'); frame.height = 0; state.host.append(frame);
  app.window.instgrm = { Embeds: { process() {} } };
  app.document.querySelector('script').onload(); await settle();
  const mutation = state.mutation, host = state.host;
  [...app.timers.values()].find(timer => timer.delay === 16000).fn();
  assert.equal(host.parentNode, state.card, 'A slow response must not destroy its native frame');
  assert.equal(state.cancelled, false); assert.notEqual(mutation.disconnected, true);
  assert.ok(state.retry); assert.equal(state.card.getAttribute('aria-busy'), 'true');
  frame.height = 640; mutation.callback([]);
  assert.equal(host.classList.contains('is-loaded'), true);
  assert.equal(state.card.querySelector('.post-placeholder'), null);
  assert.equal(state.retry, null); assert.equal(state.card.getAttribute('aria-busy'), 'false');
});

test('an Instagram script error can be retried without duplicate hosts or stale completion', async () => {
  const app = harness({ hero: false });
  app.observers.find(observer => observer.node === app.document.querySelector('#gallery')).callback([{ isIntersecting: true }]);
  const state = app.states.get(posts[0].id);
  app.observers.find(observer => observer.node === state.card).callback([{ isIntersecting: true }]);
  const oldHost = state.host, oldMutation = state.mutation;
  app.document.querySelector('script').onerror(); await settle();
  assert.equal(oldHost.parentNode, null); assert.ok(state.retry);
  state.retry.emit('click');
  assert.notEqual(state.host, oldHost); assert.equal(state.card.querySelectorAll('.instagram-host').length, 1);
  assert.equal(app.document.querySelectorAll('script').length, 1);
  oldMutation.callback([]);
  assert.equal(state.host.classList.contains('is-loaded'), false);
  assert.ok(state.card.querySelector('.post-placeholder'));
});

test('removing a slow Instagram card clears its retry control and ignores late completion', () => {
  const app = harness({ hero: false });
  app.observers.find(observer => observer.node === app.document.querySelector('#gallery')).callback([{ isIntersecting: true }]);
  const state = app.states.get(posts[0].id);
  app.observers.find(observer => observer.node === state.card).callback([{ isIntersecting: true }]);
  [...app.timers.values()].find(timer => timer.delay === 16000).fn();
  const retry = state.retry, mutation = state.mutation;
  app.updateGallery(posts.slice(1));
  assert.equal(retry.parentNode, null); assert.equal(state.host.parentNode, null);
  mutation.callback([]); retry.emit('click');
  assert.equal(state.cancelled, true); assert.equal(state.card.parentNode, null);
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

test('archive gallery fetches once only when nearby and renders 3 recent plus 9 random without a polling timer', async () => {
  const app = harness({ hero: false, archive: true, response: async url => {
    assert.equal(url, '/api/instagram-archive');
    return { ok: true, json: async () => archiveFixture };
  } });
  assert.equal(app.fetches.length, 0);
  const section = app.document.querySelector('#gallery');
  const observer = app.observers.find(item => item.node === app.track);
  assert.equal(observer.options.rootMargin, '0px');
  observer.callback([{ isIntersecting: true }]);
  await settle();
  assert.equal(app.fetches.length, 1); assert.equal(app.track.children.length, 12);
  assert.deepEqual(app.track.children.slice(0, 3).map(card => card.querySelector('.post-original').href),
    archiveFixture.recentIds.map(id => archiveFixture.posts.find(post => post.id === id).url));
  assert.equal(app.intervals.some(timer => timer.delay === 300000), false);
  assert.ok(app.track.querySelectorAll('.post-link-only').length >= 8);
  observer.callback([{ isIntersecting: true }]); await settle();
  assert.equal(app.fetches.length, 1);
});

test('unavailable archive keeps the four original posts and working swipe controls', async () => {
  const app = harness({ hero: false, archive: true });
  const section = app.document.querySelector('#gallery');
  app.observers.find(item => item.node === app.track).callback([{ isIntersecting: true }]);
  await settle();
  assert.equal(app.track.children.length, 4);
  app.track.emit('keydown', { key: 'ArrowRight' });
  assert.ok(app.track.lastScroll.left > 0);
});

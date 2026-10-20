import { posts, salon } from '../content.js';
import { normalizeFeed, selectHeroMedia } from '../feed-data.js';
import { studioPhotos, photoSourceSet } from '../studio-photos.js';

// This is the only first-party browser entry. React renders HTML at build time.
const localImage = name => `/images/${name || 'maroon'}.webp`;
const external = anchor => { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor; };
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const shown = node => Boolean(node?.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden';

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-navigation');
const setMenu = open => {
  menu?.setAttribute('aria-expanded', String(open));
  if (menu) menu.textContent = open ? 'Tutup ×' : 'Menu ☰';
  navigation?.classList.toggle('is-open', open);
};
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  if (open) setChat(false);
  setMenu(open);
});
navigation?.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
const resetMenu = () => setMenu(false);
const compactMenu = matchMedia('(max-width: 960px)');
if (compactMenu.addEventListener) compactMenu.addEventListener('change', resetMenu);
else compactMenu.addListener?.(resetMenu);

// Re-selecting the current page needs no reload; modified clicks stay native.
document.querySelectorAll('.mobile-page-tabs a[aria-current="page"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
    event.preventDefault();
  });
});

const widget = document.querySelector('.chat-widget');
const chatTrigger = widget?.querySelector('.chat-trigger');
const chatPanel = widget?.querySelector('#chat-panel');
const chatClose = chatPanel?.querySelector('.icon-button');
const setChat = (open, restoreFocus = false) => {
  if (!chatPanel || !chatTrigger) return;
  chatPanel.hidden = !open;
  chatTrigger.setAttribute('aria-expanded', String(open));
  chatTrigger.lastChild.textContent = open ? 'Close chat' : 'Chat with us';
  if (open) { setMenu(false); chatClose?.focus(); }
  else if (restoreFocus) chatTrigger.focus();
};
chatTrigger?.addEventListener('click', () => setChat(chatPanel.hidden));
chatClose?.addEventListener('click', () => setChat(false, true));
document.addEventListener('pointerdown', event => {
  if (widget && !widget.contains(event.target)) setChat(false);
  if (!menu?.contains(event.target) && !navigation?.contains(event.target)) setMenu(false);
});
document.addEventListener('focusin', event => {
  if (!menu?.contains(event.target) && !navigation?.contains(event.target)) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (chatPanel && !chatPanel.hidden) setChat(false, true);
  if (menu?.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
});

// The original local photograph stays available if Instagram's CDN expires.
const heroLinks = [...document.querySelectorAll('.mosaic-photo-link')].filter(link => link.dataset.curated !== 'true');
function updateHero(feed) {
  selectHeroMedia(feed).forEach((post, index) => {
    const link = heroLinks[index];
    if (!link) return;
    const img = link.querySelector('img');
    const picture = link.querySelector('picture');
    const render = media => {
      link.href = media.url;
      img.alt = media.alt;
      const needsAvif = !media.imageUrl && media.image === 'french';
      let source = picture.querySelector('source');
      if (needsAvif && !source) { source = element('source'); source.type = 'image/avif'; source.srcset = '/images/french.avif'; picture.prepend(source); }
      else if (!needsAvif) source?.remove();
      const src = media.imageUrl || localImage(media.image);
      if (img.getAttribute('src') !== src) img.src = src;
    };
    const next = post.imageUrl || localImage(post.image);
    if (img.dataset.failedSource === next) return;
    img.onerror = () => {
      img.onerror = null; img.dataset.failedSource = next;
      render(post.backup);
      // A supported AVIF can still fail in transit. Removing its source makes
      // the local WebP backup usable instead of selecting the failed AVIF again.
      picture.querySelector('source')?.remove();
      img.src = localImage(post.backup.image);
    };
    render(post);
  });
}
if (heroLinks.length) updateHero(posts);

const gallery = document.querySelector('#gallery');
// Rotate one visible mosaic tile at a time; Instagram remains a manual gallery.
const heroSlideshow = document.querySelector('[data-hero-slideshow]');
if (heroSlideshow) {
  const photoSlots = [...heroSlideshow.querySelectorAll('.mosaic-photo-link')]
    .filter(link => link.dataset.curated === 'true')
    .map((link, index) => ({ link, base: link.querySelector('img'), index }));
  const visiblePhotoSlots = () => photoSlots.filter(slot => {
    const bounds = slot.link.getBoundingClientRect();
    return slot.base && bounds.width > 0 && bounds.height > 0;
  });
  const photoMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let panelCursor = 0, poolCursor = 0, pendingPhoto = null;
  let photoTimer = null, fadeTimer = null, loadTimer = null, photoGeneration = 0;
  let photoVisible = !('IntersectionObserver' in window), photoActive = true;
  const stopPhotoTimer = () => { if (photoTimer !== null) clearInterval(photoTimer); photoTimer = null; };
  const cancelPhoto = () => {
    photoGeneration++;
    clearTimeout(fadeTimer); clearTimeout(loadTimer); fadeTimer = null; loadTimer = null;
    if (pendingPhoto) { pendingPhoto.onload = null; pendingPhoto.onerror = null; pendingPhoto.remove(); pendingPhoto = null; }
  };
  const syncPhotoAuto = () => {
    stopPhotoTimer();
    if (!photoVisible || !photoActive || document.hidden || pendingPhoto || !visiblePhotoSlots().length) return;
    photoTimer = setInterval(() => {
      if (photoVisible && photoActive && !document.hidden) advancePhoto(1);
    }, 8000);
  };
  const advancePhoto = direction => {
    if (pendingPhoto || !photoActive || document.hidden) return;
    const visible = visiblePhotoSlots();
    if (!visible.length) return;
    const slot = visible[panelCursor % visible.length];
    const shownIndexes = new Set(visible.map(item => item.index));
    let index = poolCursor;
    for (let step = 0; step < studioPhotos.length; step++) {
      index = (index + direction + studioPhotos.length) % studioPhotos.length;
      if (!shownIndexes.has(index)) break;
    }
    if (shownIndexes.has(index)) return;
    stopPhotoTimer();
    const photo = studioPhotos[index], next = element('img', 'photo hero-photo-next');
    const generation = ++photoGeneration;
    pendingPhoto = next;
    next.alt = photo.alt; next.width = photo.width; next.height = photo.height;
    next.sizes = slot.base.getAttribute('sizes') || slot.base.sizes || '100vw';
    next.srcset = photoSourceSet(photo); next.decoding = 'async'; next.loading = 'eager';
    next.fetchPriority = 'low'; next.style.objectPosition = photo.position;
    next.setAttribute('aria-hidden', 'true');
    const current = () => pendingPhoto === next && generation === photoGeneration && photoActive && !document.hidden && visiblePhotoSlots().includes(slot);
    const failed = () => { if (pendingPhoto !== next || generation !== photoGeneration) return; cancelPhoto(); syncPhotoAuto(); };
    const commit = () => {
      if (!current()) { failed(); return; }
      slot.base.remove(); next.className = 'photo'; next.removeAttribute('aria-hidden');
      slot.base = next; slot.index = index; pendingPhoto = null; poolCursor = index; panelCursor++;
      clearTimeout(loadTimer); clearTimeout(fadeTimer); loadTimer = null; fadeTimer = null;
      next.onload = null; next.onerror = null;
      syncPhotoAuto();
    };
    let decoding = false;
    next.onload = async () => {
      if (decoding) return;
      if (!current()) { failed(); return; }
      decoding = true;
      try { if (next.decode) await next.decode(); } catch { failed(); return; }
      if (!current()) { failed(); return; }
      clearTimeout(loadTimer); loadTimer = null;
      if (photoMotion.matches) { commit(); return; }
      next.getBoundingClientRect(); // Resolve the transparent layer before its opacity changes.
      next.classList.add('is-visible');
      fadeTimer = setTimeout(commit, 650);
    };
    next.onerror = failed;
    slot.link.append(next);
    loadTimer = setTimeout(failed, 12000);
    next.src = `/images/${photo.name}-720.webp`;
    if (next.complete && next.naturalWidth) next.onload();
  };
  if (photoSlots.length) {
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPhoto(); syncPhotoAuto(); });
    addEventListener('pagehide', () => { photoActive = false; stopPhotoTimer(); cancelPhoto(); });
    addEventListener('pageshow', () => { photoActive = true; syncPhotoAuto(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
      photoVisible = entry.isIntersecting;
      if (!photoVisible) cancelPhoto();
      syncPhotoAuto();
    }, { threshold: 0 }).observe(heroSlideshow);
    const motionChanged = () => { cancelPhoto(); syncPhotoAuto(); };
    if (photoMotion.addEventListener) photoMotion.addEventListener('change', motionChanged);
    else photoMotion.addListener?.(motionChanged);
    syncPhotoAuto();
  }
}
const track = gallery?.querySelector('.instagram-track');
const previous = gallery?.querySelector('[aria-label="Postingan sebelumnya"]');
const next = gallery?.querySelector('[aria-label="Postingan berikutnya"]');
const counter = gallery?.querySelector('[aria-live]');
let galleryActive = false;
let scriptPromise;
const states = new Map();
function loadInstagram() {
  if (window.instgrm?.Embeds) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = element('script');
    script.src = 'https://www.instagram.com/embed.js'; script.async = true;
    script.onload = resolve;
    script.onerror = () => { script.remove(); scriptPromise = undefined; reject(new Error('Instagram unavailable')); };
    document.body.append(script);
  });
  return scriptPromise;
}
function previewFor(post) {
  const wrapper = element('div', 'post-placeholder');
  const img = element('img', 'photo');
  img.src = post.imageUrl || localImage(post.image); img.alt = post.alt;
  img.loading = 'lazy'; img.decoding = 'async';
  img.onerror = () => { img.onerror = null; img.src = localImage(post.image); };
  wrapper.append(img, element('p', '', 'Instagram post'));
  return wrapper;
}
function stopEmbed(state) {
  state.cancelled = true;
  state.nearObserver?.disconnect(); state.mutation?.disconnect(); clearTimeout(state.timeout);
  state.host?.remove();
}
function embedPost(state) {
  if (state.started || !galleryActive || !shown(gallery)) return;
  state.started = true; state.cancelled = false;
  const host = element('div', 'instagram-host'); state.host = host;
  const quote = element('blockquote', 'instagram-media');
  quote.setAttribute('data-instgrm-permalink', state.post.url);
  quote.setAttribute('data-instgrm-version', '14');
  const link = external(element('a', '', 'View this post on Instagram')); link.href = state.post.url;
  quote.append(link); host.append(quote); state.card.prepend(host);
  const status = state.card.querySelector('.post-placeholder p');
  if (status) { status.className = 'small muted embed-status'; status.textContent = 'Memuat postingan Instagram…'; }
  const failure = () => {
    if (state.cancelled) return;
    stopEmbed(state);
    const preview = state.card.querySelector('.post-placeholder');
    if (preview) { preview.className = 'post-fallback'; preview.querySelector('p').textContent = 'Instagram belum bisa dimuat di browser ini.'; }
  };
  const check = () => {
    if (state.cancelled) return;
    const iframe = host.querySelector('iframe');
    if (!iframe) return;
    iframe.title = `Instagram: ${state.post.title}`;
    if (iframe.getBoundingClientRect().height > 100) {
      host.classList.add('is-loaded');
      state.card.querySelector('.post-placeholder')?.remove();
      clearTimeout(state.timeout); state.mutation?.disconnect();
    }
  };
  state.mutation = new MutationObserver(check);
  state.mutation.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'height'] });
  loadInstagram().then(() => { if (!state.cancelled) { window.instgrm?.Embeds?.process(); check(); } }).catch(failure);
  state.timeout = setTimeout(() => { if (!host.classList.contains('is-loaded')) failure(); }, 16000);
}
function observeCard(state) {
  if (!galleryActive || state.started) return;
  if (!('IntersectionObserver' in window)) { embedPost(state); return; }
  state.nearObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && shown(gallery)) { state.nearObserver.disconnect(); embedPost(state); }
  }, { root: track, rootMargin: '0px 100px', threshold: 0.01 });
  state.nearObserver.observe(state.card);
}
function createCard(post) {
  const card = element('article', 'instagram-slide'); card.setAttribute('aria-label', post.title);
  const link = external(element('a', 'post-original')); link.href = post.url;
  link.append(document.createTextNode(`${post.title} `), element('span', '', 'View on Instagram ↗'));
  card.append(previewFor(post), link);
  return card;
}
function updatePosition() {
  if (!track || !shown(gallery)) return;
  const step = (track.querySelector('.instagram-slide')?.getBoundingClientRect().width || 350) + 16;
  const total = track.children.length;
  const first = Math.min(total, Math.round(track.scrollLeft / step) + 1);
  const visible = Math.max(1, Math.floor((track.clientWidth + 16) / step));
  if (counter) counter.textContent = `Postingan ${first}–${Math.min(total, first + visible - 1)} dari ${total}`;
  if (previous) previous.disabled = track.scrollLeft < 2;
  if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
}
function advance(direction) {
  if (!track) return;
  const step = (track.querySelector('.instagram-slide')?.getBoundingClientRect().width || 350) + 16;
  track.scrollBy({ left: direction * step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function updateGallery(feed) {
  if (!track) return;
  const keep = new Set(feed.map(post => post.id));
  for (const [id, state] of states) if (!keep.has(id)) { stopEmbed(state); state.card.remove(); states.delete(id); }
  feed.forEach((post, index) => {
    let state = states.get(post.id);
    if (state && state.post.url !== post.url) { stopEmbed(state); state.card.remove(); states.delete(post.id); state = undefined; }
    if (!state) {
      state = { post, card: createCard(post) }; states.set(post.id, state);
      track.insertBefore(state.card, track.children[index] || null); observeCard(state);
    } else {
      state.post = post;
      state.card.setAttribute('aria-label', post.title);
      const link = state.card.querySelector('.post-original');
      link.firstChild.textContent = `${post.title} `;
      const iframe = state.card.querySelector('iframe');
      if (iframe) iframe.title = `Instagram: ${post.title}`;
      const preview = state.card.querySelector('.post-placeholder img,.post-fallback img');
      if (preview) { preview.alt = post.alt; preview.onerror = () => { preview.onerror = null; preview.src = localImage(post.image); }; const src = post.imageUrl || localImage(post.image); if (preview.getAttribute('src') !== src) preview.src = src; }
      // Do not replace or move an unchanged post: its live iframe remains intact.
      if (track.children[index] !== state.card) track.insertBefore(state.card, track.children[index] || null);
    }
  });
  updatePosition();
}
if (track) {
  [...track.children].forEach((card, index) => {
    const post = posts[index];
    const preview = card.querySelector('img');
    if (preview) preview.onerror = () => { preview.onerror = null; preview.src = localImage(post.image); };
    states.set(post.id, { post, card });
  });
  previous?.addEventListener('click', () => advance(-1)); next?.addEventListener('click', () => advance(1));
  track.addEventListener('scroll', updatePosition, { passive: true });
  track.addEventListener('keydown', event => {
    if (event.target === track && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1); }
  });
  const activate = () => {
    if (galleryActive || !shown(gallery)) return;
    galleryActive = true; for (const state of states.values()) observeCard(state); updatePosition();
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && shown(gallery)) { activate(); observer.disconnect(); } }, { rootMargin: '250px' });
    observer.observe(gallery);
  } else {
    const maybeActivate = () => { if (shown(gallery) && gallery.getBoundingClientRect().top < innerHeight + 250) activate(); };
    addEventListener('scroll', maybeActivate, { passive: true }); addEventListener('resize', maybeActivate, { passive: true }); maybeActivate();
  }
  if ('ResizeObserver' in window) new ResizeObserver(updatePosition).observe(track);
  else addEventListener('resize', updatePosition, { passive: true });
  updatePosition();
}

// Maps starts after the first-party page has loaded and the section is near.
// Hidden desktop/mobile duplicates never initialize; a manual request can race
// the observer safely without creating two frames.
document.querySelectorAll('.map-area').forEach(area => {
  const button = area.querySelector('button');
  let started = false, observer;
  const loadMap = () => {
    if (started || !shown(area)) return;
    started = true; observer?.disconnect();
    removeEventListener('scroll', checkNear); removeEventListener('resize', checkNear);
    button.disabled = true; button.textContent = 'Memuat peta interaktif…';
    const iframe = element('iframe'); iframe.title = 'Google Maps — Dewi Salon & Chii.Nails, Palembang';
    iframe.src = salon.mapEmbed; iframe.loading = 'eager'; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.allowFullscreen = true;
    const status = element('p', 'small muted map-status', 'Memuat peta Google Maps…');
    status.setAttribute('role', 'status');
    area.setAttribute('aria-busy', 'true');
    const timeout = setTimeout(() => {
      status.textContent = 'Peta membutuhkan waktu lebih lama. Jika belum tampil, buka lewat tombol Google Maps di bawah.';
    }, 12000);
    iframe.addEventListener('load', () => { clearTimeout(timeout); area.setAttribute('aria-busy', 'false'); status.remove(); }, { once: true });
    area.prepend(iframe);
    // Google's map can paint before its full iframe load event. Never mask an
    // already usable map while unrelated third-party resources finish loading.
    area.querySelector('.map-loading-cover')?.remove();
    area.parentNode.insertBefore(status, area.nextSibling);
  };
  const checkNear = () => {
    const bounds = area.getBoundingClientRect();
    if (shown(area) && bounds.top < innerHeight + 200 && bounds.bottom > -200) loadMap();
  };
  const watch = () => {
    if (started) return;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && shown(area)) loadMap();
      }, { rootMargin: '200px' });
      observer.observe(area);
    } else {
      addEventListener('scroll', checkNear, { passive: true });
      addEventListener('resize', checkNear, { passive: true }); checkNear();
    }
  };
  const afterLoad = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(watch, { timeout: 1200 });
    else setTimeout(watch, 200);
  };
  button?.addEventListener('click', loadMap, { once: true });
  if (document.readyState === 'complete') afterLoad();
  else addEventListener('load', afterLoad, { once: true });
});

// Shared public API poll; no account credentials or Meta code enter this bundle.
if (heroLinks.length || track) {
  let busy = false, pending;
  const refresh = async () => {
    if (busy || document.hidden) return;
    busy = true; const controller = new AbortController(); pending = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/instagram', { signal: controller.signal });
      if (!response.ok) return;
      const feed = normalizeFeed(await response.json());
      if (feed.length) { updateHero(feed); updateGallery(feed); }
    } catch { /* Keep the local photographs or last successful feed. */ }
    finally { clearTimeout(timeout); busy = false; }
  };
  refresh();
  setInterval(refresh, 300000);
  document.addEventListener('visibilitychange', refresh);
  addEventListener('pagehide', () => pending?.abort());
  addEventListener('pageshow', event => { if (event.persisted) refresh(); });
}

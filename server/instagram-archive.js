import { publicInstagramArchive } from '../src/instagram-showcase.js';
import { extractInstagramLinks, CHECK_INTERVAL_MS, PROFILE_URL } from './instagram-links.js';

export const ARCHIVE_KEY = 'archive-v1';
export const REFRESH_KEY = 'refresh-v1';

export function mergeInstagramArchive(previous, discovered, now = Date.now()) {
  const archive = publicInstagramArchive(previous);
  if (!archive) throw new Error('INVALID_ARCHIVE');
  const observed = publicInstagramArchive({ version: 1, profile: 'chii.nails_', posts: discovered });
  if (!observed) throw new Error('NO_PUBLIC_LINKS');
  const known = new Set(archive.posts.map(post => post.id));
  const additions = observed.posts.filter(post => !known.has(post.id));
  const pinned = new Set(archive.pinnedIds);
  return { ...archive, posts: [...archive.posts, ...additions],
    recentIds: observed.posts.filter(post => !pinned.has(post.id)).slice(0, 12).map(post => post.id),
    lastSuccessAt: new Date(now).toISOString(),
    // This is discovery time, not an invented publication timestamp.
    newIds: additions.map(post => post.id) };
}

export async function discoverInstagramLinks(browser) {
  const response = await browser.quickAction('content', {
    url: PROFILE_URL,
    gotoOptions: { waitUntil: 'domcontentloaded', timeout: 6000 },
    waitForSelector: {
      selector: 'a[href^="/chii.nails_/p/"],a[href^="/chii.nails_/reel/"]', timeout: 7000,
    },
    rejectResourceTypes: ['image', 'media', 'font'],
  });
  if (!response.ok) throw new Error('PUBLIC_PROFILE_UNAVAILABLE');
  const payload = await response.json();
  if (!payload.success || typeof payload.result !== 'string' || payload.result.length > 1500000) {
    throw new Error('PUBLIC_PROFILE_UNAVAILABLE');
  }
  const links = extractInstagramLinks(payload.result);
  if (!links.length) throw new Error('NO_PUBLIC_LINKS');
  return { links, browserMs: Math.max(0, Number(response.headers.get('x-browser-ms-used')) || 0) };
}

export async function refreshInstagramArchive(env, bootstrap, {
  now = Date.now(), discover = discoverInstagramLinks,
} = {}) {
  if (env.INSTAGRAM_SCRAPING_ENABLED !== 'true') return { status: 'disabled' };
  const store = env.INSTAGRAM_LINKS;
  if (!store || !env.BROWSER) return { status: 'unconfigured' };
  const state = await store.get(REFRESH_KEY, 'json');
  const elapsed = now - Date.parse(state?.attemptedAt);
  if (Number.isFinite(elapsed) && elapsed < CHECK_INTERVAL_MS) return { status: 'not-due' };
  const day = new Date(now).toISOString().slice(0, 10);
  // Budget successful and failed attempts conservatively at 15 seconds each.
  // This is an admission budget, not a claim of a platform-enforced hard timeout.
  const attempts = state?.day === day ? Number(state.attempts) || 0 : 0;
  const reservedMs = state?.day === day ? Number(state.reservedMs) || 0 : 0;
  if (attempts >= 24 || reservedMs + 15000 > 360000) return { status: 'daily-budget' };
  const nextState = { day, attempts: attempts + 1, reservedMs: reservedMs + 15000,
    attemptedAt: new Date(now).toISOString() };
  await store.put(REFRESH_KEY, JSON.stringify(nextState));
  const previous = publicInstagramArchive(await store.get(ARCHIVE_KEY, 'json'))
    || publicInstagramArchive(bootstrap);
  if (!previous) return { status: 'invalid-archive' };
  try {
    const result = await discover(env.BROWSER);
    const next = mergeInstagramArchive(previous, result.links, now);
    await store.put(ARCHIVE_KEY, JSON.stringify(next));
    await store.put(REFRESH_KEY, JSON.stringify({ ...nextState, status: 'fresh',
      reservedMs: reservedMs + Math.max(15000, result.browserMs || 0) }));
    return { status: 'fresh', total: next.posts.length, added: next.newIds.length };
  } catch {
    // Failed reads never overwrite the archive, or retry in this invocation.
    await store.put(REFRESH_KEY, JSON.stringify({ ...nextState, status: 'stale' }));
    return { status: 'stale', total: previous.posts.length };
  }
}

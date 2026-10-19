import { posts, salon } from './content.js';

export const heroFallbacks = [
  posts[1],
  { id: 'pink-showcase', image: 'pink', alt: 'Press-on maroon dengan detail pink dan putih karya Chii', url: salon.instagram },
  posts[3], posts[0],
];

// Public feed data only. Do not import any server credential code into src/.
export function normalizeFeed(payload) {
  if (!Array.isArray(payload?.posts)) return [];
  return payload.posts.filter(post => {
    try {
      const url = new URL(post.url);
      return post.id && url.protocol === 'https:' && !url.username && !url.password
        && ['www.instagram.com', 'instagram.com'].includes(url.hostname)
        && Number.isFinite(Date.parse(post.timestamp));
    } catch { return false; }
  }).map(post => {
    let imageUrl;
    try {
      const url = new URL(post.imageUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) imageUrl = url.href;
    } catch { /* Missing/unsafe preview uses local photography. */ }
    return { id: String(post.id), url: post.url, imageUrl,
      title: String(post.title || 'Karya terbaru Chii').slice(0, 120),
      alt: String(post.alt || 'Karya terbaru Chii Nails').slice(0, 180), timestamp: post.timestamp };
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 12);
}

export function selectHeroMedia(feed) {
  const images = feed.filter(post => post.imageUrl).slice(0, 4);
  return heroFallbacks.map((fallback, index) => ({ ...(images[index] || fallback), backup: fallback }));
}

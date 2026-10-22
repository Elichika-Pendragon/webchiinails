// Public links only. A permalink identifies a post; it does not establish its age.
export function instagramPost(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:chii\.nails_\/)?(p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/);
    return match ? { id: match[2], url: `https://www.instagram.com/${match[1]}/${match[2]}/` } : null;
  } catch { return null; }
}

export function publicInstagramArchive(value) {
  if (value?.version !== 1 || value?.profile !== 'chii.nails_' || !Array.isArray(value.posts)) return null;
  const unique = new Map();
  for (const item of value.posts.slice(0, 5000)) {
    const post = instagramPost(item?.url);
    if (!post || item.id !== post.id || unique.has(post.id)) continue;
    unique.set(post.id, post);
  }
  if (!unique.size) return null;
  const ids = list => [...new Set(Array.isArray(list) ? list : [])].filter(id => unique.has(id));
  return { version: 1, profile: 'chii.nails_', posts: [...unique.values()],
    recentIds: ids(value.recentIds).slice(0, 12), pinnedIds: ids(value.pinnedIds) };
}

function rank(seed, id) {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

// Seed once per document: polling must not reshuffle an already-open gallery.
export function selectInstagramShowcase(value, { seed = Math.random(), previews = [] } = {}) {
  const archive = publicInstagramArchive(value);
  if (!archive) return [];
  const byId = new Map(archive.posts.map(post => [post.id, post]));
  const recent = archive.recentIds.slice(0, 3).map(id => byId.get(id));
  const selected = new Set(recent.map(post => post.id));
  const random = archive.posts.filter(post => !selected.has(post.id))
    .sort((a, b) => rank(seed, a.id) - rank(seed, b.id) || a.id.localeCompare(b.id)).slice(0, 12 - recent.length);
  const local = new Map(previews.map(post => [post.id, post]));
  return [...recent, ...random].map(post => ({ title: 'Karya Chii Nails', alt: 'Postingan Instagram Chii Nails',
    ...local.get(post.id), ...post, linkOnly: !local.has(post.id) }));
}

export const seoPages = [
  {
    file: 'index.html', path: '/',
    title: 'Salon Nail Art Palembang | Chii Nails',
    description: 'Chii Nails, salon nail art Palembang dekat SMA N 5. Custom nail art, extensions, basic manicure & vitamin oil. Press-on se-Indonesia. Booking wajib DP.',
  },
  {
    file: 'about.html', path: '/about',
    title: 'Tentang Chii Nails & Aturan Booking | Palembang',
    description: 'Kenali Chii Nails Palembang dan aturan booking: wajib DP, jam layanan, Last book, denda keterlambatan, dan tanpa walk-in.',
  },
  {
    file: 'services.html', path: '/services',
    title: 'Nail Art, French Nails & Extension Palembang | Chii Nails',
    description: 'French nails, custom nail art, nail extension, dan basic manicure di Chii Nails Palembang. Lihat layanan, konsultasi desain dan harga sebelum booking.',
  },
  {
    file: 'custom-sets.html', path: '/custom-sets',
    title: 'Harga Nail Art & Press-on Palembang | Chii Nails',
    description: 'Hitung estimasi nail art dan press-on Chii Nails Palembang. Harga press-on dihitung dari biaya desain + base kit, dengan tambahan opsional.',
  },
  {
    file: 'visit.html', path: '/visit',
    title: 'Lokasi & Jam Buka Chii Nails Palembang | Booking Only',
    description: 'Dewi Salon & Chii.Nails dekat SMA N 5 Palembang. Senin–Jumat 08.00–17.00, Sabtu–Minggu 08.00–12.00 WIB. Cek Last book; wajib DP, tanpa walk-in.',
  },
];

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function siteSettings(env = {}) {
  const raw = (env.SITE_URL || '').trim();
  let origin = null;
  if (raw) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('SITE_URL must be an HTTPS website origin without a path, query or credentials');
    }
    origin = url.origin;
  }
  const preview = Boolean(env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== (env.SEO_PRODUCTION_BRANCH || 'main'));
  return { origin, indexable: Boolean(origin) && env.SEO_INDEXABLE !== 'false' && !preview };
}

export function structuredData(page, origin, salon) {
  if (!origin) return null;
  const businessId = `${origin}/#salon`;
  const graph = [
    { '@type': 'WebSite', '@id': `${origin}/#website`, name: salon.name, alternateName: 'Chii Nails Palembang', url: `${origin}/`, inLanguage: 'id-ID' },
    {
      '@type': page.path === '/about' ? 'AboutPage' : 'WebPage', '@id': `${origin}${page.path}#webpage`,
      url: `${origin}${page.path}`, name: page.title, description: page.description, inLanguage: 'id-ID',
      isPartOf: { '@id': `${origin}/#website` }, about: { '@id': businessId },
    },
  ];
  if (page.path === '/') graph.push({
    '@type': 'NailSalon', '@id': businessId, name: salon.name, url: `${origin}/`,
    image: [`${origin}/images/jessica-french-gold-share.jpg`, `${origin}/images/studio-clean.jpg`], logo: `${origin}/images/logo.jpg`,
    description: `Nail art custom, extensions, dan press-on di Palembang. Booking wajib DP; tidak menerima walk-in. ${salon.lastBooking}.`,
    telephone: `+${new URL(salon.whatsapp).pathname.slice(1)}`,
    address: { '@type': 'PostalAddress', ...salon.postalAddress },
    hasMap: salon.maps, sameAs: [salon.instagram],
    geo: { '@type': 'GeoCoordinates', ...salon.geo },
    openingHoursSpecification: salon.openingHours.map(item => ({
      '@type': 'OpeningHoursSpecification', dayOfWeek: item.days.map(day => `https://schema.org/${day}`), opens: item.opens, closes: item.closes,
    })),
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function brandHead(name = 'Chii Nails') {
  return [
    `<meta name="application-name" content="${escapeHtml(name)}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}" />`,
    '<link rel="icon" type="image/png" sizes="96x96" href="/images/chii-favicon-96.png" />',
    '<link rel="icon" type="image/png" sizes="192x192" href="/images/chii-favicon-192.png" />',
    '<link rel="apple-touch-icon" sizes="180x180" href="/images/chii-apple-touch-icon.png" />',
    '<link rel="shortcut icon" href="/favicon.ico" />',
  ].join('\n    ');
}

export function seoHead(page, settings, salon, verification = '') {
  const { origin, indexable } = settings;
  const tags = [
    brandHead(salon.name),
    `<meta name="robots" content="${indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow'}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="id_ID" />',
    `<meta property="og:site_name" content="${escapeHtml(salon.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
  ];
  if (origin) tags.push(
    `<link rel="canonical" href="${escapeHtml(origin + page.path)}" />`,
    `<meta property="og:url" content="${escapeHtml(origin + page.path)}" />`,
    `<meta property="og:image" content="${escapeHtml(origin)}/images/jessica-french-gold-share.jpg" />`,
    '<meta property="og:image:alt" content="Nail art custom karya Chii Nails di Palembang" />',
    `<meta name="twitter:image" content="${escapeHtml(origin)}/images/jessica-french-gold-share.jpg" />`,
  );
  const schema = structuredData(page, origin, salon);
  if (schema) tags.push(`<script type="application/ld+json">${safeJson(schema)}</script>`);
  if (verification.trim()) tags.push(`<meta name="google-site-verification" content="${escapeHtml(verification.trim())}" />`);
  return tags.join('\n    ');
}

export function sitemap(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${seoPages.map(page => `  <url><loc>${escapeHtml(origin + page.path)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

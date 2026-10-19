export const seoPages = [
  {
    file: 'index.html', path: '/',
    title: 'Nail Art Palembang & Nail Treatment | Chii Nails',
    description: 'Chii Nails, salon nail art Palembang dekat SMA N 5. Custom nail art, extensions, basic manicure & vitamin oil. Press-on se-Indonesia. Booking wajib DP.',
  },
  {
    file: 'about.html', path: '/about',
    title: 'Tentang Chii Nails & Aturan Booking | Palembang',
    description: 'Kenali Chii Nails Palembang dan aturan booking: wajib DP, jam layanan, batas booking terakhir, denda keterlambatan, dan tanpa walk-in.',
  },
  {
    file: 'services.html', path: '/services',
    title: 'Nail Art & Nail Treatment Palembang | Chii Nails Services',
    description: 'Layanan Chii Nails Palembang: custom nail art, nail extensions, basic manicure dan vitamin oil. Lihat pilihan layanan lalu konsultasi desain dan booking wajib DP.',
  },
  {
    file: 'custom-sets.html', path: '/custom-sets',
    title: 'Custom Sets & Daftar Harga Nail Art Palembang | Chii Nails',
    description: 'Lihat karya dan harga Chii Nails: nail art, Cat Eye, extensions, removal dan press-on custom. Harga total press-on Rp25.000–Rp155.000 sesuai desain.',
  },
  {
    file: 'visit.html', path: '/visit',
    title: 'Lokasi & Jam Buka Chii Nails Palembang | Booking Only',
    description: 'Dewi Salon & Chii.Nails dekat SMA N 5 Palembang. Senin–Jumat 08.00–17.00, Sabtu–Minggu 08.00–12.00 WIB. Cek batas booking terakhir; wajib DP, tanpa walk-in.',
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
    { '@type': 'WebSite', '@id': `${origin}/#website`, name: salon.name, url: `${origin}/`, inLanguage: 'id-ID' },
    {
      '@type': page.path === '/about' ? 'AboutPage' : 'WebPage', '@id': `${origin}${page.path}#webpage`,
      url: `${origin}${page.path}`, name: page.title, description: page.description, inLanguage: 'id-ID',
      isPartOf: { '@id': `${origin}/#website` }, about: { '@id': businessId },
    },
  ];
  if (page.path === '/') graph.push({
    '@type': 'NailSalon', '@id': businessId, name: salon.name, url: `${origin}/`,
    image: [`${origin}/images/french.jpg`, `${origin}/images/studio-clean.jpg`], logo: `${origin}/images/logo.jpg`,
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

export function seoHead(page, settings, salon, verification = '') {
  const { origin, indexable } = settings;
  const tags = [
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
    `<meta property="og:image" content="${escapeHtml(origin)}/images/french.jpg" />`,
    '<meta property="og:image:alt" content="Nail art custom karya Chii Nails di Palembang" />',
    `<meta name="twitter:image" content="${escapeHtml(origin)}/images/french.jpg" />`,
  );
  const schema = structuredData(page, origin, salon);
  if (schema) tags.push(`<script type="application/ld+json">${safeJson(schema)}</script>`);
  if (verification.trim()) tags.push(`<meta name="google-site-verification" content="${escapeHtml(verification.trim())}" />`);
  return tags.join('\n    ');
}

export function sitemap(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${seoPages.map(page => `  <url><loc>${escapeHtml(origin + page.path)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

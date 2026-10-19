import { getInstagramFeed } from '../server/instagram-feed.js';

// Vercel Node function: the token stays on the server.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const posts = await getInstagramFeed(process.env);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=300');
    return res.status(200).json({ posts, fetchedAt: new Date().toISOString() });
  } catch {
    // Do not leak upstream errors, credentials or token URLs to visitors.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Instagram feed temporarily unavailable' });
  }
}

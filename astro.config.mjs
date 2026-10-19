import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { loadEnv } from 'vite';
import { getInstagramFeed } from './server/instagram-feed.js';

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  integrations: [react()],
  build: { format: 'file', inlineStylesheets: 'always' },
  vite: {
    plugins: [{
      name: 'local-instagram-api',
      configureServer(server) {
        const env = { ...loadEnv(server.config.mode, process.cwd(), 'INSTAGRAM_'), ...process.env };
        server.middlewares.use('/api/instagram', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
          try { res.end(JSON.stringify({ posts: await getInstagramFeed(env) })); }
          catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'Instagram feed temporarily unavailable' })); }
        });
      },
    }],
  },
});

import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { getInstagramFeed } from './server/instagram-feed.js';
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [{
    name: 'local-instagram-api',
    configureServer(server) {
      const env = { ...loadEnv(server.config.mode, process.cwd(), 'INSTAGRAM_'), ...process.env };
      server.middlewares.use('/api/instagram', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
        try {
          const posts = await getInstagramFeed(env);
          res.end(JSON.stringify({ posts }));
        } catch {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'Instagram feed temporarily unavailable' }));
        }
      });
    },
  }],
  build: isSsrBuild ? {} : {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        about: fileURLToPath(new URL('./about.html', import.meta.url)),
      },
    },
  },
}));

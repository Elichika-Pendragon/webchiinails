import { maintainInstagramToken, STATUS_KEY } from '../server/instagram-tokens.js';

export default {
  // No public refresh/admin endpoint and no browser-accessible credentials.
  fetch() { return new Response('Not found', { status: 404 }); },
  async scheduled(controller, env) {
    try {
      const result = await maintainInstagramToken(env);
      await env.INSTAGRAM_TOKENS.put(STATUS_KEY, JSON.stringify({ ...result, checkedAt: new Date().toISOString() }));
      console.log(`Instagram token maintenance: ${result.state}`);
    } catch {
      // Never log an upstream error: it could contain a token-bearing URL.
      try {
        await env.INSTAGRAM_TOKENS?.put(STATUS_KEY, JSON.stringify({ state: 'attention-required', checkedAt: new Date().toISOString() }));
      } catch { /* Preserve a sanitized failure even if storage is unavailable. */ }
      console.error('Instagram maintenance failed; inspect configuration or reconnect privately.');
      throw new Error('Instagram maintenance requires attention');
    }
  },
};

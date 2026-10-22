import bootstrap from '../public/data/instagram-archive.json' with { type: 'json' };
import { refreshInstagramArchive } from '../server/instagram-archive.js';

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
  async scheduled(event, env) {
    await refreshInstagramArchive(env, bootstrap, { now: event.scheduledTime });
  },
};

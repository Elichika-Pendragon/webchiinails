import bootstrap from '../server/instagram-bootstrap.js';
import { refreshInstagramArchive } from '../server/instagram-archive.js';

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
  async scheduled(event, env) {
    const result = await refreshInstagramArchive(env, bootstrap, { now: event.scheduledTime });
    console.info('instagram_archive_refresh', result);
  },
};

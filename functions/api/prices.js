import { handlePublicPrices } from '../../server/prices.js';
export const onRequest = context => handlePublicPrices(context.request, context.env, {
  cache: globalThis.caches?.default, waitUntil: promise => context.waitUntil(promise),
});

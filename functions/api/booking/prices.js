import { handleOwnerPrices } from '../../../server/prices.js';
export const onRequest = ({ request, env }) => handleOwnerPrices(request, env);

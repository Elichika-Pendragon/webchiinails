import { handlePublicOrders } from '../../../server/order-estimates.js';
export const onRequest = ({ request, env }) => handlePublicOrders(request, env);

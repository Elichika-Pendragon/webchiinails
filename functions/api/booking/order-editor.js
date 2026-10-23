import { handleOwnerOrders } from '../../../server/order-estimates.js';
export const onRequest = ({ request, env }) => handleOwnerOrders(request, env);

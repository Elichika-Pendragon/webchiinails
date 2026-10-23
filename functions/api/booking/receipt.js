import { handleReceipt } from '../../../server/booking-receipts.js';
export const onRequest = ({ request, env }) => handleReceipt(request, env);

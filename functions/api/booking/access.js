import { handleBookingCodeCheck } from '../../../server/booking-codes.js';
export const onRequest = ({ request, env }) => handleBookingCodeCheck(request, env);

import { handleOwnerBookingCodes } from '../../../server/booking-codes.js';
export const onRequest = ({ request, env }) => handleOwnerBookingCodes(request, env);

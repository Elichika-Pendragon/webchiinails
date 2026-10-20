import { handleBookingStatus } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingStatus(request, env);

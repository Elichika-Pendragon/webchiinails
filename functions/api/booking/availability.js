import { handleBookingAvailability } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingAvailability(request, env);

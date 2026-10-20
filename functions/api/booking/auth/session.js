import { handleBookingSession } from '../../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingSession(request, env);

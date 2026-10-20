import { handleBookingRequests } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingRequests(request, env);

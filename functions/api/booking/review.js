import { handleBookingReview } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingReview(request, env);

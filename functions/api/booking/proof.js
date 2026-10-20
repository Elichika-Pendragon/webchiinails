import { handleBookingProof } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingProof(request, env);

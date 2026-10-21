import { handleBookingAdmission } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingAdmission(request, env);

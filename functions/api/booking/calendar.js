import { handleBookingCalendarMonth } from '../../../server/booking-http.js';

export const onRequest = ({ request, env }) => handleBookingCalendarMonth(request, env);

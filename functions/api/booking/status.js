import { handleBookingStatus } from '../../../server/booking-http.js';
import { hasBookingProcessor } from '../../../server/booking-processor.js';

export const onRequest = ({ request, env }) => handleBookingStatus(request, hasBookingProcessor(env) ? env : { ...env, BOOKING_ENABLED: 'false' });

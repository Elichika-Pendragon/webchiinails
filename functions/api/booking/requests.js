import { forwardBookingSubmission } from '../../../server/booking-processor.js';

export const onRequest = ({ request, env }) => forwardBookingSubmission(request, env);

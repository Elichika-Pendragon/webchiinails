import { cleanupExpiredPaymentProofs } from '../server/booking-proofs.js';

// Deploy separately with the same BOOKING_DB binding and one daily UTC cron.
// There is deliberately no public HTTP endpoint and no Calendar/credential use.
export default {
  async scheduled(_controller, env, context) {
    context.waitUntil(cleanupExpiredPaymentProofs(env));
  },
};

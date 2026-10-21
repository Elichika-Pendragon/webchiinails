import { DurableObject } from 'cloudflare:workers';
import { createBookingHttpHandlers, isBookingSubmissionEnabled } from '../server/booking-http.js';
import { BOOKING_PROCESSOR_CONFIG_FIELDS, processorResponse } from '../server/booking-processor.js';
import privateImages from './booking-images.js';

export class BookingSubmissionProcessor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handlers = createBookingHttpHandlers({ isSubmissionEnabled: isBookingSubmissionEnabled });
  }

  async submit(request, config) {
    if (!config || Object.getPrototypeOf(config) !== Object.prototype
      || Object.keys(config).sort().join(',') !== [...BOOKING_PROCESSOR_CONFIG_FIELDS].sort().join(',')
      || Object.values(config).some(value => typeof value !== 'string' || !value.length || value.length > 16384)
      || config.SITE_URL !== 'https://chiinails.pages.dev') return processorResponse('BOOKING_DISABLED');
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/booking/requests' || url.search) return processorResponse('BOOKING_ORIGIN', 403);
      // The allowlisted configuration exists only for this invocation. Bindings
      // are fixed at deployment and cannot be replaced by request data.
      return await this.handlers.requests(request, {
        ...config, BOOKING_DB: this.env.BOOKING_DB,
        // Keep JPEG inspection and output buffering on the DO CPU budget too.
        // Cloudflare Images does the pixel transformation through this binding.
        BOOKING_IMAGES: { fetch: imageRequest => privateImages.fetch(imageRequest, { IMAGES: this.env.IMAGES }) },
      });
    } catch { return processorResponse(); }
  }

  async fetch() { return new Response(null, { status: 404 }); }
}

// No public HTTP entrance, diagnostics route, timer, or owner-review RPC.
export default { async fetch() { return new Response(null, { status: 404 }); } };

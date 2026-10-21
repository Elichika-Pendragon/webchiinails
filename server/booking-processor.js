// Thin Pages boundary. Never parse, clone, hash, log or retry the upload here.
// Request RPC transfers its body stream to one private Durable Object.
export const BOOKING_PROCESSOR_CONFIG_FIELDS = Object.freeze([
  'BOOKING_ENABLED', 'SITE_URL', 'BOOKING_LINK_SECRET', 'BOOKING_OWNER_EMAIL',
  'BOOKING_TURNSTILE_SITE_KEY', 'BOOKING_TURNSTILE_SECRET_KEY',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_CALENDAR_ID',
]);

export function processorResponse(code = 'BOOKING_UNAVAILABLE', status = 503) {
  const messages = {
    BOOKING_UNAVAILABLE: 'Permintaan belum dapat diproses. Isian tetap tersimpan; coba lagi sebentar.',
    BOOKING_DISABLED: 'Booking belum tersedia. Silakan hubungi Chii melalui WhatsApp.',
    BOOKING_ORIGIN: 'Buka formulir booking melalui situs Chii.',
    BOOKING_METHOD: 'Metode permintaan tidak didukung.',
    BOOKING_BODY: 'Data booking terlalu besar.',
  };
  return Response.json({ code, message: messages[code] ?? messages.BOOKING_UNAVAILABLE }, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Cookie',
    ...(status === 405 ? { Allow: 'POST' } : {}),
  } });
}

export function hasBookingProcessor(env) {
  return env?.BOOKING_SUBMISSIONS_DISABLED !== 'true' && typeof env?.BOOKING_PROCESSOR?.getByName === 'function';
}

export function bookingProcessorConfig(env) {
  const config = {};
  for (const field of BOOKING_PROCESSOR_CONFIG_FIELDS) {
    if (typeof env?.[field] !== 'string' || !env[field].length || env[field].length > 16384) return null;
    config[field] = env[field];
  }
  return config;
}

export async function forwardBookingSubmission(request, env) {
  if (env?.BOOKING_ENABLED !== 'true' || !hasBookingProcessor(env)) return processorResponse('BOOKING_DISABLED');
  if (!(request instanceof Request) || request.method !== 'POST') return processorResponse('BOOKING_METHOD', 405);
  try {
    const url = new URL(request.url), site = new URL(env.SITE_URL);
    if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/'
      || url.origin !== site.origin || url.pathname !== '/api/booking/requests' || url.search
      || request.headers.get('Origin') !== site.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return processorResponse('BOOKING_ORIGIN', 403);
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 528384)) return processorResponse('BOOKING_BODY', 413);
    const config = bookingProcessorConfig(env);
    if (!config) return processorResponse('BOOKING_DISABLED');
    // RPC is private to this Pages binding. No credentials in HTTP headers,
    // URLs, logs, persistent DO storage, or browser responses.
    const response = await env.BOOKING_PROCESSOR.getByName('booking-v1').submit(request, config);
    if (!(response instanceof Response)) return processorResponse();
    return response;
  } catch {
    // A timeout may follow a committed D1 transaction. Never replay here: the
    // customer's existing idempotency key makes their explicit retry safe.
    return processorResponse();
  }
}

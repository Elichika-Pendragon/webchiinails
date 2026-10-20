# Owner approval surface

Route: `/book/approve?r=<opaque request token>`

Mode: **Operate**. Jessica opens a customer's unique link from WhatsApp, sees a short booking brief after authenticating, and accepts or cancels the pending request. There is no admin dashboard and no data to retype. This extends the existing booking interface within the fixed white, blush and rose theme; it does not change the visual system.

## Interface

- Compact logo and return-to-site header, without a Book or Booking navigation item.
- Brief: name, WhatsApp contact link, date in Palembang/WIB, two-hour interval, agreed total, calculated 10% deposit, and remaining balance.
- Pending requests have two full-width 50px controls: **Terima booking** and **Batalkan permintaan**. The short explanation states that acceptance confirms the owner has checked the actual DP and the agreed amount. The server must check capacity again before writing the appointment.
- Accepted, cancelled and expired states remove all decision controls. Approving/reconciliation states replace the two decision buttons with **Periksa penyimpanan**: an explicit protected `accept` retry which lets the backend enforce its 60-second claim lease and reconcile the deterministic Calendar event. It never cancels or retries automatically. A verified accepted response may supply a Google Calendar event link. Pending or unsuccessful responses never show a success claim.
- Decisions disable duplicate actions during the request, retain the brief on recoverable failures, and require a fresh status fetch after an uncertain response. Opening the page or a link preview cannot accept or cancel a booking.

## Privacy and access

The static HTML contains no customer details or owner account address. The request token is URL-safe opaque data, never interpolated into HTML or forwarded to third-party links. A same-origin, non-cacheable session check must verify the owner before the client requests the private brief. The route is `noindex, nofollow` with `no-referrer`; the backend must also apply no-store/noindex and access checks to every private response.

Google Identity Services loads only after an explicit sign-in request, only on this owner route. The public OAuth client ID and nonce come from the session endpoint. The returned credential is posted to the server with the session CSRF token; the client never treats a Google callback alone as authorization. There is no One Tap prompt or automatic account selection. See the [official Google Identity Services JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference) for `initialize`, `nonce`, `callback` and `renderButton`.

## API contract

- `GET /api/booking/auth/session` returns `{ authenticated, csrfToken, clientId, nonce }` as applicable.
- `POST /api/booking/auth/session` receives `{ credential, nonce }` with `X-CSRF-Token`, verifies identity, and returns the authenticated session metadata.
- Authenticated `GET /api/booking/review?token=…` returns either the summary directly or `{ summary }`.
- Authenticated `POST` to that review URL receives `{ action: 'accept' | 'cancel' }` with `X-CSRF-Token` and returns the verified current summary. Accepted status means the Calendar write is complete. A claimed but unfinished write returns `approving`; an uncertain write returns `reconcile`. Neither may return `accepted`.
- Summary: `id`, `status`, `name`, `whatsapp`, integer Rupiah `agreedPrice`, `deposit`, `remainingBalance`, `startISO`, `endISO`; optional `date`, `time`, `durationMinutes`, `expiresAt`, and `calendarEventUrl`. The client verifies the two-hour interval and canonical 10% calculation before rendering.
- Token shape: exactly 43 URL-safe characters (`[A-Za-z0-9_-]`). Tokens identify a request and never authorize the owner.
- Status vocabulary: `pending`, `approving`, `reconcile`, `accepted`, `cancelled`, `expired`.

## Accessibility and performance

Semantic headings, definition list, native buttons, visible keyboard focus and a polite status region convey the task without modal dialogs, forced scrolling or page-load animation. Labels wrap, data uses tabular numerals, and long names/numbers cannot widen the viewport. Main decisions are 50px high; reduced-motion visitors receive no button transitions. Existing self-hosted fonts and the existing small WebP logo are reused. There is no React hydration, extra UI library, Calendar iframe, polling or background refresh loop. All fetches have a 12-second timeout and are aborted on page departure; private DOM content is cleared before a cached page can be revisited.

The unconfigured and unauthorized states are intentional: without a configured session endpoint, owner identity and storage/Calendar backend, the page cannot approve a booking. In-app WhatsApp browsers may require opening the same link in Chrome or Safari for Google's account picker. Browser and responsive verification are recorded by the release owner; implementation alone does not establish physical-device Safari behavior or a sub-one-second load time.

Implementation checks on 20 October 2026: the controller passed Node syntax validation and 13 synthetic DOM/API checks covering malformed links, anonymous privacy, pending details, acceptance/cancellation, explicit reconciliation, terminal states, uncertain writes, session/CSRF expiry and private DOM cleanup on departure. These checks do not replace rendered mobile/desktop inspection or real owner sign-in and Calendar integration tests.

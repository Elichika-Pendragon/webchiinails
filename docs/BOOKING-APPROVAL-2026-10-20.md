# Booking approval implementation — 20 October 2026

**Status: RESOURCES CONFIGURED; DEPLOYMENT AND LIVE FLOW PENDING.** The owner-authorized Google sign-in, single studio Calendar writer grant, encrypted service-account key, D1 migration/binding and production settings have been configured without activating billing. A read-only live Calendar access check succeeded. This report does not establish that the new website service is deployed, that owner sign-in works end to end or that a booking has been added to Calendar.

| Release checkpoint | Current evidence |
| --- | --- |
| Local implementation | Prepared; automated, exact-checkout build and browser-fixture checks pass. |
| Google Web owner sign-in and support contact | Branding/contact and API User Data Policy accepted with explicit owner approval; Web client created for the exact production origin. Only the intended owner is persisted as a test user; the app remains in Testing. Actual permitted-owner sign-in through the website **PENDING**. |
| Selected studio Calendar writer grant and encrypted key | The existing Nail Art Calendar grants the dedicated service account **Make changes and see all event details**. One JSON key was created for this setup and its private key saved as an encrypted production secret. No project IAM role or additional Calendar grant was added. |
| D1 schema, binding and runtime settings | Database created/migrated and bound as Production `BOOKING_DB`. Six server settings are saved as Secrets; public OAuth client ID and `BOOKING_ENABLED=true` are saved as Text. Existing `SITE_URL` is unchanged. New deployment must still receive and verify this configuration. |
| Read-only live Calendar access | Official OAuth/service-account authorization and free/busy check succeeded at **2026-10-20 15:47:54 UTC**; **0 events written**. This proves read access, not an event insertion or website flow. |
| GitHub release commit | **PENDING — insert only the actual pushed commit.** |
| Successful Cloudflare deployment | **PENDING — insert only the verified deployment.** |
| Authorized live booking/approval/Calendar test | **PENDING — local fixtures are not live integration evidence.** |

Private account addresses, Cloud project identifiers, Calendar IDs, database identifiers, credentials and authentication/approval tokens are deliberately excluded. The activation procedure and secret names are documented in [the setup checklist](BOOKING-APPROVAL-SETUP.md).

The six encrypted production settings are `BOOKING_LINK_SECRET`, `BOOKING_AUTH_SECRET`, `BOOKING_OWNER_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` and `GOOGLE_CALENDAR_ID`. Only their names are documented here. Saving `BOOKING_ENABLED=true` prepares the authorized activation; it is not proof that the unpushed/new code is running or that the status endpoint has reported enabled.

## Customer and owner behavior

Chii continues sharing the same `/book` URL after consultation. Name, WhatsApp number, agreed total, requested date and start time must all be valid before **Book** is available. DP is read-only **10%**, rounded upward to the next whole Rupiah, and is recalculated by the server rather than accepted from submitted deposit values. The weekday Last book remains 14:00; weekend Last book remains 10:00 WIB. Appointments occupy two hours.

When the configured service is enabled, Book saves a pending request and prepares WhatsApp with the customer's brief plus its unique `/book/approve?r=<opaque-token>` link. An unchanged retry reuses the idempotency key; the server returns the same request/link. Changed booking details use a different key. The browser validates the returned booking values and exact same-origin approval URL before opening WhatsApp. **The customer still taps Send in WhatsApp.** Preparing or sending the message does not confirm the appointment or prove that DP was received.

The owner approval page shows a compact mobile-first brief: name, WhatsApp contact, date, two-hour WIB interval, agreed total, DP and remaining balance. Customer details appear only after the permitted Google identity is authenticated. The owner manually checks the actual transfer or QRIS payment, then explicitly chooses **Terima booking** or **Batalkan permintaan**. No information must be retyped. Opening, refreshing or sharing the URL never approves a booking. Cancellation in this interface applies to a pending request; it does not delete an accepted Calendar event.

If the service is disabled, the customer page clearly uses the WhatsApp-only preview: it does not save a request, generate an online approval link or change Calendar. A status-fetch failure instead reports unavailability and offers an explicit retry; it does not silently claim that a request was saved.

## Server and privacy boundaries

- The API is disabled unless `BOOKING_ENABLED` is exactly `true` and all required D1, signing, owner-authentication and Calendar settings are present. The public status endpoint exposes only an enabled boolean. Other disabled endpoints fail closed.
- Google Identity Services is loaded only after the owner explicitly starts sign-in. Server verification checks the Google signature, audience, issuer, issuance/expiry, nonce and exact verified allowlisted account. Owner authentication requests no Calendar scope and needs no OAuth client secret.
- Ten-minute signed challenges bind nonce and CSRF. Seven-day owner sessions use Secure, HttpOnly, SameSite=Lax cookies scoped to the booking API. Cookies contain neither the owner's email nor Google credentials. Every mutation requires exact Origin and a session-bound CSRF token. Signing-secret rotation invalidates all sessions; there is no per-device revocation list.
- Owner authentication runs before review-token parsing, request-body parsing or ledger lookup. An approval URL is an opaque lookup, not authorization. Booking/authentication responses are JSON with private no-store, no-referrer and noindex protections; no cross-origin access is granted. Unexpected errors, upstream bodies, private identifiers and submitted values are not reflected into error responses or ordinary logs.
- Acceptance atomically claims four consecutive 30-minute cells in D1, rechecks Calendar availability and inserts one private, opaque two-hour event using a deterministic event identity. Repeated approval is idempotent. D1 claims coordinate this application; direct edits in Google Calendar cannot participate in the same transaction.
- Uncertain Calendar writes retain reservations and show an uncertain status. After the recovery fence, the owner's explicit **Periksa penyimpanan** action performs a lookup before any retry. It recovers a matching event or proves absence before rechecking availability. A refresh only reads status; it never automatically resubmits a decision.
- Ordinary authenticated review uses the local signed session and makes no Google request. Google verification keys are cached, and the Calendar adapter caches its authorization/imported key per bounded credential set. No third-party SDK or runtime framework was added.

Payment verification remains manual. No payment provider/API, paid plan, billing activation, automated WhatsApp sending, public Calendar publishing or additional Calendar grant is part of this implementation. Customer-data retention/deletion and credential operating policies still need the owner's decisions recorded in the setup checklist; pending-request expiry is not automatic deletion. No automatic cleanup job is implemented; retention remains an open operating decision.

## Verification completed locally

The exact release checkout passed **161 automated tests**, its production build and static SEO/asset guards. Coverage includes canonical DP, required input, time boundaries, idempotency, owner authentication/CSRF, HTTP gates and body limits, private-data protection, overlapping approvals, Calendar failures and deterministic recovery using synthetic data/providers. Fresh independent authentication, HTTP and frontend review found no material issue. No real Google owner login or Calendar event write is established by those tests. The separately verified production database creation/migration/binding and read-only live Calendar check are setup evidence, not a completed website booking.

The bounded local Chrome fixture checks cover 320px/390px mobile and 1280px desktop layouts. No horizontal overflow was observed; Book and the owner accept/cancel controls are 50px high. Empty/missing required values keep Book disabled, completing them enables it, and clearing the name disables it again. A total of Rp155.001 derives DP Rp15.501. Anonymous approval shows no customer details and loads no Google sign-in script. Pending, accepted, reconciliation and uncertain-action fixtures were inspected; an uncertain write never displays a confirmed result. No synthetic WhatsApp message was sent.

Evidence: [local checks](evidence/booking-approval/local-browser-checks.json), [mobile owner brief](evidence/booking-approval/mobile-pending.png), [desktop owner brief](evidence/booking-approval/desktop-pending.png), [anonymous sign-in state](evidence/booking-approval/mobile-signin.png), [complete customer form](evidence/booking-approval/mobile-book-valid.png). These are local fixture captures; they are not screenshots of a live customer request or successful Google integration.

Both `/book` and `/book/approve` remain noindex and outside the five-URL public sitemap. No Book/Booking header or menu destination was added. Existing public SEO, ownership and static asset guards pass locally; production parity is a pending release check.

## Asset comparison and performance limits

The exact production build emits **39,769 bytes raw / 15,456 bytes gzip estimate** across its five browser-JS files. The preceding navigation/calendar build totaled 24,650 / 9,856 bytes, so this implementation adds 15,119 raw / 5,600 gzip bytes across the build. Visitors do not download the whole build on every route.

Reading the exact prepared HTML and its static module-import graph gives these route-specific totals:

| Route | Browser JS raw | Gzip estimate |
| --- | ---: | ---: |
| Each public page: Home, Services, Custom sets, Visit, About | 12,396 B | 5,022 B |
| `/book` customer form | 30,563 B | 11,870 B |
| `/book/approve` owner brief | 9,177 B | 3,537 B |

The public routes reference only their 29-byte module wrapper and shared controller; the approval controller is loaded only on its own route. The customer route includes its form/calendar controller and the existing shared controller. Google Identity Services is an additional network download only when the owner chooses sign-in; it is not included in these local build totals. No dependency, font, image or other visual asset was introduced for this feature.

Gzip figures sum individually compressed files and are deterministic estimates, not exact CDN transfer sizes. No fresh loading-time, Cloudflare CPU, physical older-Android, Indonesian carrier or real Safari measurement was performed for this change. The target of every route loading below one second is **not proven** by smaller bundles or fixture checks. Earlier timing reports remain historical measurements in [PERFORMANCE.md](../PERFORMANCE.md).

## Pending activation and release confirmation

The authorized resource setup is now configured and the production enabled flag is prepared. Deployment and its runtime checks remain the next boundary. Confirm the deployed Functions receive the intended D1 binding/secrets, the status boolean is enabled, the permitted owner can actually sign in, and no other account or anonymous visitor can read or decide a request. Do not put real credentials or account identifiers into this report or its evidence. Retention and operating choices remain open for routine use; no deletion job is silently added.

After publishing the actual commit, record the successful Cloudflare deployment and check exact production bytes, route status, public SEO/ownership files, noindex boundaries, anonymous privacy and disabled/enabled behavior. Complete one separately authorized synthetic end-to-end request/approval test against the agreed Calendar before distributing the booking link broadly. Record the actual result, including any unresolved failure, rather than replacing these pending checkpoints with an assumption.

Figma synchronization and Meta Instagram authorization remain deferred. This implementation does not complete either integration.

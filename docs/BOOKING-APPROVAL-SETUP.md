# Booking approval activation checklist

Updated 20 October 2026. **Code is live and production reports enabled; real owner website sign-in and a Calendar write remain pending.** Code `bccc3a887f0f6b7ddba827cf27c2f08042a4cdbf` deployed successfully as `180ada8e-26ff-4d22-a9fc-24fdce3fa1d7` at 22:53 WIB, with Functions compiled. Exact public artifacts/status and a synthetic pending request pass; they do not establish a completed booking approval.

## Current verified setup

With explicit owner approval, Google branding/support-contact configuration and API User Data Policy acceptance are complete. A Web OAuth client is restricted to the exact production origin; the intended owner is persisted as its sole test user, and the app remains in Testing. This is identity sign-in only, not owner OAuth access to Calendar.

The dedicated service account still has no project IAM role. It now has **Make changes and see all event details** writer access to the existing Nail Art Calendar only. One JSON key was created for this setup and its private key saved as an encrypted Cloudflare Production secret. D1 was created, migrated and bound to Production as `BOOKING_DB`. Six server settings are saved as Secrets; the public OAuth client ID and `BOOKING_ENABLED=true` are saved as Text. Existing `SITE_URL` is unchanged. No billing/trial or paid upgrade was activated.

A read-only live provider check using official OAuth and free/busy succeeded at **2026-10-20 15:47:54 UTC**. It wrote **0 Calendar events**. Deployed status reports `enabled:true`; seven routes/five JS assets and public SEO/ownership match the exact prepared build. A clearly labelled synthetic public TEST request returned 201/pending with canonical DP Rp15.501 and a two-hour interval, and unauthenticated review returned 401. The Google Identity Services button and basic `openid email profile` popup open, and the user completed Google device verification and account steps. A website return showed 401/sign-in-again messaging, another showed temporary 503 unavailability, and retry returned to anonymous sign-in. Production status and anonymous auth-session GET return 200, with status enabled and auth anonymous. The website owner session, authenticated decision and event insertion remain unverified; no definite Google/browser cause is established. No further login request was made in this final check. Account/project/Calendar/database identifiers, credentials and test review tokens remain outside distributable documentation. The sections below preserve the setup/verification procedure; completed resources should be verified, not duplicated.

Evidence: [GET-only production checks](evidence/booking-approval/live-verification.json), [read-only Calendar access](evidence/booking-approval/calendar-readonly-access.json). The synthetic request remains pending, with 0 Calendar writes. Its review/cancellation still requires a verified owner session; no direct token or database edit substitutes for authorization.

## Intended customer and owner flow

Chii shares the same `/book` link after consultation. The customer supplies name, WhatsApp number, agreed total, requested date and time; DP is derived server-side as 10%, rounded up to a whole Rupiah. A valid submission creates one pending request and its unique `/book/approve?r=<opaque-token>` link. The WhatsApp draft contains the booking brief and approval link. The customer must choose **Send** in WhatsApp; this implementation cannot send it automatically.

The approval link is a lookup, never permission to approve. The permitted Google owner signs in, checks the request and actual incoming transfer or QRIS payment, then explicitly accepts or cancels. An accepted booking is reported only after Calendar acknowledges the matching event. Customer declarations, screenshots and form values are not automated proof of payment. Cancellation applies only to a pending request; cancelling an already accepted Calendar appointment is outside this feature.

## Zero-paid setup boundary

- Retain the existing Cloudflare Free plan. Do not activate Workers Paid, a paid trial, paid database, payment gateway or extra billed Google service. Check the actual account's plan before applying changes.
- Pages Functions share the Workers Free allowance of 100,000 requests per day; static requests that bypass Functions remain free and unlimited. Keep function routing limited to the API routes. [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- D1 Free currently includes 5 million rows read and 100,000 rows written per day, plus 5 GB total storage. Exceeding the free D1 allowances produces errors rather than removing the limits through an automatic upgrade. Other applications on the account share capacity. [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- Google's current Calendar documentation states standard usage has no additional cost, with a daily billing threshold of 1,000,000 requests per project and future over-quota billing changes described for later 2026. Recheck the project's live quotas and published terms at activation; do not link billing or raise quotas for this setup. [Google Calendar usage limits](https://developers.google.com/workspace/calendar/api/guides/quota)

Five to ten legitimate bookings per day should be a small workload; this is an estimate, not an assurance against abusive traffic or other account usage. The current per-number creation cap is ten requests per rolling 24 hours. It supplements platform controls but does not prevent a bot from changing numbers. Check request and database metrics after activation. No paid upgrade is a prerequisite in this design.

## 1. Prepare isolated D1 storage

1. For a new installation, keep production disabled while preparing resources. For this installation the authorized Production database is already created/migrated/bound; do not create a duplicate. Keep preview/test resources isolated from production customer records, and identify the target of any authorized live test explicitly.
2. In Cloudflare's D1 dashboard, create a database named `<booking-database-name>` on the Free account. Do not paste database identifiers into frontend files.
3. Apply `migrations/0001-booking.sql` to that exact database once. The dashboard SQL console can execute the file's statements. If using an already configured Wrangler migration workflow, confirm its database target and migration directory before applying it; no project-specific Wrangler configuration or database ID is supplied by this document. [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
4. Confirm `booking_requests` and `booking_slot_claims` plus their indexes exist. Verify the unique slot constraint and canonical DP check using synthetic records in the test database. Never disable the constraints to make a test pass.
5. In the intended Pages project's settings, add a **D1 database binding** named exactly `BOOKING_DB`, pointing to the intended database. Configure Production and Preview independently, then redeploy so the binding is present. [Pages D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)

Pending requests do not occupy time. Acceptance claims four consecutive 30-minute cells in one D1 batch transaction for a two-hour appointment. Those claims coordinate this application; edits made directly in Google Calendar cannot join that transaction.

## 2. Configure Google owner sign-in

1. In the intended Google Cloud project, create an **OAuth client of type Web application** for owner sign-in. This is distinct from the Calendar service account.
2. Configure the app branding/contact information honestly. If the project uses an external testing audience, list only the intended owner as a test user and confirm sign-in works with that account.
3. Add the exact production HTTPS origin, `https://<production-host>`, to **Authorized JavaScript origins**. Include scheme and hostname only: no `/book`, `/book/approve`, wildcard or unrelated preview host. This implementation uses the Google Identity Services JavaScript callback, so it does not require inventing an OAuth redirect callback URI. [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
4. Store the resulting `GOOGLE_OAUTH_CLIENT_ID` in the server runtime configuration. A client ID is public configuration, not a secret; the browser receives it only for the sign-in page. No OAuth client secret is needed by this implementation.
5. Set `BOOKING_OWNER_EMAIL` to the exact permitted owner's verified Google email. It remains server-only. The verifier accepts a Google-authoritative Gmail identity or matching managed Workspace identity and does not treat a similar name or alias as the allowlisted address.
6. Test that another Google account, an unauthenticated browser and a copied approval URL cannot reveal the customer's brief or perform a decision. Test the sign-in popup on mobile Chrome and Safari when an actual device becomes available.

The browser receives identity credentials only for sign-in; it receives no Calendar access token, service-account private key or Calendar scope. A signed, Secure, HttpOnly, SameSite=Lax cookie is scoped to `/api/booking`. Login binds the signed challenge, Google nonce, exact origin and CSRF token; mutations also require the owner-session CSRF token. Sessions last seven days. Rotating the authentication secret invalidates every session; there is no separate per-device revocation list.

## 3. Grant access to exactly one Calendar

The existing booking service account has no project IAM role. The owner-authorized writer grant on the selected existing Calendar and one setup key stored as an encrypted production secret are now configured; read-only Calendar access was verified. Verify those existing resources before changing them, and do not create another key or sharing grant by following this checklist twice. Account/project identifiers and the owner's private email are deliberately omitted here.

1. Verify Google Calendar API is enabled in the intended project. Do not enable unrelated APIs, domain-wide delegation, service-account impersonation or broad project roles.
2. With the owner present, confirm the exact studio Calendar and its **Calendar ID**. An embed URL or secret iCal address is not an API write credential. Keep public sharing limited to the owner's chosen visibility; API synchronization does not require publishing customer event details.
3. Review what else is stored in this Calendar before granting access. Share only this Calendar with the service-account email, using **Make changes and see all event details** (`writer`), not sharing management/owner access. Writer access is needed to create and reconcile the private events used here; it also allows that account to read private details on the selected Calendar. This exact grant is already configured for this installation. [Google Calendar access roles](https://developers.google.com/workspace/calendar/api/v3/reference/acl)
4. Create a service-account JSON key only when the owner authorizes credential activation. If organization policy prohibits keys, leave this integration disabled and choose an authorized alternative; do not weaken the policy as a workaround. Retain the `client_email` and PKCS8 `private_key` only in a protected setup channel. [Google service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account)
5. Put the private key directly into the Pages **encrypted secret** `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Keep PEM line breaks intact; the adapter also accepts escaped `\n`. Store the service-account email and exact Calendar ID as server-only configuration/secrets. Never put the JSON key in Git, public assets, screenshots, chat, `PUBLIC_`/`VITE_` variables or source archives. [Cloudflare Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets)
6. Keep the owner's secure backup and delete an unnecessary downloaded working copy through the agreed credential-handling process. Record key ownership and a rotation/revocation procedure before taking real bookings.

The adapter requests `calendar.events` and `calendar.events.freebusy`; the Calendar sharing grant controls which Calendar the service account can access. It never uses the ambiguous `primary` Calendar ID, sends attendee invitations or exposes customer details through availability responses.

## 4. Required runtime configuration

Use the Pages runtime environment for the intended deployment. The table lists names and placeholders, never real credentials.

| Name | Kind | Value/purpose |
| --- | --- | --- |
| `BOOKING_ENABLED` | Variable | Exact `true` enables the feature when every requirement is present. Deployed production status now reports enabled; owner login/Calendar acceptance still require verification. Set `false` to disable safely. |
| `SITE_URL` | Variable | `https://<production-host>`; exact origin without an application path. |
| `BOOKING_DB` | D1 binding | The migrated booking database object, not a text database identifier. |
| `BOOKING_LINK_SECRET` | Encrypted secret | Independently generated random value of at least 32 bytes, encoded as a string; HMAC for request-link/idempotency material. |
| `BOOKING_AUTH_SECRET` | Encrypted secret | A different random value of at least 32 bytes, encoded as a string; owner session/challenge signatures. |
| `BOOKING_OWNER_EMAIL` | Encrypted secret | `<permitted-owner-google-email>`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Variable | `<web-client-id>.apps.googleusercontent.com`; browser sign-in audience. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Encrypted secret | `<service-account-email>`. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Encrypted secret | The service account's PKCS8 PEM private key. |
| `GOOGLE_CALENDAR_ID` | Encrypted secret | `<exact-studio-calendar-id>`; never `primary`. |

Generate both signing secrets independently with a cryptographic random generator. Do not reuse example text or the same value for different purposes. Configure preview secrets/bindings separately; absence of any required activation setting must produce disabled/unavailable behavior, never a partially enabled booking process. Redeploy after configuration changes.

## 5. Verify before handing out the link

1. Run the automated backend suites, production build and asset checks. Confirm `/book` and `/book/approve` remain noindex, outside the public sitemap, with no booking link added to the header.
2. With the feature disabled, confirm request creation fails closed and the interface does not pretend a real request or approval link was saved.
3. In the isolated test configuration, submit synthetic required fields. Check the server-derived DP, remaining balance, two-hour WIB interval and unique approval link. Weekday Last book is 14:00; weekend Last book is 10:00. Repeating an unchanged request must return the same request/link; changed data must use a new idempotency key.
4. Check WhatsApp opens the intended destination with the brief and link encoded correctly. Do not send a synthetic message to the real owner or a customer without specific authorization.
5. Open the approval link unsigned and from a second Google account: no customer brief or decisions should be available. Sign in as the permitted owner and verify the brief on a narrow mobile viewport.
6. Cancel one pending test request: no Calendar event should be created. For a separate clearly labelled synthetic request, explicitly accept only in the agreed test Calendar. Confirm a single matching private two-hour event and an accepted request; repeat accept and verify no duplicate event.
7. Attempt two overlapping test approvals and an adjacent appointment. Exactly one overlapping request may hold the slot; an adjacent appointment may succeed. A fresh external busy interval must block insertion.
8. Use synthetic provider tests, not a deliberately interrupted real booking, to exercise uncertain writes. Status `reconcile` retains reservations. Wait at least 60 seconds, then use the owner's explicit **Periksa penyimpanan** action. Lookup must recover the existing event or prove absence before a fresh availability check and insertion. Refreshing the summary alone does not reconcile a write. Never create a replacement booking to bypass a reservation.
9. Verify the test run leaves no real customer data. Test-event deletion and any cleanup are separate explicit owner actions; the pending cancel button does not delete accepted events.
10. Review the data/credential decisions below and confirm Free-plan settings. This installation is deployed and reports `enabled:true`, and its synthetic pending-request/anonymous-refusal checks passed. Google device verification/account steps have been completed, but the website session remains unverified after failed returns. Record this unresolved state; authenticated request/decision/Calendar confirmation must not be claimed or distributed as a verified flow. Do not equate a saved flag, read-only Calendar access or pending request with an accepted appointment.

## Retention and operating decisions still outstanding

There is currently **no automatic retention cleanup job**. Seven-day/start-time expiry stops approval of a pending request; it does not erase stored names, WhatsApp numbers, quoted totals, hashed references or audit data. Owner GET is read-only and can display effective expiry without writing it to the database.

The owner has not yet decided the customer-data retention/deletion policy. Agree an appropriate privacy notice, retention period, deletion process, backup policy and credential-handling/rotation policy for routine customer use. A provisional option for review is deleting cancelled/expired requests 30 days after they become terminal, and separately agreeing retention for completed appointments. This option is not implemented or approved. The open decision does not authorize a cleanup job or prevent the explicitly authorized resource setup and controlled integration test.

Never run blanket deletion against `approving`, `reconcile` or future accepted requests. Their claims protect against duplicates. An accepted request's deterministic event metadata and idempotency records may still be required to reconcile retries or edits. Any eventual cleanup must preserve unresolved cases and future reservations, define what happens to Calendar copies and backups, and be tested independently. Contact/payment details in Calendar require the same privacy decision as D1 data.

No request bodies, WhatsApp numbers, approval tokens, authentication cookies, private keys or upstream error bodies should be written to ordinary logs. Platform request/analytics retention must also be checked; approval URLs contain a token even though that token does not authorize owner access.

This design reduces Chii's daily work but is not fully maintenance-free. Quotas, credentials, platform changes, failed approvals and direct Calendar edits still require an accountable owner and a recovery process.

## Disable or roll back safely

1. Set `BOOKING_ENABLED=false` and redeploy first. Confirm the status endpoint reports disabled and new creations/decisions are unavailable. Use WhatsApp for manual scheduling while recovering.
2. Preserve the D1 database, unresolved rows/claims and Calendar events. Disabling the gate or rolling back frontend code must not delete bookings or release uncertain reservations.
3. If credentials may be exposed, revoke the affected service-account key and rotate the authentication secret to invalidate sessions; inspect unresolved writes with the owner before enabling again. Removing the Calendar share also stops future API access, but does not cancel existing events.
4. Roll back to the previously verified deployment if necessary, with the activation gate still off. A code rollback does not reverse database migrations, Calendar events or runtime settings; verify all three separately.

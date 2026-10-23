# Order references, booking access and printable receipts

Reviewed 24 October 2026. Production release is verified at source commit `6453f08`; see [deployment evidence](evidence/order-codes-2026-10-24/README.md). Do not treat a local test or successful Git push as proof that production is running the change.

## Customer and owner flow

1. Customer selects any supported combination in the existing calculator and explicitly saves a five-character reference. Saving performs the existing anonymous session/security challenge and a bounded D1 write. It sends no message, holds no slot and approves nothing.
2. Customer can copy the reference or include it in the existing unsent WhatsApp consultation message. Only Jessica's authenticated account can look it up and edit its choices at `/prices`. Saves preserve the code, increment its revision and reject stale editors.
3. `/book` has an optional calculator-code field directly below WhatsApp. Pasting a complete valid reference debounces a lookup; the explicit Lihat rincian action is also available. The lookup reads the latest saved revision. It seeds the editable total from the minimum estimate. Blank DP follows the existing deposit/full-payment rules; a manually entered DP and amounts changed during the lookup are preserved. Ranges are shown and must be reconciled with the consultation price.
4. The original payment widget's markup, layout and rules are unchanged. Normal booking can leave the calculator reference empty. This public reference is **not** the separate private booking access credential.
5. Jessica separately issues a random, phone-bound, reusable access code at `/book/manage`. The same `/book` address is always used. A valid private code permits only a pending request, never Calendar acceptance. Only Jessica can accept/cancel after checking the actual transfer.
6. After acceptance, the owner approval page prepares Send receipt via WhatsApp. Its native wa.me link targets the validated Indonesian customer number and contains a separate customer receipt URL. Jessica manually presses Send in WhatsApp; no messaging API or automatic notification is used.
7. The customer's link opens `/receipt`, with an explicit Print / Save as PDF action. The browser produces paper/PDF locally. **No PDF files, PDF generator service, PDF library, receipt screenshots or additional media storage are introduced.**

## Public order references

Five characters cannot reversibly encode the 147,276,693,503 nonempty calculator combinations. These are allocated lookup keys, not a shortened collision-free hash or compressed order. Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` avoids ambiguous characters. Every generated code contains at least one letter and one digit: 25,559,040 possible mixed codes. CSPRNG generation uses rejection sampling; SQL uniqueness prevents overwrites and retries up to eight candidate collisions.

Only stable service IDs, bounded integer quantities, kit/glue flags and server-calculated estimates are stored. No name, phone, proof, owner token or appointment is associated with the public reference. Someone who guesses a valid reference may see its service choices and estimate. It is deliberately not a privacy/authentication boundary. Unknown fields, injected totals, duplicates and mutually exclusive 1-/10-nail choices are rejected server-side.

References last 30 days. Expired choice/estimate payloads are cleared in bounded batches on subsequent saves. Tiny code tombstones remain so an old code can never reopen someone else's newer order. Limits: 100 saves per rolling day globally, 10 per anonymous session/day, 5,000 active references and 50,000 lifetime allocations. Writes use atomic SQL conditions. The existing shared session/IP/global admission limits also apply to public lookup/create requests; a fresh verified Turnstile token is required only for a new save. Retries use a session-bound idempotency key, so an uncertain response cannot create duplicate references. No receipt transformation capacity is reserved.

Owner saves recalculate using the current persisted catalog. They alter only the draft order, never existing booking amounts, an accepted appointment or catalog prices. A reference is an estimate, not an agreed-price or payment guarantee.

## Booking access remains private

Private access codes contain 80 bits of randomness (16 readable characters). Only the exact allowlisted Google owner can issue/rotate/revoke them, with normal Origin and CSRF protections. Customer-supplied codes cannot be activated. D1 stores keyed hashes, not plaintext credentials. Private credentials are never saved in calculator state or recovery drafts.

The same phone keeps a stable code identity across rotations. Enforce one active pending/accepted request per phone, a 15-minute cooldown and at most three new submissions per rolling 24 hours. Admission and code conditions are checked again in the same transaction that stores the request/proof. Idempotent retries retain the existing immutable response; rotation/revocation does not delete booking records.

Phone binding validates matching input; it is not an OTP or proof of WhatsApp ownership. The website cannot stop somebody manually typing a separate DM. Payment screenshots remain evidence for manual review, not proof that money arrived.

## Receipt boundary

Receipt preparation requires Jessica's signed owner session, CSRF and an accepted booking. Receipt data comes from the accepted booking's service classification, appointment and immutable financial snapshot—not current calculator prices or client-submitted receipt text. DP receipts show DP received and the outstanding balance; only zero-balance receipts say Lunas.

The customer capability is a domain-separated HMAC over the booking UUID. It is carried in the link's fragment and posted to a same-origin, bounded JSON endpoint for retrieval; it is not sent in the HTTP URL or query string. Signature verification happens before D1 lookup. The response exposes only the customer's printable receipt fields, never WhatsApp, payment-proof bytes, Calendar IDs, private access credentials or owner approval tokens. A receipt capability cannot authorize any mutation. Anyone with the full customer link can view that receipt; treat it as a private customer document. Rotating the signing secret invalidates these derived links.

The accepted booking already holds the fixed monetary record; there is no PDF or new invoice table. A later cancellation is displayed as cancelled without claiming a refund. Final settlement/additional payments are not recorded by this change: Jessica must not label an outstanding balance as paid. Any future correction/settlement workflow must preserve audit history rather than silently editing an issued payment record.

All owner/booking/receipt pages have noindex/nofollow and no-referrer, remain outside the five-page sitemap, and have no-store responses. Receipt pages load only local styles/fonts/logo and the small native controller. Print removes actions/help and uses a white A4 document with wrapping identifiers.

## Implementation map

| Surface | Files / routes |
| --- | --- |
| Calculator | `src/PriceList.jsx`, `src/scripts/price-client.js`, `src/order-code.js` |
| Optional lookup / amounts | `src/scripts/order-lookup.js`, `src/order-payment.js`, existing `/book` fields |
| Owner order editor | `src/components/OrderEditor.astro`, `src/scripts/order-editor.js`, `/prices` |
| Public reference API | POST `/api/booking/orders`, `server/order-estimates.js` |
| Owner reference API | POST `/api/booking/order-editor`, same server module |
| Private booking access | `/book/manage`, POST `/api/booking/access`, owner `/api/booking/codes`, `server/booking-codes.js` |
| Printable receipt | `/receipt`, POST `/api/booking/receipt`, owner POST `/api/booking/receipt-issue` |
| Receipt authorization/data | `server/booking-receipts.js`, domain-separated helpers in `server/booking-requests.js` |
| Schema | Additive migrations `0010-booking-access-codes.sql`, `0011-order-estimates.sql` |

## Validation and release

Local suite: 546 passing tests, including real SQLite transactions, signed synthetic Google-owner sessions, nonce/Origin/CSRF/challenge denial, collision/idempotency/expiry/quotas, owner edit conflicts, private-code isolation and accepted-only receipt capabilities. Production build/asset guards also check optional lookup, editable price, local assets and private-page exclusion from sitemap. No real booking or Calendar event was created in these tests.

Isolated browser checks use synthetic customer/order data and mock transport: desktop 1280px, mobile 390px and small phone 320px. They exercise owner editing, latest-version lookup, preservation of typed DP, amount autofill, code generation and receipt/WhatsApp link preparation. They are not physical Android/iPhone tests, live owner authentication, real payment verification or actual WhatsApp delivery. Browser print styles are inspected; printer/Save-as-PDF destination choices are controlled by the customer browser.

Before schema additions, Cloudflare's existing D1 Time Travel UI returned bookmark `00000067-00000000-0000510d-542c8feb251af117955b66761bba1d9b`. This is a recovery checkpoint, not a command to restore or overwrite current customer data. Only additive tables/indexes are authorized. The private Worker must be released before the dependent Pages build; keep its current bindings and public endpoints disabled. Do not enable billing or recreate resources. Verify actual Pages deployment and read-only live routes before marking release complete.

# Owner sign-in fixed — 20 October 2026

**Owner sign-in fix verified live.** Commit `654c02809b84f4b3140dbf596a328b00e8bed337` deployed successfully as `20e97b8b-9e6b-4b24-8af9-04e339ccc112` at 16:52 UTC. At 16:53:20.945 UTC, the public synthetic invalid-signature probe returned the expected 401/AUTH_REQUIRED instead of 503. Actual permitted-owner Google login then succeeded, the protected TEST brief displayed, reload retained the owner session, and authenticated cancellation succeeded and remained cancelled after reload. **0 Calendar events were written; acceptance/Calendar insertion remains unverified.** The combined payment/design/duration/proof/cleanup features remain prepared, uncommitted and unpublished; this was an auth-only release.

## Cause and narrow change

The remaining native Worker incompatibility was `redirect: error`: workerd rejects that RequestInit value before network I/O. JWKS now uses `redirect: manual` and rejects redirects/non-200 responses without following Location; browser-only credentials are omitted, the global receiver is retained and all signature/nonce/owner/CSRF checks remain. The receiver-only fix had not resolved the failure; the final redirect fix is now verified live. Local auth tests pass 22/22. Public-key rejection, actual owner session persistence and authenticated TEST cancellation were verified separately; none establishes a Calendar event insertion.

The fixed destination remains Google's public JWKS endpoint, no incoming cookies/headers are forwarded, JSON/key sizes and timeouts remain bounded, and JWKS/imported keys remain cached. No authentication bypass, Calendar scope, new permission, dependency or billing was added. [Official workerd request constructor](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B#L446-L450).

## Verification boundaries

- Public diagnostic: [sanitized 401 result](evidence/booking-approval/sign-in-fixed.json). Its deliberately invalid signature created no owner session and wrote no event.
- Separate live browser check: the real permitted owner signed in through the existing Google profile; the protected clearly labelled TEST brief displayed and remained accessible on reload. The owner session therefore persisted.
- Separate protected action: the TEST request was cancelled and remained **Dibatalkan** after reload. This used the earlier legacy request/amount; it does not verify the unpublished payment/duration/proof revision.
- Acceptance, Calendar insertion and the full booking flow remain unverified; **0 Calendar writes**. At that historical auth-only checkpoint combined features were unpublished; the booking revision is now live at 31e7ade. Migration 0004 is applied (two CREATEs, no old-row rewrite); receipt cleanup is now deployed with D1/daily cron; first execution is unobserved.

Screenshots are not copied here because they can contain private account/contact information. The public diagnostic file contains no owner identity, private identifiers, credentials, cookies or approval token. No new loading-time, physical Safari or older-Android result is claimed.

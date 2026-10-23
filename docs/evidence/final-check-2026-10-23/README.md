# Final release verification evidence - 23 October 2026

The application source, generated photo collection, responsive images, migrations,
Cloudflare Worker configuration, monthly GitHub workflow and maintained tests were
already committed. This folder adds the remaining audit and restore-fix proof.

The broad audit belongs to source `2e9d852`. The booking restore correction belongs
to `1543b21`; it supersedes the audit's open visual finding. Intermediate captures
remain labelled and must not be presented as the final result.

## Files

- `Chii-final-performance-and-feature-check.md`: historical full audit and limits.
- `chii-final-http-results.json`: eight live routes, 42 initial references, public
  availability, private API rejection and the 100-request bounded live burst.
- `chii-final-local-stress.json`: 500 requests / 20 clients, localhost only.
- `chii-final-ui-results.json`: browser feature observations and synthetic recovery.
- `chii-local-slow-probes.json`: isolated 400 kbps / 400 ms laboratory observations.
- `chii-restore-first-comparison.json`: original and first-pass layout measurements.
- `chii-restore-layout-results.json`: remaining-message diagnosis followed by the
  final desktop/390px/320px captures. The first entry is intermediate; the last
  three entries are the final build, each with zero Book-button movement.
- `chii-restore-final-browser.json`: restored values and receipt, button state,
  frame dimensions and overflow checks at all three final viewport widths.
- `chii-restore-production-check.json`: live HTTP 200 and final layout/noindex markers.
- PNG files: public layout or synthetic local test captures; no customer receipt.

`manifest.json` records the SHA-256 and size of every evidence file above, plus this
index. JSON copies replace ephemeral local Blob URLs with a synthetic marker.
Auth material, cookies, environment files, customer records, local receipt inputs,
dependency folders and generated builds are excluded.

No real booking, approval, cancellation, price edit or Calendar write was performed
in these final checks. Local fixtures are not evidence of a new production
transaction or physical Android/iPhone capacity. Browser timing is not API latency;
local load is not public maximum capacity. No new Lighthouse result was obtained.

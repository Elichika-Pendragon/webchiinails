# Hourly Instagram scraper verification - 23 October 2026

## Confirmed

The production Worker has the active `17 * * * *` trigger, Browser Run binding and separate public-link KV. Cloudflare Observability recorded a naturally delivered scheduled event at **05:17:25 WIB**, `eventType: scheduled`, `outcome: ok`, wall time 22ms, CPU time 0ms, version 2d39bf4d-47c2-4234-a569-31851737cf97. No manual invocation was made before that observation.

The archive timestamp remained 04:34:46 WIB with 279 posts. The code's strict elapsed-hour guard explains this skip: the initial remote integration test was only about 42 minutes earlier. This is an inference from the unchanged state, invocation duration and guard; the old Worker did not log the refresh return value.

A regression test showed the same elapsed-hour check could skip a later natural delivery arriving slightly earlier than the previous one. The guard now deduplicates by UTC hour rather than exact elapsed milliseconds. Duplicate deliveries within an hour still do not scrape. Existing maximum 24 attempts/day and 360-second admission estimate remain. The Worker now logs its small status/count result without credentials, account data or post HTML.

Correction deployed: Worker a0145e1a-3958-43b7-a18e-93db2a039c68, same cron/bindings/private routes. Combined app commit eb896b6; Pages 16284735-3530-4415-b385-b12e50002a88. Combined tests 514 passed.

## Upstream reliability is not yet established

One bounded manual integration execution of the corrected source at **05:21:52 WIB** reached discovery but returned `stale` after roughly 19.8s. It preserved the prior archive; refresh-v1 recorded attempts 2, reservedMs 30000, status stale. The catch handler did not retain the underlying exception, so its precise cause was not established.

A separate read-only diagnostic with the same Browser Run profile/render options then succeeded: HTTP 200, success true, 12 owner-prefixed links, 822612 HTML bytes, 1040.7 browser milliseconds, no detected login-wall phrase. That diagnostic had no KV binding and did not update the production archive. It confirms current anonymous discovery can work, not that the full scheduled path is consistently healthy. No repeated retry loop was run.

The next natural run after the correction is **06:17 WIB**. A successful natural archive refresh under the new version and discovery of a genuinely newly published post remain unobserved. No guarantee of future Meta availability is made.

## Gallery and public profile

Jessica's current anonymous profile showed the same newest three non-pinned IDs as the archive: Ddbohf_TKUi, DdbD7ocz6nT, Ddbps3lz-I2. The saved archive endpoint returns HTTP 200 and 279 links. No new post was present during this check, so a real new-post addition could not be demonstrated. Each new document reads the shared archive when the row enters view, selecting 3 recent + 9 random links; the open document intentionally stays stable.

Evidence is in docs/evidence/instagram-hourly-check/. No booking/Calendar data, billing, credentials, or permissions were changed. No future Codex monitoring automation was created.

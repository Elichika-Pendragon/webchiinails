# Monthly photo release verification — 23 October 2026

Initial implementation: a5e6bd3; deterministic fixture correction: fdb0611.
The first monthly batch was verified locally against ten anonymous public photo
embeds, exporting thirty responsive WebP variants totaling 1,099,956 bytes.
The mixed-carousel parser excludes videos. The 16-photo preview keeps later
URLs inert, with 517 application tests and 11 Python tests passing locally.

The GitHub runner found a random-noise fixture behaved differently on Linux;
the fixture now uses a deterministic gradient. No photo batch was committed by
the failed job.

Hosted verification completed successfully in 50 seconds:
https://github.com/Elichika-Pendragon/webchiinails/actions/runs/39871506806
The hosted job fetched and exported all ten photos, passed the Python and
application suites and build, then pushed generated commit 5d64e50. Cloudflare's
existing Git integration received that automated commit and published it as
https://e5c09a99.chiinails.pages.dev, selected as current production.

Production GET /custom-sets returned 200 with the new catalog and ten deferred
photo entries. A new monthly WebP returned 200 with image/webp. Browser proof
confirmed all four mosaic photos loaded from the monthly collection, 16 gallery
photos total, six enabled gallery sources, ten deferred sources, zero initial
iframes and no horizontal overflow at 1265px. Mobile preview at 375px content
width also had no overflow, held six sources until scrolling, and expanded to
twelve with four still deferred without jumping the scroll position.

The monthly schedule is published: first of the month at 09:43 Asia/Jakarta.
The successful initial run was manually dispatched; a future natural monthly
delivery has not yet occurred. Same-month deduplication and six-month retention
were tested. The automation makes one additional Pages build per successful
monthly photo batch. No Cloudflare token, Meta token, customer record or paid
service was added to the job. Temporary GitHub contents-write access is scoped
to this repository.

The existing hourly scraper's natural 06:17 scheduled invocation was observed:
status fresh, added 0, total 279, worker a0145e1a. KV lastSuccessAt advanced to
2026-10-22T23:17:24.278Z, refresh-v1 status fresh. No manual scraper invocation
was used for this check. A successful fetch with zero additions confirms the
scheduled refresh path; it does not establish ingestion of a newly published
post because none was observed during this check. Evidence is in the adjacent
monthly-photos folder (hourly-0617 checkpoint and scheduled event).

# Duration-based booking starts — 21 October 2026

The owner confirmed that start times advance by the exact selected service duration from 08:00. The merged **Layanan & durasi** selector stays in place. The native **Jam mulai** dropdown, public availability API and new-request validation use the same rule.

| Service / duration | Weekday starts | Weekend starts |
| --- | --- | --- |
| Plain, gel, removal / 1 hour | 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00 | 08:00, 09:00, 10:00 |
| Simple art / 1 hour | 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00 | 08:00, 09:00, 10:00 |
| Simple art / 2 hours | 08:00, 10:00, 12:00, 14:00 | 08:00, 10:00 |
| Full art / 3 hours | 08:00, 11:00 | 08:00 |
| Full art / 4 hours | 08:00, 12:00 | 08:00 |
| Full art / 5 hours | 08:00 | None |

All times are WIB. These are candidate starts, subject to elapsed time, real occupancy and day closure. Occupied candidates stay visible, disabled and labelled **tidak tersedia**. A busy interval removes availability without shifting the remaining starts. Weekday/weekend closing times remain 17:00/12:00, regular Last book remains 14:00/10:00, and Full Art's 12:00 limit remains a ceiling. Every interval must finish before closing.

New off-cadence starts are rejected on the server before Calendar I/O or a new storage write. Stored bookings created under the previous half-hour rule retain their original interval, exact idempotent retries, owner review/acceptance and Calendar reconciliation. Trusted snapshot validation explicitly retains that historical cadence without changing event IDs, payload versions or v1/v2/v3 fingerprints. Availability and final acceptance still compare entire intervals; atomic 30-minute storage claims remain independent of the customer-facing start interval.

## Verification

- Exact release checkout: **267/267 tests passed**; production-SITE_URL build and privacy/asset guards passed.
- Tests assert every weekday/weekend candidate for all six service/duration choices, block non-cadence requests, preserve old 08:30 requests/fingerprints, cover real overlap and touching boundaries, and retain stale-response/polling/concurrency checks.
- Local isolated browser: 4-hour weekday dropdown contained only 08:00–12:00 and 12:00–16:00. A synthetic 10:00–12:00 busy interval disabled the first. The 390px mobile 3-hour dropdown contained only 08:00–11:00 and 11:00–14:00; controls remained 50px tall with no horizontal overflow. No real booking or Calendar event was created.
- Booking script import graph: 16,912 B gzip; public pages unchanged at 5,022 B each. Whole-build JavaScript: 57,033 B raw / 21,520 B gzip, six files, no emitted React runtime or hydration. Size estimates are not load-time measurements.

No package, database migration, account permission, billing change or new login is required. Native receipt-chooser end-to-end completion and real Calendar insertion retain their previously documented verification boundaries. Publication and live API evidence will be recorded after deployment.

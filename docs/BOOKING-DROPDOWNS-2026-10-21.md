# Booking dropdown simplification — 21 October 2026

The booking form combines the previous design-category and duration fields into one required **Layanan & durasi** dropdown. Its six choices are Plain/gel/removal (1 hour), Simple art (1 or 2 hours), and Full art (3, 4 or 5 hours). Simple art / 2 hours remains the default; customers choose the duration agreed during consultation.

**Jam mulai** is a native dropdown. Each option shows its complete start–end interval in WIB. The choices update when service, duration or date changes and use the existing live availability API. Occupied and elapsed candidates remain visible, disabled and labelled **tidak tersedia**. Missing dates have a date prompt; impossible durations have a separate no-fitting-time message. Full Art retains its 12:00 latest-start cap and must finish before closing, including the earlier weekend closing time.

The combined value is a UI detail: strict validation maps only the six known choices back to canonical `designType` and digit-string `durationMinutes`. Neither API contracts nor existing booking records change. Invalid combined choices cannot fall back to a default, request availability or submit. Stale responses are ignored; loading/errors block Book. Quiet 45-second updates reuse native option nodes and retain valid choices and keyboard focus. A newly occupied selected time is cleared. Book and owner acceptance still check the full interval again, and acceptance retains its atomic double-book protection.

No new package, framework runtime, font or third-party dropdown is added. The existing theme, calendar, payment/proof flow and unlisted route are preserved. Obsolete grid/button CSS and controller work are removed.

## Verification

- Full release-checkout suite: **263/263 passed**. After the final contextual-placeholder adjustment, all **41/41 client tests passed** again.
- Production-SITE_URL build and static form/privacy/asset guards passed. No React hydration/runtime is emitted.
- Local isolated browser fixture: desktop 1280px and mobile 390px/320px inspected. Native controls are 50px tall with 16px text; no horizontal overflow. Plain selects one-hour intervals; Full Art / 5 hours ends at 17:00 for its weekday 12:00 final start. A weekend five-hour choice has no fitting start and leaves Book disabled. Fixture occupancy correctly disables overlapping intervals.
- Existing tests cover all six choices, malformed values, service/date races, unavailable options, quiet refresh, current-choice clearing, validation and unchanged canonical submissions.
- Booking JavaScript import graph: **16,891 B gzip**, down from the preceding release's 16,945 B. Public pages remain **5,022 B** each. Whole-build JavaScript is 57,008 B raw / 21,500 B gzip across six files. These are deterministic size estimates, not loading-time measurements.

No real customer request, WhatsApp message or Calendar event was created for this UI revision. Existing end-to-end limitations remain documented in [the combined booking report](BOOKING-RELEASE-2026-10-21.md): native receipt-chooser completion and Calendar insertion are not newly verified. Final publication evidence is recorded separately after Cloudflare reports success and exact production artifacts match this build.

# Live calendar dates and available times — 21 October 2026

Any active all-day event in Jessica's Nail Art Calendar closes its dates, including events marked Free. Jessica only needs to add the all-day event. Multi-day events use Google's exclusive end date, mapped to WIB. Cancelled events do not close dates; ordinary timed Free events retain their normal free/busy meaning.

The mini calendar now reads a service-specific month summary before permitting date selection. A dark date has no remaining duration-fitting future start for that service, including full-day closures, booked intervals and uncertain in-flight claims. Bounds, duration-based start spacing, Full Art's cutoff and studio closing times still apply. Closed dates remain keyboard-readable with an explicit “tidak tersedia” label; click, Enter and Space cannot select them. Loading/error states prevent selection and provide an explicit retry. Current selection and customer details are retained without silently picking a different date.

The time dropdown shows available intervals only. A confirmed 08:00–10:00 booking on 30 October removes overlapping starts; a two-hour customer sees 10:00, 12:00 and 14:00 while those remain free. Different durations apply full-interval overlap checks. When every legal start is occupied, that date becomes dark for the selected service. Removing the Calendar event reopens availability on refresh; the exact-date route still verifies deletion before releasing stored accepted claims.

## Refresh and resource boundaries

- The existing visible, idle 45-second timer refreshes the displayed month and selected date. Hidden/departed pages stop polling; visibility return checks again. Image processing and submission pause polling. Opening the page or changing month/service checks the relevant summary; unchanged summaries are cached for 45 seconds by month, service and duration.
- One month-summary request replaces 28–31 individual date requests. It returns only month/service identifiers, clipped date bounds and closed dates. It performs one bounded read of uncertain in-flight slot claims and no ledger mutation or per-accepted-event lookup. Confirmed occupancy comes from Google; exact-date and final decision checks retain authoritative stored-claim protections.
- Google occupancy combines free/busy with a filtered event-list query for all-day dates. The first requests run together using shared authorization; recurrence pagination is bounded. No titles, contacts, descriptions or event IDs are requested by this new event-list query. Errors and malformed/partial responses fail closed.
- Stale month/service/date responses cannot restore closed dates or occupied times. Unchanged options, day buttons and keyboard focus are preserved where valid. Submission and acceptance still recheck availability and claim the actual interval atomically; a screen snapshot never reserves a booking.

## Verification

The exact release-checkout suite passes **310/310**, including 55 client-controller tests, 9 date-grid tests, 34 provider tests and coupled Calendar/ledger cases. The coupled tests prove Free all-day closure blocks month/date/Book/accept; October 30's 08:00–10:00 interval is occupied; filling all legal starts closes the date despite an unused closing-hour gap; deleting one event reopens only the released interval. No real booking or Calendar write was made for these tests.

Production-SITE_URL build and static asset/privacy guards pass. Local desktop 1280px and mobile 390px checks show October 24 dark with `aria-disabled=true`; October 30's two-hour dropdown omits 08:00–10:00. Mobile date/time controls are 44px/50px tall with no horizontal overflow. Public page JavaScript stays 5,022 B gzip; `/book` is 18,083 B gzip. These are size/layout checks, not real-device loading-time measurements.

This revision requires no new account, credential, permission, package, migration or paid plan. Native receipt chooser submission and actual Calendar insertion retain their previously documented live-test boundaries. Deployment and public endpoint verification are recorded by the release operator after publication; code and this report are released together.

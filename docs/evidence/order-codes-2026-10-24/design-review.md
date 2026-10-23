# Order references and receipts design review

24 October 2026 · Disposition: **ship**. No material design fixes required.

## Scope and evidence

Ordinary extension of the existing Chii Nails identity. Reviewed the receipt direction contract, PRODUCT.md, DESIGN.md and docs/ORDER-CODES-AND-RECEIPTS.md against src/receipt.css, src/order.css, src/components/OrderEditor.astro, src/pages/book.astro, src/pages/receipt.astro, src/scripts/order-lookup.js, src/order-payment.js, src/scripts/order-editor.js and src/scripts/approval-receipt.js. The supplied review verdict is ship; this documentation pass agrees with its visual scope.

Inspected all ten supplied synthetic-data captures in this folder:

- receipt-desktop.jpg and receipt-mobile.jpg: clear logo/title, reference/status, customer/appointment, service and aligned financial hierarchy; wrapping mobile metadata and one explicit print action.
- book-mobile.jpg and book-payment-mobile.jpg: optional reference below WhatsApp, visible lookup feedback and estimate; existing payment mode/total/DP presentation. Source preserves entered DP and amounts changed during a lookup.
- owner-desktop.jpg, owner-small-phone.jpg and owner-edit-mobile.jpg: separate order section, wrapping search controls, native choices and save/reload actions; source retains the same reference and reports revisions.
- approval-mobile.jpg: accepted booking with receipt action and explicit manual WhatsApp-send guidance. Source prepares the native wa.me link only for accepted bookings.
- calculator-desktop.jpg and calculator-mobile.jpg: saved reference actions fit the existing estimate disclosure and service menu.

## Design record

The white/blush/rose palette, supplied logo and existing typography remain intact. The receipt is a document surface; its DM Sans title and body do not establish a new site-wide type system. The existing payment widget is a preservation constraint. Public saved references, private booking access and owner approval remain separate. Browser print CSS uses white A4 paper, 18mm margins and hides screen controls/help. The existing logo provenance remains recorded in DESIGN.md; no new or replaced raster asset is involved.

Refined only DESIGN.md's new 24 October section to reflect debounced optional lookup, protected typed payments, owner revision feedback, manual accepted-booking receipt sharing and responsive/print hierarchy. Replaced the unevidenced phrase "tabular amounts" with "right-aligned amounts"; no CSS change was made. No sidecar or system regeneration is warranted for this narrow extension.

## Limits and disposition

This pass inspected supplied captures and source; it did not run a browser, tests, print preview, physical printer, Save-as-PDF destination, live owner authentication, production deployment or WhatsApp delivery. Payment-widget preservation is supported by the stated implementation/review scope and current markup/captures; this pass did not independently compare historical markup. Server authorization claims rely on the supplied implementation documentation and review, rather than a new security audit. No requested capture was missing.

No unrelated historical DESIGN.md format/token drift was repaired or canonized. Existing scanner warnings about dynamically populated payment-proof images are outside this extension's design documentation scope and are not promoted to design rules. Application code, production, secrets and unrelated files were untouched.

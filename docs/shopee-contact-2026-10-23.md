# Shopee contact option

The contact panel includes “Checkout Our Shopee”, linking to the owner-supplied https://id.shp.ee/1isrkeoe (verified redirect to https://shopee.co.id/chii.shoppu). It opens a new tab with noopener noreferrer.

Logo: Shopee brand silhouette from Simple Icons, https://github.com/simple-icons/simple-icons/blob/develop/icons/shopee.svg. The SVG is self-hosted at public/images/shopee.svg and recolored to the existing contact-icon brown (#775759). Original vector path retained; 1,222 bytes. No third-party logo request is made by visitors.

Built-page desktop and 390px viewport checks confirmed all three contact options remain visible, the logo loads, and the page does not overflow horizontally. Existing panel scrolling covers shorter screens. Production build/asset checks passed; browser JS 29,409 gzip bytes, no React runtime. Combined suite with the hourly guard regression: 514 passing tests.

Production: eb896b6 / Pages deployment 16284735-3530-4415-b385-b12e50002a88. Verified live text, supplied destination link and rendered logo; proof in docs/evidence/shopee-contact/live-panel.png.

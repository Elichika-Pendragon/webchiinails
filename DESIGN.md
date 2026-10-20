# Chii Nails interface conventions

This records the existing website and the owner-approved refinement on 20 October 2026. It is a website, with static Astro HTML and a small native browser controller. Keep the white, blush and rose identity, Cormorant Garamond headings, DM Sans body text, factual copy, images, and consultation-first booking destinations.

## Shape and layout

- `--radius-control: 8px`: rectangular buttons, menu/close controls and skip link.
- `--radius-card: 12px`: service, price, hours, reminder, contact and destination panels; rule disclosures and hero caption.
- `--radius-media: 16px`: hero photographs, gallery cards, studio photographs and map frames.
- `--radius-panel: 20px`: floating contact panel. Keep the established circular slider buttons and pill-shaped chat/page-tab controls.
- Clip pictures inside their own frames. Keep adjacent focus indicators visible. Hero and post links use an inset keyboard outline where their container clips imagery.
- Keep the compact header: 76px desktop / 64px mobile and tablet; collapse navigation at 960px. Mobile content and five page tabs still switch at 720px. Desktop retains the scrolling Home; mobile retains separate detail routes.
- Header logo legibility: display the square logo inside a 96×64px desktop frame and an 80×52px compact frame using `object-fit: cover`. Crop only surplus pink margins, preserving the complete artwork and original proportions. This makes the visible mark approximately 50% larger than the earlier square display boxes, without increasing header height.
- Original branding supplied later on 20 October: archive `docs/source-assets/chii-nails-original.png` (2000×2000, 187,965 bytes). Header and gallery profile share `public/images/logo-brand.webp`, a 288×288, 15,486-byte lossless WebP export after proportional Lanczos resizing. The header uses `object-position: 50% 36%` to center the actual artwork within its pink margins. The export replaces the former 176px / 3,018-byte logo in these uses; the +12,468-byte quality tradeoff adds no JS or extra per-page logo URL. Never serve the original PNG in the header. Figma sync remains deferred.

## Interaction

Unavailable booking dates use a soft gray background (`#f0f0f0`) and muted gray numerals (`#777`), including hover and pressed states. They remain disabled with the existing keyboard focus indicator; selected available dates retain the rose treatment.

Use at least 44 × 44 CSS pixels for the main standalone controls and mobile page tabs, with full-row native disclosure summaries. Preserve inline text links within prose. Keep the secondary booking-rules link on its own centered row below the main CTA.

Menu is a disclosure, not a modal: normal Tab navigation remains available. Close it on outside pointer input, focus leaving its controls, Escape, selecting a destination, or crossing the 960px breakpoint. Escape returns focus to Menu. Opening the contact panel closes Menu and moves focus to the contact close control; closing it with Escape or its close button returns focus to the chat trigger. The existing nonmodal contact region permits normal keyboard navigation.

Retain native vertical/horizontal scrolling and slider arrow controls. Do not intercept touch gestures or add carousels/animation packages. Hover treatments apply only to a fine pointer that supports hover. Touch controls have a restrained pressed color; keyboard focus keeps a 3px rose outline, including when a contact link is hovered. Do not animate noninteractive price cards.

Respect reduced motion, safe-area insets and short viewport heights. Keep `100vh` before `100dvh` and the older MediaQueryList listener fallback. Keep browser zoom enabled. No new visual blur, backdrop filters, font downloads, image assets, or runtime dependencies are needed for this refinement.

Page navigation uses a calm, 200ms opacity-only native cross-document View Transition when supported and reduced motion is not requested. The former 4px hero entrance is removed so changing Home, Services, Custom sets, Visit or About never replays that upward movement. Header, mobile page tabs and chat each receive one unique transition name; their group geometry does not animate, their old snapshots are suppressed, and their new snapshots remain fully visible without a fade. For the remaining page, the outgoing snapshot stays opaque beneath the incoming snapshot, which fades from zero to full opacity with a decelerating ease. Both use normal blending, keeping the page covered throughout the transition without relying on the browser's additive crossfade blend. No root/body translation, navigation delay, client router, content-hiding preparation or scroll reset is added. An ordinary primary activation of the already-current mobile tab is a no-op; modifier keys, middle clicks and new-tab targets retain native behavior.

This is progressive enhancement for same-origin full-document navigation: supported Chrome 126+ and Safari 18.2+ can use the fade, while older browsers retain normal page navigation. Reduced-motion visitors use normal navigation without this transition. Desktop same-page hash links, browser Back/Forward, the separate mobile routes and the existing pink theme remain native and unchanged. Browser support does not establish performance on physical older Android devices or Safari; final release evidence must state the browsers actually inspected. Implementation references: [Chrome cross-document View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document) and [WebKit features in Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/).

Local in-app Chrome inspection at a 390px viewport observed a transient 390px document scroll width during the native fade while the classic vertical scrollbar left a 375px client width; after the fade, both widths were 375px. The header and tab bar stayed approximately 374.67px wide. The root now uses `overflow-y: scroll` and `scrollbar-gutter: stable` to reserve the classic scrollbar consistently across page snapshots. Older browsers can ignore the gutter property and retain native vertical scrolling; overlay scrollbars need no extra reserved width. Horizontal overflow is not hidden. This addresses the measured transient and does not establish it as the sole cause of the movement in the user's recording. Navigation QA must await the destination URL and the end of `:active-view-transition` before activating the next tab.

## Platform references and verification limits

Apple's [accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection), [layout](https://developer.apple.com/design/human-interface-guidelines/layout), and [motion](https://developer.apple.com/design/human-interface-guidelines/motion) inform comfortable targets, visible focus, adaptable layout and restrained motion. Our 44px web target is a design choice; it is not an Apple certification or a claim that CSS pixels and native points are identical.

Chrome responsive checks and a constrained-4G/6× CPU slowdown benchmark are laboratory proxies. No physical older Android, Indonesian carrier measurement or Apple-device Safari test is claimed. The same lightweight HTML/CSS/native-control approach serves Android and Apple browsers. See [PERFORMANCE.md](PERFORMANCE.md) and [RELEASE-REPORT.md](RELEASE-REPORT.md) for actual results and limits.

Figma synchronization is deferred at the owner's request. Preserve these tokens, source and screenshots for the later sync; do not claim the Figma file already includes this refinement.

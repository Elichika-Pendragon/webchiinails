# Chii Nails interface conventions

This records the existing website and the owner-approved refinement on 20 October 2026. It is a website, with static Astro HTML and a small native browser controller. Keep the white, blush and rose identity, Cormorant Garamond headings, DM Sans body text, factual copy, images, and consultation-first booking destinations.

## Shape and layout

- `--radius-control: 8px`: rectangular buttons, menu/close controls and skip link.
- `--radius-card: 12px`: service, price, hours, reminder, contact and destination panels; rule disclosures and hero caption.
- `--radius-media: 16px`: hero photographs, gallery cards, studio photographs and map frames.
- `--radius-panel: 20px`: floating contact panel. Keep the established circular slider buttons and pill-shaped chat/page-tab controls.
- Clip pictures inside their own frames. Keep adjacent focus indicators visible. Hero and post links use an inset keyboard outline where their container clips imagery.
- Keep the compact header: 76px desktop / 64px mobile and tablet; collapse navigation at 960px. Mobile content and five page tabs still switch at 720px. Desktop retains the scrolling Home; mobile retains separate detail routes.

## Interaction

Use at least 44 × 44 CSS pixels for the main standalone controls and mobile page tabs, with full-row native disclosure summaries. Preserve inline text links within prose. Keep the secondary booking-rules link on its own centered row below the main CTA.

Menu is a disclosure, not a modal: normal Tab navigation remains available. Close it on outside pointer input, focus leaving its controls, Escape, selecting a destination, or crossing the 960px breakpoint. Escape returns focus to Menu. Opening the contact panel closes Menu and moves focus to the contact close control; closing it with Escape or its close button returns focus to the chat trigger. The existing nonmodal contact region permits normal keyboard navigation.

Retain native vertical/horizontal scrolling and slider arrow controls. Do not intercept touch gestures or add carousels/animation packages. Hover treatments apply only to a fine pointer that supports hover. Touch controls have a restrained pressed color; keyboard focus keeps a 3px rose outline, including when a contact link is hovered. Do not animate noninteractive price cards.

Respect reduced motion, safe-area insets and short viewport heights. Keep `100vh` before `100dvh` and the older MediaQueryList listener fallback. Keep browser zoom enabled. No new visual blur, backdrop filters, font downloads, image assets, or runtime dependencies are needed for this refinement.

## Platform references and verification limits

Apple's [accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection), [layout](https://developer.apple.com/design/human-interface-guidelines/layout), and [motion](https://developer.apple.com/design/human-interface-guidelines/motion) inform comfortable targets, visible focus, adaptable layout and restrained motion. Our 44px web target is a design choice; it is not an Apple certification or a claim that CSS pixels and native points are identical.

Chrome responsive checks and a constrained-4G/6× CPU slowdown benchmark are laboratory proxies. No physical older Android, Indonesian carrier measurement or Apple-device Safari test is claimed. The same lightweight HTML/CSS/native-control approach serves Android and Apple browsers. See [PERFORMANCE.md](PERFORMANCE.md) and [RELEASE-REPORT.md](RELEASE-REPORT.md) for actual results and limits.

Figma synchronization is deferred at the owner's request. Preserve these tokens, source and screenshots for the later sync; do not claim the Figma file already includes this refinement.

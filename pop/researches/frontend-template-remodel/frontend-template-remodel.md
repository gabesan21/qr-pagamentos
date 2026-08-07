# Frontend template remodel recon

## Established current state

- The production application remains a Next.js App Router, React 19, Tailwind CSS 4, pnpm application whose server components resolve authorization, locale, and domain projections before rendering; browser boundaries stay narrow and interaction-specific.
- The current frontend contract is distributed across `DESIGN.md`, `src/design-system/`, `src/components/ui/`, `src/app-shell/`, `src/data-directory/`, `src/brand/`, `src/i18n/`, the route tree under `src/app/`, and the frontend-facing specs in `pop/specs/`.
- The application already persists exactly six theme identifiers: `pix-paper`, `cashier-daylight`, `settlement-sand`, `midnight-clearing`, `vault-blue`, and `terminal-amber`; remodelling their values is frontend work, while removing or renaming identifiers would cross into stored application contracts.
- Existing role separation, owner authorization, native POST targets, opaque outcomes, keyset directory URLs, exact-decimal money, V1/V2 compatibility, public rate limits, media identifiers, checkout polling, cart persistence, redaction, and bilingual unprefixed routes remain authoritative behavior.
- The current public surface includes `/store/[slug]` and `/store/[slug]/pay` in addition to the payment-link checkout, and these routes need remodel coverage even though the supplied template does not design them.

## Template evidence

- `docs/template/app/src/App.tsx` defines the shared login/reset flows, nine administrator routes, sixteen merchant routes, and `/pay/:identifier`, with page implementations matching those route families.
- The template is a Vite 7, React Router 7, Tailwind CSS 3 client application backed by mock/local-storage state; it is a visual and interaction reference, not a runtime or data-access implementation to transplant.
- Its visual language uses Inter for body copy, Sora for display copy, IBM Plex Mono for money and identifiers, a 14/20 body rhythm, compact 6/8/10-pixel radii, a 1280-pixel application width, a 248-pixel desktop rail, a 56-pixel top bar, semantic elevation, visible focus, reduced motion, and responsive authenticated/auth/public shells.
- Its six theme palettes reuse the production identifiers and define semantic page, surface, border, text, accent, status, focus, and elevation values; the template currently expresses them as authored CSS variables rather than the production DTCG/projection pipeline.
- The template provides seventeen SVG assets, sixteen application-specific reusable components, and a broad generated shadcn inventory; only the components that are demonstrably consumed should enter the production-owned component inventory.
- Data-driven surfaces model loading, ready, empty, filtered-empty, unavailable, validation, request error, success, retry, pending, confirmation, and terminal states as applicable; directories also model search, filter chips, page size, and pagination.
- The template covers the intended administrator, merchant, authentication, and V1/V2 payment-link journeys, including MFA, account lifecycle, settings, catalog/media interaction, link lifecycle, comments/local outcomes, PIX QR/copy, polling, and bilingual content.
- The template has no `/store/[slug]` or `/store/[slug]/pay` design. Its merchant storefront shortcut incorrectly points the store slug at `/pay/:identifier`, so that behavior cannot be copied.

## Planning boundaries

- The template determines presentation, composition, interaction feedback, and responsive behavior; existing specs and server contracts determine business rules, authorization, data ownership, data precision, security, and mutation semantics.
- The migration must rebuild the existing token generator, `DESIGN.md`, owned components, shells, and route surfaces rather than layering a second CSS/component system over the old one.
- The existing `pop/specs/administrative-design-system.md` is scoped to and materially conflicts with the previous visual direction; the remodel needs a new application-wide frontend design-system spec that formally supersedes the old visual contract while leaving historical epoch and memory artifacts intact.
- API/backend work is not a default phase. A narrow contract task is justified only when a route task proves that exact template functionality cannot be expressed through an existing redacted projection, native mutation, or public endpoint.
- Focused additions such as motion, chart, QR, or component packages must be justified by actual template usage; the template manifest must not be copied wholesale.
- Every migrated route family needs evidence across both locales, all six themes where applicable, representative widths including 320, 375, 768, and 1440 pixels, keyboard/focus behavior, WCAG 2.2 AA, and all applicable page states.
- Shared write lanes include `package.json`/`pnpm-lock.yaml`, `DESIGN.md`, `src/app/globals.css`, token/brand generators, `src/components/ui/`, `src/app-shell/`, shared dictionaries, and the evidence inventory; domain route migrations can parallelize only after those foundations stabilize.

## Recommended epoch structure

1. Freeze the template parity contract and application-wide frontend spec.
2. Rebuild tokens, typography, assets, primitives, responsive compositions, and the design-system specimen.
3. Rebuild the role shells and shared authentication/recovery journeys.
4. Remodel the complete administrator surface.
5. Remodel the complete merchant surface.
6. Remodel payment-link checkout, public storefront/cart, and standalone payment.
7. Remove obsolete visual sources and prove route/state/locale/theme/viewport parity without backend regressions.

## Dependencies and forks

- The parity contract precedes the token/component foundation; all route-family work depends on that foundation, while final cleanup and evidence depend on every consumer migration.
- If the professional source includes omitted storefront or standalone-payment references, use them; otherwise their layouts require explicit authorization to extrapolate the established template language.
- If the supplied logo and illustrations replace the current canonical identity, the brand provenance/generator contract must be deliberately superseded; otherwise reuse the current identity inside the new layouts.
- If exact typography is approved, use licensed self-hosted Sora, Inter, and IBM Plex Mono sources rather than the template's Google Fonts runtime dependency.
- If template interactions request unavailable analytics, total-count pagination, arbitrary sorting, new media purposes, or new mutations, preserve the current behavior unless a separately approved contract change proves necessary.
- Pause the epoch if exact parity would weaken role/owner/security/redaction/exact-decimal contracts, replace the fixed framework stack, require unapproved font or asset rights, or depend on an unresolved design gap.

## Decisions and unresolved checks

- Decided on 2026-08-02: the frontend remodel is Epoch 12 and the unmaterialized pre-production hardening proposal moves to Epoch 13.
- Decided on 2026-08-02: the epoch itself is not yolo; each phase is independently yolo so the user can authorize one or several phases at a time.
- Confirm whether `docs/template/app/src/` is the complete visual authority or whether an omitted `design.md`, design file, or screenshot set must also be ingested.
- Decided on 2026-08-02: public storefront and standalone-payment pages must extrapolate the supplied template language where dedicated template pages are absent.
- Confirm whether the template logo/illustrations replace the current official brand family and whether all supplied assets are approved for production use.
- Confirm that Sora, Inter, and IBM Plex Mono are approved for self-hosted production use and that focused UI dependency additions are permitted.
- Define the authoritative browser, viewport matrix, and visual-difference tolerance for the meaning of exact parity.

# App shell visual review

- Run: `20260724053533`
- Manifest SHA-256: `b0d5183e4140bf66e1006c3cc87071a7785f8e35d7932f9f69f212f37215eaba`
- Reviewed: both roles at 320, 375, 768, and 1440 across all six themes,
  plus both mobile-open states.
- Result: approved. The final semantic layer-token repair preserves the
  reviewed responsive shell layouts without clipping, overlap, or navigation
  regressions. Every base case also records that the first-tab skip link is
  visible, has the semantic two-pixel focus outline, wins center-point hit
  testing above fixed chrome, and activates the main-content target.
- Findings at severity two or above: none.
- shadcn preflight: pinned local `shadcn 4.13.0 info` completed successfully
  and reported Next.js 16.2.10, React Server Components, Tailwind CSS v4, the
  Radix/nova style, preset `b5aq`, and the existing Lucide component inventory.
  `shadcn docs button` resolved the official component documentation and
  example URLs. No registry source was added or changed.

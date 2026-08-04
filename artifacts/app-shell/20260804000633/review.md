# App shell visual review

- Run: `20260804000633`
- Manifest SHA-256: `57ea9f0414c8554bd39e2ea7943b97b7e1253f9daa094b17a3dfc95983bc1f44`
- Reviewed: both roles at 320, 375, 768, and 1440 across all six themes,
  plus both mobile-open states.
- Result: approved. The rebuilt shell reproduces the template rail, top bar,
  account menu, language switcher, and footer geometry without changing
  authorization, session, or locale contracts. Every base case records that the
  first-tab skip link is visible, has the semantic focus outline, wins
  center-point hit testing above fixed chrome, and activates the main-content
  target. Navigation keeps five entries per role, one aria-current marker, and
  only one responsive copy in the accessibility tree.
- Findings at severity two or above: none.
- shadcn preflight: pinned local `shadcn 4.13.0 info` completed successfully
  and reported Next.js 16.2.10, React Server Components, Tailwind CSS v4, the
  Radix/nova style, preset `b5aq`, and the existing Lucide component inventory.
  `shadcn docs button` resolved the official component documentation and
  example URLs. No registry source was added or changed.

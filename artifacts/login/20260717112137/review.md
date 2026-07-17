# Login evidence review — run 20260717112137

- **Run ID:** 20260717112137
- **Manifest:** `artifacts/login/20260717112137/manifest.json`
- **Manifest SHA-256:** `a99281f0cd2e41afbedba77e8166db57684d9d11513567ba70d958c054ac95f8`
- **Reviewer:** agent (ui-review loop, screenshot → vision)
- **Date:** 2026-07-17

## Scope

All eight manifest captures (`login-{light,dark}-{320,375,768,1440}.png`) were
inspected visually; per-capture measurements, keyboard traversal, recovery
state, and axe results were read from `assertions.json` (hash-bound by the
manifest).

## Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | 1 | The page shows no product wordmark, only the `Entrar` credential card. Recognition is still immediate (single-purpose page, dictionary-owned heading) and the plan authorized exactly this restrained card composition. | Accepted; no change required in this task. |
| 2 | 1 | At 320 px the card nearly reaches the viewport edges, but horizontal padding and no-overflow assertions hold in both themes. | Accepted; matches the shared layout token behavior. |

No unresolved severity 1 finding blocks release; there is no severity 2+
finding, open or otherwise.

## Checklist (pass/fail with evidence)

- Composition/hierarchy: PASS — title, introduction, labels above native
  fields, single primary action in the footer, in both themes at all widths.
- Contrast/theme: PASS — dark mode maps background/card/foreground/primary
  tokens correctly; the primary action keeps legible contrast on mint at all
  widths.
- Responsive: PASS — no horizontal overflow at 320/375/768/1440; the card
  centers vertically and horizontally.
- Keyboard: PASS — Tab order is username → password → submit in every
  combination; every stop is `:focus-visible` with a visible 2px ring.
- Targets: PASS — both inputs and the submit button measure 44px height.
- Labels/autofill: PASS — one native label per control, `username` /
  `current-password` autocomplete, password type, required attributes.
- Recovery: PASS — `?error=invalid-credentials` shows only the generic
  pt-BR `role="alert"` message in every combination; axe reports no
  serious/critical violation on default or recovery states.
- Hygiene: PASS — no console errors, no page errors, no external requests,
  IBM Plex Sans is the rendered body font.

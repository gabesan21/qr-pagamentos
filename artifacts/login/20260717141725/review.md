# Login evidence review

- **Run:** `20260717141725`
- **Manifest SHA-256:** `a4e69aca5244f9017344d0a57384c97dd1cacfe18b7083ed31fdd824d756962f`
- **Reviewed:** 2026-07-17

All eight light/dark captures at 320, 375, 768, and 1440 CSS pixels were
inspected. The restrained credential card remains centered and legible, with
labels above controls, one primary action, consistent local IBM Plex type, and
no clipping or horizontal overflow. Both theme mappings preserve hierarchy and
visible control boundaries at narrow and wide sizes.

The bound assertions confirm username/password semantics, 44px controls,
ordered keyboard focus with visible rings, generic recovery copy, no external
requests or browser errors, and no serious/critical axe findings. The same fresh
browser run delayed the native `/login/submit` POST and observed busy text,
spinner, `aria-busy`, and disabled state for both click and Enter without
intercepting native submission. Final severity: 1. All S2-S4 findings are
resolved.

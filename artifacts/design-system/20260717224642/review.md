# Design-system visual review

- **Run:** `20260717224642`
- **Manifest SHA-256:** `44471dd578001af850bcd2d41430aaf8ea4e0d5cef956871baa8a23b5b1d6b6a`
- **Reviewed:** 2026-07-17

All eight light/dark captures at 320, 375, 768, and 1440 CSS pixels were
inspected. The `specimen-pending` section now visibly represents an active
native key submission: the submitted action shows its localized pending label
and spinner, while the password input, submitted action, and competing webhook
completion action are all disabled. The state remains legible without overflow
and no key value or credential revision is rendered.

The bound assertions record `aria-busy="true"`, one spinner, three disabled
scoped controls, and exactly one `/nautt-credentials` request after two submit
attempts in every viewport/theme capture. The separate browser regression proves
the same single-request lock for `/nautt-credentials/register`. Axe reports no
serious/critical finding. Final severity: 1; all S2-S4 findings are resolved.

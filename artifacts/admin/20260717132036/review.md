# Admin evidence review

- Run: `20260717132036`
- Manifest SHA-256: `d8409576ab620792ad8a3324c25c1b8987153d531f7c8e9689892d2526452546`
- Reviewed: 2026-07-17

## Coverage

All eight fresh captures were inspected: light and dark at 320, 375, 768, and
1440 CSS pixels. Each capture includes the populated account state, successful
mutation notice, account facts and actions, BRL/PIX settings, locale control,
navigation/logout, and the inline administrator-demotion warning.

The bound assertions traverse all 18 initial focus stops in DOM order for every
viewport/theme pair. They also use only the keyboard to select demotion, open
confirmation, verify focus handoff to Cancel, reach Confirm, submit and observe
the protected recovery result, reopen, cancel, and verify focus restoration to
the destructive trigger.

## Findings

- Hierarchy and density remain legible from the ruled receipt header through
  create, account, settings, and locale sections. No nested-card or repeated
  dashboard-grid pattern is present.
- No text, control, warning, or account fact is clipped. The 320px capture stays
  one-directional and has no document-level horizontal overflow.
- Light and dark status, warning, border, focus, and action roles remain
  distinguishable without color-only meaning. The warning uses an explicit
  title, consequence copy, cancel, and confirm actions.
- The focused Cancel action is visibly outlined after the destructive trigger
  is replaced. Full traversal, confirmation, cancellation, recovery, and focus
  restoration pass in every bound result; no focus loss or trap remains.
- English copy is complete in the authenticated run. Dictionary parity and all
  named localized states are covered by deterministic `pt-BR` and `en` tests.
- The account actions are vertically generous on narrow screens and compact
  without crowding at 768/1440. Labels remain visible above every field.

All Nielsen, WCAG, and visual severity 2–4 findings are resolved. No severity 1
finding requires a scoped change.

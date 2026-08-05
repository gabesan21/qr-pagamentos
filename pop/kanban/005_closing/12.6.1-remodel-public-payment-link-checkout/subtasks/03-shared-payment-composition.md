# 03 — Shared payment composition inventory

## Context

The checkout journey uses `QrDisplay`, `CopyField`, `MoneyText`, and `StatusBadge` from `src/components/ui/`. These primitives were stabilized by task `12.2.3` and must not drift.

## Goal

Confirm the shared inventory satisfies the checkout remodeling and extend it only additively when a genuine insufficiency exists.

## Work

1. Map each checkout state to the shared inventory:
   - QR image + pending skeleton → `QrDisplay`
   - PIX copy-paste code → `CopyField`
   - Amount and currency label → `MoneyText`
   - Payment/terminal badges → `StatusBadge`
2. Identify any checkout-only prop needs (for example, an optional caption slot on `QrDisplay` or a destructive terminal variant on `StatusBadge`).
3. If a change is needed, extend the shared component in the smallest additive way and update `src/components/ui/inventory.json` with the new prop, state, and a one-line insufficiency finding.
4. If no shared change is needed, document the reuse decision in the task notes and keep the components untouched.
5. Verify `scripts/check-shared-ui-inventory.mjs` still passes.

## Boundaries

- Do not create a second button, badge, or QR style.
- Do not weaken the existing prop contracts of other routes.

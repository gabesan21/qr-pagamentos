# Shared admin UI contract

- This subtree owns the small, reusable primitives for administrative screens; do
  not add page-specific variants here.
- Consume semantic classes and custom properties from `../globals.css`; never
  introduce raw colors, spacing, radius, shadow, or typography values.
- Follow [`../../../DESIGN.md`](../../../DESIGN.md) before changing a primitive;
  update it in the same task when its inventory, visual decision, or state matrix
  changes.
- Keep primitives server-renderable unless a documented interaction requires a
  client boundary.
- Every applicable primitive state remains explicit: default, loading, empty,
  error/recovery, hover/focus, and disabled. Record non-applicable states in
  `DESIGN.md`; do not invent a second button style.
- Preserve native controls, associated labels, visible `:focus-visible` behavior,
  and disabled controls outside keyboard order.

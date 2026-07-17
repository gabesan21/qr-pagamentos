# Owned shadcn UI contract

- This subtree owns the customized Radix/nova shadcn source used by current
  Epoch 1 login, administration, and `/design-system` surfaces.
- Run the pinned shadcn CLI `info`, component `docs`, and `add --dry-run` before
  adding or updating registry source; never fetch raw registry files manually.
- Consume semantic Tailwind names mapped in `../../app/globals.css`; never add
  raw color, spacing, radius, shadow, type, manual dark-mode, or z-index values.
- Keep components server-renderable unless their official primitive requires a
  client boundary. Preserve Radix `asChild` composition and native semantics.
- Forms compose `FieldGroup` and `Field`; validation pairs `data-invalid` on the
  field with `aria-invalid` on its control.
- Prefer built-in variants. `className` may arrange layout but must not create a
  second visual variant or override component color and typography.
- Button icons use the configured Lucide source, `data-icon`, and component-owned
  sizing. Loading buttons compose `Spinner` and remain disabled.
- Update [`../../../DESIGN.md`](../../../DESIGN.md) and the specimen when the
  inventory, state matrix, or visual contract changes.
- Follow [`../../app/ui/AGENTS.md`](../../app/ui/AGENTS.md) when changing the
  temporary compatibility adapters over these sources.

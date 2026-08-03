# Owned shadcn UI contract

- This subtree owns the customized Radix/nova shadcn primitives and the
  role-neutral compositions listed in `inventory.json`.
- Run the pinned shadcn CLI `info`, component `docs`, and `add --dry-run` before
  adding or updating registry source; never fetch raw registry files manually.
- Consume semantic Tailwind names projected from
  `../../design-system/tokens/themes.tokens.json` into `../../app/globals.css`; never add
  raw color, spacing, radius, shadow, type, manual dark-mode, or z-index values.
- Never branch component classes or geometry by theme identifier; the six
  themes replace semantic color values only and unknown identifiers fall back
  to `pix-paper`.
- Keep components server-renderable unless their official primitive requires a
  client boundary. Clipboard, localized-field selection, dialogs, tabs and
  toast are the only composition client boundaries; preserve Radix `asChild`
  composition and native semantics.
- Forms compose `FieldGroup` and `Field`; validation pairs `data-invalid` on the
  field with `aria-invalid` on its control.
- Prefer built-in variants. `className` may arrange layout but must not create a
  second visual variant or override component color and typography.
- Button icons use the configured Lucide source, `data-icon`, and component-owned
  sizing. Loading buttons compose `Spinner` and remain disabled.
- Run `node scripts/check-shared-ui-inventory.mjs` after inventory changes; each
  template obligation maps once and excluded generated sources never become
  reachable owners.
- Update [`../../../DESIGN.md`](../../../DESIGN.md) with inventory or state
  changes. The complete inventory specimen is owned by task `12.2.4`.

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
- `accent` is the **strong** template accent (`bg-accent`/`text-accent`);
  `accent-soft` is the pale tint a consumer wants for a hover/checked/active
  surface. The legacy shadcn `accent-foreground` is **not** the on-accent
  foreground — use `accent-fg` for text placed on a strong `bg-accent`
  surface.
- Keep components server-renderable unless their official primitive requires a
  client boundary. Clipboard, localized-field selection, dialogs, tabs, toast,
  the drop-tile `ImageUploader`, and `QrDisplay`'s client-side QR generation
  are the only composition client boundaries; preserve Radix `asChild`
  composition and native semantics.
- `status-badge.tsx` exports `StatusBadge` plus five domain families
  (`ProviderStateBadge`, `LocalOutcomeBadge`, `LinkLifecycleBadge`,
  `AccountStateBadge`, `EntityStateBadge`) over one owned tone map; `copy-field.tsx`
  adds a compact chip `variant`, `monogram.tsx` adds an `xl` accent-soft size,
  `qr-display.tsx` accepts an optional `payload` and generates the QR itself
  with the pinned `qrcode` package, and `stat-card.tsx` accepts an optional
  `sparkline`. Every family and prop is additive; callers still supply their
  own localized `labels` and no shared owner imports a domain enum.
- A genuinely new component that a template obligation excludes as
  `excluded-unreachable-generated-ui` (e.g. `ImageUploader`) is recorded in
  `inventory.json`'s `localAdditions` section — owner, public API, states, and
  a one-line insufficiency finding — and never enters `owners`; `owners` stays
  exactly the 20 reachable template sources.
- Forms compose `FieldGroup` and `Field`; validation pairs `data-invalid` on the
  field with `aria-invalid` on its control.
- Prefer built-in variants. `className` may arrange layout but must not create a
  second visual variant or override component color and typography.
- Button icons use the configured Lucide source, `data-icon`, and component-owned
  sizing. Loading buttons compose `Spinner` and remain disabled.
- Run `node scripts/check-shared-ui-inventory.mjs` after inventory changes; each
  template obligation maps once, excluded generated sources never become
  reachable owners, and each `localAdditions` entry's owner never collides with
  `owners` or an excluded source.
- Update [`../../../DESIGN.md`](../../../DESIGN.md) with inventory or state
  changes. `/design-system` is the role-neutral evidence specimen for this
  inventory; it composes these owners but never becomes a production-owner
  boundary.

# Data-directory shadcn validation — 2026-07-24

- Project runner: pnpm; installed and invoked CLI: `shadcn 4.13.0`.
- Project configuration: `radix-nova`, Radix base, RSC enabled, Tailwind v4,
  Lucide icons, `@/components/ui` alias, `src/app/globals.css` token projection.
- Required commands attempted before owned-source work: `info --json`,
  `docs empty pagination`, `add empty pagination --dry-run`, and per-file
  `--diff` for `empty.tsx` and `pagination.tsx`.
- Registry result: every command failed before returning source with
  `getaddrinfo EAI_AGAIN ui.shadcn.com`.
- Decision: no owned registry source was added or edited. The approved fallback
  composes the existing `Card`, `Alert`, `Button`, `Field`, `Input`,
  `NativeSelect`, `Separator`, `Skeleton`, and `Table` sources. This satisfies
  empty and pagination behavior without hand-rolled substitutes or duplicate
  visual primitives.

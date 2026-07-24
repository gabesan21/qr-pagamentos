# Media security contract

- Scope: image validation, canonicalization, storage, quota admission, lifecycle, reconciliation, and descriptor-authenticated reads.
- Read repository-root [`AGENTS.md`](../../AGENTS.md) before changing this subtree.
- [`../../pop/specs/media-storage.md`](../../pop/specs/media-storage.md) — follow whenever media behavior or invariants change.

## Boundaries

- Keep this subtree server-only; never expose storage keys, filesystem paths, digests, owner IDs, or lifecycle metadata.
- Accept only bounded JPEG, PNG, or WebP bytes; reject SVG, GIF, AVIF, animation, multiple pages, mismatched signatures, truncation, and decoder limit failures before publication.
- Keep Sharp pinned at `0.34.5`; never relax cache, concurrency, timeout, dimension, pixel, byte, or preflight limits.
- Persist only canonical metadata-free `image/webp` output of at most 5 MiB and 4096×4096 / 16,777,216 pixels.
- Never accept a caller path. `MEDIA_STORAGE_ROOT` must be a canonical existing local-POSIX root whose controlled directories pass the no-follow, same-device, hard-link, and sync probe.
- Publication and reads must authenticate the already-opened `O_NOFOLLOW` regular-file descriptor with bounded EOF length and SHA-256 before state publication or response commitment.
- Every create, activate, orphan, delete, and read recheck is owner/purpose/state/revision fenced; never reset or replace the monotonic revision.
- Count every metadata row and retained byte in every state until both controlled paths are durably absent and the fenced row is deleted.
- Any untracked file, missing tracked file, incomplete scan, or failed reclaim blocks admission; reconciliation must remain idempotent and preserve non-eligible or stale-claim objects.
- Public reads require `ACTIVE`; only the matching active `USER` may read `STAGED` or a not-yet-due `ORPHANED` object. `ADMIN` has no media-owner capability.
- Never add media attachment columns, upload UI/routes, request-limiter/logger inventory, public projection wiring, or deployment/volume/installer/backup behavior here.

## Verification

- Run `pnpm media:decoder-preflight` and the focused `src/media/*.test.ts` suites.
- Run `pnpm db:contract-check`, `pnpm db:test`, `pnpm container:contract-check`, and `pnpm check` when the complete boundary changes.
